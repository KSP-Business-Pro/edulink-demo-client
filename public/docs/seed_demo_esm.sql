-- ============================================================
-- EduLink Sup — Environnement DÉMO (données fictives ESM)
-- École Supérieure de Management (ESM) — ~3000 étudiants
-- À exécuter dans Supabase SQL Editor
-- ============================================================
-- ATTENTION : Ce script crée une école de démo indépendante.
-- Il ne touche PAS aux données HEMEC existantes.
-- ============================================================

BEGIN;

-- ── 1. École de démo ──────────────────────────────────────────────────────────
INSERT INTO ecoles (id, nom, type, ville, pays, email, telephone)
VALUES (
  'de000000-0000-0000-0000-000000000001',
  'École Supérieure de Management (DÉMO)',
  'grande_ecole',
  'Cotonou',
  'Bénin',
  'demo@esm-demo.bj',
  '+229 21 30 00 00'
) ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom;

-- ── 2. Règles LMD ─────────────────────────────────────────────────────────────
INSERT INTO regles_ecole (
  ecole_id, compensation_active, seuil_validation_ue, note_plancher_active,
  seuil_note_plancher, regle_rattrapage, seuil_absence_pct,
  blocage_releve_impaye, tolerance_impaye_releve,
  notif_releve_active, notif_releve_sujet,
  notif_paiement_active, notif_paiement_sujet,
  notif_absence_active, notif_absence_sujet
) VALUES (
  'de000000-0000-0000-0000-000000000001',
  true, 10, true, 5, 'max', 30, false, 0,
  true, 'Relevé de notes — {semestre}',
  true, 'Confirmation de paiement — {etablissement}',
  false, 'Alerte absences — {ue}'
) ON CONFLICT (ecole_id) DO UPDATE SET compensation_active = EXCLUDED.compensation_active;

-- ── 3. Année académique ───────────────────────────────────────────────────────
INSERT INTO annees_academiques (id, ecole_id, libelle, date_debut, date_fin, est_courante)
VALUES (
  'de000000-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000001',
  '2025-2026', '2025-09-01', '2026-07-31', true
) ON CONFLICT (id) DO NOTHING;

-- ── 4. Programmes LMD ────────────────────────────────────────────────────────
INSERT INTO programmes_lmd (id, ecole_id, code, intitule, grade, credits_total, duree_annees, actif) VALUES
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000001', 'L-MGT', 'Licence Management Général', 'licence', 180, 3, true),
  ('de000000-0000-0000-0000-000000000011', 'de000000-0000-0000-0000-000000000001', 'L-MKT', 'Licence Marketing & Commerce', 'licence', 180, 3, true),
  ('de000000-0000-0000-0000-000000000012', 'de000000-0000-0000-0000-000000000001', 'M-MGT', 'Master Management Stratégique', 'master', 120, 2, true),
  ('de000000-0000-0000-0000-000000000013', 'de000000-0000-0000-0000-000000000001', 'M-RH',  'Master Ressources Humaines',   'master', 120, 2, true)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Semestres ──────────────────────────────────────────────────────────────
