-- =============================================================================
-- EduLink Sup — Portail étudiant S5
-- RLS : permettre aux étudiants authentifiés de lire leurs propres relevés
-- À exécuter dans Supabase → SQL Editor (projet kcfpvnrgutkhakogbjip)
-- =============================================================================

-- Active RLS sur releves_notes si pas déjà fait
alter table public.releves_notes enable row level security;

-- Policy SELECT : l'étudiant lit uniquement ses propres relevés publiés
-- Suppose que etudiants.user_id = auth.uid() pour l'étudiant connecté
drop policy if exists "etudiant_lit_ses_releves" on public.releves_notes;
create policy "etudiant_lit_ses_releves" on public.releves_notes
  for select
  using (
    etudiant_id in (
      select id from public.etudiants where user_id = auth.uid()
    )
  );

-- Note : le service_role (Edge Function publish-releve) bypasse RLS → non affecté.
-- Note : les admins/staff lisent via leur propre policy ou service_role.

-- Vérification
-- select policyname, cmd, qual from pg_policies where tablename = 'releves_notes';
