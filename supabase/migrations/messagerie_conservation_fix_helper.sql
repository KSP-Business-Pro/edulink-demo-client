-- ============================================================================
-- EduLink Sup — Messagerie institutionnelle
-- CHANTIER F, point 3 : fix du helper de rôle fn_est_direction_ou_admin
-- Fichier : messagerie_conservation_fix_helper.sql
-- Date : 07/08/2026
--
-- DÉJÀ EXÉCUTÉ EN BASE le 07/08/2026 — ce fichier versionne l'état réel.
--
-- Cause : le compte super-admin "réseau" a utilisateurs.ecole_id NULL ;
-- la version initiale du helper exigeait u.ecole_id = p_ecole_id, condition
-- jamais vraie avec NULL -> acces_refuse sur gel/prévisualisation/purge.
-- Correctif aligné sur le pattern de référence de fn_valider_message_officiel :
--   - liaison auth_id = auth.uid() uniquement
--   - filtre actif = true
--   - ecole_id IS NULL = compte réseau, autorisé sur toutes les écoles
-- Toutes les RPC (fn_previsualiser_purge, fn_purger_messages_expires,
-- fn_definir_gel_legal) et les policies RLS utilisent ce helper et héritent
-- du correctif sans autre changement.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_est_direction_ou_admin(p_ecole_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM utilisateurs u
    WHERE u.auth_id = auth.uid()
      AND u.actif = true
      AND u.role IN ('admin', 'direction')
      AND (u.ecole_id IS NULL OR u.ecole_id = p_ecole_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_est_direction_ou_admin(uuid) TO authenticated;
