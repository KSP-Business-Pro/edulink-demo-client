-- ============================================================
--  EduLink Sup — Migrations S8
--  Supabase : kcfpvnrgutkhakogbjip
--  À exécuter dans l'éditeur SQL Supabase (une section à la fois)
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  1. TABLE notes_historique
--  Trace toutes les modifications de notes (création, correction,
--  passage en absent). Lecture seule pour les non-admins via RLS.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notes_historique (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  etudiant_id    uuid        NOT NULL REFERENCES etudiants(id)    ON DELETE CASCADE,
  evaluation_id  uuid        NOT NULL REFERENCES evaluations(id)  ON DELETE CASCADE,
  ecole_id       uuid        REFERENCES ecoles(id)                ON DELETE CASCADE,
  valeur_ancienne numeric(5,2),          -- NULL si première saisie ou passage en absent
  valeur_nouvelle numeric(5,2),          -- NULL si passage en absent
  modifie_par    uuid        REFERENCES auth.users(id),
  modifie_le     timestamptz NOT NULL DEFAULT now()
);

-- Index pour requêtes fréquentes (audit par étudiant/évaluation)
CREATE INDEX IF NOT EXISTS idx_notes_historique_etudiant
  ON notes_historique (etudiant_id, modifie_le DESC);

CREATE INDEX IF NOT EXISTS idx_notes_historique_eval
  ON notes_historique (evaluation_id, modifie_le DESC);

CREATE INDEX IF NOT EXISTS idx_notes_historique_ecole
  ON notes_historique (ecole_id, modifie_le DESC);

-- RLS : les admins de l'école voient leur historique ; super-admin voit tout
ALTER TABLE notes_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_historique_read" ON notes_historique
  FOR SELECT USING (
    -- Super-admin
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id IS NULL AND role = 'admin'
    )
    OR
    -- Admin de l'école
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND ecole_id = notes_historique.ecole_id
        AND role IN ('admin', 'scolarite')
    )
  );

-- Insert autorisé uniquement via SECURITY DEFINER (le JS insère directement,
-- donc on permet INSERT à l'utilisateur authentifié de la même école)
CREATE POLICY "notes_historique_insert" ON notes_historique
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM utilisateurs
      WHERE auth_id = auth.uid() AND actif = true
        AND (ecole_id IS NULL OR ecole_id = notes_historique.ecole_id)
        AND role IN ('admin', 'scolarite', 'enseignant')
    )
  );

-- Pas de UPDATE ni DELETE (historique immuable)


-- ────────────────────────────────────────────────────────────
--  2. INDEX PERFORMANCE
--  Tables : notes_lmd, resultats_cache, inscriptions_semestre,
--           evaluations, releves_notes
-- ────────────────────────────────────────────────────────────

-- notes_lmd — accès par étudiant + évaluation (le plus fréquent)
CREATE INDEX IF NOT EXISTS idx_notes_lmd_etudiant_eval
  ON notes_lmd (etudiant_id, evaluation_id);

-- notes_lmd — accès batch par session (chargement grille)
CREATE INDEX IF NOT EXISTS idx_notes_lmd_session
  ON notes_lmd (session_id, ecole_id);

-- resultats_cache — lecture par semestre (tableau résultats, délibé)
CREATE INDEX IF NOT EXISTS idx_resultats_cache_semestre
  ON resultats_cache (semestre_id, ecole_id);

-- resultats_cache — lookup par étudiant (fiche, LMD bar)
CREATE INDEX IF NOT EXISTS idx_resultats_cache_etudiant
  ON resultats_cache (etudiant_id, ecole_id);

-- inscriptions_semestre — filtre actif + semestre (très fréquent)
CREATE INDEX IF NOT EXISTS idx_inscriptions_semestre_active
  ON inscriptions_semestre (semestre_id, ecole_id, statut)
  WHERE statut = 'active';

-- evaluations — jointure par matière + session
CREATE INDEX IF NOT EXISTS idx_evaluations_matiere_session
  ON evaluations (matiere_id, session_id);

-- releves_notes — lookup par semestre (module Relevés)
CREATE INDEX IF NOT EXISTS idx_releves_notes_semestre
  ON releves_notes (semestre_id, ecole_id);

-- factures — solde impayé (calcul blocage relevé)
CREATE INDEX IF NOT EXISTS idx_factures_etudiant_statut
  ON factures (etudiant_id, statut)
  WHERE statut <> 'annule';


-- ────────────────────────────────────────────────────────────
--  3. VÉRIFICATION (optionnel — à lancer séparément)
-- ────────────────────────────────────────────────────────────
-- SELECT tablename, indexname FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'notes_historique','notes_lmd','resultats_cache',
--     'inscriptions_semestre','evaluations','releves_notes','factures'
--   )
-- ORDER BY tablename, indexname;
