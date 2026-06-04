-- =========================================================================
-- Fix RLS — fn_resultats_semestre SECURITY DEFINER + resultats_cache
-- Problème : get_user_ecole_id() retourne NULL dans le contexte RLS INSERT
--            → 403 sur l'upsert cache, notes_lmd invisibles → 0 crédits
-- Solution : SECURITY DEFINER sur fn_resultats_semestre (bypasse RLS sur
--            toutes les tables qu'elle lit) + politique cache basée sur
--            auth.uid() qui ne dépend pas de get_user_ecole_id()
-- =========================================================================

-- ── 1. Remettre RLS actif sur resultats_cache ────────────────────────────
ALTER TABLE public.resultats_cache ENABLE ROW LEVEL SECURITY;

-- ── 2. Politiques write basées sur auth.uid() (contourne le bug) ─────────
DROP POLICY IF EXISTS cache_insert ON resultats_cache;
DROP POLICY IF EXISTS cache_update ON resultats_cache;

CREATE POLICY cache_insert ON resultats_cache
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY cache_update ON resultats_cache
  FOR UPDATE
  USING    (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── 3. fn_resultats_semestre → SECURITY DEFINER ──────────────────────────
-- Bypasse RLS sur programme_ue, unites_enseignement, exclusions_ue,
-- notes_lmd, evaluations (via fn_ue_validee / fn_moyenne_ue).
-- Sécurité : lecture seule, scopée par (etudiant_id, semestre_id).
CREATE OR REPLACE FUNCTION public.fn_resultats_semestre(
  p_etudiant_id UUID,
  p_semestre_id UUID
)
RETURNS TABLE(
  ue_id          UUID,
  ue_code        TEXT,
  ue_intitule    TEXT,
  ue_credits     INTEGER,
  type_ue        type_ue,
  obligatoire    BOOLEAN,
  poids_cc       NUMERIC,
  poids_examen   NUMERIC,
  moyenne_ue     NUMERIC,
  ue_validee     BOOLEAN,
  est_exclu      BOOLEAN,
  credits_acquis INTEGER,
  mention_ue     mention_cames
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    ue.id                                                                   AS ue_id,
    ue.code                                                                 AS ue_code,
    ue.intitule                                                             AS ue_intitule,
    ue.credits_cect                                                         AS ue_credits,
    ue.type_ue                                                              AS type_ue,
    pu.obligatoire                                                          AS obligatoire,
    ue.poids_cc                                                             AS poids_cc,
    ue.poids_examen                                                         AS poids_examen,
    fn_moyenne_ue(p_etudiant_id, ue.id, p_semestre_id)                     AS moyenne_ue,
    (
      fn_ue_validee(p_etudiant_id, ue.id, p_semestre_id)
      AND NOT EXISTS(
        SELECT 1 FROM exclusions_ue ex
        WHERE ex.etudiant_id = p_etudiant_id
          AND ex.ue_id       = ue.id
          AND ex.semestre_id = p_semestre_id
      )
    )                                                                       AS ue_validee,
    EXISTS(
      SELECT 1 FROM exclusions_ue ex
      WHERE ex.etudiant_id = p_etudiant_id
        AND ex.ue_id       = ue.id
        AND ex.semestre_id = p_semestre_id
    )                                                                       AS est_exclu,
    CASE
      WHEN fn_ue_validee(p_etudiant_id, ue.id, p_semestre_id)
        AND NOT EXISTS(
          SELECT 1 FROM exclusions_ue ex
          WHERE ex.etudiant_id = p_etudiant_id
            AND ex.ue_id       = ue.id
            AND ex.semestre_id = p_semestre_id
        )
      THEN ue.credits_cect
      ELSE 0
    END                                                                     AS credits_acquis,
    fn_mention(fn_moyenne_ue(p_etudiant_id, ue.id, p_semestre_id))         AS mention_ue
  FROM programme_ue pu
  JOIN unites_enseignement ue ON pu.ue_id = ue.id
  WHERE pu.semestre_id = p_semestre_id
  ORDER BY pu.obligatoire DESC, ue.code;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_resultats_semestre(UUID, UUID) TO authenticated;
