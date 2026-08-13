-- ============================================================================
-- 2FA TOTP — Codes de secours et récupération
-- EduLink Sup — migration 20260814_2fa_totp_codes_secours.sql
--
-- Le TOTP lui-même est géré nativement par Supabase Auth (auth.mfa_factors).
-- Cette migration ajoute uniquement ce que Supabase n'offre pas :
--   1. codes_secours_mfa          : codes de secours à usage unique (hachés, jamais en clair)
--   2. tentatives_recuperation_mfa: limitation des essais de récupération (5 / 15 min)
--   3. fn_generer_codes_secours   : génère 10 codes (authenticated, exige un facteur TOTP vérifié)
--   4. fn_codes_secours_restants  : nombre de codes non utilisés (authenticated)
--   5. fn_consommer_code_secours  : vérifie et consomme un code (service_role UNIQUEMENT,
--                                    appelée par l'Edge Function auth-mfa-recovery)
--
-- Même philosophie que 20260813_rate_limiting_auth.sql : RLS activée sans policy,
-- EXECUTE révoqué à anon/authenticated sauf pour les fonctions explicitement publiques.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Table des codes de secours (hachés SHA-256 + sel par code, jamais en clair)
-- ----------------------------------------------------------------------------
create table if not exists public.codes_secours_mfa (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  code_hash      text not null,
  sel            text not null,
  cree_le        timestamptz not null default now(),
  utilise_le     timestamptz
);

create index if not exists idx_codes_secours_mfa_utilisateur
  on public.codes_secours_mfa (utilisateur_id);

alter table public.codes_secours_mfa enable row level security;
revoke all on table public.codes_secours_mfa from anon, authenticated;
grant all on table public.codes_secours_mfa to service_role;

-- ----------------------------------------------------------------------------
-- 2. Table de limitation des essais de récupération
-- ----------------------------------------------------------------------------
create table if not exists public.tentatives_recuperation_mfa (
  utilisateur_id uuid primary key,
  echecs         integer not null default 0,
  premier_echec  timestamptz not null default now()
);

alter table public.tentatives_recuperation_mfa enable row level security;
revoke all on table public.tentatives_recuperation_mfa from anon, authenticated;
grant all on table public.tentatives_recuperation_mfa to service_role;

-- ----------------------------------------------------------------------------
-- 3. Génération des codes (appelée depuis le profil, après enrôlement vérifié)
--    Régénère intégralement le jeu : les anciens codes sont invalidés.
-- ----------------------------------------------------------------------------
create or replace function public.fn_generer_codes_secours()
returns text[]
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_alphabet constant text := 'ACDEFGHJKMNPQRSTUVWXYZ23456789'; -- sans caractères ambigus (B/8, I/1, L/1, O/0)
  v_codes    text[] := '{}';
  v_code     text;
  v_sel      text;
  i          integer;
  j          integer;
begin
  if v_uid is null then
    raise exception 'non_authentifie';
  end if;

  -- Exiger un facteur TOTP vérifié : pas de codes de secours sans TOTP actif
  if not exists (
    select 1 from auth.mfa_factors
    where user_id = v_uid and factor_type = 'totp' and status = 'verified'
  ) then
    raise exception 'aucun_facteur_totp_verifie';
  end if;

  delete from public.codes_secours_mfa where utilisateur_id = v_uid;

  for i in 1..10 loop
    v_code := '';
    for j in 1..8 loop
      v_code := v_code || substr(
        v_alphabet,
        1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(v_alphabet)),
        1
      );
    end loop;
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
    v_sel  := encode(extensions.gen_random_bytes(16), 'hex');

    insert into public.codes_secours_mfa (utilisateur_id, code_hash, sel)
    values (v_uid, encode(extensions.digest(v_code || v_sel, 'sha256'), 'hex'), v_sel);

    v_codes := array_append(v_codes, v_code);
  end loop;

  return v_codes;
end;
$$;

revoke all on function public.fn_generer_codes_secours() from public, anon;
grant execute on function public.fn_generer_codes_secours() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Nombre de codes restants (affichage dans la section Sécurité du profil)
-- ----------------------------------------------------------------------------
create or replace function public.fn_codes_secours_restants()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.codes_secours_mfa
  where utilisateur_id = auth.uid()
    and utilise_le is null
$$;

revoke all on function public.fn_codes_secours_restants() from public, anon;
grant execute on function public.fn_codes_secours_restants() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Consommation d'un code (service_role UNIQUEMENT — via auth-mfa-recovery)
--    Limitation : 5 essais infructueux / 15 minutes / utilisateur.
--    Retourne : {ok:true}
--             | {ok:false, motif:'bloque', reessayer_dans_s:N}
--             | {ok:false, motif:'code_invalide', essais_restants:N}
-- ----------------------------------------------------------------------------
create or replace function public.fn_consommer_code_secours(
  p_utilisateur_id uuid,
  p_code           text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_max_echecs constant integer  := 5;
  v_fenetre    constant interval := interval '15 minutes';
  v_tent       record;
  v_norm       text;
  v_code_id    uuid;
  v_echecs     integer;
begin
  -- 1. Fenêtre de blocage
  select * into v_tent
  from public.tentatives_recuperation_mfa
  where utilisateur_id = p_utilisateur_id;

  if found and now() - v_tent.premier_echec >= v_fenetre then
    -- fenêtre expirée : on repart de zéro
    delete from public.tentatives_recuperation_mfa where utilisateur_id = p_utilisateur_id;
    v_tent := null;
  elsif found and v_tent.echecs >= v_max_echecs then
    return jsonb_build_object(
      'ok', false,
      'motif', 'bloque',
      'reessayer_dans_s', ceil(extract(epoch from (v_fenetre - (now() - v_tent.premier_echec))))::integer
    );
  end if;

  -- 2. Normalisation : casse, espaces et tiret indifférents
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  -- 3. Recherche du code parmi les codes non utilisés de l'utilisateur
  if length(v_norm) = 8 then
    v_norm := substr(v_norm, 1, 4) || '-' || substr(v_norm, 5, 4);

    select c.id into v_code_id
    from public.codes_secours_mfa c
    where c.utilisateur_id = p_utilisateur_id
      and c.utilise_le is null
      and c.code_hash = encode(extensions.digest(v_norm || c.sel, 'sha256'), 'hex')
    limit 1;
  end if;

  -- 4. Échec : incrémenter le compteur
  if v_code_id is null then
    insert into public.tentatives_recuperation_mfa (utilisateur_id, echecs, premier_echec)
    values (p_utilisateur_id, 1, now())
    on conflict (utilisateur_id)
    do update set echecs = tentatives_recuperation_mfa.echecs + 1
    returning echecs into v_echecs;

    return jsonb_build_object(
      'ok', false,
      'motif', 'code_invalide',
      'essais_restants', greatest(v_max_echecs - v_echecs, 0)
    );
  end if;

  -- 5. Succès : consommer le code, purger le compteur
  update public.codes_secours_mfa set utilise_le = now() where id = v_code_id;
  delete from public.tentatives_recuperation_mfa where utilisateur_id = p_utilisateur_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_consommer_code_secours(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_consommer_code_secours(uuid, text) to service_role;
-- ----------------------------------------------------------------------------
-- 6. Purge de ses propres codes de secours (désactivation self-service du TOTP)
-- ----------------------------------------------------------------------------
create or replace function public.fn_purger_mes_codes_secours()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.codes_secours_mfa where utilisateur_id = auth.uid();
$$;

revoke all on function public.fn_purger_mes_codes_secours() from public, anon;
grant execute on function public.fn_purger_mes_codes_secours() to authenticated, service_role;