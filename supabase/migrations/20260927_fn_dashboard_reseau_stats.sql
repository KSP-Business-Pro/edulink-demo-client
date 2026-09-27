-- ============================================================================
-- Dashboard Réseau — agrégation SQL (correctif performance)
-- EduLink Sup — migration 20260927_fn_dashboard_reseau_stats.sql
-- Remplace ~7-8 requêtes séquentielles PAR ÉCOLE (loadStats côté front) par
-- un seul aller-retour serveur, calculé en SQL pour toutes les écoles actives.
-- ============================================================================

-- 1. Index de soutien (additifs, sans risque) sur les colonnes déjà filtrées
--    partout dans l'app par ecole_id/semestre_id. Sur une table `presences`
--    volumineuse en prod, envisager de les créer en CONCURRENTLY hors
--    transaction si un verrou, même bref, est indésirable.
create index if not exists idx_etudiants_ecole        on public.etudiants     (ecole_id);
create index if not exists idx_enseignants_ecole       on public.enseignants   (ecole_id);
create index if not exists idx_promotions_ecole        on public.promotions    (ecole_id);
create index if not exists idx_factures_ecole          on public.factures      (ecole_id);
create index if not exists idx_semestres_ecole_statut  on public.semestres     (ecole_id, statut);
create index if not exists idx_presences_ecole_etudiant on public.presences    (ecole_id, etudiant_id);
create index if not exists idx_deliberations_semestre  on public.deliberations (semestre_id);

-- 2. Fonction d'agrégation réseau — un seul appel pour toutes les écoles actives.
--    SECURITY DEFINER car elle doit lire à travers toutes les écoles (RLS
--    normalement scopée par ecole_id pour un utilisateur non-superadmin) ;
--    protégée par un contrôle explicite du rôle appelant : superadmin RÉSEAU
--    uniquement (role='admin' ET ecole_id IS NULL), même convention que
--    admin-reset-mfa.
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
    e.id,
    e.nom,
    e.code_ecole,
    coalesce((select count(*)::integer from public.etudiants et where et.ecole_id = e.id), 0),
    coalesce((select count(*)::integer from public.enseignants en where en.ecole_id = e.id), 0),
    coalesce((select count(*)::integer from public.promotions pr where pr.ecole_id = e.id), 0),
    coalesce((select count(*)::integer from sem_actifs sa where sa.ecole_id = e.id), 0),
    coalesce((select sum(f.montant_total) from public.factures f where f.ecole_id = e.id), 0),
    coalesce((select sum(f.montant_paye) from public.factures f where f.ecole_id = e.id), 0),
    coalesce((select nb_risque from risque_par_ecole rq where rq.ecole_id = e.id), 0),
    (
      coalesce((select count(*)::integer from sem_actifs sa where sa.ecole_id = e.id), 0)
      - coalesce((select count(*)::integer from delibs_validees dv where dv.ecole_id = e.id), 0)
    )
  from public.ecoles e
  where e.actif = true
  order by e.nom;
end;
$$;

revoke all on function public.fn_dashboard_reseau_stats() from public, anon;
grant execute on function public.fn_dashboard_reseau_stats() to authenticated, service_role;