-- ============================================================================
-- Correctif — detect_paiement_incoherence() référence paiements.montant_paye,
-- colonne inexistante (la vraie colonne s'appelle `montant`, cohérent avec
-- fn_audit_log qui utilise déjà NEW.montant pour cette même table).
-- Un seul changement : SUM(montant_paye) -> SUM(montant).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_paiement_incoherence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_somme_paiements numeric;
  v_ecart numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.montant_paye IS NOT DISTINCT FROM OLD.montant_paye THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(SUM(montant), 0) INTO v_somme_paiements
  FROM public.paiements
  WHERE facture_id = NEW.id;
  v_ecart := COALESCE(NEW.montant_paye, 0) - v_somme_paiements;
  IF v_ecart <> 0 THEN
    BEGIN
      INSERT INTO public.audit_log (
        ecole_id, user_id, user_email, user_role,
        action, table_name, record_id, details, statut, created_at
      ) VALUES (
        NEW.ecole_id,
        auth.uid(),
        COALESCE(auth.jwt()->>'email', 'system'),
        COALESCE((SELECT role FROM public.utilisateurs WHERE auth_id = auth.uid() LIMIT 1), 'system'),
        'INCOHERENCE_DETECTEE',
        'factures',
        NEW.id,
        format('Facture %s: montant_paye=%s mais SUM(paiements)=%s ecart=%s FCFA',
          NEW.reference, NEW.montant_paye, v_somme_paiements, v_ecart),
        'WARNING',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- Vérification : recréer/mettre à jour une facture (avec des paiements valides
-- dans `paiements`) ne doit plus lever "column montant_paye does not exist".
-- Un écart réel entre factures.montant_paye et SUM(paiements.montant) créera
-- désormais une ligne WARNING dans audit_log — comportement voulu, pas une erreur.
-- ============================================================================

-- ============================================================================
-- Même bug, quasi-doublon de la fonction précédente — également sur factures.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_facture_paiement_incoherence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_paiements NUMERIC;
  v_ecart           NUMERIC;
  v_user_email      TEXT;
  v_user_role       TEXT;
BEGIN
  -- Ne s'exécute que si montant_paye change réellement
  IF (TG_OP = 'UPDATE' AND NEW.montant_paye IS NOT DISTINCT FROM OLD.montant_paye) THEN
    RETURN NEW;
  END IF;

  -- Calculer la somme réelle des paiements pour cette facture
  SELECT COALESCE(SUM(montant), 0)
  INTO v_total_paiements
  FROM public.paiements
  WHERE facture_id = NEW.id;

  v_ecart := COALESCE(NEW.montant_paye, 0) - v_total_paiements;

  -- S'il y a un écart, logger
  IF v_ecart <> 0 THEN
    -- Récupérer info utilisateur (peut être null si service_role ou backend)
    SELECT email, role INTO v_user_email, v_user_role
    FROM public.utilisateurs
    WHERE auth_id = auth.uid()
    LIMIT 1;

    BEGIN
      INSERT INTO public.audit_log (
        ecole_id, user_id, user_email, user_role,
        action, table_name, record_id, details, statut, created_at
      ) VALUES (
        NEW.ecole_id,
        auth.uid(),
        v_user_email,
        v_user_role,
        'INCOHERENCE_DETECTED',
        'factures',
        NEW.id,
        format(
          'Incoherence facture %s : montant_paye=%s, total_paiements=%s, ecart=%s FCFA',
          NEW.reference,
          NEW.montant_paye,
          v_total_paiements,
          v_ecart
        ),
        'warning',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Ne jamais bloquer l'opération principale (même garde que l'autre trigger)
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- Vérification finale : les DEUX triggers sont maintenant cohérents avec le
-- vrai schéma de `paiements` (colonne `montant`). Recréer une facture, puis
-- enregistrer un paiement, ne doit plus lever aucune erreur de colonne.
-- ============================================================================
