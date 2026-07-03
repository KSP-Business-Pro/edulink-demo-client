-- ============================================================================
-- EduLink Sup — Comptabilité Bloc 3 : Suivi et recouvrement
-- Tables : relances_paiement, derogations_financieres
-- ============================================================================

-- ── 1. relances_paiement ──────────────────────────────────────────────────────
-- Trace de chaque relance envoyée à un étudiant/parent pour impayé.

create table if not exists relances_paiement (
  id                uuid primary key default gen_random_uuid(),
  ecole_id          uuid not null references ecoles(id) on delete cascade,
  etudiant_id       uuid not null references etudiants(id) on delete cascade,
  canal             text not null check (canal in ('email','sms','appel','autre')),
  message           text,
  montant_du        numeric(12,2) not null default 0,
  envoye_par        uuid references utilisateurs(id),
  envoye_par_nom    text not null,
  envoye_le         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table relances_paiement enable row level security;

create policy relances_paiement_select on relances_paiement
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy relances_paiement_select_superadmin on relances_paiement
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy relances_paiement_insert on relances_paiement
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create index if not exists idx_relances_ecole    on relances_paiement(ecole_id);
create index if not exists idx_relances_etudiant on relances_paiement(etudiant_id);


-- ── 2. derogations_financieres ────────────────────────────────────────────────
-- Autorise temporairement un étudiant en situation d'impayé à contourner un
-- blocage précis (accès relevé, inscription, examen…), avec traçabilité.

create table if not exists derogations_financieres (
  id                uuid primary key default gen_random_uuid(),
  ecole_id          uuid not null references ecoles(id) on delete cascade,
  etudiant_id       uuid not null references etudiants(id) on delete cascade,
  type_derogation   text not null check (type_derogation in ('acces_releve','inscription','examen','autre')),
  motif             text not null,
  accordee_par      uuid references utilisateurs(id),
  accordee_par_nom  text not null,
  date_debut        date not null default current_date,
  date_fin          date,                 -- null = pas de date de fin explicite
  active            boolean not null default true,
  revoquee_le       timestamptz,
  revoquee_par      uuid references utilisateurs(id),
  created_at        timestamptz not null default now()
);

alter table derogations_financieres enable row level security;

create policy derogations_financieres_select on derogations_financieres
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy derogations_financieres_select_superadmin on derogations_financieres
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy derogations_financieres_insert on derogations_financieres
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy derogations_financieres_update on derogations_financieres
  for update using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create index if not exists idx_derogations_ecole    on derogations_financieres(ecole_id);
create index if not exists idx_derogations_etudiant on derogations_financieres(etudiant_id);


-- ============================================================================
-- Vérification :
--   select count(*) from relances_paiement;         -- doit retourner 0
--   select count(*) from derogations_financieres;    -- doit retourner 0
-- ============================================================================
