-- ============================================================
-- EduLink Sup — Tests SQL S4 — LMD-CAMES
-- Exécuter dans Supabase SQL Editor
-- Toutes les données de test sont rollbackées en fin de script.
-- Durée estimée : 3-8 secondes selon la taille de la DB.
-- ============================================================

BEGIN;

-- ── Table de résultats (temp, disparaît au ROLLBACK) ──────
CREATE TEMP TABLE _t (
  id   SERIAL,
  nom  TEXT,
  ok   BOOLEAN,
  info TEXT
) ON COMMIT DROP;

-- ================================================================
DO $tests$
DECLARE
  -- ── IDs réels de la DB (évite les FK manquantes) ──
  v_ecole UUID;
  v_prog  UUID;
  v_sem   UUID;

  -- ── UEs de test (2 obligatoires, 1 optionnelle) ──
  v_ue1 UUID := gen_random_uuid();   -- 6 cr, obligatoire
  v_ue2 UUID := gen_random_uuid();   -- 4 cr, obligatoire
  v_ue3 UUID := gen_random_uuid();   -- 2 cr, optionnelle

  -- ── Matières (1 par UE) ──
  v_m1 UUID := gen_random_uuid();
  v_m2 UUID := gen_random_uuid();
  v_m3 UUID := gen_random_uuid();

  -- ── Sessions ──
  v_sn UUID := gen_random_uuid();   -- normale
  v_sr UUID := gen_random_uuid();   -- rattrapage

  -- ── Évaluations (examen, 1 par UE + 1 rattrapage UE1) ──
  v_e1n UUID := gen_random_uuid();
  v_e2n UUID := gen_random_uuid();
  v_e3n UUID := gen_random_uuid();
  v_e1r UUID := gen_random_uuid();   -- ratt UE1

  -- ── Étudiants ──
  v_ea  UUID := gen_random_uuid();   -- Admis
  v_eaj UUID := gen_random_uuid();   -- Ajourné
  v_ec  UUID := gen_random_uuid();   -- Compensé
  v_ep  UUID := gen_random_uuid();   -- Plancher
  v_er  UUID := gen_random_uuid();   -- Rattrapage
  v_ex  UUID := gen_random_uuid();   -- Exclu absences
  v_eab UUID := gen_random_uuid();   -- Note absent
  v_eab_eval UUID := gen_random_uuid();

  -- ── Enum type_ue (valeur réelle de la DB) ──
  v_type_ue type_ue;

  -- ── Résultats ──
  v_res   RECORD;
  v_moy   NUMERIC;
  v_uuids UUID[];
  v_n     INTEGER;
  v_sem_r UUID;        -- semestre réel pour test idempotence

