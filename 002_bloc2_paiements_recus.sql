-- ============================================================================
-- EduLink Sup — Comptabilité Bloc 2 (Phase 1) : Paiements détaillés + Reçus
-- Tables : paiements, compteurs_recus
-- Fonction : fn_generate_numero_recu (SECURITY DEFINER, contourne RLS comme les
--            autres RPC déjà en place — fn_get_promotions, fn_get_programmes_lmd…)
-- RLS calquée à l'identique sur `promotions` pour la table `paiements`.
-- ============================================================================

-- ── 1. compteurs_recus ───────────────────────────────────────────────────────
-- Compteur atomique par école + année, jamais accédé directement (RLS fermée,
-- uniquement via fn_generate_numero_recu ci-dessous).

create table if not exists compteurs_recus (
  ecole_id        uuid not null references ecoles(id) on delete cascade,
  annee           integer not null,
  dernier_numero  integer not null default 0,
  primary key (ecole_id, annee)
);

alter table compteurs_recus enable row level security;
-- Aucune policy : accès uniquement via la fonction SECURITY DEFINER ci-dessous.


-- ── 2. Fonction de numérotation atomique des reçus ───────────────────────────
-- Format : RECU-2026-000001 (remise à zéro chaque année civile, par école)

create or replace function fn_generate_numero_recu(p_ecole_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annee  integer := extract(year from now())::integer;
  v_numero integer;
begin
  insert into compteurs_recus (ecole_id, annee, dernier_numero)
  values (p_ecole_id, v_annee, 1)
  on conflict (ecole_id, annee)
  do update set dernier_numero = compteurs_recus.dernier_numero + 1
  returning dernier_numero into v_numero;

  return 'RECU-' || v_annee || '-' || lpad(v_numero::text, 6, '0');
end;
$$;

grant execute on function fn_generate_numero_recu(uuid) to authenticated;


-- ── 3. paiements ──────────────────────────────────────────────────────────────
-- Historique détaillé des paiements (remplace le simple compteur montant_paye
-- sur factures — celui-ci reste à jour en parallèle pour ne rien casser côté UI).

create table if not exists paiements (
  id               uuid primary key default gen_random_uuid(),
  ecole_id         uuid not null references ecoles(id) on delete cascade,
  facture_id       uuid not null references factures(id) on delete cascade,
  etudiant_id      uuid not null references etudiants(id) on delete cascade,
  montant          numeric(12,2) not null check (montant > 0),
  mode_paiement    text not null check (mode_paiement in ('especes','virement','mobile_money','cheque')),
  reference        text,                 -- obligatoire côté UI si mode = virement/mobile_money
  date_paiement    timestamptz not null default now(),
  caissier_id      uuid references utilisateurs(id),
  caissier_nom     text,                 -- dénormalisé pour affichage résilient (reçu, historique)
  numero_recu      text not null unique,
  statut           text not null default 'valide' check (statut in ('valide','annule')),
  motif_annulation text,
  annule_par       uuid references utilisateurs(id),
  annule_le        timestamptz,
  observation      text,
  created_at       timestamptz not null default now()
);

alter table paiements enable row level security;

create policy paiements_select on paiements
  for select using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy paiements_select_superadmin on paiements
  for select using (
    exists (select 1 from utilisateurs
      where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true
        and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

create policy paiements_insert on paiements
  for insert with check (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

create policy paiements_update on paiements
  for update using (
    ((get_user_ecole_id() is null) and ((select utilisateurs.role from utilisateurs
        where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true limit 1) = 'admin'))
    or (get_user_ecole_id() = ecole_id)
  );

-- Pas de policy delete : un paiement ne se supprime jamais, il s'annule (traçabilité,
-- cf. section 18 de la spec — écriture inverse, jamais de suppression physique).

create index if not exists idx_paiements_ecole    on paiements(ecole_id);
create index if not exists idx_paiements_facture   on paiements(facture_id);
create index if not exists idx_paiements_etudiant  on paiements(etudiant_id);
create index if not exists idx_paiements_numero    on paiements(numero_recu);


-- ============================================================================
-- Vérification rapide après exécution :
--   select fn_generate_numero_recu('e3b029b5-f98f-4314-9654-054a0dbcfcde'::uuid);
--   -- doit retourner quelque chose comme 'RECU-2026-000001' sans erreur
--   select count(*) from paiements;  -- doit retourner 0
-- ============================================================================
