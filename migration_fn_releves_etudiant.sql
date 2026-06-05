-- =============================================================================
-- EduLink Sup — Portail étudiant S5
-- RPC fn_releves_etudiant : retourne les relevés publiés d'un étudiant
-- SECURITY DEFINER → bypass RLS (appelé par le portail avec l'etudiant_id
-- déjà résolu côté client via la session OTP authentifiée)
-- =============================================================================

create or replace function public.fn_releves_etudiant(p_etudiant_id uuid)
returns table (
  id                uuid,
  semestre_id       uuid,
  snapshot_notes    jsonb,
  moyenne_semestre  numeric,
  credits_valides   integer,
  credits_tentes    integer,
  mention           text,
  decision          text,
  publie_le         timestamptz,
  numero_releve     text,
  verrouille        boolean,
  semestre_libelle  text,
  semestre_niveau   text
)
language sql
security definer
stable
as $$
  select
    r.id,
    r.semestre_id,
    r.snapshot_notes,
    r.moyenne_semestre,
    r.credits_valides,
    r.credits_tentes,
    r.mention::text,
    r.decision,
    r.publie_le,
    r.numero_releve,
    r.verrouille,
    s.libelle  as semestre_libelle,
    s.niveau   as semestre_niveau
  from public.releves_notes r
  left join public.semestres s on s.id = r.semestre_id
  where r.etudiant_id = p_etudiant_id
  order by r.publie_le desc;
$$;

-- Permettre à tout utilisateur authentifié d'appeler la fonction
-- (la sécurité repose sur le fait que currentEtudiant.id est résolu
--  après authentification OTP dans le portail)
grant execute on function public.fn_releves_etudiant(uuid) to authenticated, anon;

-- Vérification rapide
-- select * from fn_releves_etudiant('4b57793e-9dff-4dfe-8b9b-dacf0f28593c');
