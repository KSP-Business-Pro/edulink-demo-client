-- Migration : fn_notifier_evenement
-- Chantier D (messagerie) — modèles automatiques / notifications d'événements métier.
-- Résout un modèle actif dans modeles_notification (type + canal='email'),
-- substitue les variables {var} de p_vars, et crée un message interne catégorisé.
-- SECURITY DEFINER ; erreurs avalées (RAISE WARNING) pour ne jamais bloquer
-- l'action métier appelante.
--
-- MAJ 30/07/2026 : résolution du modèle en fallback global — l'école-spécifique
-- prime, sinon on prend le modèle global (ecole_id IS NULL). Évite le no-op
-- silencieux pour toute école non provisionnée.

CREATE OR REPLACE FUNCTION public.fn_notifier_evenement(
  p_ecole_id    uuid,
  p_etudiant_id uuid,
  p_type        text,
  p_vars        jsonb DEFAULT '{}'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expediteur  utilisateurs%ROWTYPE;
  v_etudiant    etudiants%ROWTYPE;
  v_modele      record;
  v_sujet       text;
  v_corps       text;
  v_categorie   text;
  v_message_id  uuid;
  v_key         text;
  v_val         text;
BEGIN
  SELECT * INTO v_expediteur FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true;
  IF v_expediteur.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_type NOT IN ('note', 'absence', 'paiement', 'releve') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_etudiant FROM etudiants WHERE id = p_etudiant_id AND ecole_id = p_ecole_id;
  IF v_etudiant.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT actif, sujet, corps_texte INTO v_modele
  FROM modeles_notification
  WHERE type = p_type AND canal = 'email'
    AND (ecole_id = p_ecole_id OR ecole_id IS NULL)
  ORDER BY ecole_id NULLS LAST
  LIMIT 1;
  IF NOT FOUND OR v_modele.actif IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  v_sujet := coalesce(v_modele.sujet, '');
  v_corps := coalesce(v_modele.corps_texte, '');
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(p_vars) LOOP
    v_sujet := replace(v_sujet, '{' || v_key || '}', v_val);
    v_corps := replace(v_corps, '{' || v_key || '}', v_val);
  END LOOP;

  v_categorie := CASE p_type
    WHEN 'note'     THEN 'NOT'
    WHEN 'absence'  THEN 'ABS'
    WHEN 'paiement' THEN 'FIN'
    WHEN 'releve'   THEN 'REL'
  END;

  INSERT INTO messages (ecole_id, expediteur_id, expediteur_nom, expediteur_role,
                        destinataire_nom, destinataire_role,
                        sujet, objet, contenu, categorie, priorite, statut)
  VALUES (p_ecole_id, v_expediteur.id, v_expediteur.nom, v_expediteur.role,
          v_etudiant.nom || ' ' || v_etudiant.prenom || ' (famille)', 'famille',
          v_sujet, v_sujet, v_corps, v_categorie, 'normale', 'envoye')
  RETURNING id INTO v_message_id;

  INSERT INTO message_destinataires (message_id, etudiant_id, destinataire_role)
  VALUES (v_message_id, p_etudiant_id, 'famille');

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_message_id, 'creation', v_expediteur.id);

  RETURN v_message_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'fn_notifier_evenement: echec (%): %', SQLSTATE, SQLERRM;
    RETURN NULL;
END;
$function$;