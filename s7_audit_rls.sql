-- ================================================================
-- Audit RLS S7 — Isolation multi-tenant
-- Suppression des 25 politiques auth_all_* (qual=true, with_check=true)
-- qui laissent tout utilisateur authentifié accéder aux données
-- de toutes les écoles.
--
-- ORDRE D'EXÉCUTION :
--   Étape 1 — Ajouter les politiques de remplacement manquantes
--   Étape 2 — Supprimer les 25 auth_all_*
--   Étape 3 — Vérification (doit retourner 0 lignes)
--
-- Exécuter en bloc dans Supabase SQL Editor.
-- ================================================================


-- ── Étape 1 : Politiques de remplacement ─────────────────────────
-- Deux tables n'ont aucune politique d'écriture en dehors de auth_all_*.
-- On les ajoute avant de supprimer pour ne pas casser l'application.

-- resultats_cache : écrit par calculerResultatsBatch (JS, anon+JWT)
DROP POLICY IF EXISTS cache_insert ON resultats_cache;
DROP POLICY IF EXISTS cache_update ON resultats_cache;
DROP POLICY IF EXISTS cache_delete ON resultats_cache;

CREATE POLICY cache_insert ON resultats_cache
  FOR INSERT WITH CHECK (ecole_id = get_user_ecole_id());

CREATE POLICY cache_update ON resultats_cache
  FOR UPDATE
  USING    (ecole_id = get_user_ecole_id())
  WITH CHECK (ecole_id = get_user_ecole_id());

CREATE POLICY cache_delete ON resultats_cache
  FOR DELETE USING (ecole_id = get_user_ecole_id());

-- utilisateurs : les admins doivent pouvoir gérer les comptes de leur école
DROP POLICY IF EXISTS utilisateurs_admin_school ON utilisateurs;

CREATE POLICY utilisateurs_admin_school ON utilisateurs
  FOR ALL
  USING    ((ecole_id = get_user_ecole_id()) AND is_admin_or_directeur())
  WITH CHECK ((ecole_id = get_user_ecole_id()) AND is_admin_or_directeur());


-- ── Étape 2 : Suppression des 25 politiques auth_all_* ───────────

-- Tables LMD / académiques
DROP POLICY IF EXISTS auth_all_notes_lmd          ON notes_lmd;
DROP POLICY IF EXISTS auth_all_evaluations         ON evaluations;
DROP POLICY IF EXISTS auth_all_matieres_lmd        ON matieres_lmd;
DROP POLICY IF EXISTS auth_all_sessions_evaluation ON sessions_evaluation;
DROP POLICY IF EXISTS auth_all_seances             ON seances;
DROP POLICY IF EXISTS auth_all_presences           ON presences;
DROP POLICY IF EXISTS auth_all_programme_ue        ON programme_ue;
DROP POLICY IF EXISTS auth_all_programmes_lmd      ON programmes_lmd;
DROP POLICY IF EXISTS auth_all_unites_enseignement ON unites_enseignement;
DROP POLICY IF EXISTS auth_all_exclusions_ue       ON exclusions_ue;
DROP POLICY IF EXISTS auth_all_releves_notes       ON releves_notes;
DROP POLICY IF EXISTS auth_all_resultats_cache     ON resultats_cache;
DROP POLICY IF EXISTS auth_all_semestres           ON semestres;
DROP POLICY IF EXISTS auth_all_promotions          ON promotions;
DROP POLICY IF EXISTS auth_all_inscriptions_semestre ON inscriptions_semestre;

-- Tables financières / étudiants / enseignants
DROP POLICY IF EXISTS auth_all_factures    ON factures;
DROP POLICY IF EXISTS auth_all_etudiants   ON etudiants;
DROP POLICY IF EXISTS auth_all_enseignants ON enseignants;

-- Tables administratives
DROP POLICY IF EXISTS auth_all_regles_ecole         ON regles_ecole;
DROP POLICY IF EXISTS auth_all_annees_academiques   ON annees_academiques;
DROP POLICY IF EXISTS auth_all_programmes_lmd       ON programmes_lmd;
DROP POLICY IF EXISTS auth_all_messages             ON messages;
DROP POLICY IF EXISTS auth_all_portail_config       ON portail_config;
DROP POLICY IF EXISTS auth_all_push_tokens          ON push_tokens;
DROP POLICY IF EXISTS auth_all_utilisateurs         ON utilisateurs;
DROP POLICY IF EXISTS auth_all_ecoles               ON ecoles;


-- ── Étape 3 : Vérification ────────────────────────────────────────
-- Doit retourner 0 lignes.
-- Si des lignes apparaissent, copier les noms et me les envoyer.

SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'auth_all_%'
ORDER BY tablename;
