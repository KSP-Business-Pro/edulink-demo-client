-- =============================================================================
-- EduLink Sup — Tests SQL critiques LMD-CAMES
-- École test : HEMEC (ecole_id = 8916ae3b-eaba-4f64-b785-9f2b00ab1334)
-- Semestre test : S8 — Master ACG 2025-2026
-- Exécuter chaque bloc séparément et vérifier les résultats attendus
-- =============================================================================

-- Variables réutilisées (copier les UUIDs réels si les sous-requêtes sont lentes)
-- Semestre S8 ACG :
--   select id from semestres where libelle like '%S8%ACG%'
-- Année académique :
--   select id from annees_academiques where libelle like '%2025-2026%' limit 1

-- =============================================================================
-- CAS 1 — ADMIS normal (toutes UEs >= 10, pas de compensation)
-- Étudiant : AGBODEKA Maxime (hemec-AUD-0006) — moy 15.87, 6 CECT
-- =============================================================================
-- Attendu :
--   ue_validee = true pour toutes les UEs
--   est_compense = false partout
--   est_exclu = false partout
--   credits_acquis = credits_cect pour chaque UE
--   total_credits = 6 (somme)
-- =============================================================================
select
  ue_code,
  round(moyenne_ue, 2)   as moy,
  ue_validee,
  est_compense,
  est_exclu,
  credits_acquis,
  mention_ue::text       as mention
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0006'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
)
order by ue_code;

-- =============================================================================
-- CAS 2 — ADMIS par compensation (une UE < 10 mais moy sem >= 10)
-- Étudiant : KEKE Annonciade (hemec-AUD-0009)
-- Pré-requis : compensation_active = true sur HEMEC (déjà activé)
-- =============================================================================
-- Attendu :
--   ACG-M1-UE1 : ue_validee = true, est_compense = false (note >= 10)
--   ACG-M1-UE2 : ue_validee = true, est_compense = true  (compensée)
--   Total crédits = 6 (toutes UEs validées)
-- =============================================================================
select
  ue_code,
  round(moyenne_ue, 2)   as moy,
  ue_validee,
  est_compense,
  est_exclu,
  credits_acquis
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0009'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
)
order by ue_code;

-- Vérification cohérence : moy semestrielle doit être >= 10
select round(avg(moyenne_ue), 2) as moy_semestre_keke
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0009'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
)
where moyenne_ue is not null;
-- Attendu : >= 10

-- =============================================================================
-- CAS 3 — AJOURNÉ (aucune UE >= 10, pas de compensation possible)
-- Étudiant : VODONOU Justine (hemec-AUD-0001) — moy 9.14, 0 CECT
-- =============================================================================
-- Attendu :
--   ue_validee = false pour toutes les UEs
--   est_compense = false (moy sem < 10 → compensation impossible)
--   credits_acquis = 0 pour toutes
-- =============================================================================
select
  ue_code,
  round(moyenne_ue, 2)   as moy,
  ue_validee,
  est_compense,
  est_exclu,
  credits_acquis
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0001'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
)
order by ue_code;

select round(avg(moyenne_ue), 2) as moy_semestre_vodonou
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0001'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
)
where moyenne_ue is not null;
-- Attendu : < 10

-- =============================================================================
-- CAS 4 — EXCLU pour absence (UE obligatoire → semestre non validé)
-- Étudiant : AZONHIHO Gildas (hemec-AUD-0002) — exclu ACG-M1-UE2
-- =============================================================================
-- Attendu :
--   ACG-M1-UE1 : ue_validee = true, est_exclu = false, credits_acquis = 4
--   ACG-M1-UE2 : est_exclu = true, moyenne_ue = null, ue_validee = false,
--                credits_acquis = 0, mention_ue = null
-- =============================================================================
select
  ue_code,
  moyenne_ue,
  ue_validee,
  est_compense,
  est_exclu,
  credits_acquis,
  mention_ue::text as mention
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0002'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
)
order by ue_code;

-- =============================================================================
-- CAS 5 — NOTE PLANCHER (UE non compensable car note < plancher)
-- Test logique : forcer note_plancher_active = true, seuil_note_plancher = 8
-- puis vérifier qu'une UE à 7.60 (KEKE, UE2) n'est PLUS compensée
-- =============================================================================
-- Étape 5a : activer le plancher à 8
update regles_ecole
set note_plancher_active = true, seuil_note_plancher = 8
where ecole_id = '8916ae3b-eaba-4f64-b785-9f2b00ab1334';

