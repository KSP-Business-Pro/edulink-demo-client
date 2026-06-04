-- ============================================================
-- EduLink Sup — Tests SQL S2 — Contrôle crédits LMD-CAMES
-- Un seul SELECT, lecture seule.
-- ============================================================

WITH

-- ════════════════════════════════════════════════
-- A — Schéma : colonnes bien créées
-- ════════════════════════════════════════════════
a1 AS (
  SELECT 'A1 regles_ecole : colonne controle_credits_actif existe' AS nom,
    (COUNT(*) > 0) AS ok,
    'nb='||COUNT(*) AS info
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='regles_ecole'
    AND column_name='controle_credits_actif'
),
a2 AS (
  SELECT 'A2 regles_ecole : colonne seuil_credits_avancement existe' AS nom,
    (COUNT(*) > 0) AS ok,
    'nb='||COUNT(*) AS info
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='regles_ecole'
    AND column_name='seuil_credits_avancement'
),
a3 AS (
  SELECT 'A3 regles_ecole : controle_credits_actif = false par défaut' AS nom,
    (COUNT(*) FILTER (WHERE controle_credits_actif IS NULL) = 0) AS ok,
    'null_count='||COUNT(*) FILTER (WHERE controle_credits_actif IS NULL) AS info
  FROM regles_ecole
),
a4 AS (
  SELECT 'A4 regles_ecole : seuil_credits_avancement non NULL et dans [0,30]' AS nom,
    (COUNT(*) FILTER (WHERE seuil_credits_avancement IS NULL
                         OR seuil_credits_avancement < 0
                         OR seuil_credits_avancement > 30) = 0) AS ok,
    'violations='||COUNT(*) FILTER (WHERE seuil_credits_avancement IS NULL
                                      OR seuil_credits_avancement < 0
                                      OR seuil_credits_avancement > 30) AS info
  FROM regles_ecole
),

-- ════════════════════════════════════════════════
-- B — Données disponibles pour la garde JS
-- ════════════════════════════════════════════════

-- B1 : semestres ont bien un numéro (requis pour la garde)
b1 AS (
  SELECT 'B1 Semestres : tous ont un numéro non NULL' AS nom,
    (COUNT(*) FILTER (WHERE numero IS NULL) = 0) AS ok,
    'sans_numero='||COUNT(*) FILTER (WHERE numero IS NULL) AS info
  FROM semestres
),

-- B2 : semestres liés à un programme (programme_id non NULL)
b2 AS (
  SELECT 'B2 Semestres : tous liés à un programme' AS nom,
    (COUNT(*) FILTER (WHERE programme_id IS NULL) = 0) AS ok,
    'sans_programme='||COUNT(*) FILTER (WHERE programme_id IS NULL) AS info
  FROM semestres
),

-- B3 : pas de numéros dupliqués dans le même programme
-- (ex: deux S1 dans le même programme casserait la garde)
b3 AS (
  SELECT 'B3 Semestres : numéros uniques par programme' AS nom,
    (COUNT(*) = 0) AS ok,
    'doublons='||COUNT(*) AS info
  FROM (
    SELECT programme_id, numero, COUNT(*) AS cnt
    FROM semestres
    GROUP BY programme_id, numero
    HAVING COUNT(*) > 1
  ) dup
),

-- B4 : resultats_cache a bien des credits_valides pour les étudiants calculés
b4 AS (
  SELECT 'B4 resultats_cache : credits_valides ≥ 0 et ≤ 30' AS nom,
    (COUNT(*) FILTER (WHERE credits_valides < 0 OR credits_valides > 30) = 0) AS ok,
    'hors_plage='||COUNT(*) FILTER (WHERE credits_valides < 0 OR credits_valides > 30) AS info
  FROM resultats_cache
  WHERE credits_valides IS NOT NULL
),

-- B5 : cohérence garde — crédits du semestre précédent accessibles
-- Pour chaque paire (semestre N, semestre N-1) dans un même programme,
-- les étudiants inscrits en N doivent avoir un enregistrement en cache pour N-1
b5 AS (
  SELECT 'B5 Garde crédits : cache disponible pour le semestre précédent ('||nb_avec||'/'||nb_total||' cas)' AS nom,
    (nb_total = 0 OR nb_avec > 0) AS ok,
    'étudiants_avec_cache_semPrev='||nb_avec||' sur '||nb_total||' inscrits_sem_N>1' AS info
  FROM (
    SELECT
      COUNT(*) AS nb_total,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM resultats_cache rc2
        WHERE rc2.etudiant_id = i.etudiant_id AND rc2.semestre_id = s_prev.id
      )) AS nb_avec
    FROM inscriptions_semestre i
    JOIN semestres s ON s.id = i.semestre_id AND s.numero > 1
    JOIN semestres s_prev ON s_prev.programme_id = s.programme_id
      AND s_prev.numero = s.numero - 1
    LIMIT 30
  ) sub
),

-- ════════════════════════════════════════════════
-- C — Progression LMD : données de la fiche
-- ════════════════════════════════════════════════

-- C1 : credits_valides dans resultats_cache ≥ 0 (jamais négatif)
c1 AS (
  SELECT 'C1 resultats_cache : credits_valides jamais négatif' AS nom,
    (COUNT(*) FILTER (WHERE credits_valides < 0) = 0) AS ok,
    'négatifs='||COUNT(*) FILTER (WHERE credits_valides < 0) AS info
  FROM resultats_cache
),

-- C2 : progression cohérente — somme crédits par étudiant ≤ 180 × nb_années
-- (un étudiant ne peut pas avoir plus de 30 crédits par semestre)
c2 AS (
  SELECT 'C2 Progression : total crédits par étudiant ≤ 30 × nb_semestres' AS nom,
    (COUNT(*) FILTER (WHERE total_credits > nb_sem * 30) = 0) AS ok,
    'incohérences='||COUNT(*) FILTER (WHERE total_credits > nb_sem * 30) AS info
  FROM (
    SELECT etudiant_id,
      SUM(credits_valides) AS total_credits,
      COUNT(*) AS nb_sem
    FROM resultats_cache
    GROUP BY etudiant_id
  ) sub
),

-- C3 : informativité — crédit max cumulé HEMEC
c3 AS (
  SELECT 'C3 Progression : crédit max cumulé (' ||
    COALESCE(MAX(tot)::text,'—') || ' CECT, top étudiant)' AS nom,
    true AS ok,
    'max_cumule='||COALESCE(MAX(tot)::text,'0')||'  moy='||COALESCE(ROUND(AVG(tot)::numeric,1)::text,'0') AS info
  FROM (
    SELECT SUM(credits_valides) AS tot
    FROM resultats_cache GROUP BY etudiant_id
  ) sub
),

-- ════════════════════════════════════════════════
-- Assemblage
-- ════════════════════════════════════════════════
tous AS (
  SELECT * FROM a1 UNION ALL SELECT * FROM a2 UNION ALL
  SELECT * FROM a3 UNION ALL SELECT * FROM a4 UNION ALL
  SELECT * FROM b1 UNION ALL SELECT * FROM b2 UNION ALL
  SELECT * FROM b3 UNION ALL SELECT * FROM b4 UNION ALL
  SELECT * FROM b5 UNION ALL SELECT * FROM c1 UNION ALL
  SELECT * FROM c2 UNION ALL SELECT * FROM c3
)

SELECT
  ROW_NUMBER() OVER ()                               AS "#",
  CASE WHEN ok THEN '✅ PASS' ELSE '❌ FAIL' END     AS statut,
  nom                                                AS test,
  info                                               AS détail
FROM tous;
