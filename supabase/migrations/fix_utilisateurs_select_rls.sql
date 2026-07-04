-- ═══════════════════════════════════════════════════════════════════════
-- Correctif : policy RLS manquante sur SELECT utilisateurs
-- Bug latent découvert le 04/07/2026 : aucune policy ne permettait à un
-- admin/direction de lister les comptes autres que le sien (seule une
-- policy UPDATE existait pour ce périmètre). La page "Utilisateurs"
-- n'affichait donc jamais que l'utilisateur connecté lui-même, quel que
-- soit le nombre réel de comptes en base.
--
-- IMPORTANT : cette policy est DÉJÀ appliquée en base de données.
-- Ce fichier est UNIQUEMENT une trace versionnée dans le code (pour
-- documentation et reproductibilité future) — NE PAS relancer cette
-- requête dans le SQL Editor Supabase, elle échouera avec
-- "policy already exists" (normal et sans gravité).
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY utilisateurs_select_admin ON utilisateurs FOR SELECT
USING (
  get_my_role() = ANY (ARRAY['admin', 'directeur'])
  AND (ecole_id = get_user_ecole_id() OR get_user_ecole_id() IS NULL)
);
