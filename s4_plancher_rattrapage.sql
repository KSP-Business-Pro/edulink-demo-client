-- =========================================================================
-- S4 — Note plancher + Rattrapage LMD-CAMES
-- Exécuter dans Supabase SQL Editor
-- =========================================================================

-- ── 1. fn_check_plancher ─────────────────────────────────────────────────────
-- Retourne les ue_id ayant au moins une note en dessous du seuil plancher
-- pour un étudiant et un semestre donnés.
-- Appelée par _calculerUnEtudiant quand note_plancher_active = true.

CREATE OR REPLACE FUNCTION fn_check_plancher(
  p_etudiant_id UUID,
  p_semestre_id UUID,
  p_seuil       NUMERIC
)
RETURNS TABLE (ue_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.ue_id
  FROM notes_lmd n
  JOIN evaluations e          ON e.id  = n.evaluation_id
  JOIN matieres_lmd m         ON m.id  = e.matiere_id
  JOIN sessions_evaluation se ON se.id = e.session_id
  WHERE n.etudiant_id   = p_etudiant_id
    AND se.semestre_id  = p_semestre_id
    AND se.type_session = 'normale'
    AND n.absent        = false
    AND n.valeur        IS NOT NULL
    AND n.valeur        < p_seuil;
$$;

GRANT EXECUTE ON FUNCTION fn_check_plancher(UUID, UUID, NUMERIC) TO authenticated;


-- ── 2. fn_moy_ue_rattrapage ──────────────────────────────────────────────────
-- Calcule la moyenne par UE à partir de la SESSION DE RATTRAPAGE uniquement.
-- Retourne (ue_id, moy_rattrapage) pour toutes les UE ayant des notes de ratt.

CREATE OR REPLACE FUNCTION fn_moy_ue_rattrapage(
  p_etudiant_id UUID,
  p_semestre_id UUID
)
RETURNS TABLE (ue_id UUID, moy_rattrapage NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.ue_id,
    ROUND(
      SUM(n.valeur * COALESCE(e.ponderation, 1)) /
      NULLIF(SUM(COALESCE(e.ponderation, 1)), 0)
    , 2) AS moy_rattrapage
  FROM notes_lmd n
  JOIN evaluations e          ON e.id  = n.evaluation_id
  JOIN matieres_lmd m         ON m.id  = e.matiere_id
  JOIN sessions_evaluation se ON se.id = e.session_id
  WHERE n.etudiant_id   = p_etudiant_id
    AND se.semestre_id  = p_semestre_id
    AND se.type_session = 'rattrapage'
    AND n.absent        = false
    AND n.valeur        IS NOT NULL
  GROUP BY m.ue_id;
$$;

GRANT EXECUTE ON FUNCTION fn_moy_ue_rattrapage(UUID, UUID) TO authenticated;
