-- =============================================================================
-- Fix : fn_recalcul_semestre plantait silencieusement pour TOUS les etudiants
-- Cause : SELECT fn_resultats_semestre(...) INTO v_result JSONB, alors que
-- fn_resultats_semestre retourne une TABLE (ensemble de lignes), pas un
-- scalaire JSONB compatible. L'exception etait avalee par WHEN OTHERS,
-- donnant systematiquement {"ok":0,"erreurs":N} sans jamais recalculer quoi
-- que ce soit, ni remonter d'erreur claire a l'utilisateur (juste un toast
-- "info" peu visible).
--
-- Decouvert en testant le bouton "Recalculer" du module Deliberations avec
-- des donnees de test isolees (ecole is_demo=true).
--
-- Fix applique en 2 temps :
-- 1. Remplace SELECT...INTO par PERFORM (fn_resultats_semestre est appelee
--    juste pour valider qu'elle ne leve pas d'exception, son resultat n'est
--    de toute facon jamais exploite par cette fonction).
-- 2. Ajoute un appel a fn_recalcul_semestre_complet(p_semestre_id) pour que
--    l'appel depuis le frontend (deliberations.service.ts / recalculerResultats)
--    persiste reellement credits_valides/semestre_valide dans resultats_cache,
--    ce qui n'etait fait par aucune des deux fonctions auparavant.
--
-- LIMITE CONNUE (a traiter separement) : fn_recalcul_semestre_complet ne
-- calcule que credits_valides et semestre_valide. Les colonnes
-- moyenne_semestre, mention et decision de resultats_cache restent NULL
-- apres un recalcul via ce bouton. A corriger dans un prochain chantier.
--
-- Applique en production le 2026-07-07 via SQL Editor Supabase.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_recalcul_semestre(p_semestre_id uuid, p_ecole_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_etudiant RECORD;
  v_ok       INTEGER := 0;
  v_err      INTEGER := 0;
BEGIN
  FOR v_etudiant IN
    SELECT e.id
    FROM etudiants e
    JOIN inscriptions_semestre ins ON ins.etudiant_id = e.id
    WHERE ins.semestre_id  = p_semestre_id
      AND ins.ecole_id     = p_ecole_id
      AND ins.statut       = 'active'
  LOOP
    BEGIN
      PERFORM fn_resultats_semestre(v_etudiant.id, p_semestre_id);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
    END;
  END LOOP;

  PERFORM fn_recalcul_semestre_complet(p_semestre_id);

  RETURN jsonb_build_object('ok', v_ok, 'erreurs', v_err);
END;
$function$;

-- =============================================================================
-- Complement : fn_recalcul_semestre_complet ne calculait que credits_valides
-- et semestre_valide dans resultats_cache, jamais moyenne_semestre/mention/
-- decision - alors que la page Deliberations affiche ces 3 colonnes et que
-- deliberations.service.ts (ajusterDecisionJury) les utilise activement.
-- Resultat avant fix : apres un clic sur "Recalculer resultats", la colonne
-- "Decision auto" affichait systematiquement "Non calcule" pour tous les
-- etudiants de toutes les ecoles, meme quand le calcul etait bien possible.
--
-- Le fix reutilise fn_resultats_semestre (deja fiable, cf. fix precedent)
-- pour calculer la moyenne semestre ponderee par credits, fn_mention() pour
-- la mention, et fn_semestre_valide() (deja existante) pour la decision
-- admis/ajourne.
--
-- Valide sur les donnees de test (ecole is_demo=true) avant application :
-- moyenne 14.60, mention "bien", decision "admis" - coherent avec les notes
-- de test saisies (CC=14, Examen=15, ponderation 40/60).
--
-- Applique en production le 2026-07-07 via SQL Editor Supabase.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_recalcul_semestre_complet(p_semestre_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count  int := 0;
  v_ins    inscriptions_semestre%ROWTYPE;
  v_moy    numeric;
  v_valide boolean;
BEGIN
  FOR v_ins IN
    SELECT * FROM inscriptions_semestre
    WHERE semestre_id = p_semestre_id
      AND statut = 'active'
  LOOP
    SELECT
      CASE WHEN sum(r.ue_credits) > 0
        THEN round(sum(r.moyenne_ue * r.ue_credits)::numeric / sum(r.ue_credits), 2)
        ELSE NULL
      END
    INTO v_moy
    FROM fn_resultats_semestre(v_ins.etudiant_id, p_semestre_id) r
    WHERE r.moyenne_ue IS NOT NULL;

    v_valide := fn_semestre_valide(v_ins.etudiant_id, p_semestre_id);

    INSERT INTO resultats_cache (
      ecole_id, etudiant_id, semestre_id,
      credits_valides, semestre_valide, moyenne_semestre, mention, decision,
      derniere_maj
    )
    VALUES (
      v_ins.ecole_id,
      v_ins.etudiant_id,
      p_semestre_id,
      fn_credits_semestre(v_ins.etudiant_id, p_semestre_id),
      v_valide,
      v_moy,
      CASE WHEN v_moy IS NOT NULL THEN fn_mention(v_moy)::text ELSE NULL END,
      CASE WHEN v_valide THEN 'admis' ELSE 'ajourne' END,
      now()
    )
    ON CONFLICT (etudiant_id, semestre_id) DO UPDATE SET
      credits_valides   = EXCLUDED.credits_valides,
      semestre_valide   = EXCLUDED.semestre_valide,
      moyenne_semestre  = EXCLUDED.moyenne_semestre,
      mention           = EXCLUDED.mention,
      decision          = EXCLUDED.decision,
      derniere_maj      = EXCLUDED.derniere_maj;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Recalcul force : % etudiants traites pour le semestre %',
    v_count, p_semestre_id;
  RETURN v_count;
END;
$function$;