-- Étape 5b : vérifier que UE2 de KEKE (7.60) n'est plus compensée
select
  ue_code,
  round(moyenne_ue, 2)   as moy,
  ue_validee,
  est_compense,
  credits_acquis
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0009'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
)
order by ue_code;
-- Attendu : ACG-M1-UE2 → est_compense = false (7.60 < plancher 8)

-- Étape 5c : remettre le plancher à 5 (valeur HEMEC correcte)
update regles_ecole
set note_plancher_active = true, seuil_note_plancher = 5
where ecole_id = '8916ae3b-eaba-4f64-b785-9f2b00ab1334';

-- Vérification : KEKE UE2 redevient compensée
select ue_code, round(moyenne_ue,2) as moy, est_compense
from fn_resultats_semestre(
  (select id from etudiants where matricule = 'hemec-AUD-0009'),
  (select id from semestres where libelle like '%S8%ACG%' limit 1)
);
-- Attendu : ACG-M1-UE2 → est_compense = true (7.60 >= plancher 5)

-- =============================================================================
-- CAS 6 — RÉSULTATS ANNUELS (bilan agrégé multi-semestres)
-- Étudiant : AGBODEKA Maxime (hemec-AUD-0006)
-- =============================================================================
-- Attendu :
--   Une ligne par semestre inscrit cette année
--   total_credits_valides = somme des crédits validés sur tous les semestres
--   moyenne_annuelle = moy des moyennes semestrielles
--   decision_annuelle = 'Admis' ou 'En attente' (si semestres non évalués)
-- =============================================================================
select
  semestre_libelle,
  semestre_niveau,
  credits_valides,
  credits_tentes,
  round(moyenne_semestre, 2)   as moy_sem,
  semestre_valide,
  mention,
  source,
  total_credits_valides,
  round(moyenne_annuelle, 2)   as moy_annuelle,
  annee_validee,
  decision_annuelle
from fn_resultats_annuels(
  (select id from etudiants where matricule = 'hemec-AUD-0006'),
  (select id from annees_academiques where libelle like '%2025-2026%' limit 1)
)
order by semestre_numero;

-- =============================================================================
-- CAS 7 — COHÉRENCE credits_acquis (fn vs cache)
-- Vérifier que fn_resultats_semestre retourne les mêmes crédits que resultats_cache
-- =============================================================================
select
  e.matricule,
  fn_creds.credits_calcules,
  rc.credits_valides   as credits_cache,
  fn_creds.credits_calcules = rc.credits_valides as coherent
from etudiants e
cross join lateral (
  select sum(credits_acquis)::integer as credits_calcules
  from fn_resultats_semestre(
    e.id,
    (select id from semestres where libelle like '%S8%ACG%' limit 1)
  )
) fn_creds
left join resultats_cache rc
  on rc.etudiant_id = e.id
 and rc.semestre_id = (select id from semestres where libelle like '%S8%ACG%' limit 1)
where e.ecole_id = '8916ae3b-eaba-4f64-b785-9f2b00ab1334'
order by e.matricule;
-- Attendu : coherent = true pour tous les étudiants

-- =============================================================================
-- CAS 8 — RATTRAPAGE (règle 'max' des deux sessions)
-- Vérifier que fn_moyenne_ue prend bien le max(session_normale, rattrapage)
-- Affiche les composantes de la moyenne pour un étudiant
-- =============================================================================
select
  m.code                    as matiere,
  e.type_session,
  n.note
from notes_lmd n
join evaluations e  on e.id = n.evaluation_id
join matieres_lmd m on m.id = e.matiere_id
join programme_ue pu on pu.ue_id = m.ue_id
  and pu.semestre_id = (select id from semestres where libelle like '%S8%ACG%' limit 1)
where n.etudiant_id = (select id from etudiants where matricule = 'hemec-AUD-0009')
order by m.code, e.type_session;
-- Attendu : si rattrapage présent → fn_moyenne_ue a pris max(normale, rattrapage)
-- Vérifier cohérence avec la moyenne affichée dans CAS 2
