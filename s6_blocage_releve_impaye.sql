-- =========================================================================
-- S6 — Blocage relevé si impayés (configurable)
-- Exécuter dans Supabase SQL Editor
-- =========================================================================

-- ── 1. Config dans regles_ecole ──────────────────────────────────────────
-- blocage_releve_impaye   : active/désactive le blocage à la publication
-- tolerance_impaye_releve : montant d'impayé toléré (publication autorisée
--                           tant que le solde dû reste <= cette valeur)
ALTER TABLE regles_ecole
  ADD COLUMN IF NOT EXISTS blocage_releve_impaye   BOOLEAN DEFAULT false;

ALTER TABLE regles_ecole
  ADD COLUMN IF NOT EXISTS tolerance_impaye_releve NUMERIC DEFAULT 0;

-- Valeurs par défaut pour les écoles existantes
UPDATE regles_ecole SET blocage_releve_impaye   = false WHERE blocage_releve_impaye   IS NULL;
UPDATE regles_ecole SET tolerance_impaye_releve = 0     WHERE tolerance_impaye_releve IS NULL;


-- ── 2. fn_solde_etudiant ─────────────────────────────────────────────────
-- Retourne le solde total dû par un étudiant (toutes factures non annulées).
-- Les factures soldées ou en trop-perçu ne génèrent pas de solde négatif
-- (GREATEST(..., 0)), pour ne pas compenser une dette par un crédit.
-- Appelée par publierReleve quand blocage_releve_impaye = true.
CREATE OR REPLACE FUNCTION fn_solde_etudiant(p_etudiant_id UUID)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    GREATEST(COALESCE(f.montant_total, f.montant, 0) - COALESCE(f.montant_paye, 0), 0)
  ), 0)
  FROM factures f
  WHERE f.etudiant_id = p_etudiant_id
    AND f.statut <> 'annule';
$$;

GRANT EXECUTE ON FUNCTION fn_solde_etudiant(UUID) TO authenticated;
