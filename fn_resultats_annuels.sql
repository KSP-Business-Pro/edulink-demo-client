-- =============================================================================
-- fn_resultats_annuels — Calcul des résultats annuels LMD-CAMES
-- Appel  : SELECT fn_resultats_annuels('<etudiant_id>', '<annee_id>');
-- Retour : JSONB  { credits_valides, credits_total, nb_semestres,
--                   semestres_valides, moyenne_annuelle, annee_validee,
--                   compensation, mention, decision }
-- Règles : agrège les resultats_cache semestriels + applique compensation
--          configurée dans regles_ecole (compensation_active, seuil_validation_ue)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_resultats_annuels(
  p_etudiant_id UUID,
  p_annee_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ecole_id              UUID;
  v_compensation_active   BOOLEAN := FALSE;
  v_seuil_ue              NUMERIC := 10;
  v_credits_valides       INT     := 0;
  v_credits_total         INT     := 0;
  v_sum_moy               NUMERIC := 0;
  v_nb_sem_avec_moy       INT     := 0;
  v_nb_semestres          INT     := 0;
  v_semestres_valides     INT     := 0;
  v_moyenne               NUMERIC;
  v_annee_validee         BOOLEAN := FALSE;
  v_compensation          BOOLEAN := FALSE;
  v_mention               TEXT;
  v_decision              TEXT;
  rec                     RECORD;
BEGIN
  -- 1. Récupérer ecole_id de l'étudiant
  SELECT ecole_id INTO v_ecole_id
  FROM etudiants WHERE id = p_etudiant_id;

  IF v_ecole_id IS NULL THEN
    RETURN '{"error":"etudiant_non_trouve"}'::JSONB;
  END IF;

  -- 2. Règles LMD de l'école
  SELECT
    COALESCE(compensation_active, FALSE),
    COALESCE(seuil_validation_ue, 10)
  INTO v_compensation_active, v_seuil_ue
  FROM regles_ecole
  WHERE ecole_id = v_ecole_id;

  -- 3. Agréger les résultats semestriels de l'année
  --    (jointure resultats_cache → semestres → annee_academique_id)
  FOR rec IN
    SELECT
      rc.credits_valides,
      rc.semestre_valide,
      rc.moyenne_semestre
    FROM resultats_cache rc
    JOIN semestres s ON s.id = rc.semestre_id
    WHERE rc.etudiant_id  = p_etudiant_id
      AND rc.ecole_id     = v_ecole_id
      AND s.annee_academique_id = p_annee_id
  LOOP
    v_nb_semestres    := v_nb_semestres + 1;
    v_credits_valides := v_credits_valides + COALESCE(rec.credits_valides, 0);
    v_credits_total   := v_credits_total   + 30;  -- 30 crédits/semestre (norme LMD)

    IF rec.semestre_valide THEN
      v_semestres_valides := v_semestres_valides + 1;
    END IF;

    IF rec.moyenne_semestre IS NOT NULL THEN
      v_sum_moy           := v_sum_moy + rec.moyenne_semestre;
      v_nb_sem_avec_moy   := v_nb_sem_avec_moy + 1;
    END IF;
  END LOOP;

  -- Aucun semestre calculé pour cette année
  IF v_nb_semestres = 0 THEN
    RETURN jsonb_build_object(
      'credits_valides',   0,
      'credits_total',     0,
      'nb_semestres',      0,
      'semestres_valides', 0,
      'moyenne_annuelle',  NULL,
      'annee_validee',     FALSE,
      'compensation',      FALSE,
      'mention',           NULL,
      'decision',          'non_calcule'
    );
  END IF;

  -- 4. Moyenne annuelle (moyenne arithmétique des moyennes semestrielles)
  v_moyenne := CASE
    WHEN v_nb_sem_avec_moy > 0
      THEN ROUND(v_sum_moy / v_nb_sem_avec_moy, 2)
    ELSE NULL
  END;

  -- 5. Validation : tous les semestres doivent être validés
  v_annee_validee := (v_semestres_valides = v_nb_semestres AND v_nb_semestres > 0);

  -- 6. Compensation CAMES :
  --    Si compensation activée ET moyenne ≥ seuil ET au plus 1 semestre raté
  IF NOT v_annee_validee
     AND v_compensation_active
     AND v_moyenne IS NOT NULL
     AND v_moyenne >= v_seuil_ue
     AND (v_nb_semestres - v_semestres_valides) <= 1
  THEN
    v_annee_validee := TRUE;
    v_compensation  := TRUE;
  END IF;

  -- 7. Mention (barème CAMES standard)
  v_mention := CASE
    WHEN v_moyenne IS NULL THEN NULL
    WHEN v_moyenne >= 16   THEN 'tres_bien'
    WHEN v_moyenne >= 14   THEN 'bien'
    WHEN v_moyenne >= 12   THEN 'assez_bien'
    WHEN v_moyenne >= 10   THEN 'passable'
    ELSE                        'insuffisant'
  END;

  -- 8. Décision pédagogique
  v_decision := CASE
    WHEN v_annee_validee     THEN 'admis'
    WHEN v_moyenne >= 8      THEN 'ajourné'
    ELSE                          'redoublant'
  END;

  RETURN jsonb_build_object(
    'credits_valides',   v_credits_valides,
    'credits_total',     v_credits_total,
    'nb_semestres',      v_nb_semestres,
    'semestres_valides', v_semestres_valides,
    'moyenne_annuelle',  v_moyenne,
    'annee_validee',     v_annee_validee,
    'compensation',      v_compensation,
    'mention',           v_mention,
    'decision',          v_decision
  );
END;
$$;

-- Accès aux utilisateurs authentifiés seulement
GRANT EXECUTE ON FUNCTION fn_resultats_annuels(UUID, UUID) TO authenticated;
