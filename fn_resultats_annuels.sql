-- =============================================================================
-- fn_resultats_annuels(p_etudiant_id, p_annee_academique_id)
-- Bilan annuel LMD d'un étudiant pour une année académique donnée.
-- Sources : releves_notes (snapshot publié) en priorité, sinon resultats_cache.
-- Logique compensation : si compensation_active ET moy_annuelle >= seuil → Admis
-- =============================================================================

create or replace function public.fn_resultats_annuels(
  p_etudiant_id        uuid,
  p_annee_academique_id uuid
)
returns table (
  semestre_id           uuid,
  semestre_libelle      text,
  semestre_niveau       text,
  semestre_numero       integer,
  credits_valides       integer,
  credits_tentes        integer,
  moyenne_semestre      numeric,
  semestre_valide       boolean,
  mention               text,
  source                text,
  -- Agrégats annuels (identiques sur chaque ligne)
  total_credits_valides integer,
  total_credits_tentes  integer,
  moyenne_annuelle      numeric,
  annee_validee         boolean,
  decision_annuelle     text
)
language sql stable security definer
set search_path to 'public'
as $$
with
-- Règles de l'école (compensation + seuil)
ecole_regles as (
  select re.compensation_active,
         coalesce(re.seuil_validation_semestre, 10) as seuil
  from inscriptions_semestre ins
  join regles_ecole re on re.ecole_id = ins.ecole_id
  where ins.etudiant_id        = p_etudiant_id
    and ins.annee_academique_id = p_annee_academique_id
  limit 1
),

-- Semestres auxquels l'étudiant est inscrit cette année
semestres_annee as (
  select distinct
    s.id            as semestre_id,
    s.libelle       as semestre_libelle,
    s.niveau::text  as semestre_niveau,
    s.numero        as semestre_numero
  from inscriptions_semestre ins
  join semestres s on s.id = ins.semestre_id
  where ins.etudiant_id        = p_etudiant_id
    and ins.annee_academique_id = p_annee_academique_id
),

-- Résultats par semestre : releve_publie > cache > non_evalue
resultats_par_semestre as (
  select
    sa.semestre_id,
    sa.semestre_libelle,
    sa.semestre_niveau,
    sa.semestre_numero,
    coalesce(rn.credits_valides,  rc.credits_valides,  0)          as credits_valides,
    coalesce(rn.credits_tentes,   rc.credits_valides,  0)          as credits_tentes,
    coalesce(rn.moyenne_semestre, rc.moyenne_semestre)              as moyenne_semestre,
    coalesce(rn.decision = 'admis', rc.semestre_valide, false)      as semestre_valide,
    coalesce(rn.mention::text, rc.mention)                          as mention,
    case
      when rn.id is not null then 'releve_publie'
      when rc.id is not null then 'cache'
      else                        'non_evalue'
    end                                                             as source
  from semestres_annee sa
  -- Dernier relevé publié pour ce semestre
  left join lateral (
    select id, credits_valides, credits_tentes,
           moyenne_semestre, decision, mention
    from   releves_notes
    where  etudiant_id = p_etudiant_id
      and  semestre_id = sa.semestre_id
    order by publie_le desc
    limit  1
  ) rn on true
  -- Résultats cachés (recalcul auto)
  left join resultats_cache rc
    on rc.etudiant_id = p_etudiant_id
   and rc.semestre_id = sa.semestre_id
),

-- Agrégats annuels
annual as (
  select
    sum(credits_valides)::integer      as total_cv,
    sum(credits_tentes)::integer       as total_ct,
    round(avg(moyenne_semestre), 2)    as moy_an,      -- moy simple : semestres = 30 ECTS chacun
    bool_and(semestre_valide)          as tous_valides,
    bool_and(source <> 'non_evalue')   as tous_evalues
  from resultats_par_semestre
)

select
  rs.semestre_id,
  rs.semestre_libelle,
  rs.semestre_niveau,
  rs.semestre_numero,
  rs.credits_valides,
  rs.credits_tentes,
  rs.moyenne_semestre,
  rs.semestre_valide,
  rs.mention,
  rs.source,
  a.total_cv,
  a.total_ct,
  a.moy_an,
  -- annee_validee : tous semestres admis, OU compensation active + moy >= seuil
  (
    a.tous_valides
    or (
      a.tous_evalues
      and coalesce((select compensation_active from ecole_regles), false)
      and a.moy_an >= (select seuil from ecole_regles)
    )
  )                                                              as annee_validee,
  case
    when not a.tous_evalues                                      then 'En attente'
    when a.tous_valides                                          then 'Admis'
    when coalesce((select compensation_active from ecole_regles), false)
      and a.moy_an >= (select seuil from ecole_regles)          then 'Admis par compensation'
    else                                                              'Ajourné'
  end                                                            as decision_annuelle
from resultats_par_semestre rs
cross join annual a
order by rs.semestre_numero;
$$;

grant execute on function public.fn_resultats_annuels(uuid, uuid)
  to authenticated, anon;

-- =============================================================================
-- Test rapide après exécution :
-- Remplacer les UUIDs par de vraies valeurs depuis votre base.
--
-- select * from fn_resultats_annuels(
--   (select id from etudiants where matricule = 'hemec-AUD-0006'),
--   (select id from annees_academiques where libelle = '2025-2026' limit 1)
-- );
--
-- Résultat attendu :
--   - Une ligne par semestre de l'étudiant pour cette année
--   - total_credits_valides = somme des crédits validés sur tous les semestres
--   - moyenne_annuelle = moyenne des moyennes semestrielles
--   - decision_annuelle = 'Admis' / 'Admis par compensation' / 'Ajourné' / 'En attente'
-- =============================================================================
