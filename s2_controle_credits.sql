-- =========================================================================
-- S2 — Contrôle crédits bloquant (30/sem, norme LMD-CAMES)
-- Exécuter dans Supabase SQL Editor
-- =========================================================================

-- Activation du contrôle à l'inscription (désactivé par défaut)
ALTER TABLE regles_ecole
  ADD COLUMN IF NOT EXISTS controle_credits_actif    BOOLEAN DEFAULT false;

-- Seuil minimum de crédits validés par semestre pour autoriser l'avancement
-- Défaut : 24/30 (80 %) — configurable par école
ALTER TABLE regles_ecole
  ADD COLUMN IF NOT EXISTS seuil_credits_avancement  INTEGER DEFAULT 24;

UPDATE regles_ecole
  SET controle_credits_actif    = false WHERE controle_credits_actif    IS NULL;
UPDATE regles_ecole
  SET seuil_credits_avancement  = 24    WHERE seuil_credits_avancement  IS NULL;