INSERT INTO semestres (id, ecole_id, programme_id, annee_academique_id, libelle, numero, niveau, statut, date_debut, date_fin) VALUES
  ('de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000002', 'S1 — Licence MGT 2025-2026', 1, 'L1', 'en_cours', '2025-09-01', '2026-01-31'),
  ('de000000-0000-0000-0000-000000000021', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000011', 'de000000-0000-0000-0000-000000000002', 'S1 — Licence MKT 2025-2026', 1, 'L1', 'en_cours', '2025-09-01', '2026-01-31'),
  ('de000000-0000-0000-0000-000000000022', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000012', 'de000000-0000-0000-0000-000000000002', 'S1 — Master MGT 2025-2026',  1, 'M1', 'en_cours', '2025-09-01', '2026-01-31'),
  ('de000000-0000-0000-0000-000000000023', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000013', 'de000000-0000-0000-0000-000000000002', 'S1 — Master RH 2025-2026',   1, 'M1', 'en_cours', '2025-09-01', '2026-01-31')
ON CONFLICT (id) DO NOTHING;

-- ── 6. Sessions d'évaluation ──────────────────────────────────────────────────
INSERT INTO sessions_evaluation (id, ecole_id, semestre_id, type_session, statut, date_debut, date_fin) VALUES
  ('de000000-0000-0000-0000-000000000030', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000020', 'normale', 'ouverte', '2025-09-01', '2026-01-31'),
  ('de000000-0000-0000-0000-000000000031', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000021', 'normale', 'ouverte', '2025-09-01', '2026-01-31'),
  ('de000000-0000-0000-0000-000000000032', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000022', 'normale', 'ouverte', '2025-09-01', '2026-01-31'),
  ('de000000-0000-0000-0000-000000000033', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000023', 'normale', 'ouverte', '2025-09-01', '2026-01-31')
ON CONFLICT (id) DO NOTHING;

-- ── 7. Promotions ─────────────────────────────────────────────────────────────
INSERT INTO promotions (id, ecole_id, programme_id, annee_academique_id, niveau, nom, effectif_max, responsable) VALUES
  ('de000000-0000-0000-0000-000000000040', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000002', 'L1', 'Promo L1 — Licence MGT 2025-2026', 80, 'Dr. AGOSSOU'),
  ('de000000-0000-0000-0000-000000000041', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000011', 'de000000-0000-0000-0000-000000000002', 'L1', 'Promo L1 — Licence MKT 2025-2026', 60, 'Dr. AHOUANDJINOU'),
  ('de000000-0000-0000-0000-000000000042', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000012', 'de000000-0000-0000-0000-000000000002', 'M1', 'Promo M1 — Master MGT 2025-2026', 40, 'Pr. DOSSOU'),
  ('de000000-0000-0000-0000-000000000043', 'de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000013', 'de000000-0000-0000-0000-000000000002', 'M1', 'Promo M1 — Master RH 2025-2026',  35, 'Dr. KPOSSOU')
ON CONFLICT (id) DO NOTHING;

-- ── 8. UE et matières ─────────────────────────────────────────────────────────
-- UE Licence MGT S1
INSERT INTO unites_enseignement (id, ecole_id, code, intitule, credits_cect, type_ue, poids_cc, poids_examen) VALUES
  ('de000000-0000-0000-0000-000000000050', 'de000000-0000-0000-0000-000000000001', 'MGT-L1-UE1', 'Fondements du Management',  6, 'fondamentale', 0.40, 0.60),
  ('de000000-0000-0000-0000-000000000051', 'de000000-0000-0000-0000-000000000001', 'MGT-L1-UE2', 'Introduction à la Comptabilité', 6, 'fondamentale', 0.40, 0.60),
  ('de000000-0000-0000-0000-000000000052', 'de000000-0000-0000-0000-000000000001', 'MGT-L1-UE3', 'Droit des Affaires',          6, 'fondamentale', 0.30, 0.70),
  ('de000000-0000-0000-0000-000000000053', 'de000000-0000-0000-0000-000000000001', 'MGT-L1-UE4', 'Mathématiques de Gestion',   6, 'fondamentale', 0.30, 0.70),
  ('de000000-0000-0000-0000-000000000054', 'de000000-0000-0000-0000-000000000001', 'MGT-M1-UE1', 'Management Stratégique Avancé', 6, 'fondamentale', 0.40, 0.60),
  ('de000000-0000-0000-0000-000000000055', 'de000000-0000-0000-0000-000000000001', 'MGT-M1-UE2', 'Finance d''Entreprise',      6, 'fondamentale', 0.40, 0.60),
  ('de000000-0000-0000-0000-000000000056', 'de000000-0000-0000-0000-000000000001', 'RH-M1-UE1',  'Gestion des Talents',        6, 'fondamentale', 0.40, 0.60),
  ('de000000-0000-0000-0000-000000000057', 'de000000-0000-0000-0000-000000000001', 'RH-M1-UE2',  'Droit du Travail Approfondi', 6, 'fondamentale', 0.30, 0.70)
ON CONFLICT (id) DO NOTHING;

-- Lier UE aux semestres
INSERT INTO programme_ue (semestre_id, ue_id, programme_id, obligatoire) VALUES
  ('de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000050', 'de000000-0000-0000-0000-000000000010', true),
  ('de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000051', 'de000000-0000-0000-0000-000000000010', true),
  ('de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000052', 'de000000-0000-0000-0000-000000000010', true),
  ('de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000053', 'de000000-0000-0000-0000-000000000010', true),
  ('de000000-0000-0000-0000-000000000022', 'de000000-0000-0000-0000-000000000054', 'de000000-0000-0000-0000-000000000012', true),
  ('de000000-0000-0000-0000-000000000022', 'de000000-0000-0000-0000-000000000055', 'de000000-0000-0000-0000-000000000012', true),
  ('de000000-0000-0000-0000-000000000023', 'de000000-0000-0000-0000-000000000056', 'de000000-0000-0000-0000-000000000013', true),
  ('de000000-0000-0000-0000-000000000023', 'de000000-0000-0000-0000-000000000057', 'de000000-0000-0000-0000-000000000013', true)
ON CONFLICT DO NOTHING;

-- ── 9. Enseignants ────────────────────────────────────────────────────────────
INSERT INTO enseignants (id, ecole_id, nom, prenom, grade, specialite, email, telephone, statut) VALUES
  ('de000000-0000-0000-0000-000000000060', 'de000000-0000-0000-0000-000000000001', 'AGOSSOU',     'Théodore',   'Maître de Conférences', 'Management',       'tagossou@esm-demo.bj',    '+22901000001', 'Permanent'),
  ('de000000-0000-0000-0000-000000000061', 'de000000-0000-0000-0000-000000000001', 'AHOUANDJINOU','Gervais',    'Professeur Titulaire',             'Finance',          'gahouandjinou@esm-demo.bj','+22901000002', 'Permanent'),
  ('de000000-0000-0000-0000-000000000062', 'de000000-0000-0000-0000-000000000001', 'DOSSOU',      'Romuald',    'Maître-Assistant',       'Droit',            'rdossou@esm-demo.bj',     '+22901000003', 'Permanent'),
  ('de000000-0000-0000-0000-000000000063', 'de000000-0000-0000-0000-000000000001', 'KPOSSOU',     'Christiane', 'Maître-Assistant',              'RH',               'ckpossou@esm-demo.bj',    '+22901000004', 'Permanent'),
  ('de000000-0000-0000-0000-000000000064', 'de000000-0000-0000-0000-000000000001', 'ZANNOU',      'Félicité',   'Maître de Conférences',  'Mathématiques',    'fzannou@esm-demo.bj',     '+22901000005', 'Permanent')
ON CONFLICT (id) DO NOTHING;

-- ── 10. Étudiants (20 fictifs réalistes) ────────────────────────────────────
INSERT INTO etudiants (id, ecole_id, nom, prenom, matricule, filiere, niveau, email_auth, telephone_parent, statut) VALUES
  ('de000000-0000-0000-0001-000000000001','de000000-0000-0000-0000-000000000001','ADANLE','Euphrasie','esm-MGT-0001','Management','L1','eadanle@esm-demo.bj','+22960000001','actif'),
  ('de000000-0000-0000-0001-000000000002','de000000-0000-0000-0000-000000000001','ADOMOU','Fidèle','esm-MGT-0002','Management','L1','fadomou@esm-demo.bj','+22960000002','actif'),
  ('de000000-0000-0000-0001-000000000003','de000000-0000-0000-0000-000000000001','AGBAKPA','Sèwè','esm-MGT-0003','Management','L1','sagbakpa@esm-demo.bj','+22960000003','actif'),
  ('de000000-0000-0000-0001-000000000004','de000000-0000-0000-0000-000000000001','AHISSOU','Prudence','esm-MGT-0004','Management','L1','pahissou@esm-demo.bj','+22960000004','actif'),
  ('de000000-0000-0000-0001-000000000005','de000000-0000-0000-0000-000000000001','AÏZONHOUN','Délali','esm-MGT-0005','Management','L1','daïzonhoun@esm-demo.bj','+22960000005','actif'),
  ('de000000-0000-0000-0001-000000000006','de000000-0000-0000-0000-000000000001','BIAOU','Christèle','esm-MGT-0006','Management','L1','cbiaou@esm-demo.bj','+22960000006','actif'),
  ('de000000-0000-0000-0001-000000000007','de000000-0000-0000-0000-000000000001','DANSOU','Hortense','esm-MGT-0007','Management','L1','hdansou@esm-demo.bj','+22960000007','actif'),
  ('de000000-0000-0000-0001-000000000008','de000000-0000-0000-0000-000000000001','ELEGBEDE','Maxime','esm-MGT-0008','Management','L1','melegbede@esm-demo.bj','+22960000008','actif'),
  ('de000000-0000-0000-0001-000000000009','de000000-0000-0000-0000-000000000001','FAGNON','Judicaël','esm-MGT-0009','Management','L1','jfagnon@esm-demo.bj','+22960000009','actif'),
  ('de000000-0000-0000-0001-000000000010','de000000-0000-0000-0000-000000000001','GANGBE','Sylvestre','esm-MGT-0010','Management','L1','sgangbe@esm-demo.bj','+22960000010','actif'),
  ('de000000-0000-0000-0001-000000000011','de000000-0000-0000-0000-000000000001','HOUENOU','Brice','esm-MKT-0001','Marketing','L1','bhouenou@esm-demo.bj','+22960000011','actif'),
  ('de000000-0000-0000-0001-000000000012','de000000-0000-0000-0000-000000000001','GBAGUIDI','Odile','esm-MKT-0002','Marketing','L1','ogbaguidi@esm-demo.bj','+22960000012','actif'),
  ('de000000-0000-0000-0001-000000000013','de000000-0000-0000-0000-000000000001','KIKI','Aristide','esm-MKT-0003','Marketing','L1','akiki@esm-demo.bj','+22960000013','actif'),
  ('de000000-0000-0000-0001-000000000014','de000000-0000-0000-0000-000000000001','LOKO','Bénédicte','esm-MKT-0004','Marketing','L1','bloko@esm-demo.bj','+22960000014','actif'),
  ('de000000-0000-0000-0001-000000000015','de000000-0000-0000-0000-000000000001','MEDENOU','Charbel','esm-MKT-0005','Marketing','L1','cmedenou@esm-demo.bj','+22960000015','actif'),
  ('de000000-0000-0000-0001-000000000016','de000000-0000-0000-0000-000000000001','NOUDOKPESSI','Arnauld','esm-MGTm-0001','Management','M1','anoudokpessi@esm-demo.bj','+22960000016','actif'),
  ('de000000-0000-0000-0001-000000000017','de000000-0000-0000-0000-000000000001','OUINSOU','Latifatou','esm-MGTm-0002','Management','M1','louinsou@esm-demo.bj','+22960000017','actif'),
  ('de000000-0000-0000-0001-000000000018','de000000-0000-0000-0000-000000000001','PADONOU','Gilles','esm-MGTm-0003','Management','M1','gpadonou@esm-demo.bj','+22960000018','actif'),
  ('de000000-0000-0000-0001-000000000019','de000000-0000-0000-0000-000000000001','QUENUM','Ines','esm-RH-0001','RH','M1','iquenum@esm-demo.bj','+22960000019','actif'),
  ('de000000-0000-0000-0001-000000000020','de000000-0000-0000-0000-000000000001','RANDAH','Sèwanougbé','esm-RH-0002','RH','M1','srandah@esm-demo.bj','+22960000020','actif')
ON CONFLICT (id) DO NOTHING;

-- ── 11. Inscriptions semestrielles ────────────────────────────────────────────
-- L1 MGT
INSERT INTO inscriptions_semestre (etudiant_id, semestre_id, ecole_id, promotion_id, annee_academique_id, statut) VALUES
  ('de000000-0000-0000-0001-000000000001','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000002','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000003','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000004','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000005','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000006','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000007','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000008','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000009','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000010','de000000-0000-0000-0000-000000000020','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000040','de000000-0000-0000-0000-000000000002','active'),
-- L1 MKT
  ('de000000-0000-0000-0001-000000000011','de000000-0000-0000-0000-000000000021','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000041','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000012','de000000-0000-0000-0000-000000000021','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000041','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000013','de000000-0000-0000-0000-000000000021','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000041','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000014','de000000-0000-0000-0000-000000000021','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000041','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000015','de000000-0000-0000-0000-000000000021','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000041','de000000-0000-0000-0000-000000000002','active'),
-- M1 MGT
  ('de000000-0000-0000-0001-000000000016','de000000-0000-0000-0000-000000000022','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000042','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000017','de000000-0000-0000-0000-000000000022','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000042','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000018','de000000-0000-0000-0000-000000000022','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000042','de000000-0000-0000-0000-000000000002','active'),
-- M1 RH
  ('de000000-0000-0000-0001-000000000019','de000000-0000-0000-0000-000000000023','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000043','de000000-0000-0000-0000-000000000002','active'),
  ('de000000-0000-0000-0001-000000000020','de000000-0000-0000-0000-000000000023','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000043','de000000-0000-0000-0000-000000000002','active')
ON CONFLICT DO NOTHING;

-- ── 12. Matières LMD ─────────────────────────────────────────────────────────
INSERT INTO matieres_lmd (id, ecole_id, ue_id, code, nom, coefficient, enseignant_id) VALUES
  ('de000000-0000-0000-0002-000000000001','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000050','MGT101','Théories des Organisations',2,'de000000-0000-0000-0000-000000000060'),
  ('de000000-0000-0000-0002-000000000002','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000050','MGT102','Processus Managériaux',2,'de000000-0000-0000-0000-000000000060'),
  ('de000000-0000-0000-0002-000000000003','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000051','CPT101','Comptabilité Générale',3,'de000000-0000-0000-0000-000000000061'),
  ('de000000-0000-0000-0002-000000000004','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000052','DRT101','Droit Commercial',2,'de000000-0000-0000-0000-000000000062'),
  ('de000000-0000-0000-0002-000000000005','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000053','MAT101','Statistiques Descriptives',2,'de000000-0000-0000-0000-000000000064'),
  ('de000000-0000-0000-0002-000000000006','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000054','MGT501','Stratégie d''Entreprise',3,'de000000-0000-0000-0000-000000000060'),
  ('de000000-0000-0000-0002-000000000007','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000055','FIN501','Analyse Financière Avancée',3,'de000000-0000-0000-0000-000000000061'),
  ('de000000-0000-0000-0002-000000000008','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000056','RH501','GPEC et Développement RH',3,'de000000-0000-0000-0000-000000000063'),
  ('de000000-0000-0000-0002-000000000009','de000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000057','DRT501','Droit Social Avancé',3,'de000000-0000-0000-0000-000000000062')
ON CONFLICT (id) DO NOTHING;

-- ── 13. Notes de démo (variées — admis, ajourné, compensation) ───────────────
-- ── 13. Notes de démo ───────────────────────────────────────────────────────
-- Les notes sont stockées dans notes_lmd via la table evaluations.
-- Pour ajouter des notes de démo, utiliser l'interface Saisie des notes
-- depuis le back-office après avoir créé les évaluations par matière.
-- Exemple via SQL :
-- 1. Créer une évaluation : INSERT INTO evaluations (ecole_id, session_id, matiere_id, categorie, intitule, ponderation)
--    VALUES ('de000000-...', 'de000000-...', 'de000000-...', 'Examen', 'Examen final', 1.0);
-- 2. Saisir une note : INSERT INTO notes_lmd (etudiant_id, evaluation_id, session_id, ecole_id, valeur, absent)
--    VALUES ('de000000-...', '<eval_id>', 'de000000-...', 'de000000-...', 15.5, false);

-- ── 14. Factures de démo ──────────────────────────────────────────────────────
INSERT INTO factures (ecole_id, etudiant_id, type_frais, libelle, montant_total, montant_paye, statut, annee_scolaire, date_echeance) VALUES
-- L1 MGT — Scolarité (payés variés)
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000001','scolarite','Frais de scolarité 2025-2026',450000,450000,'paye','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000002','scolarite','Frais de scolarité 2025-2026',450000,300000,'partiel','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000003','scolarite','Frais de scolarité 2025-2026',450000,0,'en_attente','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000004','scolarite','Frais de scolarité 2025-2026',450000,450000,'paye','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000005','scolarite','Frais de scolarité 2025-2026',450000,200000,'partiel','2025-2026','2025-10-31'),
-- Frais inscription
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000001','inscription','Frais d''inscription 2025-2026',50000,50000,'paye','2025-2026','2025-09-30'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000002','inscription','Frais d''inscription 2025-2026',50000,50000,'paye','2025-2026','2025-09-30'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000003','inscription','Frais d''inscription 2025-2026',50000,0,'en_attente','2025-2026','2025-09-30'),
-- Master
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000016','scolarite','Frais de scolarité Master 2025-2026',650000,650000,'paye','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000017','scolarite','Frais de scolarité Master 2025-2026',650000,325000,'partiel','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000018','scolarite','Frais de scolarité Master 2025-2026',650000,650000,'paye','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000019','scolarite','Frais de scolarité Master 2025-2026',650000,0,'en_attente','2025-2026','2025-10-31'),
  ('de000000-0000-0000-0000-000000000001','de000000-0000-0000-0001-000000000020','scolarite','Frais de scolarité Master 2025-2026',650000,650000,'paye','2025-2026','2025-10-31')
ON CONFLICT DO NOTHING;

-- ── 15. Message de bienvenue démo ─────────────────────────────────────────────
INSERT INTO messages (ecole_id, expediteur_id, expediteur_nom, expediteur_role, sujet, objet, contenu, lu)
VALUES (
  'de000000-0000-0000-0000-000000000001',
  NULL,
  'Administration ESM',
  'admin',
  'Bienvenue sur EduLink Sup — ESM DÉMO',
  'Bienvenue sur EduLink Sup — ESM DÉMO',
  'Bienvenue sur l''environnement de démonstration EduLink Sup pour l''École Supérieure de Management (ESM). Cet environnement contient des données fictives représentatives : 4 programmes LMD, 20 étudiants, des notes variées illustrant admis/ajourné/compensation, et des factures avec différents statuts de paiement. N''hésitez pas à explorer tous les modules.',
  false
) ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- Script de NETTOYAGE (à exécuter pour supprimer la démo)
-- ============================================================
/*
BEGIN;
DELETE FROM messages          WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM factures          WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM notes             WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM inscriptions_semestre WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM etudiants         WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM matieres_lmd      WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM programme_ue      WHERE semestre_id IN (SELECT id FROM semestres WHERE ecole_id = 'de000000-0000-0000-0000-000000000001');
DELETE FROM unites_enseignement WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM enseignants       WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM promotions        WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM sessions_evaluation WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM semestres         WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM programmes_lmd    WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM annees_academiques WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM regles_ecole      WHERE ecole_id = 'de000000-0000-0000-0000-000000000001';
DELETE FROM ecoles            WHERE id = 'de000000-0000-0000-0000-000000000001';
COMMIT;
*/
