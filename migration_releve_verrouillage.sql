-- =============================================================================
-- EduLink Sup — S5 — Verrouillage strict du snapshot des relevés
-- À exécuter dans Supabase → SQL Editor (projet kcfpvnrgutkhakogbjip)
-- Idempotent : ré-exécutable sans risque.
-- =============================================================================

-- 1. Colonnes de verrouillage -------------------------------------------------
alter table public.releves_notes
  add column if not exists verrouille      boolean     not null default false,
  add column if not exists verrouille_le   timestamptz,
  add column if not exists verrouille_par  uuid;

comment on column public.releves_notes.verrouille is
  'Relevé figé : snapshot_notes et résultats deviennent immuables (voir trigger trg_releve_immutable).';

-- 2. Trigger d''immuabilité ---------------------------------------------------
--    Tant que verrouille = true, toute tentative de modifier le snapshot ou les
--    résultats consolidés lève une exception — y compris via service_role ou un
--    accès SQL direct (les triggers ne sont PAS contournés par le service_role).
--    Seule exception : la transition de déverrouillage (true -> false), qui doit
--    rester possible pour rouvrir le relevé.
create or replace function public.fn_releve_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.verrouille = true then
    -- Déverrouillage explicite : autorisé (et c''est la seule modif permise ici)
    if new.verrouille = false then
      return new;
    end if;

    -- Relevé encore verrouillé : aucun champ figé ne peut bouger
    if new.snapshot_notes    is distinct from old.snapshot_notes
       or new.moyenne_semestre is distinct from old.moyenne_semestre
       or new.credits_valides  is distinct from old.credits_valides
       or new.credits_tentes   is distinct from old.credits_tentes
       or new.mention          is distinct from old.mention
       or new.decision         is distinct from old.decision
       or new.publie_le        is distinct from old.publie_le
    then
      raise exception
        'Relevé verrouillé : modification interdite (etudiant %, semestre %). Déverrouillez d''abord.',
        old.etudiant_id, old.semestre_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_releve_immutable on public.releves_notes;
create trigger trg_releve_immutable
  before update on public.releves_notes
  for each row
  execute function public.fn_releve_immutable();

-- 3. (Optionnel mais recommandé) Lecture seule côté étudiant ------------------
--    À adapter selon tes policies existantes. L'idée : l'étudiant ne doit jamais
--    pouvoir écrire dans releves_notes ; seul le service_role (Edge Function) écrit.
--    Décommente et ajuste si la RLS de releves_notes n'est pas déjà ainsi.
--
-- alter table public.releves_notes enable row level security;
--
-- drop policy if exists "etudiant_lit_son_releve" on public.releves_notes;
-- create policy "etudiant_lit_son_releve" on public.releves_notes
--   for select using (
--     etudiant_id in (select id from public.etudiants where user_id = auth.uid())
--   );
--
-- (Aucune policy insert/update/delete pour le rôle authenticated → écriture
--  réservée au service_role utilisé par l'Edge Function.)

-- 4. Vérification rapide ------------------------------------------------------
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'releves_notes'
--    and column_name in ('verrouille','verrouille_le','verrouille_par');
