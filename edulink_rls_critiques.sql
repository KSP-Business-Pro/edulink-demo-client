-- ============================================================
--  EduLink Sup — Corrections RLS critiques
--  Supabase : kcfpvnrgutkhakogbjip
--  Généré suite audit RLS 06-06-2026
--  À exécuter dans l'éditeur SQL Supabase
--  ⚠ Exécuter section par section et vérifier entre chaque
-- ============================================================

-- Helper super-admin réutilisé dans toutes les policies :
-- EXISTS (SELECT 1 FROM utilisateurs
--         WHERE auth_id = auth.uid() AND actif = true
--           AND ecole_id IS NULL AND role = 'admin')


-- ────────────────────────────────────────────────────────────
--  CRITIQUE 1 : annees_academiques — RLS désactivé
--  Isolation multi-tenant absente malgré les policies définies
-- ────────────────────────────────────────────────────────────

-- Réactiver RLS
ALTER TABLE annees_academiques ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "annees_select"  ON annees_academiques;
DROP POLICY IF EXISTS "annees_insert"  ON annees_academiques;
DROP POLICY IF EXISTS "annees_update"  ON annees_academiques;
DROP POLICY IF EXISTS "annees_delete"  ON annees_academiques;

-- SELECT : admin de l'école voit ses années + super-admin voit tout
CREATE POLICY "annees_select" ON annees_academiques
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = annees_academiques.ecole_id
    )
  );

-- INSERT
CREATE POLICY "annees_insert" ON annees_academiques
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = annees_academiques.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );

-- UPDATE
CREATE POLICY "annees_update" ON annees_academiques
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = annees_academiques.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );

-- DELETE
CREATE POLICY "annees_delete" ON annees_academiques
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = annees_academiques.ecole_id
        AND role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────
--  CRITIQUE 2 : utilisateurs — SELECT public (true)
--  Fuite noms, rôles, emails inter-écoles
-- ────────────────────────────────────────────────────────────

-- Supprimer la policy trop permissive
DROP POLICY IF EXISTS "utilisateurs_select_any" ON utilisateurs;
DROP POLICY IF EXISTS "utilisateurs_select"     ON utilisateurs;

-- SELECT : chaque utilisateur voit les membres de sa propre école
--          + super-admin voit tout
--          + chaque utilisateur se voit lui-même
CREATE POLICY "utilisateurs_select" ON utilisateurs
  FOR SELECT USING (
    -- Super-admin voit tout
    EXISTS (
      SELECT 1 FROM utilisateurs u2
      WHERE u2.auth_id = auth.uid() AND u2.actif = true
        AND u2.ecole_id IS NULL AND u2.role = 'admin'
    )
    OR
    -- Utilisateur se voit lui-même
    auth_id = auth.uid()
    OR
    -- Admin/scolarité voit les membres de son école
    EXISTS (
      SELECT 1 FROM utilisateurs u2
      WHERE u2.auth_id = auth.uid() AND u2.actif = true
        AND u2.ecole_id = utilisateurs.ecole_id
        AND u2.role IN ('admin', 'scolarite')
    )
  );


-- ────────────────────────────────────────────────────────────
--  CRITIQUE 3 : resultats_cache — INSERT/UPDATE sans filtre école
--  + RLS désactivé
-- ────────────────────────────────────────────────────────────

ALTER TABLE resultats_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cache_select" ON resultats_cache;
DROP POLICY IF EXISTS "cache_insert" ON resultats_cache;
DROP POLICY IF EXISTS "cache_update" ON resultats_cache;
DROP POLICY IF EXISTS "cache_delete" ON resultats_cache;

-- SELECT
CREATE POLICY "cache_select" ON resultats_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = resultats_cache.ecole_id
    )
  );

-- INSERT — filtre sur ecole_id obligatoire
CREATE POLICY "cache_insert" ON resultats_cache
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = resultats_cache.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );

-- UPDATE
CREATE POLICY "cache_update" ON resultats_cache
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = resultats_cache.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );

-- DELETE
CREATE POLICY "cache_delete" ON resultats_cache
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = resultats_cache.ecole_id
        AND role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────
--  CRITIQUE 4 : releves_notes — policy portail corrompue
--  Auto-référence incorrecte dans etudiant_lit_ses_releves
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "etudiant_lit_ses_releves" ON releves_notes;

-- Recréer correctement : l'étudiant lit SES relevés via profiles
-- profiles.auth_id → etudiants.id via profiles.etudiant_id
CREATE POLICY "etudiant_lit_ses_releves" ON releves_notes
  FOR SELECT USING (
    -- Portail étudiant : l'étudiant authentifié voit uniquement ses propres relevés
    etudiant_id = (
      SELECT p.etudiant_id FROM profiles p
      WHERE p.auth_id = auth.uid()
      LIMIT 1
    )
    OR
    -- Back-office : admin/scolarité de l'école
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = releves_notes.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );


-- ────────────────────────────────────────────────────────────
--  CRITIQUE 5 : recalcul_queue — RLS désactivé
-- ────────────────────────────────────────────────────────────

ALTER TABLE recalcul_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recalcul_select" ON recalcul_queue;
DROP POLICY IF EXISTS "recalcul_insert" ON recalcul_queue;
DROP POLICY IF EXISTS "recalcul_delete" ON recalcul_queue;

-- SELECT
CREATE POLICY "recalcul_select" ON recalcul_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = recalcul_queue.ecole_id
    )
  );

-- INSERT
CREATE POLICY "recalcul_insert" ON recalcul_queue
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = recalcul_queue.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );

-- DELETE (nettoyage queue après traitement)
CREATE POLICY "recalcul_delete" ON recalcul_queue
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true AND ecole_id IS NULL AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = recalcul_queue.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );


-- ────────────────────────────────────────────────────────────
--  BONUS : _backup_auth_users_20260512 — à supprimer
-- ────────────────────────────────────────────────────────────
-- Décommenter et exécuter après vérification que la table n'est plus utile :
-- DROP TABLE IF EXISTS _backup_auth_users_20260512;


-- ────────────────────────────────────────────────────────────
--  VÉRIFICATION — à lancer après exécution
-- ────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'annees_academiques','utilisateurs','resultats_cache',
--     'releves_notes','recalcul_queue'
--   );
--
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'annees_academiques','utilisateurs','resultats_cache',
--     'releves_notes','recalcul_queue'
--   )
-- ORDER BY tablename, cmd;
