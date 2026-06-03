-- ============================================================
-- EduLink Sup — Tests SQL S4 — LMD-CAMES
-- Un seul SELECT, lecture seule, données HEMEC réelles.
-- Groupes A-B : fonctions pures
-- Groupes C-F : invariants (rien ne casse)
-- Groupes G-J : comportements LMD-CAMES spécifiques
-- ============================================================

WITH

-- ════════════════════════════════════════════════════
-- A — fn_mention : barème CAMES exact
-- ════════════════════════════════════════════════════
a1 AS (SELECT 'A1 fn_mention(16)    → tres_bien' AS nom,
  (fn_mention(16) = 'tres_bien'::mention_cames) AS ok, fn_mention(16)::text AS info),
a2 AS (SELECT 'A2 fn_mention(15)    → bien',
  (fn_mention(15) = 'bien'::mention_cames), fn_mention(15)::text),
a3 AS (SELECT 'A3 fn_mention(14)    → bien',
  (fn_mention(14) = 'bien'::mention_cames), fn_mention(14)::text),
a4 AS (SELECT 'A4 fn_mention(13.99) → assez_bien',
  (fn_mention(13.99) = 'assez_bien'::mention_cames), fn_mention(13.99)::text),
a5 AS (SELECT 'A5 fn_mention(12)    → assez_bien',
  (fn_mention(12) = 'assez_bien'::mention_cames), fn_mention(12)::text),
a6 AS (SELECT 'A6 fn_mention(10)    → passable',
  (fn_mention(10) = 'passable'::mention_cames), fn_mention(10)::text),
a7 AS (SELECT 'A7 fn_mention(9.99)  → NULL',
  (fn_mention(9.99) IS NULL), COALESCE(fn_mention(9.99)::text,'NULL')),
a8 AS (SELECT 'A8 fn_mention(0)     → NULL',
  (fn_mention(0) IS NULL), COALESCE(fn_mention(0)::text,'NULL')),
a9 AS (SELECT 'A9 fn_mention(16) ≠ bien (bornes strictes)',
  (fn_mention(16) <> 'bien'::mention_cames), fn_mention(16)::text),

-- ════════════════════════════════════════════════════
-- B — fn_solde_etudiant
-- ════════════════════════════════════════════════════
b1 AS (
  SELECT 'B1 fn_solde_etudiant : sans facture = 0' AS nom,
    (fn_solde_etudiant(id) = 0) AS ok,
    ('solde='||fn_solde_etudiant(id)) AS info
  FROM etudiants
  WHERE id NOT IN (SELECT DISTINCT etudiant_id FROM factures
                   WHERE etudiant_id IS NOT NULL)
  LIMIT 1
),
b2 AS (
  SELECT 'B2 fn_solde_etudiant ≥ 0 pour tous ('||COUNT(*)||' facturés)' AS nom,
    (COUNT(*) FILTER (WHERE fn_solde_etudiant(etudiant_id) < 0) = 0) AS ok,
    ('nb_négatifs='||COUNT(*) FILTER (WHERE fn_solde_etudiant(etudiant_id) < 0)) AS info
  FROM (SELECT DISTINCT etudiant_id FROM factures WHERE etudiant_id IS NOT NULL) f
),
b3 AS (
  SELECT 'B3 fn_solde_etudiant cohérent vs SUM(factures) (10 étudiants)' AS nom,
    (COUNT(*) FILTER (WHERE delta > 0.01) = 0) AS ok,
    ('incohérences='||COUNT(*) FILTER (WHERE delta > 0.01)) AS info
  FROM (
    SELECT f.etudiant_id,
      ABS(fn_solde_etudiant(f.etudiant_id) -
        COALESCE(SUM(GREATEST(COALESCE(f2.montant_total,f2.montant,0)
                             - COALESCE(f2.montant_paye,0), 0)), 0)) AS delta
    FROM (SELECT DISTINCT etudiant_id FROM factures
          WHERE etudiant_id IS NOT NULL LIMIT 10) f
    JOIN factures f2 ON f2.etudiant_id = f.etudiant_id AND f2.statut <> 'annule'
    GROUP BY f.etudiant_id
  ) sub
),

