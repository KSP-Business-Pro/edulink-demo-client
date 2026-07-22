-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- messagerie_fn_envoyer_message_famille.sql
-- Ã‰tend fn_envoyer_message pour accepter un ciblage par Ã©tudiant (famille)
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CREATE OR REPLACE FUNCTION fn_envoyer_message(
  p_ecole_id        uuid,
  p_destinataire_id uuid DEFAULT NULL,
  p_sujet           text DEFAULT NULL,
  p_contenu         text DEFAULT NULL,
  p_categorie       text DEFAULT NULL,
  p_priorite        text DEFAULT 'normale',
  p_etudiant_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    RAISE EXCEPTION 'Utilisateur non authentifiÃ© ou inactif';
  END IF;

  IF v_expediteur.ecole_id IS NOT NULL AND v_expediteur.ecole_id <> p_ecole_id THEN
    RAISE EXCEPTION 'Non autorisÃ© pour cette Ã©cole';
  END IF;

  IF p_destinataire_id IS NULL AND p_etudiant_id IS NULL THEN
    RAISE EXCEPTION 'Un destinataire (collÃ¨gue ou Ã©tudiant) est requis';
  END IF;

  IF p_destinataire_id IS NOT NULL THEN
    SELECT * INTO v_destinataire FROM utilisateurs WHERE id = p_destinataire_id AND actif = true;
    IF v_destinataire.id IS NULL THEN
      RAISE EXCEPTION 'Destinataire introuvable ou inactif';
    END IF;
    v_dest_nom := v_destinataire.nom;
    v_dest_role := v_destinataire.role;
  ELSE
    SELECT * INTO v_etudiant FROM etudiants WHERE id = p_etudiant_id;
    IF v_etudiant.id IS NULL THEN
      RAISE EXCEPTION 'Ã‰tudiant introuvable';
    END IF;
    v_dest_nom := v_etudiant.nom || ' ' || v_etudiant.prenom || ' (famille)';
    v_dest_role := 'famille';
  END IF;

  INSERT INTO messages (ecole_id, expediteur_id, expediteur_nom, expediteur_role,
                         destinataire_id, destinataire_nom, destinataire_role,
                         sujet, objet, contenu, categorie, priorite, statut)
  VALUES (p_ecole_id, v_expediteur.id, v_expediteur.nom, v_expediteur.role,
          p_destinataire_id, v_dest_nom, v_dest_role,
          p_sujet, p_sujet, p_contenu, p_categorie, p_priorite, 'envoye')
  RETURNING id INTO v_message_id;

  INSERT INTO message_destinataires (message_id, destinataire_id, destinataire_role, etudiant_id)
  VALUES (v_message_id, p_destinataire_id, v_dest_role, p_etudiant_id);

  RETURN v_message_id;
END;
$$;