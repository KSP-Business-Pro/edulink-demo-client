-- ============================================================================
-- Sprint B9 (reprise) — Rate limiting sur les endpoints d'authentification
-- Action Critique de la roadmap consolidée v10 :
--   « Implémenter un rate limiting sur les endpoints d'authentification
--     (5 tentatives puis blocage 15 min) »
--
-- Principe : le comptage et le blocage vivent en base, et ne sont accessibles
-- QU'À la clé service role, utilisée exclusivement par l'Edge Function
-- `auth-login`. Le navigateur n'appelle plus signInWithPassword directement :
-- il passe par l'Edge Function, ce qui rend le blocage non contournable.
--
-- DEUX COMPTEURS INDÉPENDANTS, qui ne mesurent pas la même chose :
--
--   • par COMPTE — seuil 5 échecs
--     C'est le blocage demandé par l'audit. Il ne bloque QUE l'email concerné :
--     les collègues du même établissement gardent chacun leur propre compteur.
--
--   • par IP — seuil 20 COMPTES DISTINCTS visés (et non 20 échecs bruts)
--     Cette couche vise le balayage multi-comptes : un attaquant qui essaie
--     2-3 mots de passe courants sur des dizaines de comptes ne déclenche
--     jamais le compteur par compte, et passerait donc entre les mailles.
--     Compter les comptes DISTINCTS plutôt que les échecs est essentiel en
--     exploitation : un agent qui s'acharne sur son propre compte, même
--     trente fois, ne vise qu'un seul compte distinct et ne bloquera donc
--     jamais son établissement — alors qu'un balayage sur 20 comptes
--     différents bascule immédiatement en blocage. Un établissement entier
--     partageant une seule IP publique (NAT) ne peut ainsi plus se bloquer
--     lui-même par simple maladresse.
--
--     Les comptes visés sont stockés sous forme d'empreintes MD5 et non en
--     clair : la distinction suffit au comptage, et on évite de constituer
--     une liste d'adresses ciblées (cohérence avec la politique de
--     confidentialité APDP formalisée au Sprint B15).
--
-- Fenêtre glissante de 15 min : un compteur dont la dernière tentative
-- remonte à plus de 15 min repart de zéro.
-- ============================================================================

-- ── Table de comptage ───────────────────────────────────────────────────────
create table if not exists public.tentatives_connexion (
  cle                 text        primary key,            -- 'email:x@y.z' ou 'ip:1.2.3.4'
  type_cle            text        not null check (type_cle in ('email', 'ip')),
  tentatives          integer     not null default 0,     -- échecs bruts dans la fenêtre
  comptes_vises       text[]      not null default '{}',  -- lignes 'ip' : empreintes des comptes distincts visés
  bloque_jusqu_a      timestamptz,                        -- null = pas de blocage actif
  nb_blocages         integer     not null default 0,     -- historique cumulé (traçabilité)
  derniere_tentative  timestamptz not null default now(),
  cree_le             timestamptz not null default now()
);

comment on table public.tentatives_connexion is
  'Rate limiting des tentatives de connexion (Sprint B9). Alimentée uniquement par l''Edge Function auth-login via la clé service role.';
comment on column public.tentatives_connexion.cle is
  'Clé de comptage préfixée par son type : email:<adresse en minuscules> ou ip:<adresse IP>.';
comment on column public.tentatives_connexion.tentatives is
  'Échecs bruts dans la fenêtre glissante. Décide du blocage pour les lignes email ; purement informatif pour les lignes ip.';
comment on column public.tentatives_connexion.comptes_vises is
  'Lignes ip uniquement : empreintes MD5 des comptes distincts visés dans la fenêtre. C''est leur NOMBRE qui décide du blocage IP, afin qu''un utilisateur s''acharnant sur son propre compte ne bloque pas tout son établissement.';
comment on column public.tentatives_connexion.nb_blocages is
  'Nombre total de blocages déclenchés pour cette clé depuis sa création — indicateur d''attaque persistante.';

create index if not exists idx_tentatives_connexion_bloque
  on public.tentatives_connexion (bloque_jusqu_a)
  where bloque_jusqu_a is not null;

create index if not exists idx_tentatives_connexion_derniere
  on public.tentatives_connexion (derniere_tentative);

-- RLS activée SANS aucune policy : personne n'y accède via l'API PostgREST.
-- Seule la clé service role (qui contourne RLS) peut lire/écrire, et elle
-- n'est utilisée que par l'Edge Function auth-login.
alter table public.tentatives_connexion enable row level security;

-- ── Paramètres (regroupés ici pour ajuster la politique en un seul endroit) ─
create or replace function public.fn_params_rate_limit()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'seuil_email',     5,     -- échecs sur un même compte avant blocage
    'seuil_ip',        20,    -- comptes DISTINCTS visés depuis une IP avant blocage
    'plafond_comptes', 100,   -- garde-fou : taille max du tableau d'empreintes
    'duree_blocage',   '15 minutes',
    'fenetre',         '15 minutes'
  );
$$;

comment on function public.fn_params_rate_limit() is
  'Seuils du rate limiting de connexion — modifier ici pour ajuster la politique globale.';

