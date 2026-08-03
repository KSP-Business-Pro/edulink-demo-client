-- Migration : Message officiel + validation direction + accusé de lecture
-- Chantier F, §6 workflow "Message officiel" + §13 point 12.
--
-- Principe de sécurité : les destinataires (message_destinataires) ne sont
-- JAMAIS insérés à la création du brouillon — fn_is_message_destinataire()
-- ne vérifie pas le statut du message, donc insérer les destinataires trop
-- tôt rendrait le brouillon visible AVANT validation. Le ciblage est
-- mémorisé sur la ligne messages, et l'insertion réelle des destinataires
-- n'a lieu qu'à la validation (fn_valider_message_officiel).
--
-- Accusé de lecture : réutilise `date_lecture`, colonne existante mais
-- jamais écrite par le code actuel — sert d'horodatage dédié aux messages
-- officiels, séparé de lu/lu_at (qui continuent de fonctionner pour tous
-- les messages, officiels ou non).

-- 1) Nouvelles colonnes sur messages
alter table messages add column if not exists est_officiel boolean not null default false;
alter table messages add column if not exists officiel_mode text;
alter table messages add column if not exists officiel_type_groupe text;
alter table messages add column if not exists officiel_valeur_groupe text;
alter table messages add column if not exists officiel_etudiant_id uuid references etudiants(id);
alter table messages add column if not exists valide_par uuid references utilisateurs(id);
alter table messages add column if not exists valide_le timestamptz;
alter table messages add column if not exists motif_rejet text;

do $$ begin
  alter table messages add constraint messages_officiel_mode_check
    check (officiel_mode is null or officiel_mode in ('collegue','etudiant','groupe'));
exception when duplicate_object then null; end $$;

-- 2) RLS : la direction/admin doit pouvoir voir les brouillons officiels
-- de son école en attente de validation (sinon aucune requête client ne
-- peut construire la file d'attente "à valider").
create policy messages_select_direction_brouillons on messages
  for select using (
    statut = 'brouillon' and est_officiel = true
    and exists (
      select 1 from utilisateurs u
      where u.auth_id = auth.uid() and u.actif = true
        and u.role in ('direction','admin')
        and (u.ecole_id = messages.ecole_id or u.ecole_id is null)
    )
  );

-- 3) Créer un brouillon officiel (admin ou enseignant)
create or replace function public.fn_creer_message_officiel_brouillon(
  p_ecole_id        uuid,
  p_mode             text, -- 'collegue' | 'etudiant' | 'groupe'
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
  VALUES (v_message_id, 'creation_brouillon', v_expediteur.id);

  RETURN v_message_id;
END;
$function$;

-- 4) Valider un brouillon officiel (direction/admin uniquement)
-- C'est ICI, et seulement ici, que les destinataires sont réellement créés.
create or replace function public.fn_valider_message_officiel(p_message_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_validateur utilisateurs%ROWTYPE;
  v_msg        messages%ROWTYPE;
  v_count      integer := 0;
BEGIN
  SELECT * INTO v_validateur FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true;
  IF v_validateur.id IS NULL OR v_validateur.role NOT IN ('direction','admin') THEN
    RAISE EXCEPTION 'Seule la direction peut valider un message officiel';
  END IF;

  SELECT * INTO v_msg FROM messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN RAISE EXCEPTION 'Message introuvable'; END IF;
  IF NOT v_msg.est_officiel THEN RAISE EXCEPTION 'Ce message n''est pas un message officiel'; END IF;
  IF v_msg.statut <> 'brouillon' THEN RAISE EXCEPTION 'Ce message n''est plus en attente de validation'; END IF;
  IF v_validateur.ecole_id IS NOT NULL AND v_validateur.ecole_id <> v_msg.ecole_id THEN
    RAISE EXCEPTION 'Non autorisé pour cette école';
  END IF;

  IF v_msg.officiel_mode = 'collegue' THEN
    INSERT INTO message_destinataires (message_id, destinataire_id, destinataire_role)
    VALUES (v_msg.id, v_msg.destinataire_id, v_msg.destinataire_role);
    v_count := 1;
  ELSIF v_msg.officiel_mode = 'etudiant' THEN
    INSERT INTO message_destinataires (message_id, etudiant_id, destinataire_role)
    VALUES (v_msg.id, v_msg.officiel_etudiant_id, 'famille');
    v_count := 1;
  ELSE
    IF v_msg.officiel_type_groupe = 'role' THEN
      INSERT INTO message_destinataires (message_id, destinataire_id, destinataire_role)
      SELECT v_msg.id, u.id, u.role
      FROM utilisateurs u
      WHERE u.ecole_id = v_msg.ecole_id AND u.actif = true AND u.role = v_msg.officiel_valeur_groupe
        AND u.id <> v_msg.expediteur_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
      INSERT INTO message_destinataires (message_id, etudiant_id, destinataire_role)
      SELECT v_msg.id, e.id, 'famille'
      FROM etudiants e
      WHERE e.ecole_id = v_msg.ecole_id AND (
        (v_msg.officiel_type_groupe = 'niveau' AND e.niveau = v_msg.officiel_valeur_groupe) OR
        (v_msg.officiel_type_groupe = 'filiere' AND e.filiere = v_msg.officiel_valeur_groupe)
      );
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
    IF v_count = 0 THEN RAISE EXCEPTION 'Aucun destinataire trouvé pour ce groupe'; END IF;
  END IF;

  UPDATE messages SET statut = 'envoye', valide_par = v_validateur.id, valide_le = now()
  WHERE id = v_msg.id;

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_msg.id, 'validation', v_validateur.id);

  RETURN v_count;
END;
$function$;

-- 5) Rejeter un brouillon officiel (direction/admin uniquement)
create or replace function public.fn_rejeter_message_officiel(p_message_id uuid, p_motif text default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_validateur utilisateurs%ROWTYPE;
  v_msg        messages%ROWTYPE;
BEGIN
  SELECT * INTO v_validateur FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true;
  IF v_validateur.id IS NULL OR v_validateur.role NOT IN ('direction','admin') THEN
    RAISE EXCEPTION 'Seule la direction peut rejeter un message officiel';
  END IF;

  SELECT * INTO v_msg FROM messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN RAISE EXCEPTION 'Message introuvable'; END IF;
  IF NOT v_msg.est_officiel OR v_msg.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'Ce message n''est plus en attente de validation';
  END IF;
  IF v_validateur.ecole_id IS NOT NULL AND v_validateur.ecole_id <> v_msg.ecole_id THEN
    RAISE EXCEPTION 'Non autorisé pour cette école';
  END IF;

  UPDATE messages
  SET statut = 'annule', valide_par = v_validateur.id, valide_le = now(), motif_rejet = p_motif
  WHERE id = v_msg.id;

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_msg.id, 'rejet', v_validateur.id);
END;
$function$;