BEGIN

  -- ── 0. Récupérer les IDs réels de la DB ────────────────────
  SELECT id INTO v_ecole FROM ecoles LIMIT 1;
  SELECT id INTO v_prog  FROM programmes_lmd WHERE ecole_id = v_ecole LIMIT 1;
  SELECT id INTO v_sem   FROM semestres WHERE programme_id = v_prog LIMIT 1;

  -- Enum type_ue : première valeur disponible
  SELECT enumlabel::type_ue INTO v_type_ue
  FROM pg_enum WHERE enumtypid = 'type_ue'::regtype LIMIT 1;

  IF v_ecole IS NULL OR v_prog IS NULL OR v_sem IS NULL THEN
    INSERT INTO _t(nom, ok, info)
      VALUES ('SETUP', false, 'Aucune école/programme/semestre trouvé — DB vide ?');
    RETURN;
  END IF;

  -- ── FIXTURES ───────────────────────────────────────────────
  -- Note : tous ces INSERTs sont rollbackés en fin de script.

  -- Mettre à jour / insérer les règles de l'école pour ce test
  -- (compensation active, plancher désactivé, seuil UE=10, ratt=max)
  INSERT INTO regles_ecole
    (ecole_id, seuil_validation_ue, compensation_active, note_plancher_active,
     seuil_note_plancher, regle_rattrapage, seuil_absence_pct)
  VALUES
    (v_ecole, 10, true, false, 5, 'max', 30)
  ON CONFLICT (ecole_id) DO UPDATE SET
    seuil_validation_ue  = 10,
    compensation_active  = true,
    note_plancher_active = false,
    seuil_note_plancher  = 5,
    regle_rattrapage     = 'max',
    seuil_absence_pct    = 30;

  -- UEs
  INSERT INTO unites_enseignement
    (id, ecole_id, code, intitule, credits_cect, type_ue, poids_cc, poids_examen)
  VALUES
    (v_ue1, v_ecole, 'T-UE1', 'UE Test 1 (oblig)', 6, v_type_ue, 0.4, 0.6),
    (v_ue2, v_ecole, 'T-UE2', 'UE Test 2 (oblig)', 4, v_type_ue, 0.4, 0.6),
    (v_ue3, v_ecole, 'T-UE3', 'UE Test 3 (option)',2, v_type_ue, 0.4, 0.6);

  -- Affectation UE → programme × semestre
  INSERT INTO programme_ue (programme_id, ue_id, semestre_id, ecole_id, obligatoire)
  VALUES
    (v_prog, v_ue1, v_sem, v_ecole, true),
    (v_prog, v_ue2, v_sem, v_ecole, true),
    (v_prog, v_ue3, v_sem, v_ecole, false);

  -- Matières (1 par UE)
  INSERT INTO matieres_lmd (id, ecole_id, ue_id, code, nom, coefficient)
  VALUES
    (v_m1, v_ecole, v_ue1, 'T-M1', 'Mat Test 1', 1),
    (v_m2, v_ecole, v_ue2, 'T-M2', 'Mat Test 2', 1),
    (v_m3, v_ecole, v_ue3, 'T-M3', 'Mat Test 3', 1);

  -- Sessions
  INSERT INTO sessions_evaluation
    (id, ecole_id, semestre_id, type_session, statut, libelle)
  VALUES
    (v_sn, v_ecole, v_sem, 'normale',    'planifiee', 'Session Normale Test'),
    (v_sr, v_ecole, v_sem, 'rattrapage', 'planifiee', 'Session Rattrapage Test');

  -- Évaluations (pondération = 1 → note de la matière = note de l'UE)
  INSERT INTO evaluations
    (id, ecole_id, matiere_id, session_id, categorie, format, intitule, ponderation)
  VALUES
    (v_e1n, v_ecole, v_m1, v_sn, 'Examen', 'ecrit', 'Exam T-UE1 N',  1),
    (v_e2n, v_ecole, v_m2, v_sn, 'Examen', 'ecrit', 'Exam T-UE2 N',  1),
    (v_e3n, v_ecole, v_m3, v_sn, 'Examen', 'ecrit', 'Exam T-UE3 N',  1),
    (v_e1r, v_ecole, v_m1, v_sr, 'Examen', 'ecrit', 'Exam T-UE1 R',  1);

  -- Étudiants (sexe, statut, niveau requis)
  INSERT INTO etudiants (id, ecole_id, matricule, nom, prenom, sexe, statut, niveau)
  VALUES
    (v_ea,  v_ecole, 'T-A',  'ADMIS',      'Tst', 'M', 'actif', 'L1'),
    (v_eaj, v_ecole, 'T-AJ', 'AJOURNE',    'Tst', 'M', 'actif', 'L1'),
    (v_ec,  v_ecole, 'T-C',  'COMPENSE',   'Tst', 'F', 'actif', 'L1'),
    (v_ep,  v_ecole, 'T-P',  'PLANCHER',   'Tst', 'M', 'actif', 'L1'),
    (v_er,  v_ecole, 'T-R',  'RATTRAPAGE', 'Tst', 'F', 'actif', 'L1'),
    (v_ex,  v_ecole, 'T-EX', 'EXCLU',      'Tst', 'M', 'actif', 'L1'),
    (v_eab, v_ecole, 'T-AB', 'ABSENT',     'Tst', 'F', 'actif', 'L1');

  -- ── NOTES ──────────────────────────────────────────────────
  -- ADMIS : UE1=14 UE2=12 UE3=11 → tout validé direct
  INSERT INTO notes_lmd (evaluation_id, etudiant_id, valeur, absent, ecole_id) VALUES
    (v_e1n, v_ea, 14, false, v_ecole),
    (v_e2n, v_ea, 12, false, v_ecole),
    (v_e3n, v_ea, 11, false, v_ecole);

  -- AJOURNÉ : UE1=14 UE2=5 UE3=8 → moy_gen=(14+5)/2=9.5 < 10 → pas de comp
  INSERT INTO notes_lmd (evaluation_id, etudiant_id, valeur, absent, ecole_id) VALUES
    (v_e1n, v_eaj, 14, false, v_ecole),
    (v_e2n, v_eaj,  5, false, v_ecole),
    (v_e3n, v_eaj,  8, false, v_ecole);

  -- COMPENSÉ : UE1=14 UE2=7 UE3=11 → moy_gen=(14+7+11)/3≈10.67 ≥ 10 → UE2 compensée
  INSERT INTO notes_lmd (evaluation_id, etudiant_id, valeur, absent, ecole_id) VALUES
    (v_e1n, v_ec, 14, false, v_ecole),
    (v_e2n, v_ec,  7, false, v_ecole),
    (v_e3n, v_ec, 11, false, v_ecole);

  -- PLANCHER : UE1=3 (< seuil_plancher=5) UE2=12 UE3=11
  INSERT INTO notes_lmd (evaluation_id, etudiant_id, valeur, absent, ecole_id) VALUES
    (v_e1n, v_ep,  3, false, v_ecole),
    (v_e2n, v_ep, 12, false, v_ecole),
    (v_e3n, v_ep, 11, false, v_ecole);

  -- RATTRAPAGE : UE1 normale=5 ratt=13 → fn_moy_ue_ratt=13 ; UE2=11
  INSERT INTO notes_lmd (evaluation_id, etudiant_id, valeur, absent, ecole_id) VALUES
    (v_e1n, v_er,  5, false, v_ecole),
    (v_e1r, v_er, 13, false, v_ecole),
    (v_e2n, v_er, 11, false, v_ecole),
    (v_e3n, v_er, 10, false, v_ecole);

  -- EXCLU : bonnes notes (UE1=16) mais exclu de UE1 → credits=0
  INSERT INTO notes_lmd (evaluation_id, etudiant_id, valeur, absent, ecole_id) VALUES
    (v_e1n, v_ex, 16, false, v_ecole),
    (v_e2n, v_ex, 14, false, v_ecole),
    (v_e3n, v_ex, 12, false, v_ecole);
  INSERT INTO exclusions_ue
    (etudiant_id, ue_id, semestre_id, ecole_id, motif, date_exclusion, source)
  VALUES (v_ex, v_ue1, v_sem, v_ecole, 'Absences test', CURRENT_DATE, 'auto');

  -- ABSENT : note absent=true valeur=0 — doit être ignorée par fn_check_plancher
  INSERT INTO evaluations
    (id, ecole_id, matiere_id, session_id, categorie, format, intitule, ponderation)
  VALUES (v_eab_eval, v_ecole, v_m1, v_sn, 'Examen', 'ecrit', 'Exam Absent', 1);
  INSERT INTO notes_lmd (evaluation_id, etudiant_id, valeur, absent, ecole_id) VALUES
    (v_eab_eval, v_eab, 0, true, v_ecole);

  -- ============================================================
  -- GROUPE A — fn_mention (fonctions pures, aucune donnée requise)
  -- ============================================================
  INSERT INTO _t(nom, ok, info) VALUES
    ('A1 fn_mention(16)    → tres_bien',
      fn_mention(16) = 'tres_bien'::mention_cames,    fn_mention(16)::text),
    ('A2 fn_mention(15)    → bien',
      fn_mention(15) = 'bien'::mention_cames,         fn_mention(15)::text),
    ('A3 fn_mention(14)    → bien',
      fn_mention(14) = 'bien'::mention_cames,         fn_mention(14)::text),
    ('A4 fn_mention(13.99) → assez_bien',
      fn_mention(13.99) = 'assez_bien'::mention_cames, fn_mention(13.99)::text),
    ('A5 fn_mention(12)    → assez_bien',
      fn_mention(12) = 'assez_bien'::mention_cames,   fn_mention(12)::text),
    ('A6 fn_mention(10)    → passable',
      fn_mention(10) = 'passable'::mention_cames,     fn_mention(10)::text),
    ('A7 fn_mention(9.99)  → NULL',
      fn_mention(9.99) IS NULL,
      COALESCE(fn_mention(9.99)::text, 'NULL')),
    ('A8 fn_mention(0)     → NULL',
      fn_mention(0) IS NULL,
      COALESCE(fn_mention(0)::text, 'NULL'));

  -- ============================================================
  -- GROUPE B — Admis direct (UE1=14 UE2=12 UE3=11)
  -- ============================================================
  SELECT * INTO v_res FROM fn_resultats_semestre(v_ea, v_sem) WHERE ue_id = v_ue1;
  INSERT INTO _t(nom, ok, info) VALUES
    ('B1 Admis : UE1 ue_validee=true  (14≥10)',
      v_res.ue_validee = true,
      'ue_validee='||v_res.ue_validee||'  moy='||COALESCE(v_res.moyenne_ue::text,'?')),
    ('B2 Admis : UE1 credits_acquis=6',
      v_res.credits_acquis = 6,
      'credits='||v_res.credits_acquis);

  SELECT * INTO v_res FROM fn_resultats_semestre(v_ea, v_sem) WHERE ue_id = v_ue2;
  INSERT INTO _t(nom, ok, info) VALUES
    ('B3 Admis : UE2 ue_validee=true  (12≥10)',
      v_res.ue_validee = true,
      'ue_validee='||v_res.ue_validee),
    ('B4 Admis : UE2 credits_acquis=4',
      v_res.credits_acquis = 4,
      'credits='||v_res.credits_acquis);

  SELECT * INTO v_res FROM fn_resultats_semestre(v_ea, v_sem) WHERE ue_id = v_ue3;
  INSERT INTO _t(nom, ok, info) VALUES
    ('B5 Admis : UE3 optionnelle validée (11≥10)',
      v_res.ue_validee = true,
      'ue_validee='||v_res.ue_validee||'  oblig='||v_res.obligatoire::text);

  -- ============================================================
  -- GROUPE C — Ajourné (UE1=14 UE2=5 moy_gen=9.5 < 10)
  -- ============================================================
  SELECT * INTO v_res FROM fn_resultats_semestre(v_eaj, v_sem) WHERE ue_id = v_ue2;
  INSERT INTO _t(nom, ok, info) VALUES
    ('C1 Ajourné : UE2 ue_validee=false (5<10)',
      v_res.ue_validee = false,
      'ue_validee='||v_res.ue_validee||'  moy='||COALESCE(v_res.moyenne_ue::text,'?')),
    ('C2 Ajourné : UE2 credits_acquis=0',
      v_res.credits_acquis = 0,
      'credits='||v_res.credits_acquis),
    ('C3 Ajourné : UE2 est_exclu=false (non exclu, juste ajourné)',
      v_res.est_exclu = false,
      'est_exclu='||v_res.est_exclu::text);

  SELECT * INTO v_res FROM fn_resultats_semestre(v_eaj, v_sem) WHERE ue_id = v_ue1;
  INSERT INTO _t(nom, ok, info) VALUES
    ('C4 Ajourné : UE1 toujours validée (14≥10)',
      v_res.ue_validee = true,
      'ue_validee='||v_res.ue_validee);

  -- ============================================================
  -- GROUPE D — Compensation (UE1=14 UE2=7 UE3=11 → moy≈10.67)
  -- ============================================================
  SELECT * INTO v_res FROM fn_resultats_semestre(v_ec, v_sem) WHERE ue_id = v_ue2;
  INSERT INTO _t(nom, ok, info) VALUES
    ('D1 Compensation : UE2 ue_validee=true  (7<10 mais moy_gen≈10.67)',
      v_res.ue_validee = true,
      'ue_validee='||v_res.ue_validee||'  moy_ue2='||COALESCE(v_res.moyenne_ue::text,'?')),
    ('D2 Compensation : UE2 credits_acquis=4 (compensée → crédits accordés)',
      v_res.credits_acquis = 4,
      'credits='||v_res.credits_acquis);

  -- ============================================================
  -- GROUPE E — fn_check_plancher
  -- ============================================================
  -- Note 3 < seuil 5 → UE1 doit être signalée
  SELECT ARRAY_AGG(ue_id) INTO v_uuids FROM fn_check_plancher(v_ep, v_sem, 5);
  INSERT INTO _t(nom, ok, info) VALUES
    ('E1 Plancher : UE1 signalée (note=3 < seuil=5)',
      v_ue1 = ANY(COALESCE(v_uuids, ARRAY[]::UUID[])),
      'nb_violations='||COALESCE(ARRAY_LENGTH(v_uuids,1)::text,'0')),
    ('E2 Plancher : UE2 non signalée (note=12 ≥ seuil=5)',
      NOT (v_ue2 = ANY(COALESCE(v_uuids, ARRAY[]::UUID[]))),
      'ue2_dans_viol='||(v_ue2 = ANY(COALESCE(v_uuids, ARRAY[]::UUID[])))::text);

  -- Note absent=true ne doit PAS être signalée même si valeur=0 < seuil
  SELECT ARRAY_AGG(ue_id) INTO v_uuids FROM fn_check_plancher(v_eab, v_sem, 5);
  INSERT INTO _t(nom, ok, info) VALUES
    ('E3 Plancher : note absent=true ignorée (valeur=0 < seuil=5 mais absent)',
      COALESCE(ARRAY_LENGTH(v_uuids,1), 0) = 0,
      'nb_viol_absent='||COALESCE(ARRAY_LENGTH(v_uuids,1)::text,'0'));

  -- Seuil agressif (< 15) → UE1 (3) ET UE2 (12) signalées
  SELECT ARRAY_AGG(ue_id) INTO v_uuids FROM fn_check_plancher(v_ep, v_sem, 15);
  INSERT INTO _t(nom, ok, info) VALUES
    ('E4 Plancher seuil=15 : UE1 (3) et UE2 (12) signalées',
      v_ue1 = ANY(COALESCE(v_uuids, ARRAY[]::UUID[]))
        AND v_ue2 = ANY(COALESCE(v_uuids, ARRAY[]::UUID[])),
      'nb='||COALESCE(ARRAY_LENGTH(v_uuids,1)::text,'0'));

  -- ============================================================
  -- GROUPE F — fn_moy_ue_rattrapage (UE1 normale=5, ratt=13)
  -- ============================================================
  SELECT moy_rattrapage INTO v_moy
  FROM fn_moy_ue_rattrapage(v_er, v_sem) WHERE ue_id = v_ue1;

  INSERT INTO _t(nom, ok, info) VALUES
    ('F1 Rattrapage : fn_moy_ue_rattrapage UE1 = 13',
      v_moy = 13,
      'moy_ratt='||COALESCE(v_moy::text,'NULL'));

  -- UE1 en session normale = 5 → non validée par fn_resultats_semestre
  SELECT * INTO v_res FROM fn_resultats_semestre(v_er, v_sem) WHERE ue_id = v_ue1;
  INSERT INTO _t(nom, ok, info) VALUES
    ('F2 Rattrapage : fn_resultats_semestre UE1 normale=5 → non validée',
      v_res.ue_validee = false,
      'ue_validee='||v_res.ue_validee::text||'  moy='||COALESCE(v_res.moyenne_ue::text,'?'));

  -- UE2 sans note rattrapage → fn_moy_ue_rattrapage ne retourne rien
  INSERT INTO _t(nom, ok, info) VALUES
    ('F3 Rattrapage : UE2 sans note ratt → fn_moy_ue_rattrapage vide',
      NOT EXISTS (SELECT 1 FROM fn_moy_ue_rattrapage(v_er, v_sem) WHERE ue_id = v_ue2),
      'rows_ue2='||(SELECT COUNT(*)::text FROM fn_moy_ue_rattrapage(v_er, v_sem) WHERE ue_id = v_ue2));

  -- UE2 validée normalement (11≥10) malgré rattrapage sur UE1
  SELECT * INTO v_res FROM fn_resultats_semestre(v_er, v_sem) WHERE ue_id = v_ue2;
  INSERT INTO _t(nom, ok, info) VALUES
    ('F4 Rattrapage : UE2 normale validée (11≥10), non impactée par ratt UE1',
      v_res.ue_validee = true,
      'ue2_validee='||v_res.ue_validee::text);

  -- ============================================================
  -- GROUPE G — Exclusion absences → résultats (UE1 exclu, note=16)
  -- ============================================================
  SELECT * INTO v_res FROM fn_resultats_semestre(v_ex, v_sem) WHERE ue_id = v_ue1;
  INSERT INTO _t(nom, ok, info) VALUES
    ('G1 Exclusion : est_exclu=true (UE1)',
      v_res.est_exclu = true,
      'est_exclu='||v_res.est_exclu::text),
    ('G2 Exclusion : ue_validee=false malgré note=16 [PATCH fn_resultats]',
      v_res.ue_validee = false,
      'ue_validee='||v_res.ue_validee::text||'  moy='||COALESCE(v_res.moyenne_ue::text,'?')),
    ('G3 Exclusion : credits_acquis=0 malgré note=16 [PATCH fn_resultats]',
      v_res.credits_acquis = 0,
      'credits='||v_res.credits_acquis::text);

  -- UE2 non exclue → validée normalement
  SELECT * INTO v_res FROM fn_resultats_semestre(v_ex, v_sem) WHERE ue_id = v_ue2;
  INSERT INTO _t(nom, ok, info) VALUES
    ('G4 Exclusion : UE2 non exclue → validée (14≥10) credits=4',
      v_res.ue_validee = true AND v_res.credits_acquis = 4,
      'ue2_validee='||v_res.ue_validee::text||'  credits='||v_res.credits_acquis::text),
    ('G5 Exclusion : UE2 est_exclu=false (seule UE1 est exclue)',
      v_res.est_exclu = false,
      'est_exclu='||v_res.est_exclu::text);

  -- ============================================================
  -- GROUPE H — fn_solde_etudiant
  -- ============================================================
  -- Étudiants de test sans aucune facture → solde = 0
  INSERT INTO _t(nom, ok, info) VALUES
    ('H1 fn_solde_etudiant : étudiant de test sans facture = 0',
      fn_solde_etudiant(v_ea) = 0,
      'solde='||fn_solde_etudiant(v_ea)::text),
    ('H2 fn_solde_etudiant : jamais négatif (étudiants test)',
      fn_solde_etudiant(v_ea) >= 0
        AND fn_solde_etudiant(v_eaj) >= 0
        AND fn_solde_etudiant(v_ec)  >= 0,
      'ea='||fn_solde_etudiant(v_ea)||'  eaj='||fn_solde_etudiant(v_eaj));

  -- ============================================================
  -- GROUPE I — fn_auto_exclure_absences : idempotence
  -- On appelle 2× sur un semestre réel : le 2e appel doit retourner 0
  -- (ne crée pas de doublons). Utilise v_sem réel (avec vraies séances).
  -- ============================================================
  DECLARE
    v_r1 INTEGER;
    v_r2 INTEGER;
  BEGIN
    SELECT fn_auto_exclure_absences(v_sem) INTO v_r1;
    SELECT fn_auto_exclure_absences(v_sem) INTO v_r2;
    INSERT INTO _t(nom, ok, info) VALUES
      ('I1 fn_auto_exclure_absences : idempotente (2e appel = 0)',
        v_r2 = 0,
        '1er='||v_r1||'  2e='||v_r2);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _t(nom, ok, info) VALUES
      ('I1 fn_auto_exclure_absences : idempotente', false, SQLERRM);
  END;

  -- ============================================================
  -- GROUPE J — Cohérence sur données réelles HEMEC
  -- Tests d'invariants sur les données existantes (pas de fixtures).
  -- ============================================================

  -- J1 : tous les est_exclu dans fn_resultats_semestre correspondent à exclusions_ue
  INSERT INTO _t(nom, ok, info)
  SELECT
    'J1 Cohérence : est_exclu=true ↔ ligne dans exclusions_ue',
    COUNT(*) = 0,
    'incohérences='||COUNT(*)
  FROM exclusions_ue ex
  CROSS JOIN LATERAL (
    SELECT est_exclu FROM fn_resultats_semestre(ex.etudiant_id, ex.semestre_id)
    WHERE ue_id = ex.ue_id
  ) r
  WHERE r.est_exclu = false;   -- devrait être 0 : exclu dans table mais pas dans résultats

  -- J2 : exclu → credits_acquis = 0 (patch fn_resultats garanti)
  INSERT INTO _t(nom, ok, info)
  SELECT
    'J2 Cohérence : exclu → credits_acquis=0 (toutes exclusions de la DB)',
    COUNT(*) = 0,
    'violations='||COUNT(*)
  FROM exclusions_ue ex
  CROSS JOIN LATERAL (
    SELECT credits_acquis FROM fn_resultats_semestre(ex.etudiant_id, ex.semestre_id)
    WHERE ue_id = ex.ue_id
  ) r
  WHERE r.credits_acquis > 0;  -- devrait être 0

  -- J3 : fn_solde_etudiant ≥ 0 pour tous les étudiants avec factures
  INSERT INTO _t(nom, ok, info)
  SELECT
    'J3 Cohérence : fn_solde_etudiant ≥ 0 pour tous les étudiants facturés ('||COUNT(*)||' testés)',
    COUNT(*) FILTER (WHERE fn_solde_etudiant(etudiant_id) < 0) = 0,
    'nb_négatifs='||COUNT(*) FILTER (WHERE fn_solde_etudiant(etudiant_id) < 0)
  FROM (SELECT DISTINCT etudiant_id FROM factures WHERE etudiant_id IS NOT NULL) f;

END;
$tests$;

-- ================================================================
-- RAPPORT FINAL
-- ================================================================

\echo ''
\echo '═══════════════════════════════════════════════════════'
\echo '  EduLink Sup — Résultats tests S4 LMD-CAMES'
\echo '═══════════════════════════════════════════════════════'

SELECT
  COUNT(*)                             AS total,
  COUNT(*) FILTER (WHERE ok)           AS "✅ PASS",
  COUNT(*) FILTER (WHERE NOT ok)       AS "❌ FAIL"
FROM _t;

SELECT
  id,
  CASE WHEN ok THEN '✅ PASS' ELSE '❌ FAIL' END AS statut,
  nom                                              AS test,
  info                                             AS détail
FROM _t
ORDER BY id;

-- ── Résumé des FAIL seulement ─────────────────────────────────
SELECT
  id,
  nom  AS test_échoué,
  info AS détail
FROM _t
WHERE NOT ok
ORDER BY id;

ROLLBACK;
-- ================================================================
-- Toutes les données de test ont été rollbackées.
-- Relancer sans modifications = même résultat.
-- ================================================================
