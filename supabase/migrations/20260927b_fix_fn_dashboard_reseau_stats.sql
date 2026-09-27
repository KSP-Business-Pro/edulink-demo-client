-- ============================================================================
-- Correctif — fn_dashboard_reseau_stats : colonne ambiguë + types de retour
-- EduLink Sup — migration 20260927b_fix_fn_dashboard_reseau_stats.sql
-- Corrige deux erreurs rencontrées après le déploiement de la migration
-- 20260927_fn_dashboard_reseau_stats.sql :
--   1) 42702 "column reference ecole_id is ambiguous" (conflit entre la
--      colonne de sortie RETURNS TABLE et les colonnes de table du même nom)
--   2) 42804 "Returned type character varying(10) does not match expected
--      type text" (ecoles.code_ecole est varchar(10), pas text)
-- ============================================================================

create or replace function public.fn_dashboard_reseau_stats()
returns table (
  ecole_id              uuid,
  nom                   text,
  code_ecole            text,
  etudiants             integer,
  enseignants           integer,
  promotions            integer,
  semestres_actifs      integer,
  factures_total        numeric,
  factures_encaissees   numeric,
  etudiants_risque      integer,
  deliberations_pending integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ecole_id uuid;
begin
  if v_uid is null then
    raise exception 'non_authentifie';
  end if;

  select u.role, u.ecole_id into v_role, v_ecole_id
  from public.utilisateurs u
  where u.auth_id = v_uid and u.actif = true;

  if v_role is distinct from 'admin' or v_ecole_id is not null then
    raise exception 'acces_refuse';
  end if;

  return query
  with sem_actifs as (
    select s.id, s.ecole_id
    from public.semestres s
    where s.statut = 'en_cours'
  ),
  delibs_validees as (
    select d.id, sa.ecole_id
    from public.deliberations d
    join sem_actifs sa on sa.id = d.semestre_id
    where d.statut = 'validee'
  ),
  presences_par_etudiant as (
    select
      p.ecole_id,
      p.etudiant_id,
      count(*) as total,
      count(*) filter (where p.statut = 'absent') as absents
    from public.presences p
    group by p.ecole_id, p.etudiant_id
  ),
  risque_par_ecole as (
    select ecole_id, count(*) as nb_risque
    from presences_par_etudiant
    where total > 0 and (absents::numeric / total) > 0.3
    group by ecole_id
  )
  select
    e.id::uuid,
    e.nom::text,
    e.code_ecole::text,
    coalesce((select count(*) from public.etudiants et where et.ecole_id = e.id), 0)::integer,
    coalesce((select count(*) from public.enseignants en where en.ecole_id = e.id), 0)::integer,
    coalesce((select count(*) from public.promotions pr where pr.ecole_id = e.id), 0)::integer,
    coalesce((select count(*) from sem_actifs sa where sa.ecole_id = e.id), 0)::integer,
    coalesce((select sum(f.montant_total) from public.factures f where f.ecole_id = e.id), 0)::numeric,
    coalesce((select sum(f.montant_paye) from public.factures f where f.ecole_id = e.id), 0)::numeric,
    coalesce((select nb_risque from risque_par_ecole rq where rq.ecole_id = e.id), 0)::integer,
    (
      coalesce((select count(*) from sem_actifs sa where sa.ecole_id = e.id), 0)
      - coalesce((select count(*) from delibs_validees dv where dv.ecole_id = e.id), 0)
    )::integer
  from public.ecoles e
  where e.actif = true
  order by e.nom;
end;
$$;

revoke all on function public.fn_dashboard_reseau_stats() from public, anon;
grant execute on function public.fn_dashboard_reseau_stats() to authenticated, service_role;