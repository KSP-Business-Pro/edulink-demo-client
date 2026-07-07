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