-- ============================================================================
-- EduLink Sup — Comptabilité Bloc 2 (fin) : Facturation liée aux grilles
-- tarifaires + Caisse journalière
-- ============================================================================

-- ── 1. Traçabilité facture ↔ grille tarifaire ────────────────────────────────
-- Colonne nullable : les factures manuelles existantes ne sont pas affectées.

alter table factures
  add column if not exists grille_tarifaire_id uuid references grilles_tarifaires(id) on delete set null;

create index if not exists idx_factures_grille on factures(grille_tarifaire_id);


-- ── 2. caisse_journaliere ─────────────────────────────────────────────────────
-- Une caisse par (école, caissier, jour). RLS identique au pattern `promotions`.

create table if not exists caisse_journaliere (
  id             uuid primary key default gen_random_uuid(),
  ecole_id       uuid not null references ecoles(id) on delete cascade,
  date_jour      date not null default current_date,
  caissier_id    uuid references utilisateurs(id),
  caissier_nom   text not null,
  statut         text not null default 'ouverte' check (statut in ('ouverte','fermee')),
  fond_initial   numeric(12,2) not null default 0,
  total_compte   numeric(12,2),          -- montant espèces réellement compté à la clôture
  ecart          numeric(12,2),          -- total_compte - (fond_initial + total espèces théorique du jour)
  observations   text,
  ouverte_le     timestamptz not null default now(),
  fermee_le      timestamptz,
  created_at     timestamptz not null default now(),
  unique (ecole_id, caissier_id, date_jour)
);

alter table caisse_journaliere enable row level security;

create policy caisse_journaliere_select on caisse_journaliere
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy caisse_journaliere_select_superadmin on caisse_journaliere
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy caisse_journaliere_insert on caisse_journaliere
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy caisse_journaliere_update on caisse_journaliere
  for update using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create index if not exists idx_caisse_ecole_jour on caisse_journaliere(ecole_id, date_jour);


-- ============================================================================
-- Vérification :
--   select column_name from information_schema.columns
--   where table_name = 'factures' and column_name = 'grille_tarifaire_id';
--   -- doit retourner 1 ligne
--   select count(*) from caisse_journaliere;  -- doit retourner 0
-- ============================================================================
