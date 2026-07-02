-- ============================================================================
-- Correctif — fn_audit_log() référence une colonne "rubrique" inexistante
-- sur la table `factures` (la vraie colonne s'appelle `type_frais`).
-- Bug préexistant, sans rapport avec le Bloc 1/2 comptabilité — juste croisé
-- en testant la création de facture. Un seul mot changé, rien d'autre modifié.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_user_role text;
  v_ecole_id uuid;
  v_action text;
  v_details text;
  v_record_id uuid;
BEGIN
  -- Récupérer infos utilisateur
  v_user_id := auth.uid();

  SELECT email INTO v_user_email
  FROM auth.users WHERE id = v_user_id;

  SELECT role, ecole_id INTO v_user_role, v_ecole_id
  FROM public.utilisateurs
  WHERE auth_id = v_user_id AND actif = true
  LIMIT 1;
  -- Déterminer l'action
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_record_id := NEW.id;
    v_ecole_id := COALESCE(v_ecole_id, NEW.ecole_id);
    v_details := 'Création';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_record_id := NEW.id;
    v_ecole_id := COALESCE(v_ecole_id, NEW.ecole_id);
    v_details := 'Modification';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_record_id := OLD.id;
    v_ecole_id := COALESCE(v_ecole_id, OLD.ecole_id);
    v_details := 'Suppression';
  END IF;
  -- Détails spécifiques par table
  IF TG_TABLE_NAME = 'notes_lmd' THEN
    IF TG_OP = 'UPDATE' THEN
      v_details := format(
        'Note modifiée: evaluation_id=%s, etudiant_id=%s, ancienne=%s, nouvelle=%s',
        NEW.evaluation_id, NEW.etudiant_id,
        OLD.valeur, NEW.valeur
      );
    ELSIF TG_OP = 'INSERT' THEN
      v_details := format(
        'Note saisie: evaluation_id=%s, etudiant_id=%s, valeur=%s',
        NEW.evaluation_id, NEW.etudiant_id, NEW.valeur
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'releves_notes' THEN
    IF TG_OP = 'INSERT' THEN
      v_details := format(
        'Relevé publié: etudiant_id=%s, semestre_id=%s, mention=%s',
        NEW.etudiant_id, NEW.semestre_id, NEW.mention
      );
    ELSIF TG_OP = 'UPDATE' AND OLD.verrouille != NEW.verrouille THEN
      v_details := format(
        'Relevé %s: etudiant_id=%s',
        CASE WHEN NEW.verrouille THEN 'verrouillé' ELSE 'déverrouillé' END,
        NEW.etudiant_id
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'factures' THEN
    IF TG_OP = 'INSERT' THEN
      v_details := format(
        'Facture créée: etudiant_id=%s, montant=%s, rubrique=%s',
        NEW.etudiant_id, NEW.montant_total, NEW.type_frais
      );
    ELSIF TG_OP = 'UPDATE' THEN
      v_details := format(
        'Facture modifiée: id=%s, ancien_statut=%s, nouveau_statut=%s, montant_paye=%s',
        NEW.id, OLD.statut, NEW.statut, NEW.montant_paye
      );
    ELSIF TG_OP = 'DELETE' THEN
      v_details := format(
        'Facture supprimée: etudiant_id=%s, montant=%s',
        OLD.etudiant_id, OLD.montant_total
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'paiements' THEN
    IF TG_OP = 'INSERT' THEN
      v_details := format(
        'Paiement enregistré: facture_id=%s, montant=%s, mode=%s',
        NEW.facture_id, NEW.montant, NEW.mode_paiement
      );
    ELSIF TG_OP = 'DELETE' THEN
      v_details := format(
        'Paiement supprimé: facture_id=%s, montant=%s',
        OLD.facture_id, OLD.montant
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'etudiants' THEN
    IF TG_OP = 'DELETE' THEN
      v_details := format(
        'Étudiant supprimé: matricule=%s, nom=%s %s',
        OLD.matricule, OLD.nom, OLD.prenom
      );
    ELSIF TG_OP = 'UPDATE' THEN
      v_details := format(
        'Étudiant modifié: matricule=%s, ancien_statut=%s, nouveau_statut=%s',
        NEW.matricule, OLD.statut, NEW.statut
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'resultats_cache' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      v_details := format(
        'Résultat calculé: etudiant_id=%s, semestre_id=%s, decision=%s, moy=%s',
        NEW.etudiant_id, NEW.semestre_id, NEW.decision, NEW.moyenne_semestre
      );
    END IF;
  END IF;
  -- Insérer dans audit_log (silencieux si erreur)
  BEGIN
    INSERT INTO public.audit_log (
      ecole_id, user_id, user_email, user_role,
      action, table_name, record_id, details, statut
    ) VALUES (
      v_ecole_id, v_user_id, v_user_email, v_user_role,
      v_action, TG_TABLE_NAME, v_record_id, v_details, 'ok'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ne jamais bloquer l'opération principale
    NULL;
  END;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- Vérification : recréer une facture ne doit plus lever "record new has no
-- field rubrique". La ligne d'audit doit s'insérer avec le bon type_frais.
-- ============================================================================