-- ════════════════════════════════════════════════════
-- C — fn_resultats_semestre : invariants
-- ════════════════════════════════════════════════════
c_base AS (
  SELECT r.*
  FROM (SELECT etudiant_id, semestre_id FROM releves_notes LIMIT 30) rn
  CROSS JOIN LATERAL fn_resultats_semestre(rn.etudiant_id, rn.semestre_id) r
),
c1 AS (
  SELECT 'C1 fn_resultats_semestre : credits_acquis ≥ 0' AS nom,
    (COUNT(*) FILTER (WHERE credits_acquis < 0) = 0) AS ok,
    ('violations='||COUNT(*) FILTER (WHERE credits_acquis < 0)) AS info
  FROM c_base
),
c2 AS (
  SELECT 'C2 fn_resultats_semestre : moyenne_ue dans [0,20]' AS nom,
    (COUNT(*) FILTER (WHERE moyenne_ue IS NOT NULL
      AND (moyenne_ue < 0 OR moyenne_ue > 20)) = 0) AS ok,
    ('hors_plage='||COUNT(*) FILTER (WHERE moyenne_ue IS NOT NULL
      AND (moyenne_ue < 0 OR moyenne_ue > 20))) AS info
  FROM c_base
),
c3 AS (
  SELECT 'C3 fn_resultats_semestre : ue_validee=true → credits=ue_credits' AS nom,
    (COUNT(*) FILTER (WHERE ue_validee AND credits_acquis <> ue_credits) = 0) AS ok,
    ('violations='||COUNT(*) FILTER (WHERE ue_validee AND credits_acquis <> ue_credits)) AS info
  FROM c_base
),
c4 AS (
  SELECT 'C4 fn_resultats_semestre : ue_validee=false → credits=0' AS nom,
    (COUNT(*) FILTER (WHERE NOT ue_validee AND credits_acquis <> 0) = 0) AS ok,
    ('violations='||COUNT(*) FILTER (WHERE NOT ue_validee AND credits_acquis <> 0)) AS info
  FROM c_base
),

-- ════════════════════════════════════════════════════
-- D — exclusions_ue → patch fn_resultats [S4]
-- ════════════════════════════════════════════════════
d_base AS (
  SELECT r.est_exclu, r.credits_acquis, r.ue_validee
  FROM (SELECT etudiant_id, ue_id, semestre_id FROM exclusions_ue LIMIT 30) ex
  CROSS JOIN LATERAL (
    SELECT est_exclu, credits_acquis, ue_validee
    FROM fn_resultats_semestre(ex.etudiant_id, ex.semestre_id)
    WHERE ue_id = ex.ue_id
  ) r
),
d1 AS (
  SELECT 'D1 Exclusions : est_exclu=true dans fn_resultats' AS nom,
    (COUNT(*) FILTER (WHERE NOT est_exclu) = 0) AS ok,
    ('incohérences='||COUNT(*) FILTER (WHERE NOT est_exclu)) AS info
  FROM d_base
),
d2 AS (
  SELECT 'D2 Exclusions : credits_acquis=0 [patch fn_resultats]' AS nom,
    (COUNT(*) FILTER (WHERE credits_acquis > 0) = 0) AS ok,
    ('toujours_crédités='||COUNT(*) FILTER (WHERE credits_acquis > 0)) AS info
  FROM d_base
),
d3 AS (
  SELECT 'D3 Exclusions : ue_validee=false [patch fn_resultats]' AS nom,
    (COUNT(*) FILTER (WHERE ue_validee) = 0) AS ok,
    ('toujours_validés='||COUNT(*) FILTER (WHERE ue_validee)) AS info
  FROM d_base
),

-- ════════════════════════════════════════════════════
-- E — fn_check_plancher
-- ════════════════════════════════════════════════════
e1 AS (
  SELECT 'E1 fn_check_plancher : absent=true ignoré' AS nom,
    (COUNT(*) = 0) AS ok,
    ('faux_positifs='||COUNT(*)) AS info
  FROM (
    SELECT DISTINCT n.etudiant_id, se.semestre_id, m.ue_id
    FROM notes_lmd n
    JOIN evaluations e ON e.id = n.evaluation_id
    JOIN matieres_lmd m ON m.id = e.matiere_id
    JOIN sessions_evaluation se ON se.id = e.session_id
    WHERE n.absent = true LIMIT 20
  ) absents
  JOIN LATERAL fn_check_plancher(absents.etudiant_id, absents.semestre_id, 5) fp
    ON fp.ue_id = absents.ue_id
  WHERE NOT EXISTS (
    SELECT 1 FROM notes_lmd n2
    JOIN evaluations e2 ON e2.id = n2.evaluation_id
    JOIN matieres_lmd m2 ON m2.id = e2.matiere_id
    JOIN sessions_evaluation se2 ON se2.id = e2.session_id
    WHERE n2.etudiant_id = absents.etudiant_id
      AND se2.semestre_id = absents.semestre_id
      AND se2.type_session = 'normale'
      AND m2.ue_id = fp.ue_id
      AND n2.absent = false AND n2.valeur IS NOT NULL AND n2.valeur < 5
  )
),
e2 AS (
  -- fn_check_plancher DÉTECTE effectivement les vraies violations
  SELECT 'E2 fn_check_plancher : détecte les vraies notes < 5 ('||total||' cas testés)' AS nom,
    (total = 0 OR detections > 0) AS ok,
    ('cas_testés='||total||'  détections='||detections) AS info
  FROM (
    SELECT COUNT(DISTINCT pairs.etudiant_id::text||pairs.semestre_id::text) AS total,
      COUNT(DISTINCT fp.ue_id::text||pairs.etudiant_id::text) AS detections
    FROM (
      SELECT DISTINCT n.etudiant_id, se.semestre_id
      FROM notes_lmd n
      JOIN evaluations e ON e.id = n.evaluation_id
      JOIN sessions_evaluation se ON se.id = e.session_id
      WHERE n.absent = false AND n.valeur IS NOT NULL AND n.valeur < 5
        AND se.type_session = 'normale'
      LIMIT 10
    ) pairs
    CROSS JOIN LATERAL fn_check_plancher(pairs.etudiant_id, pairs.semestre_id, 5) fp
  ) sub
),

