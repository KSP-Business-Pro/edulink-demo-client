-- ============================================================
--  EduLink Sup — Corrections RLS hauts (super-admin écriture)
--  10 tables · Pattern uniforme
--  Super-admin : ecole_id IS NULL AND role = 'admin'
--  détecté via auth_id = auth.uid() sur la même ligne (sans récursion)
-- ============================================================

-- Helper super-admin sans récursion (réutilisé partout) :
-- get_user_ecole_id() IS NULL
-- AND EXISTS (SELECT 1 FROM utilisateurs
--             WHERE auth_id = auth.uid() AND actif = true
--               AND ecole_id IS NULL AND role = 'admin')
--
-- Mais pour éviter toute récursion on utilise get_user_ecole_id() = NULL
-- combiné avec get_my_role() = 'admin' si disponible,
-- sinon on passe par une sous-requête directe sur utilisateurs
-- (pas de récursion car utilisateurs_select autorise auth_id = auth.uid())


-- ────────────────────────────────────────────────────────────
--  1. evaluations
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "evaluations_insert" ON evaluations;
DROP POLICY IF EXISTS "evaluations_update" ON evaluations;
DROP POLICY IF EXISTS "evaluations_delete" ON evaluations;

CREATE POLICY "evaluations_insert" ON evaluations
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "evaluations_update" ON evaluations
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "evaluations_delete" ON evaluations
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  2. notes_lmd — SELECT aussi bloqué pour super-admin
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notes_lmd_select" ON notes_lmd;
DROP POLICY IF EXISTS "notes_lmd_insert" ON notes_lmd;
DROP POLICY IF EXISTS "notes_lmd_update" ON notes_lmd;
DROP POLICY IF EXISTS "notes_lmd_delete" ON notes_lmd;

CREATE POLICY "notes_lmd_select" ON notes_lmd
  FOR SELECT USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "notes_lmd_insert" ON notes_lmd
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "notes_lmd_update" ON notes_lmd
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "notes_lmd_delete" ON notes_lmd
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  3. inscriptions_semestre
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "inscriptions_insert" ON inscriptions_semestre;
DROP POLICY IF EXISTS "inscriptions_update" ON inscriptions_semestre;
DROP POLICY IF EXISTS "inscriptions_delete" ON inscriptions_semestre;

CREATE POLICY "inscriptions_insert" ON inscriptions_semestre
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "inscriptions_update" ON inscriptions_semestre
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "inscriptions_delete" ON inscriptions_semestre
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  4. semestres
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "semestres_insert" ON semestres;
DROP POLICY IF EXISTS "semestres_update" ON semestres;
DROP POLICY IF EXISTS "semestres_delete" ON semestres;

CREATE POLICY "semestres_insert" ON semestres
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "semestres_update" ON semestres
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "semestres_delete" ON semestres
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  5. sessions_evaluation
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sessions_eval_insert" ON sessions_evaluation;
DROP POLICY IF EXISTS "sessions_eval_update" ON sessions_evaluation;
DROP POLICY IF EXISTS "sessions_eval_delete" ON sessions_evaluation;

CREATE POLICY "sessions_eval_insert" ON sessions_evaluation
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "sessions_eval_update" ON sessions_evaluation
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "sessions_eval_delete" ON sessions_evaluation
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  6. unites_enseignement
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ue_insert" ON unites_enseignement;
DROP POLICY IF EXISTS "ue_update" ON unites_enseignement;
DROP POLICY IF EXISTS "ue_delete" ON unites_enseignement;

CREATE POLICY "ue_insert" ON unites_enseignement
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "ue_update" ON unites_enseignement
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "ue_delete" ON unites_enseignement
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  7. matieres_lmd
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "matieres_lmd_insert" ON matieres_lmd;
DROP POLICY IF EXISTS "matieres_lmd_update" ON matieres_lmd;
DROP POLICY IF EXISTS "matieres_lmd_delete" ON matieres_lmd;

CREATE POLICY "matieres_lmd_insert" ON matieres_lmd
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "matieres_lmd_update" ON matieres_lmd
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "matieres_lmd_delete" ON matieres_lmd
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  8. promotions — toutes opérations bloquées
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "promotions_select" ON promotions;
DROP POLICY IF EXISTS "promotions_insert" ON promotions;
DROP POLICY IF EXISTS "promotions_update" ON promotions;
DROP POLICY IF EXISTS "promotions_delete" ON promotions;

CREATE POLICY "promotions_select" ON promotions
  FOR SELECT USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "promotions_insert" ON promotions
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "promotions_update" ON promotions
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );

CREATE POLICY "promotions_delete" ON promotions
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  9. programme_ue — pas de ecole_id direct, jointure via semestres
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "programme_ue_insert" ON programme_ue;
DROP POLICY IF EXISTS "programme_ue_update" ON programme_ue;
DROP POLICY IF EXISTS "programme_ue_delete" ON programme_ue;

CREATE POLICY "programme_ue_insert" ON programme_ue
  FOR INSERT WITH CHECK (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR EXISTS (
      SELECT 1 FROM semestres s
      WHERE s.id = programme_ue.semestre_id
        AND s.ecole_id = get_user_ecole_id()
    )
  );

CREATE POLICY "programme_ue_update" ON programme_ue
  FOR UPDATE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR EXISTS (
      SELECT 1 FROM semestres s
      WHERE s.id = programme_ue.semestre_id
        AND s.ecole_id = get_user_ecole_id()
    )
  );

CREATE POLICY "programme_ue_delete" ON programme_ue
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR EXISTS (
      SELECT 1 FROM semestres s
      WHERE s.id = programme_ue.semestre_id
        AND s.ecole_id = get_user_ecole_id()
    )
  );


-- ────────────────────────────────────────────────────────────
--  10. seances — DELETE manquant super-admin
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "seances_delete" ON seances;

CREATE POLICY "seances_delete" ON seances
  FOR DELETE USING (
    (get_user_ecole_id() IS NULL AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true LIMIT 1) = 'admin')
    OR get_user_ecole_id() = ecole_id
  );


-- ────────────────────────────────────────────────────────────
--  VÉRIFICATION
-- ────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'evaluations','notes_lmd','inscriptions_semestre','semestres',
--     'sessions_evaluation','unites_enseignement','matieres_lmd',
--     'promotions','programme_ue','seances'
--   )
-- ORDER BY tablename, cmd;
