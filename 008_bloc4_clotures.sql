-- ============================================================================
-- EduLink Sup — Comptabilité Bloc 4 : Pilotage financier
-- Table : clotures_comptables (le dashboard/rapports/audit s'appuient sur les
-- tables déjà existantes : factures, paiements, audit_log — rien de neuf à créer)
-- ============================================================================

create table if not exists clotures_comptables (
  id                uuid primary key default gen_random_uuid(),
  ecole_id          uuid not null references ecoles(id) on delete cascade,
  periode_debut     date not null,
  periode_fin       date not null,
  libelle           text not null,          -- ex: "Juin 2026"
  total_attendu     numeric(14,2) not null default 0,
  total_encaisse    numeric(14,2) not null default 0,
  total_impaye      numeric(14,2) not null default 0,
  cloturee_par      uuid references utilisateurs(id),
  cloturee_par_nom  text not null,
  observations      text,
  created_at        timestamptz not null default now(),
  unique (ecole_id, periode_debut, periode_fin)
);

alter table clotures_comptables enable row level security;

create policy clotures_comptables_select on clotures_comptables
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy clotures_comptables_select_superadmin on clotures_comptables
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy clotures_comptables_insert on clotures_comptables
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create index if not exists idx_clotures_ecole on clotures_comptables(ecole_id);

-- ============================================================================
-- Vérification : select count(*) from clotures_comptables;  -- doit retourner 0
-- ============================================================================