-- ── Incrément du compteur d'un COMPTE (échecs bruts) ────────────────────────
create or replace function public.fn_incrementer_tentative_compte(
  p_email  text,
  p_seuil  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_fenetre interval    := (public.fn_params_rate_limit() ->> 'fenetre')::interval;
  v_duree   interval    := (public.fn_params_rate_limit() ->> 'duree_blocage')::interval;
  v_cle     text        := 'email:' || lower(trim(p_email));
  v_tent    integer;
begin
  insert into public.tentatives_connexion (cle, type_cle, tentatives, derniere_tentative)
  values (v_cle, 'email', 1, v_now)
  on conflict (cle) do update
    set tentatives = case
          -- hors fenêtre glissante : le compteur repart de zéro
          when tentatives_connexion.derniere_tentative < v_now - v_fenetre then 1
          else tentatives_connexion.tentatives + 1
        end,
        derniere_tentative = v_now
  returning tentatives into v_tent;

  if v_tent >= p_seuil then
    update public.tentatives_connexion
       set bloque_jusqu_a = v_now + v_duree,
           nb_blocages    = nb_blocages + 1,
           tentatives     = 0            -- le compteur repart après le blocage
     where cle = v_cle;

    return jsonb_build_object(
      'bloque',             true,
      'secondes_restantes', ceil(extract(epoch from v_duree))::integer
    );
  end if;

  return jsonb_build_object(
    'bloque',               false,
    'tentatives_restantes', p_seuil - v_tent
  );
end;
$$;

-- ── Incrément du compteur d'une IP (comptes DISTINCTS visés) ────────────────
create or replace function public.fn_incrementer_tentative_ip(
  p_ip     text,
  p_email  text,
  p_seuil  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_params    jsonb       := public.fn_params_rate_limit();
  v_now       timestamptz := now();
  v_fenetre   interval    := (v_params ->> 'fenetre')::interval;
  v_duree     interval    := (v_params ->> 'duree_blocage')::interval;
  v_plafond   integer     := (v_params ->> 'plafond_comptes')::integer;
  v_cle       text        := 'ip:' || trim(p_ip);
  -- empreinte plutôt que l'adresse en clair : seule la distinction compte
  v_empreinte text        := md5(lower(trim(coalesce(p_email, ''))));
  v_comptes   text[];
  v_nb        integer;
begin
  insert into public.tentatives_connexion (cle, type_cle, tentatives, comptes_vises, derniere_tentative)
  values (v_cle, 'ip', 1, array[v_empreinte], v_now)
  on conflict (cle) do update
    set comptes_vises = case
          -- hors fenêtre : on repart avec le seul compte courant
          when tentatives_connexion.derniere_tentative < v_now - v_fenetre
            then array[v_empreinte]
          -- compte déjà vu dans la fenêtre : le tableau ne bouge pas
          when v_empreinte = any(tentatives_connexion.comptes_vises)
            then tentatives_connexion.comptes_vises
          -- garde-fou de taille (le seuil est de toute façon déjà franchi)
          when coalesce(array_length(tentatives_connexion.comptes_vises, 1), 0) >= v_plafond
            then tentatives_connexion.comptes_vises
          else tentatives_connexion.comptes_vises || v_empreinte
        end,
        tentatives = case
          when tentatives_connexion.derniere_tentative < v_now - v_fenetre then 1
          else tentatives_connexion.tentatives + 1
        end,
        derniere_tentative = v_now
  returning comptes_vises into v_comptes;

  v_nb := coalesce(array_length(v_comptes, 1), 0);

  if v_nb >= p_seuil then
    update public.tentatives_connexion
       set bloque_jusqu_a = v_now + v_duree,
           nb_blocages    = nb_blocages + 1,
           tentatives     = 0,
           comptes_vises  = '{}'
     where cle = v_cle;

    return jsonb_build_object(
      'bloque',             true,
      'secondes_restantes', ceil(extract(epoch from v_duree))::integer
    );
  end if;

  return jsonb_build_object(
    'bloque',            false,
    'comptes_distincts', v_nb
  );
end;
$$;

-- ── 1. Vérification AVANT toute tentative d'authentification ────────────────
create or replace function public.fn_verifier_blocage_connexion(
  p_email text,
  p_ip    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_email_b timestamptz;
  v_ip_b    timestamptz;
  v_fin     timestamptz;
  v_motif   text;
begin
  if p_email is not null and length(trim(p_email)) > 0 then
    select bloque_jusqu_a into v_email_b
      from public.tentatives_connexion
     where cle = 'email:' || lower(trim(p_email));
  end if;

  if p_ip is not null and length(trim(p_ip)) > 0 then
    select bloque_jusqu_a into v_ip_b
      from public.tentatives_connexion
     where cle = 'ip:' || trim(p_ip);
  end if;

  if v_email_b is not null and v_email_b > v_now then
    v_fin   := v_email_b;
    v_motif := 'compte';
  end if;

  if v_ip_b is not null and v_ip_b > v_now and (v_fin is null or v_ip_b > v_fin) then
    v_fin   := v_ip_b;
    v_motif := 'reseau';
  end if;

  if v_fin is null then
    return jsonb_build_object('bloque', false);
  end if;

  return jsonb_build_object(
    'bloque',             true,
    'motif',              v_motif,
    'secondes_restantes', ceil(extract(epoch from (v_fin - v_now)))::integer
  );
end;
$$;

comment on function public.fn_verifier_blocage_connexion(text, text) is
  'Retourne {bloque, motif, secondes_restantes} — appelée par auth-login AVANT signInWithPassword.';

-- ── 2. Enregistrement d'un échec d'authentification ─────────────────────────
create or replace function public.fn_enregistrer_echec_connexion(
  p_email text,
  p_ip    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_params jsonb := public.fn_params_rate_limit();
  v_email  jsonb := jsonb_build_object('bloque', false);
  v_ip     jsonb := jsonb_build_object('bloque', false);
begin
  if p_email is not null and length(trim(p_email)) > 0 then
    v_email := public.fn_incrementer_tentative_compte(
      p_email, (v_params ->> 'seuil_email')::integer
    );
  end if;

  if p_ip is not null and length(trim(p_ip)) > 0 then
    v_ip := public.fn_incrementer_tentative_ip(
      p_ip, p_email, (v_params ->> 'seuil_ip')::integer
    );
  end if;

  -- Le blocage du compte prime sur le blocage réseau dans le message rendu
  if (v_email ->> 'bloque')::boolean then
    return jsonb_build_object(
      'bloque',             true,
      'motif',              'compte',
      'secondes_restantes', (v_email ->> 'secondes_restantes')::integer
    );
  end if;

  if (v_ip ->> 'bloque')::boolean then
    return jsonb_build_object(
      'bloque',             true,
      'motif',              'reseau',
      'secondes_restantes', (v_ip ->> 'secondes_restantes')::integer
    );
  end if;

  return jsonb_build_object(
    'bloque',               false,
    'tentatives_restantes', coalesce((v_email ->> 'tentatives_restantes')::integer, 0)
  );
end;
$$;

comment on function public.fn_enregistrer_echec_connexion(text, text) is
  'Incrémente les compteurs compte (échecs) + IP (comptes distincts) après un échec. Retourne {bloque, motif, secondes_restantes|tentatives_restantes}.';

-- ── 3. Réinitialisation après une connexion réussie ─────────────────────────
create or replace function public.fn_reinitialiser_tentatives(
  p_email text,
  p_ip    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Le compteur du compte est effacé : l'utilisateur a prouvé son identité.
  if p_email is not null and length(trim(p_email)) > 0 then
    delete from public.tentatives_connexion
     where cle = 'email:' || lower(trim(p_email));
  end if;

  -- Le compteur IP est volontairement LAISSÉ EN L'ÉTAT : sinon un attaquant
  -- disposant d'un compte valide pourrait « blanchir » son IP entre deux
  -- salves de balayage. Il décroît de lui-même via la fenêtre glissante.
end;
$$;

comment on function public.fn_reinitialiser_tentatives(text, text) is
  'Efface le compteur du compte après une connexion réussie. Le compteur IP est conservé (anti-blanchiment).';

-- ── 4. Purge des lignes obsolètes (hygiène — à planifier via pg_cron) ───────
create or replace function public.fn_purger_tentatives_connexion()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supprimees integer;
begin
  delete from public.tentatives_connexion
   where derniere_tentative < now() - interval '7 days'
     and (bloque_jusqu_a is null or bloque_jusqu_a < now());
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end;
$$;

comment on function public.fn_purger_tentatives_connexion() is
  'Supprime les compteurs inactifs depuis plus de 7 jours. À planifier quotidiennement.';

-- ── Permissions : ces fonctions ne sont PAS exposées au navigateur ──────────
-- Seule la clé service role (Edge Function auth-login) peut les exécuter.
revoke execute on function public.fn_params_rate_limit()                              from public, anon, authenticated;
revoke execute on function public.fn_incrementer_tentative_compte(text, integer)      from public, anon, authenticated;
revoke execute on function public.fn_incrementer_tentative_ip(text, text, integer)    from public, anon, authenticated;
revoke execute on function public.fn_verifier_blocage_connexion(text, text)           from public, anon, authenticated;
revoke execute on function public.fn_enregistrer_echec_connexion(text, text)          from public, anon, authenticated;
revoke execute on function public.fn_reinitialiser_tentatives(text, text)             from public, anon, authenticated;
revoke execute on function public.fn_purger_tentatives_connexion()                    from public, anon, authenticated;

grant execute on function public.fn_params_rate_limit()                               to service_role;
grant execute on function public.fn_incrementer_tentative_compte(text, integer)       to service_role;
grant execute on function public.fn_incrementer_tentative_ip(text, text, integer)     to service_role;
grant execute on function public.fn_verifier_blocage_connexion(text, text)            to service_role;
grant execute on function public.fn_enregistrer_echec_connexion(text, text)           to service_role;
grant execute on function public.fn_reinitialiser_tentatives(text, text)              to service_role;
grant execute on function public.fn_purger_tentatives_connexion()                     to service_role;
