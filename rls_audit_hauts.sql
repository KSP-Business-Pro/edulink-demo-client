-- =============================================================================
-- EduLink Sup — Audit RLS S7 — Correctifs HAUTS (super-admin manquants)
-- À exécuter APRÈS les correctifs critiques
-- Idempotent : DROP IF EXISTS avant chaque CREATE
-- =============================================================================

-- Helper super-admin (rappel) :
-- EXISTS(SELECT 1 FROM utilisateurs
--   WHERE auth_id = auth.uid() AND actif = true
--   AND ecole_id IS NULL AND role = 'admin')

-- ── evaluations (aucune policy super-admin) ───────────────────────────────────
drop policy if exists evaluations_select_superadmin on public.evaluations;
drop policy if exists evaluations_insert_superadmin on public.evaluations;
drop policy if exists evaluations_update_superadmin on public.evaluations;
drop policy if exists evaluations_delete_superadmin on public.evaluations;
create policy evaluations_select_superadmin on public.evaluations for select
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy evaluations_insert_superadmin on public.evaluations for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy evaluations_update_superadmin on public.evaluations for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy evaluations_delete_superadmin on public.evaluations for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── notes_lmd (aucune policy super-admin SELECT) ──────────────────────────────
drop policy if exists notes_lmd_select_superadmin on public.notes_lmd;
drop policy if exists notes_lmd_insert_superadmin on public.notes_lmd;
drop policy if exists notes_lmd_update_superadmin on public.notes_lmd;
drop policy if exists notes_lmd_delete_superadmin on public.notes_lmd;
create policy notes_lmd_select_superadmin on public.notes_lmd for select
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy notes_lmd_insert_superadmin on public.notes_lmd for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy notes_lmd_update_superadmin on public.notes_lmd for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy notes_lmd_delete_superadmin on public.notes_lmd for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── inscriptions_semestre (INSERT/UPDATE/DELETE manquants) ────────────────────
drop policy if exists inscriptions_insert_superadmin on public.inscriptions_semestre;
drop policy if exists inscriptions_update_superadmin on public.inscriptions_semestre;
drop policy if exists inscriptions_delete_superadmin on public.inscriptions_semestre;
create policy inscriptions_insert_superadmin on public.inscriptions_semestre for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy inscriptions_update_superadmin on public.inscriptions_semestre for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy inscriptions_delete_superadmin on public.inscriptions_semestre for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── semestres (INSERT/UPDATE/DELETE manquants) ────────────────────────────────
drop policy if exists semestres_insert_superadmin on public.semestres;
drop policy if exists semestres_update_superadmin on public.semestres;
drop policy if exists semestres_delete_superadmin on public.semestres;
create policy semestres_insert_superadmin on public.semestres for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy semestres_update_superadmin on public.semestres for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy semestres_delete_superadmin on public.semestres for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── sessions_evaluation (INSERT/UPDATE/DELETE manquants) ──────────────────────
drop policy if exists sessions_eval_insert_superadmin on public.sessions_evaluation;
drop policy if exists sessions_eval_update_superadmin on public.sessions_evaluation;
drop policy if exists sessions_eval_delete_superadmin on public.sessions_evaluation;
create policy sessions_eval_insert_superadmin on public.sessions_evaluation for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy sessions_eval_update_superadmin on public.sessions_evaluation for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy sessions_eval_delete_superadmin on public.sessions_evaluation for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── unites_enseignement (INSERT/UPDATE/DELETE manquants) ──────────────────────
drop policy if exists ue_insert_superadmin on public.unites_enseignement;
drop policy if exists ue_update_superadmin on public.unites_enseignement;
drop policy if exists ue_delete_superadmin on public.unites_enseignement;
create policy ue_insert_superadmin on public.unites_enseignement for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy ue_update_superadmin on public.unites_enseignement for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy ue_delete_superadmin on public.unites_enseignement for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── matieres_lmd (INSERT/UPDATE/DELETE manquants) ─────────────────────────────
drop policy if exists matieres_lmd_insert_superadmin on public.matieres_lmd;
drop policy if exists matieres_lmd_update_superadmin on public.matieres_lmd;
drop policy if exists matieres_lmd_delete_superadmin on public.matieres_lmd;
create policy matieres_lmd_insert_superadmin on public.matieres_lmd for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy matieres_lmd_update_superadmin on public.matieres_lmd for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy matieres_lmd_delete_superadmin on public.matieres_lmd for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── promotions (aucune policy super-admin) ────────────────────────────────────
drop policy if exists promotions_select_superadmin on public.promotions;
drop policy if exists promotions_insert_superadmin on public.promotions;
drop policy if exists promotions_update_superadmin on public.promotions;
drop policy if exists promotions_delete_superadmin on public.promotions;
create policy promotions_select_superadmin on public.promotions for select
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy promotions_insert_superadmin on public.promotions for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy promotions_update_superadmin on public.promotions for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy promotions_delete_superadmin on public.promotions for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── programmes_lmd (INSERT/UPDATE/DELETE manquants) ───────────────────────────
drop policy if exists programmes_lmd_insert_superadmin on public.programmes_lmd;
drop policy if exists programmes_lmd_update_superadmin on public.programmes_lmd;
drop policy if exists programmes_lmd_delete_superadmin on public.programmes_lmd;
create policy programmes_lmd_insert_superadmin on public.programmes_lmd for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy programmes_lmd_update_superadmin on public.programmes_lmd for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy programmes_lmd_delete_superadmin on public.programmes_lmd for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── programme_ue (INSERT/UPDATE/DELETE manquants) ─────────────────────────────
drop policy if exists programme_ue_insert_superadmin on public.programme_ue;
drop policy if exists programme_ue_update_superadmin on public.programme_ue;
drop policy if exists programme_ue_delete_superadmin on public.programme_ue;
create policy programme_ue_insert_superadmin on public.programme_ue for insert
  with check (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy programme_ue_update_superadmin on public.programme_ue for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy programme_ue_delete_superadmin on public.programme_ue for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── seances (DELETE + UPDATE manquants) ──────────────────────────────────────
drop policy if exists seances_update_superadmin on public.seances;
drop policy if exists seances_delete_superadmin on public.seances;
create policy seances_update_superadmin on public.seances for update
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));
create policy seances_delete_superadmin on public.seances for delete
  using (exists(select 1 from utilisateurs where utilisateurs.auth_id = auth.uid() and utilisateurs.actif = true and utilisateurs.ecole_id is null and utilisateurs.role = 'admin'));

-- ── pwa_devices : policy basique (RLS activé sans policy = tout bloqué) ───────
drop policy if exists pwa_devices_own on public.pwa_devices;
create policy pwa_devices_own on public.pwa_devices
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Vérification post-exécution :
-- select tablename, count(*) nb_policies
-- from pg_policies where schemaname = 'public'
--   and tablename in ('evaluations','notes_lmd','promotions','seances','semestres',
--     'sessions_evaluation','unites_enseignement','matieres_lmd',
--     'programme_ue','programmes_lmd')
-- group by tablename order by tablename;