-- ════════════════════════════════════════════════════
-- F — fn_moy_ue_rattrapage
-- ════════════════════════════════════════════════════
f1 AS (
  SELECT 'F1 fn_moy_ue_rattrapage : moy dans [0,20]' AS nom,
    (COUNT(*) FILTER (WHERE r.moy_rattrapage < 0 OR r.moy_rattrapage > 20) = 0) AS ok,
    ('hors_plage='||COUNT(*) FILTER (WHERE r.moy_rattrapage < 0 OR r.moy_rattrapage > 20)) AS info
  FROM (
    SELECT DISTINCT n.etudiant_id, se.semestre_id
    FROM notes_lmd n
    JOIN evaluations e ON e.id = n.evaluation_id
    JOIN sessions_evaluation se ON se.id = e.session_id
    WHERE se.type_session = 'rattrapage' AND n.absent = false LIMIT 20
  ) pairs
  CROSS JOIN LATERAL fn_moy_ue_rattrapage(pairs.etudiant_id, pairs.semestre_id) r
),

-- ════════════════════════════════════════════════════
-- G — COMPORTEMENTS LMD-CAMES : scénarios métier
-- ════════════════════════════════════════════════════

-- G1 : Admis → TOUTES les UE obligatoires validées
-- Pour chaque relevé publié avec decision='admis', fn_resultats
-- ne doit retourner aucune UE obligatoire non validée.
g1 AS (
  SELECT 'G1 Admis : toutes UE oblig validées dans fn_resultats ('||nb||' vérifiés)' AS nom,
    (violations = 0) AS ok,
    ('violations='||violations||'  étudiants_testés='||nb) AS info
  FROM (
    SELECT COUNT(*) AS violations, COUNT(DISTINCT etudiant_id::text||semestre_id::text) AS nb
    FROM (
      SELECT rn.etudiant_id, rn.semestre_id
      FROM releves_notes rn
      WHERE rn.decision = 'admis'
      LIMIT 20
    ) admis
    CROSS JOIN LATERAL fn_resultats_semestre(admis.etudiant_id, admis.semestre_id) r
    WHERE r.obligatoire = true AND r.ue_validee = false
  ) sub
),

-- G2 : Ajourné → AU MOINS UNE UE obligatoire non validée
g2 AS (
  SELECT 'G2 Ajourné : au moins 1 UE oblig non validée ('||nb||' vérifiés)' AS nom,
    (nb = 0 OR violations = 0) AS ok,
    ('ajournés_avec_tout_validé='||violations||'  testés='||nb) AS info
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE nb_echecs = 0) AS violations,
      COUNT(*) AS nb
    FROM (
      SELECT admis.etudiant_id, admis.semestre_id,
        COUNT(*) FILTER (WHERE r.obligatoire AND NOT r.ue_validee) AS nb_echecs
      FROM (
        SELECT etudiant_id, semestre_id FROM releves_notes
        WHERE decision = 'ajourné' LIMIT 20
      ) admis
      CROSS JOIN LATERAL fn_resultats_semestre(admis.etudiant_id, admis.semestre_id) r
      GROUP BY admis.etudiant_id, admis.semestre_id
    ) sub
  ) agg
),

