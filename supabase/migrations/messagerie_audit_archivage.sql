-- Chantier A : audit reel (message_audit alimentee) + archivage au lieu de suppression definitive

-- 1. Supprime l'ancienne surcharge de fn_envoyer_message (6 params, code mort depuis l'etape 3 - p_etudiant_id)
DROP FUNCTION IF EXISTS public.fn_envoyer_message(uuid, uuid, text, text, text, text);

-- 2. fn_envoyer_message (7 params) : identique + ecriture message_audit
CREATE OR REPLACE FUNCTION public.fn_envoyer_message(p_ecole_id uuid, p_destinataire_id uuid DEFAULT NULL::uuid, p_sujet text DEFAULT NULL::text, p_contenu text DEFAULT NULL::text, p_categorie text DEFAULT NULL::text, p_priorite text DEFAULT 'normale'::text, p_etudiant_id uuid DEFAULT NULL::uuid)
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

  IF p_destinataire_id IS NULL AND p_etudiant_id IS NULL THEN
    RAISE EXCEPTION 'Un destinataire (collègue ou étudiant) est requis';
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
      RAISE EXCEPTION 'Étudiant introuvable';
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

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_message_id, 'creation', v_expediteur.id);

  RETURN v_message_id;
END;
$function$;

-- 3. fn_envoyer_message_famille : identique + ecriture message_audit
CREATE OR REPLACE FUNCTION public.fn_envoyer_message_famille(p_ecole_id uuid, p_sujet text DEFAULT NULL::text, p_contenu text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_etudiant   etudiants%ROWTYPE;
  v_message_id uuid;
  v_exp_nom    text;
BEGIN
  SELECT * INTO v_etudiant FROM etudiants WHERE auth_id = auth.uid();
  IF v_etudiant.id IS NULL THEN
    RAISE EXCEPTION 'Session portail non authentifiée';
  END IF;
  IF v_etudiant.ecole_id <> p_ecole_id THEN
    RAISE EXCEPTION 'École incohérente';
  END IF;
  IF p_contenu IS NULL OR trim(p_contenu) = '' THEN
    RAISE EXCEPTION 'Le contenu du message est requis';
  END IF;
  v_exp_nom := COALESCE(v_etudiant.nom_parent, v_etudiant.nom || ' ' || v_etudiant.prenom || ' (famille)');
  INSERT INTO messages (ecole_id, expediteur_nom, expediteur_role,
                         destinataire_nom, destinataire_role,
                         sujet, objet, contenu, statut, lu)
  VALUES (p_ecole_id, v_exp_nom, 'famille',
          'Administration', 'admin',
          p_sujet, p_sujet, p_contenu, 'envoye', false)
  RETURNING id INTO v_message_id;
  INSERT INTO message_destinataires (message_id, etudiant_id, destinataire_role)
  VALUES (v_message_id, v_etudiant.id, 'famille');
  INSERT INTO message_destinataires (message_id, destinataire_id, destinataire_role)
  SELECT v_message_id, u.id, u.role
  FROM utilisateurs u
  WHERE u.ecole_id = p_ecole_id AND u.actif = true AND u.role = 'admin';

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_message_id, 'creation', NULL);

  RETURN v_message_id;
END;
$function$;

-- 4. Nouvelle RPC : archivage au lieu de DELETE, avec audit
CREATE OR REPLACE FUNCTION public.fn_supprimer_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user  utilisateurs%ROWTYPE;
  v_msg   messages%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true;
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié ou inactif';
  END IF;

  SELECT * INTO v_msg FROM messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN
    RAISE EXCEPTION 'Message introuvable';
  END IF;

  IF v_msg.expediteur_id IS DISTINCT FROM v_user.id THEN
    RAISE EXCEPTION 'Seul l''expediteur peut archiver ce message';
  END IF;

  UPDATE messages SET statut = 'archive' WHERE id = p_message_id;

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (p_message_id, 'archivage', v_user.id);
END;
$function$;