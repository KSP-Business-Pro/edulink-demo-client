-- Fix : message_audit_action_check n'autorisait que
-- ('creation','lecture','reponse','suppression','archivage') — les nouvelles
-- RPC du workflow officiel utilisaient 'creation_brouillon'/'validation'/'rejet',
-- dont deux n'existaient pas dans la liste. On élargit la contrainte avec les
-- deux valeurs sémantiquement nécessaires (validation, rejet) et on réutilise
-- 'creation' (déjà autorisée) pour la création du brouillon plutôt que
-- d'ajouter une 3e valeur superflue.

alter table message_audit drop constraint message_audit_action_check;
alter table message_audit add constraint message_audit_action_check
  check (action = any (array['creation','lecture','reponse','suppression','archivage','validation','rejet']));

-- Recréation de fn_creer_message_officiel_brouillon avec action='creation'
-- au lieu de 'creation_brouillon' (seule différence avec la version précédente)
CREATE OR REPLACE FUNCTION public.fn_creer_message_officiel_brouillon(
  p_ecole_id        uuid,
  p_mode             text,
  p_destinataire_id  uuid default null,
  p_etudiant_id      uuid default null,
  p_type_groupe      text default null,
  p_valeur_groupe    text default null,
  p_sujet            text default null,
  p_contenu          text default null,
  p_categorie        text default null,
  p_priorite         text default 'normale'
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expediteur   utilisateurs%ROWTYPE;
  v_destinataire utilisateurs%ROWTYPE;
  v_etudiant     etudiants%ROWTYPE;
  v_message_id   uuid;
  v_dest_nom     text;
  v_dest_role    text;
BEGIN
  SELECT * INTO v_expediteur FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true;
  IF v_expediteur.id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié ou inactif';
  END IF;
  IF v_expediteur.ecole_id IS NOT NULL AND v_expediteur.ecole_id <> p_ecole_id THEN
    RAISE EXCEPTION 'Non autorisé pour cette école';
  END IF;
  IF p_mode NOT IN ('collegue','etudiant','groupe') THEN
    RAISE EXCEPTION 'Mode invalide';
  END IF;
  IF p_contenu IS NULL OR trim(p_contenu) = '' THEN
    RAISE EXCEPTION 'Le contenu est requis';
  END IF;

  IF p_mode = 'collegue' THEN
    IF p_destinataire_id IS NULL THEN RAISE EXCEPTION 'Destinataire requis'; END IF;
    SELECT * INTO v_destinataire FROM utilisateurs WHERE id = p_destinataire_id AND actif = true;
    IF v_destinataire.id IS NULL THEN RAISE EXCEPTION 'Destinataire introuvable'; END IF;
    v_dest_nom := v_destinataire.nom; v_dest_role := v_destinataire.role;
  ELSIF p_mode = 'etudiant' THEN
    IF p_etudiant_id IS NULL THEN RAISE EXCEPTION 'Étudiant requis'; END IF;
    SELECT * INTO v_etudiant FROM etudiants WHERE id = p_etudiant_id;
    IF v_etudiant.id IS NULL THEN RAISE EXCEPTION 'Étudiant introuvable'; END IF;
    v_dest_nom := v_etudiant.nom || ' ' || v_etudiant.prenom || ' (famille)';
    v_dest_role := 'famille';
  ELSE
    IF p_type_groupe IS NULL OR p_valeur_groupe IS NULL THEN RAISE EXCEPTION 'Groupe requis'; END IF;
    IF p_type_groupe NOT IN ('niveau','filiere','role') THEN RAISE EXCEPTION 'Type de groupe invalide'; END IF;
    v_dest_nom := CASE p_type_groupe
      WHEN 'niveau' THEN 'Niveau ' || p_valeur_groupe
      WHEN 'filiere' THEN 'Filiere ' || p_valeur_groupe
      ELSE 'Role ' || p_valeur_groupe END;
    v_dest_role := 'groupe';
  END IF;

  INSERT INTO messages (
    ecole_id, expediteur_id, expediteur_nom, expediteur_role,
    destinataire_id, destinataire_nom, destinataire_role,
    sujet, objet, contenu, categorie, priorite, statut,
    est_officiel, officiel_mode, officiel_type_groupe, officiel_valeur_groupe, officiel_etudiant_id
  ) VALUES (
    p_ecole_id, v_expediteur.id, v_expediteur.nom, v_expediteur.role,
    CASE WHEN p_mode='collegue' THEN p_destinataire_id ELSE NULL END, v_dest_nom, v_dest_role,
    p_sujet, p_sujet, p_contenu, p_categorie, p_priorite, 'brouillon',
    true, p_mode, p_type_groupe, p_valeur_groupe, CASE WHEN p_mode='etudiant' THEN p_etudiant_id ELSE NULL END
  ) RETURNING id INTO v_message_id;

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_message_id, 'creation', v_expediteur.id);

  RETURN v_message_id;
END;
$function$;
