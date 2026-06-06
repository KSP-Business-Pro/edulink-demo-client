-- =============================================================================
-- fn_resultats_semestre — mise à jour avec compensation inter-UE
-- Changement de signature (ajout est_compense) → DROP obligatoire avant.
--
-- Logique compensation LMD-CAMES :
--   Si compensation_active = true (regles_ecole) ET
--      moyenne_semestrielle >= seuil_validation_semestre ET
--      moyenne_ue >= note_plancher (si note_plancher_active) ET
--      étudiant non exclu de l'UE
--   → UE compensée : ue_validee = true, credits_acquis = credits_cect
-- =============================================================================

drop function if exists public.fn_resultats_semestre(uuid, uuid);

create or replace function public.fn_resultats_semestre(
  p_etudiant_id uuid,
  p_semestre_id uuid
)
returns table (
  ue_id         uuid,
  ue_code       text,
  ue_intitule   text,
  ue_credits    integer,
  type_ue       type_ue,
  obligatoire   boolean,
  poids_cc      numeric,
  poids_examen  numeric,
  moyenne_ue    numeric,
  ue_validee    boolean,
  est_exclu     boolean,
  credits_acquis integer,
  mention_ue    mention_cames,
  est_compense  boolean         -- NOUVEAU : true si UE validée par compensation
)
language sql stable security definer
set search_path to 'public'
as $function$
with
-- ── 1. Règles de l'école (via semestres → ecole_id) ─────────────────────────
regles as (
  select
    coalesce(re.compensation_active,       false) as compensation_active,
    coalesce(re.seuil_validation_ue,       10)    as seuil_ue,
    coalesce(re.seuil_validation_semestre, 10)    as seuil_sem,
    coalesce(re.note_plancher_active,      false) as plancher_actif,
    coalesce(re.seuil_note_plancher,       5)     as plancher
  from      semestres    s
  left join regles_ecole re on re.ecole_id = s.ecole_id
  where s.id = p_semestre_id
  limit 1
),

-- ── 2. UEs du semestre avec exclusion + moyenne brute ────────────────────────
ue_base as (
  select
    ue.id                                                                  as ue_id,
    ue.code                                                                as ue_code,
    ue.intitule                                                            as ue_intitule,
    ue.credits_cect                                                        as ue_credits,
    ue.type_ue,
    pu.obligatoire,
    ue.poids_cc,
    ue.poids_examen,
    -- Exclusion ?
    exists(
      select 1 from exclusions_ue ex
      where ex.etudiant_id = p_etudiant_id
        and ex.ue_id       = ue.id
        and ex.semestre_id = p_semestre_id
    )                                                                      as est_exclu,
    -- Moyenne : NULL si exclu (ne compte pas dans la moy. semestrielle)
    case
      when exists(
        select 1 from exclusions_ue ex
        where ex.etudiant_id = p_etudiant_id
          and ex.ue_id       = ue.id
          and ex.semestre_id = p_semestre_id
      ) then null
      else fn_moyenne_ue(p_etudiant_id, ue.id, p_semestre_id)
    end                                                                    as moyenne_ue
  from programme_ue pu
  join unites_enseignement ue on pu.ue_id = ue.id
  where pu.semestre_id = p_semestre_id
),

-- ── 3. Moyenne semestrielle (hors exclus) — sert au calcul de compensation ──
semestre_avg as (
  select round(avg(ub.moyenne_ue), 2) as moy_sem
  from ue_base ub
  where ub.moyenne_ue is not null
),

-- ── 4. Qualification compensation par UE ─────────────────────────────────────
ue_final as (
  select
    ub.ue_id, ub.ue_code, ub.ue_intitule, ub.ue_credits,
    ub.type_ue, ub.obligatoire, ub.poids_cc, ub.poids_examen,
    ub.est_exclu, ub.moyenne_ue,
    -- Validée normalement (sans compensation)
    (
      not ub.est_exclu
      and ub.moyenne_ue is not null
      and ub.moyenne_ue >= r.seuil_ue
    ) as validee_normale,
    -- Compensable : non exclue, note présente, sous le seuil UE,
    -- mais moy_sem >= seuil semestre, et note >= plancher si règle active
    (
      not ub.est_exclu
      and ub.moyenne_ue is not null
      and ub.moyenne_ue < r.seuil_ue
      and r.compensation_active
      and sa.moy_sem >= r.seuil_sem
      and (not r.plancher_actif or ub.moyenne_ue >= r.plancher)
    ) as est_compense
  from ue_base ub
  cross join regles r
  cross join semestre_avg sa
)

-- ── 5. Projection finale ──────────────────────────────────────────────────────
select
  ue_id,
  ue_code,
  ue_intitule,
  ue_credits,
  type_ue,
  obligatoire,
  poids_cc,
  poids_examen,
  moyenne_ue,
  -- ue_validee : true si validée normalement OU par compensation
  (validee_normale or est_compense)                                       as ue_validee,
  est_exclu,
  -- credits_acquis : 0 si ni validée ni compensée
  case when (validee_normale or est_compense) then ue_credits else 0 end  as credits_acquis,
  -- mention_ue : NULL si exclu (cohérence avec moyenne_ue)
  case when est_exclu then null else fn_mention(moyenne_ue) end           as mention_ue,
  est_compense
from ue_final
order by obligatoire desc, ue_code;
$function$;

grant execute on function public.fn_resultats_semestre(uuid, uuid)
  to authenticated, anon;

-- =============================================================================
-- Tests à exécuter après déploiement :
--
-- Cas 1 : étudiant avec compensation (moy sem >= 10, une UE < 10 >= plancher)
-- select ue_code, moyenne_ue, ue_validee, est_compense, credits_acquis
-- from fn_resultats_semestre(
--   '<etudiant_id>',
--   '<semestre_id>'
-- );
-- → L'UE sous 10 doit afficher est_compense = true, ue_validee = true
--
-- Cas 2 : étudiant exclu d'une UE
-- → L'UE exclue doit afficher est_exclu = true, ue_validee = false,
--   moyenne_ue = null, mention_ue = null
--
-- Cas 3 : moy sem < 10 — pas de compensation possible
-- → Toutes les UEs sous le seuil restent ue_validee = false, est_compense = false
-- =============================================================================
