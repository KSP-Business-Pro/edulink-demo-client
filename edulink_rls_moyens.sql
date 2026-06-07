-- ============================================================
--  EduLink Sup — Corrections RLS moyens (4 items)
--  Supabase : kcfpvnrgutkhakogbjip
-- ============================================================


-- ────────────────────────────────────────────────────────────
--  MOYEN 1 : exclusions_ue — INSERT/DELETE super-admin bloqués
--  (contourné par RPC SECURITY DEFINER mais policy directe KO)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "exclusions_insert" ON exclusions_ue;
DROP POLICY IF EXISTS "exclusions_update" ON exclusions_ue;
DROP POLICY IF EXISTS "exclusions_delete" ON exclusions_ue;

CREATE POLICY "exclusions_insert" ON exclusions_ue
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND get_my_role() = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "exclusions_update" ON exclusions_ue
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND get_my_role() = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "exclusions_delete" ON exclusions_ue
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND get_my_role() = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  MOYEN 2 : pwa_devices — RLS actif mais policies inopérantes
--  Enregistrement des appareils PWA bloqué
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pwa_devices_select" ON pwa_devices;
DROP POLICY IF EXISTS "pwa_devices_insert" ON pwa_devices;
DROP POLICY IF EXISTS "pwa_devices_update" ON pwa_devices;
DROP POLICY IF EXISTS "pwa_devices_delete" ON pwa_devices;

-- SELECT : admin voit les appareils de son école
CREATE POLICY "pwa_devices_select" ON pwa_devices
  FOR SELECT USING (
    (get_user_ecole_id() IS NULL AND get_my_role() = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

-- INSERT : tout utilisateur authentifié de l'école peut enregistrer son appareil
CREATE POLICY "pwa_devices_insert" ON pwa_devices
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND get_my_role() = 'admin')
    OR get_user_ecole_id() = ecole_id
    OR EXISTS (
      SELECT 1 FROM etudiants
      WHERE auth_id = auth.uid() AND ecole_id = pwa_devices.ecole_id
    )
  );

-- UPDATE : même règle que INSERT
CREATE POLICY "pwa_devices_update" ON pwa_devices
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND get_my_role() = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

-- DELETE : admin uniquement
CREATE POLICY "pwa_devices_delete" ON pwa_devices
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND get_my_role() = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  MOYEN 3 : Unification des helpers RLS
--
--  Problèmes identifiés :
--  • get_my_role()    — pas de filtre actif = true → utilisateurs désactivés inclus
--  • get_my_ecole_id() — pas de filtre actif = true → idem
--  • peut_voir_ecole() — UUID UCAO hardcodé, appelle get_my_ecole_id() incohérent
--  • get_user_ecole_id() — correct (actif = true) mais ignoré par les autres
--
--  Correction : aligner get_my_role() et get_my_ecole_id() sur actif = true
--  get_user_ecole_id() reste inchangé (déjà correct, SECURITY DEFINER)
--  peut_voir_ecole() reste inchangée (logique UCAO spécifique)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Utilisateur back-office actif uniquement
    (SELECT role FROM public.utilisateurs
     WHERE auth_id = auth.uid() AND actif = true LIMIT 1),
    -- Fallback JWT metadata (portail étudiant/enseignant)
    NULLIF(auth.jwt()->'user_metadata'->>'role', ''),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_ecole_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Utilisateur back-office actif uniquement
    (SELECT ecole_id FROM public.utilisateurs
     WHERE auth_id = auth.uid() AND actif = true LIMIT 1),
    -- Fallback JWT metadata
    NULLIF(auth.jwt()->'user_metadata'->>'ecole_id', '')::uuid,
    NULL
  );
$$;


-- ────────────────────────────────────────────────────────────
--  MOYEN 4 : _backup_auth_users_20260512 — table backup à supprimer
-- ────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS _backup_auth_users_20260512;


-- ────────────────────────────────────────────────────────────
--  VÉRIFICATION
-- ────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('exclusions_ue', 'pwa_devices')
-- ORDER BY tablename, cmd;
--
-- SELECT routine_name, routine_definition
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('get_my_role', 'get_my_ecole_id')
-- ORDER BY routine_name;
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name = '_backup_auth_users_20260512';
