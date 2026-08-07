-- ============================================================================
-- EduLink Sup — Messagerie institutionnelle
-- CHANTIER F, point 3 : Archivage légal / politique de conservation
-- Fichier : messagerie_conservation.sql
-- Date : 07/08/2026
--
-- Contenu :
--   1. messages : colonnes archive_le + gel_legal, backfill, trigger d'horodatage
--   2. Helper de rôle fn_est_direction_ou_admin
--   3. Table politiques_conservation (fallback global ecole_id IS NULL) + seed + RLS
--   4. Table journal_purges + RLS
--   5. Helpers internes fn_duree_conservation / fn_messages_expires
--   6. RPC fn_previsualiser_purge (lecture seule, obligatoire avant purge)
--   7. RPC fn_purger_messages_expires (DELETE réel, renvoie les chemins storage)
--   8. RPC fn_definir_gel_legal (pose/lève le gel, direction/admin uniquement)
--
-- Vérifié le 07/08/2026 sur le schéma réel :
--   - message_pieces_jointes.chemin_storage = nom exact de la colonne chemin
--   - FKs vers messages TOUTES en ON DELETE CASCADE (message_destinataires,
--     message_pieces_jointes, message_audit) -> le DELETE de purge cascade
--     proprement, y compris sur l'audit (cohérent avec la purge physique :
--     la trace agrégée est conservée dans journal_purges)
--   - AUCUN trigger utilisateur sur public.messages (rien ne bloque le DELETE)
--   - Rôles existants en base : admin / direction / enseignant
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. MESSAGES : archive_le + gel_legal
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS archive_le timestamptz,
  ADD COLUMN IF NOT EXISTS gel_legal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.messages.archive_le IS
  'Horodatage du passage en statut archive — point de depart du delai de conservation';
COMMENT ON COLUMN public.messages.gel_legal IS
  'Gel legal : exclut le message de toute purge tant que true';

-- Backfill conservateur (décision validée) : archives existantes datées de created_at
UPDATE public.messages
SET archive_le = created_at
WHERE statut = 'archive' AND archive_le IS NULL;

-- Horodatage automatique des archivages futurs, quel que soit le chemin de code
CREATE OR REPLACE FUNCTION public.fn_messages_horodater_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.statut = 'archive' AND COALESCE(OLD.statut, '') <> 'archive' THEN
    NEW.archive_le := now();
  ELSIF NEW.statut <> 'archive' AND OLD.statut = 'archive' THEN
    -- Désarchivage : le délai repartira de zéro au prochain archivage
    NEW.archive_le := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_horodater_archive ON public.messages;
CREATE TRIGGER trg_messages_horodater_archive
BEFORE UPDATE OF statut ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_messages_horodater_archive();


