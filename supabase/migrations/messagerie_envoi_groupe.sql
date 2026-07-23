-- Chantier C : envoi groupe (niveau/filiere/role) avec resolution atomique et audit

CREATE OR REPLACE FUNCTION public.fn_envoyer_message_groupe(
  p_ecole_id uuid,
  p_type_groupe text,
  p_valeur_groupe text,
  p_sujet text DEFAULT NULL::text,
  p_contenu text DEFAULT NULL::text,
  p_categorie text DEFAULT NULL::text,
  p_priorite text DEFAULT 'normale'::text
)
RETURNS TABLE(message_id uuid, nb_destinataires integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expediteur utilisateurs%ROWTYPE;
  v_message_id uuid;
  v_label text;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_expediteur FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true;
  IF v_expediteur.id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifie ou inactif';
  END IF;
  IF v_expediteur.ecole_id IS NOT NULL AND v_expediteur.ecole_id <> p_ecole_id THEN
    RAISE EXCEPTION 'Non autorise pour cette ecole';
  END IF;
  IF p_type_groupe NOT IN ('niveau', 'filiere', 'role') THEN
    RAISE EXCEPTION 'Type de groupe invalide';
  END IF;
  IF p_valeur_groupe IS NULL OR trim(p_valeur_groupe) = '' THEN
    RAISE EXCEPTION 'Valeur de groupe requise';
  END IF;

  v_label := CASE p_type_groupe
    WHEN 'niveau' THEN 'Niveau ' || p_valeur_groupe
    WHEN 'filiere' THEN 'Filiere ' || p_valeur_groupe
    ELSE 'Role ' || p_valeur_groupe
  END;

  INSERT INTO messages (ecole_id, expediteur_id, expediteur_nom, expediteur_role,
                         destinataire_nom, destinataire_role,
                         sujet, objet, contenu, categorie, priorite, statut)
  VALUES (p_ecole_id, v_expediteur.id, v_expediteur.nom, v_expediteur.role,
          v_label, 'groupe',
          p_sujet, p_sujet, p_contenu, p_categorie, p_priorite, 'envoye')
  RETURNING id INTO v_message_id;

  IF p_type_groupe = 'role' THEN
    INSERT INTO message_destinataires (message_id, destinataire_id, destinataire_role)
    SELECT v_message_id, u.id, u.role
    FROM utilisateurs u
    WHERE u.ecole_id = p_ecole_id AND u.actif = true AND u.role = p_valeur_groupe AND u.id <> v_expediteur.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    INSERT INTO message_destinataires (message_id, etudiant_id, destinataire_role)
    SELECT v_message_id, e.id, 'famille'
    FROM etudiants e
    WHERE e.ecole_id = p_ecole_id AND (
      (p_type_groupe = 'niveau' AND e.niveau = p_valeur_groupe) OR
      (p_type_groupe = 'filiere' AND e.filiere = p_valeur_groupe)
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Aucun destinataire trouve pour ce groupe';
  END IF;

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_message_id, 'creation', v_expediteur.id);

  RETURN QUERY SELECT v_message_id, v_count;
END;
$function$;