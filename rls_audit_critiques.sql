-- =============================================================================
-- EduLink Sup — Audit RLS S7 — Correctifs CRITIQUES
-- Projet Supabase : kcfpvnrgutkhakogbjip
-- À exécuter dans SQL Editor — idempotent (DROP IF EXISTS avant CREATE)
-- =============================================================================

-- ── 1. annees_academiques : activer RLS + policies super-admin ────────────────
alter table public.annees_academiques enable row level security;

drop policy if exists annees_select_superadmin on public.annees_academiques;
drop policy if exists annees_insert_superadmin on public.annees_academiques;
drop policy if exists annees_update_superadmin on public.annees_academiques;
drop policy if exists annees_delete_superadmin on public.annees_academiques;

create policy annees_select_superadmin on public.annees_academiques for select
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy annees_insert_superadmin on public.annees_academiques for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy annees_update_superadmin on public.annees_academiques for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy annees_delete_superadmin on public.annees_academiques for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── 2. utilisateurs : supprimer la policy SELECT publique ─────────────────────
-- utilisateurs_select_any (true) expose tous les utilisateurs à tout authentifié.
-- utilisateurs_select_v3 (own row OR même école) suffit et est déjà en place.
drop policy if exists utilisateurs_select_any on public.utilisateurs;

-- ── 3. resultats_cache : corriger les policies trop permissives ───────────────
-- cache_insert / cache_update avec auth.uid() IS NOT NULL = n'importe quel
-- utilisateur authentifié peut écrire dans le cache de toutes les écoles.
-- Ces tables ne sont écrites que par des fonctions SECURITY DEFINER → on restreint.
drop policy if exists cache_insert on public.resultats_cache;
drop policy if exists cache_update on public.resultats_cache;

create policy cache_insert on public.resultats_cache for insert
  with check (
    ecole_id = get_user_ecole_id()
    or exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );
create policy cache_update on public.resultats_cache for update
  using (
    ecole_id = get_user_ecole_id()
    or exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  ) with check (
    ecole_id = get_user_ecole_id()
    or exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin')
  );

-- ── 4. releves_notes : corriger la policy portail corrompue ──────────────────
-- Ancienne policy : SELECT releves_notes.etudiant_id FROM profiles → auto-référence
-- incorrecte. Corriger par une jointure sur etudiants.auth_id.
drop policy if exists etudiant_lit_ses_releves on public.releves_notes;

create policy etudiant_lit_ses_releves on public.releves_notes for select
  using (
    etudiant_id in (
      select id from public.etudiants
      where etudiants.auth_id = auth.uid()
    )
  );

-- ── 5. recalcul_queue : activer RLS ──────────────────────────────────────────
-- Policies existantes (ecole_id = get_user_ecole_id()) mais RLS désactivé.
-- SECURITY DEFINER bypass RLS → les triggers ne seront pas affectés.
alter table public.recalcul_queue enable row level security;

-- ── Vérification post-exécution ───────────────────────────────────────────────
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public'
--   and tablename in ('annees_academiques','resultats_cache','recalcul_queue');
--
-- select policyname, cmd from pg_policies
-- where tablename = 'utilisateurs' and policyname = 'utilisateurs_select_any';
-- (doit retourner 0 lignes)
