-- =========================================================================
-- S6 — Impact absences → résultats (auto-exclusion + patch fn_resultats)
-- Exécuter dans Supabase SQL Editor
-- =========================================================================

-- ── 1. Colonne source dans exclusions_ue ─────────────────────────────────
-- Distingue les exclusions manuelles (admin) des automatiques (seuil).
-- Les exclusions existantes sont marquées 'manuel' par défaut.

ALTER TABLE exclusions_ue
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manuel';

UPDATE exclusions_ue SET source = 'manuel' WHERE source IS NULL;


-- ── 2. fn_auto_exclure_absences ───────────────────────────────────────────
-- Lit seuil_absence_pct dans regles_ecole et insère les exclusions
-- pour tous les étudiants dépassant ce seuil (injustifié) dans le semestre.
-- Idempotente : n'insère pas si l'exclusion existe déjà (source auto ou manuel).
-- Retourne le nombre de nouvelles exclusions créées.

CREATE OR REPLACE FUNCTION fn_auto_exclure_absences(p_semestre_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ecole_id UUID;
  v_seuil    INTEGER := 30;
  v_count    INTEGER := 0;
BEGIN
  -- Récupérer l'école via les séances du semestre
  SELECT DISTINCT ecole_id INTO v_ecole_id
  FROM seances WHERE semestre_id = p_semestre_id LIMIT 1;

  IF v_ecole_id IS NULL THEN
    RETURN 0; -- Aucune séance enregistrée pour ce semestre
  END IF;

  -- Lire le seuil configuré pour l'école
  SELECT COALESCE(seuil_absence_pct, 30) INTO v_seuil
  FROM regles_ecole WHERE ecole_id = v_ecole_id;

  -- Insérer les nouvelles exclusions (NOT EXISTS = idempotent sans contrainte UNIQUE)
  INSERT INTO exclusions_ue
    (etudiant_id, ue_id, semestre_id, ecole_id, motif, date_exclusion, source)
  SELECT
    v.etudiant_id,
    v.ue_id,
    v.semestre_id,
    v.ecole_id,
    'Exclusion automatique — taux d''absence : ' || v.taux_absence_pct
      || '% (' || v.nb_absences || '/' || v.nb_seances_total || ' séances)',
    CURRENT_DATE,
    'auto'
  FROM v_absences_ue v
  WHERE v.semestre_id      = p_semestre_id
    AND v.etudiant_id      IS NOT NULL
    AND v.taux_absence_pct >= v_seuil
    AND NOT EXISTS (
      SELECT 1 FROM exclusions_ue ex
      WHERE ex.etudiant_id = v.etudiant_id
        AND ex.ue_id       = v.ue_id
        AND ex.semestre_id = v.semestre_id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_auto_exclure_absences(UUID) TO authenticated;


-- ── 3. fn_lever_exclusions_auto ───────────────────────────────────────────
-- Supprime les exclusions AUTO dont le taux est repassé sous le seuil.
-- Utile après correction d'une saisie de présence.
-- Ne touche jamais aux exclusions manuelles (source <> 'auto').
-- Retourne le nombre d'exclusions levées.

CREATE OR REPLACE FUNCTION fn_lever_exclusions_auto(p_semestre_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ecole_id UUID;
  v_seuil    INTEGER := 30;
  v_count    INTEGER := 0;
BEGIN
  SELECT DISTINCT ecole_id INTO v_ecole_id
  FROM seances WHERE semestre_id = p_semestre_id LIMIT 1;

  IF v_ecole_id IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(seuil_absence_pct, 30) INTO v_seuil
  FROM regles_ecole WHERE ecole_id = v_ecole_id;

  -- Supprimer les exclusions auto dont le taux est maintenant sous le seuil
  DELETE FROM exclusions_ue ex
  WHERE ex.semestre_id = p_semestre_id
    AND ex.source      = 'auto'
    AND NOT EXISTS (
      SELECT 1 FROM v_absences_ue v
      WHERE v.etudiant_id      = ex.etudiant_id
        AND v.ue_id             = ex.ue_id
        AND v.semestre_id       = ex.semestre_id
        AND v.taux_absence_pct  >= v_seuil
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_lever_exclusions_auto(UUID) TO authenticated;


-- ── 4. Patch fn_resultats_semestre ────────────────────────────────────────
-- PROBLÈME : ue_validee et credits_acquis dépendent de fn_ue_validee
-- qui peut ignorer exclusions_ue. Un étudiant exclu par absences mais avec
-- moyenne ≥ seuil obtiendrait ses crédits — ce qui est incorrect LMD-CAMES.
-- CORRECTION : on ajoute AND NOT EXISTS(exclusions_ue) sur les deux colonnes.
-- Si fn_ue_validee gère déjà l'exclusion, ce patch est un no-op.

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

    -- ue_validee : false si exclu par absences, même si la moyenne est bonne
    (
      fn_ue_validee(p_etudiant_id, ue.id, p_semestre_id)
      AND NOT EXISTS(
        SELECT 1 FROM exclusions_ue ex
        WHERE ex.etudiant_id = p_etudiant_id
          AND ex.ue_id       = ue.id
          AND ex.semestre_id = p_semestre_id
      )
    )                                                                       AS ue_validee,

    -- est_exclu : inchangé — pour l'affichage "Exclue" dans l'UI
    EXISTS(
      SELECT 1 FROM exclusions_ue ex
      WHERE ex.etudiant_id = p_etudiant_id
        AND ex.ue_id       = ue.id
        AND ex.semestre_id = p_semestre_id
    )                                                                       AS est_exclu,

    -- credits_acquis : 0 si exclu, même avec bonne moyenne
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
