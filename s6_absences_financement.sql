-- =========================================================
-- S6 — Présences seuil configurable + Finances
-- Exécuter dans Supabase SQL Editor
-- =========================================================

-- Ajouter le seuil d'exclusion par absences dans regles_ecole
ALTER TABLE regles_ecole
  ADD COLUMN IF NOT EXISTS seuil_absence_pct INTEGER DEFAULT 30;

-- Valeur par défaut pour les écoles existantes
UPDATE regles_ecole SET seuil_absence_pct = 30
WHERE seuil_absence_pct IS NULL;