-- ----------------------------------------------------------------------------
-- 2. HELPER DE RÔLE
--    NB : couvre les deux patterns de liaison possibles vers auth
--    (utilisateurs.auth_id = auth.uid() OU utilisateurs.id = auth.uid()).
--    Si la colonne auth_id n'existe pas sur utilisateurs, la création échouera
--    ici de façon VISIBLE : supprimer alors le membre "u.auth_id = auth.uid() OR".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_est_direction_ou_admin(p_ecole_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM utilisateurs u
    WHERE (u.auth_id = auth.uid() OR u.id = auth.uid())
      AND u.ecole_id = p_ecole_id
      AND u.role IN ('admin', 'direction')
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_est_direction_ou_admin(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. POLITIQUES DE CONSERVATION
--    Une ligne par cible. ecole_id NULL = défaut global (même mécanique de
--    fallback que les modèles de notification). Cibles = les 8 catégories de
--    messages + OFFICIEL (messages officiels validés) + JOURNAL
--    (journal_notifications).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.politiques_conservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id uuid,  -- NULL = politique globale par défaut
  cible text NOT NULL CHECK (cible IN
    ('ADM','PED','NOT','ABS','FIN','EXA','REL','SUP','OFFICIEL','JOURNAL')),
  duree_mois integer NOT NULL CHECK (duree_mois BETWEEN 1 AND 1200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_politiques_conservation_ecole_cible
  ON public.politiques_conservation (ecole_id, cible)
  WHERE ecole_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_politiques_conservation_globale_cible
  ON public.politiques_conservation (cible)
  WHERE ecole_id IS NULL;

-- Seed des défauts globaux (décisions validées le 07/08/2026)
INSERT INTO public.politiques_conservation (ecole_id, cible, duree_mois)
SELECT NULL, t.cible, t.duree_mois
FROM (VALUES
  ('ADM', 24), ('PED', 24), ('NOT', 24), ('ABS', 24),
  ('EXA', 24), ('REL', 24), ('SUP', 24),
  ('FIN', 120),       -- messages financiers : 10 ans (alignement OHADA)
  ('OFFICIEL', 120),  -- messages officiels validés : 10 ans (valeur probatoire)
  ('JOURNAL', 24)     -- journal_notifications : 2 ans
) AS t(cible, duree_mois)
WHERE NOT EXISTS (
  SELECT 1 FROM public.politiques_conservation p
  WHERE p.ecole_id IS NULL AND p.cible = t.cible
);

ALTER TABLE public.politiques_conservation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS politiques_conservation_select ON public.politiques_conservation;
CREATE POLICY politiques_conservation_select
ON public.politiques_conservation
FOR SELECT TO authenticated
USING (
  ecole_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.utilisateurs u
    WHERE (u.auth_id = auth.uid() OR u.id = auth.uid())
      AND u.ecole_id = politiques_conservation.ecole_id
  )
);

-- Écriture : direction/admin de l'école uniquement, et jamais sur les globales
DROP POLICY IF EXISTS politiques_conservation_write ON public.politiques_conservation;
CREATE POLICY politiques_conservation_write
ON public.politiques_conservation
FOR ALL TO authenticated
USING (ecole_id IS NOT NULL AND public.fn_est_direction_ou_admin(ecole_id))
WITH CHECK (ecole_id IS NOT NULL AND public.fn_est_direction_ou_admin(ecole_id));


-- ----------------------------------------------------------------------------
-- 4. JOURNAL DES PURGES (trace agrégée, exigée par la décision "purge physique")
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_purges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id uuid NOT NULL,
  execute_par uuid,
  execute_le timestamptz NOT NULL DEFAULT now(),
  nb_messages integer NOT NULL DEFAULT 0,
  nb_pieces_jointes integer NOT NULL DEFAULT 0,
  nb_journal_notifications integer NOT NULL DEFAULT 0,
  details jsonb
);

ALTER TABLE public.journal_purges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_purges_select ON public.journal_purges;
CREATE POLICY journal_purges_select
ON public.journal_purges
FOR SELECT TO authenticated
USING (public.fn_est_direction_ou_admin(ecole_id));
-- Aucune policy INSERT/UPDATE/DELETE : la table n'est alimentée que par la
-- RPC SECURITY DEFINER fn_purger_messages_expires.


-- ----------------------------------------------------------------------------
-- 5. HELPERS INTERNES
-- ----------------------------------------------------------------------------
-- Résolution de la durée applicable : école -> global -> 24 mois par défaut
CREATE OR REPLACE FUNCTION public.fn_duree_conservation(p_ecole_id uuid, p_cible text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT duree_mois FROM politiques_conservation
     WHERE ecole_id = p_ecole_id AND cible = p_cible),
    (SELECT duree_mois FROM politiques_conservation
     WHERE ecole_id IS NULL AND cible = p_cible),
    24
  );
$$;