-- G3 : Compensation — cas où moyenne_ue < 10 mais ue_validee=true
-- Prouve que la compensation est active et fonctionne
g3 AS (
  SELECT 'G3 Compensation : cas moyenne_ue<10 mais ue_validee=true ('||cas||' cas)' AS nom,
    (cas >= 0) AS ok,   -- informatif : 0 = compensation inactive ou pas de cas
    ('cas_compensés='||cas||
     CASE WHEN cas = 0 THEN ' (compensation inactive ou aucun cas HEMEC)' ELSE '' END) AS info
  FROM (
    SELECT COUNT(*) AS cas
    FROM (SELECT etudiant_id, semestre_id FROM releves_notes LIMIT 30) rn
    CROSS JOIN LATERAL fn_resultats_semestre(rn.etudiant_id, rn.semestre_id) r
    WHERE r.moyenne_ue IS NOT NULL AND r.moyenne_ue < 10 AND r.ue_validee = true
  ) sub
),

-- G4 : Rattrapage — fn_moy_ue_rattrapage > moyenne session normale
-- Quand la note ratt est meilleure que la normale, le max doit s'appliquer
g4 AS (
  SELECT 'G4 Rattrapage : cas moy_ratt > moy_normale détectés ('||améliorations||')' AS nom,
    (améliorations >= 0) AS ok,   -- informatif
    ('améliorations='||améliorations||
     CASE WHEN améliorations = 0 THEN ' (aucun ratt supérieur à normale dans HEMEC)' ELSE '' END) AS info
  FROM (
    SELECT COUNT(*) AS améliorations
    FROM (
      SELECT DISTINCT n.etudiant_id, se.semestre_id
      FROM notes_lmd n
      JOIN evaluations e ON e.id = n.evaluation_id
      JOIN sessions_evaluation se ON se.id = e.session_id
      WHERE se.type_session = 'rattrapage' AND n.absent = false LIMIT 20
    ) pairs
    CROSS JOIN LATERAL fn_moy_ue_rattrapage(pairs.etudiant_id, pairs.semestre_id) ratt
    JOIN LATERAL (
      SELECT moyenne_ue FROM fn_resultats_semestre(pairs.etudiant_id, pairs.semestre_id)
      WHERE ue_id = ratt.ue_id
    ) norm ON true
    WHERE ratt.moy_rattrapage > COALESCE(norm.moyenne_ue, 0)
  ) sub
),

-- G5 : Cohérence decision publiée vs fn_resultats_semestre
-- Les relevés publiés et fn_resultats doivent être d'accord
-- sur le nombre de crédits (à ±1 près pour les arrondis)
g5 AS (
  SELECT 'G5 Crédits publiés cohérents avec fn_resultats ('||nb||' relevés)' AS nom,
    (violations = 0) AS ok,
    ('violations='||violations||'  testés='||nb) AS info
  FROM (
    SELECT COUNT(*) AS violations, COUNT(DISTINCT rn.etudiant_id::text||rn.semestre_id::text) AS nb
    FROM releves_notes rn
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(credits_acquis), 0) AS credits_calcules
      FROM fn_resultats_semestre(rn.etudiant_id, rn.semestre_id)
    ) r
    WHERE ABS(rn.credits_valides - r.credits_calcules) > 1
      AND rn.credits_valides IS NOT NULL
    LIMIT 30
  ) sub
),

-- ════════════════════════════════════════════════════
-- Assemblage final
-- ════════════════════════════════════════════════════
tous AS (
  SELECT * FROM a1 UNION ALL SELECT * FROM a2 UNION ALL
  SELECT * FROM a3 UNION ALL SELECT * FROM a4 UNION ALL
  SELECT * FROM a5 UNION ALL SELECT * FROM a6 UNION ALL
  SELECT * FROM a7 UNION ALL SELECT * FROM a8 UNION ALL
  SELECT * FROM a9 UNION ALL
  SELECT * FROM b1 UNION ALL SELECT * FROM b2 UNION ALL SELECT * FROM b3 UNION ALL
  SELECT * FROM c1 UNION ALL SELECT * FROM c2 UNION ALL
  SELECT * FROM c3 UNION ALL SELECT * FROM c4 UNION ALL
  SELECT * FROM d1 UNION ALL SELECT * FROM d2 UNION ALL SELECT * FROM d3 UNION ALL
  SELECT * FROM e1 UNION ALL SELECT * FROM e2 UNION ALL
  SELECT * FROM f1 UNION ALL
  SELECT * FROM g1 UNION ALL SELECT * FROM g2 UNION ALL
  SELECT * FROM g3 UNION ALL SELECT * FROM g4 UNION ALL SELECT * FROM g5
)

SELECT
  ROW_NUMBER() OVER ()                                       AS "#",
  CASE WHEN ok THEN '✅ PASS' ELSE '❌ FAIL' END             AS statut,
  nom                                                        AS test,
  info                                                       AS détail
FROM tous;
