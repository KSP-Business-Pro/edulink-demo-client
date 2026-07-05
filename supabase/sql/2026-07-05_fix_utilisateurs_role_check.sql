-- ═══════════════════════════════════════════════════════════════════════
-- Correctif : contrainte utilisateurs_role_check désynchronisée du modèle
-- de rôles applicatif (UserRole côté frontend).
--
-- Découvert le 04/07/2026 : impossible de créer un compte 'direction' ou
-- 'scolarite' depuis le module Utilisateurs — la contrainte de la base ne
-- connaissait que 'directeur' (pas 'direction') et ne connaissait pas du
-- tout 'scolarite'. Le compte existant d'Isidore HOUNHUEDO (role='directeur')
-- a dû être inséré hors de l'application (SQL direct), jamais via ce
-- formulaire, qui aurait échoué de la même façon.
--
-- Ce correctif est volontairement ADDITIF (n'enlève ni 'directeur' ni
-- 'secretaire'/'surveillance') pour ne rien casser côté données existantes.
-- Un vrai nettoyage (migrer 'directeur' → 'direction', décider du sort de
-- secretaire/surveillance) est un chantier à part, à mener consciemment.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE utilisateurs DROP CONSTRAINT utilisateurs_role_check;

ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text, 'enseignant'::text, 'comptable'::text,
    'secretaire'::text, 'directeur'::text, 'surveillance'::text,
    'direction'::text, 'scolarite'::text
  ]));

-- Vérification :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'utilisateurs_role_check';
