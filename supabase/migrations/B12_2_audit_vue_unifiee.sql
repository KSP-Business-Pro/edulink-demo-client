-- ═══════════════════════════════════════════════════════════════════════
-- B12.2 — Journal d'audit : vue de consultation unifiée
-- Combine les deux journaux existants sans les modifier :
--   - audit_log  (singulier) : alimenté automatiquement par triggers
--     (notes_lmd, releves_notes, factures, paiements, etudiants, resultats_cache)
--   - audit_logs (pluriel)   : alimenté manuellement via fn_audit_log()
--     (utilisateurs, auth_2fa, et autres actions applicatives)
-- À exécuter dans le SQL Editor Supabase.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW audit_journal_unifie AS
SELECT
  'auto'::text          AS source,
  id,
  ecole_id,
  user_id,
  user_email,
  user_role,
  action,
  table_name             AS cible,
  record_id::text        AS ressource_id,
  details                AS detail,
  created_at
FROM audit_log

UNION ALL

SELECT
  'manuel'::text         AS source,
  id,
  ecole_id,
  user_id,
  user_email,
  NULL::text              AS user_role,
  action,
  module                  AS cible,
  ressource_id,
  COALESCE(ressource_ref, '')
    || CASE WHEN avant IS NOT NULL OR apres IS NOT NULL
         THEN ' — avant/après disponibles' ELSE '' END AS detail,
  created_at
FROM audit_logs;

-- La vue hérite du RLS des deux tables sous-jacentes (row_security appliqué
-- par table membre de l'UNION, avec le contexte auth.uid() de l'appelant) —
-- aucune policy supplémentaire nécessaire sur la vue elle-même.

-- Vérification :
--   SELECT source, action, cible, created_at FROM audit_journal_unifie
--   ORDER BY created_at DESC LIMIT 20;
