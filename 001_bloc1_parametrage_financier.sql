-- ============================================================================
-- EduLink Sup — Comptabilité Bloc 1 : Paramétrage financier
-- Tables : types_frais, grilles_tarifaires, echeanciers
-- RLS calquée à l'identique sur la table `promotions` (même helper get_user_ecole_id())
-- ============================================================================

-- ── 1. types_frais ───────────────────────────────────────────────────────────
-- Catalogue des frais configurables par école (remplace l'enum figé côté front)

create table if not exists types_frais (
  id           uuid primary key default gen_random_uuid(),
  ecole_id     uuid not null references ecoles(id) on delete cascade,
  code         text not null,                 -- ex: INS, SCO, EXA, MEM, BIB, LAB, STA, CAR, ASS, AUT
  libelle      text not null,                 -- ex: "Frais de scolarité"
  description  text,
  obligatoire  boolean not null default true,
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (ecole_id, code)
);

alter table types_frais enable row level security;

create policy types_frais_select on types_frais
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy types_frais_select_superadmin on types_frais
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy types_frais_insert on types_frais
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy types_frais_update on types_frais
  for update using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy types_frais_delete on types_frais
  for delete using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create index if not exists idx_types_frais_ecole on types_frais(ecole_id);


-- ── 2. grilles_tarifaires ────────────────────────────────────────────────────
-- Montant d'un type de frais pour un programme + niveau + année académique donnés

create table if not exists grilles_tarifaires (
  id                    uuid primary key default gen_random_uuid(),
  ecole_id              uuid not null references ecoles(id) on delete cascade,
  annee_academique_id   uuid references annees_academiques(id) on delete cascade,
  programme_id          uuid references programmes_lmd(id) on delete cascade,
  niveau                text,                 -- L1, L2, L3, M1, M2, D1, D2, D3 — null = s'applique à tout le programme
  type_frais_id         uuid not null references types_frais(id) on delete restrict,
  montant               numeric(12,2) not null check (montant >= 0),
  obligatoire           boolean not null default true,
  created_at            timestamptz not null default now()
);

alter table grilles_tarifaires enable row level security;

create policy grilles_tarifaires_select on grilles_tarifaires
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy grilles_tarifaires_select_superadmin on grilles_tarifaires
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy grilles_tarifaires_insert on grilles_tarifaires
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy grilles_tarifaires_update on grilles_tarifaires
  for update using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy grilles_tarifaires_delete on grilles_tarifaires
  for delete using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create index if not exists idx_grilles_tarifaires_ecole on grilles_tarifaires(ecole_id);
create index if not exists idx_grilles_tarifaires_lookup on grilles_tarifaires(ecole_id, programme_id, niveau, annee_academique_id);


-- ── 3. echeanciers ────────────────────────────────────────────────────────────
-- Tranches de paiement associées à une ligne de grille tarifaire
-- ecole_id dénormalisé (comme inscriptions_semestre) pour garder des policies RLS simples

create table if not exists echeanciers (
  id                    uuid primary key default gen_random_uuid(),
  ecole_id              uuid not null references ecoles(id) on delete cascade,
  grille_tarifaire_id   uuid not null references grilles_tarifaires(id) on delete cascade,
  tranche               integer not null check (tranche >= 1),
  pourcentage           numeric(5,2) check (pourcentage >= 0 and pourcentage <= 100),
  montant               numeric(12,2) check (montant >= 0),
  date_echeance         date,
  created_at            timestamptz not null default now(),
  unique (grille_tarifaire_id, tranche)
);

alter table echeanciers enable row level security;

create policy echeanciers_select on echeanciers
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy echeanciers_select_superadmin on echeanciers
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy echeanciers_insert on echeanciers
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy echeanciers_update on echeanciers
  for update using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy echeanciers_delete on echeanciers
  for delete using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create index if not exists idx_echeanciers_ecole on echeanciers(ecole_id);
create index if not exists idx_echeanciers_grille on echeanciers(grille_tarifaire_id);


-- ============================================================================
-- Vérification rapide après exécution :
--   select count(*) from types_frais;
--   select count(*) from grilles_tarifaires;
--   select count(*) from echeanciers;
-- Les 3 doivent retourner 0 (tables vides, RLS active) sans erreur de permission.
-- ============================================================================