-- Messages arrivés à expiration pour une école :
--   statut='archive', hors gel légal, archive_le + durée applicable dépassé.
--   Cible = OFFICIEL si est_officiel, sinon la catégorie du message.
CREATE OR REPLACE FUNCTION public.fn_messages_expires(p_ecole_id uuid)
RETURNS TABLE (message_id uuid, cible text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id,
         CASE WHEN COALESCE(m.est_officiel, false)
              THEN 'OFFICIEL'
              ELSE COALESCE(m.categorie, 'ADM')
         END AS cible
  FROM messages m
  WHERE m.ecole_id = p_ecole_id
    AND m.statut = 'archive'
    AND m.gel_legal = false
    AND m.archive_le IS NOT NULL
    AND m.archive_le + make_interval(
          months => fn_duree_conservation(
            m.ecole_id,
            CASE WHEN COALESCE(m.est_officiel, false)
                 THEN 'OFFICIEL'
                 ELSE COALESCE(m.categorie, 'ADM')
            END
          )
        ) < now();
$$;

-- Fonction interne : jamais appelée directement par le client
REVOKE ALL ON FUNCTION public.fn_messages_expires(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_messages_expires(uuid) FROM anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6. PRÉVISUALISATION (lecture seule) — à afficher OBLIGATOIREMENT dans la
--    confirmation UI avant toute exécution de la purge
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_previsualiser_purge(p_ecole_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_par_cible   jsonb;
  v_nb_messages bigint := 0;
  v_nb_pj       bigint := 0;
  v_nb_journal  bigint := 0;
BEGIN
  IF NOT fn_est_direction_ou_admin(p_ecole_id) THEN
    RAISE EXCEPTION 'acces_refuse: reserve a la direction/admin de l''ecole';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('cible', s.cible, 'nb', s.nb)), '[]'::jsonb),
         COALESCE(SUM(s.nb), 0)
    INTO v_par_cible, v_nb_messages
  FROM (
    SELECT e.cible, COUNT(*) AS nb
    FROM fn_messages_expires(p_ecole_id) e
    GROUP BY e.cible
  ) s;

  SELECT COUNT(*) INTO v_nb_pj
  FROM message_pieces_jointes pj
  WHERE pj.message_id IN (SELECT e.message_id FROM fn_messages_expires(p_ecole_id) e);

  SELECT COUNT(*) INTO v_nb_journal
  FROM journal_notifications jn
  WHERE jn.ecole_id = p_ecole_id
    AND jn.envoye_le + make_interval(
          months => fn_duree_conservation(p_ecole_id, 'JOURNAL')) < now();

  RETURN jsonb_build_object(
    'nb_messages', v_nb_messages,
    'nb_pieces_jointes', v_nb_pj,
    'nb_journal_notifications', v_nb_journal,
    'par_cible', v_par_cible
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_previsualiser_purge(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 7. PURGE RÉELLE
--    DELETE physique des messages expirés (cascade : destinataires, pièces
--    jointes, audit) + purge de journal_notifications + trace dans
--    journal_purges. Renvoie les chemins storage à supprimer du bucket
--    'messages-pieces-jointes' (fait par l'Edge Function purge-messages,
--    étape suivante — le SQL ne peut pas toucher au storage).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_purger_messages_expires(p_ecole_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids         uuid[];
  v_chemins     text[] := ARRAY[]::text[];
  v_par_cible   jsonb  := '[]'::jsonb;
  v_nb_messages integer := 0;
  v_nb_pj       integer := 0;
  v_nb_journal  integer := 0;
BEGIN
  IF NOT fn_est_direction_ou_admin(p_ecole_id) THEN
    RAISE EXCEPTION 'acces_refuse: reserve a la direction/admin de l''ecole';
  END IF;

  SELECT array_agg(e.message_id) INTO v_ids
  FROM fn_messages_expires(p_ecole_id) e;

  IF v_ids IS NOT NULL THEN
    -- Répartition par cible (pour la trace), calculée AVANT le DELETE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('cible', s.cible, 'nb', s.nb)), '[]'::jsonb)
      INTO v_par_cible
    FROM (
      SELECT e.cible, COUNT(*) AS nb
      FROM fn_messages_expires(p_ecole_id) e
      GROUP BY e.cible
    ) s;

    -- Chemins storage des pièces jointes concernées, capturés AVANT le DELETE
    SELECT COALESCE(array_agg(pj.chemin_storage)
                    FILTER (WHERE pj.chemin_storage IS NOT NULL), ARRAY[]::text[])
      INTO v_chemins
    FROM message_pieces_jointes pj
    WHERE pj.message_id = ANY (v_ids);

    v_nb_pj := COALESCE(array_length(v_chemins, 1), 0);

    DELETE FROM messages m WHERE m.id = ANY (v_ids);
    GET DIAGNOSTICS v_nb_messages = ROW_COUNT;
  END IF;

  DELETE FROM journal_notifications jn
  WHERE jn.ecole_id = p_ecole_id
    AND jn.envoye_le + make_interval(
          months => fn_duree_conservation(p_ecole_id, 'JOURNAL')) < now();
  GET DIAGNOSTICS v_nb_journal = ROW_COUNT;

  INSERT INTO journal_purges
    (ecole_id, execute_par, nb_messages, nb_pieces_jointes,
     nb_journal_notifications, details)
  VALUES
    (p_ecole_id, auth.uid(), v_nb_messages, v_nb_pj,
     v_nb_journal, jsonb_build_object('par_cible', v_par_cible));

  RETURN jsonb_build_object(
    'nb_messages', v_nb_messages,
    'nb_pieces_jointes', v_nb_pj,
    'nb_journal_notifications', v_nb_journal,
    'chemins_storage', COALESCE(to_jsonb(v_chemins), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_purger_messages_expires(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. GEL LÉGAL : pose/lève le flag, réservé direction/admin
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_definir_gel_legal(p_message_id uuid, p_gel boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ecole uuid;
BEGIN
  SELECT ecole_id INTO v_ecole FROM messages WHERE id = p_message_id;
  IF v_ecole IS NULL THEN
    RAISE EXCEPTION 'message_introuvable';
  END IF;
  IF NOT fn_est_direction_ou_admin(v_ecole) THEN
    RAISE EXCEPTION 'acces_refuse: reserve a la direction/admin de l''ecole';
  END IF;

  UPDATE messages SET gel_legal = p_gel WHERE id = p_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_definir_gel_legal(uuid, boolean) TO authenticated;


-- ============================================================================
-- VÉRIFICATIONS POST-EXÉCUTION (à lancer après le script, ne rien modifier) :
--
-- 1) Seed en place (10 lignes globales attendues) :
--    SELECT cible, duree_mois FROM politiques_conservation
--    WHERE ecole_id IS NULL ORDER BY cible;
--
-- 2) Backfill : plus aucune archive sans date :
--    SELECT COUNT(*) FROM messages WHERE statut='archive' AND archive_le IS NULL;
--    -- attendu : 0
--
-- 3) Prévisualisation (connecté en direction/admin, remplacer l'ecole_id) :
--    SELECT fn_previsualiser_purge('<ecole_id>');
--    -- attendu : 0 partout sur des données récentes
-- ============================================================================
