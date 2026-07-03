-- ============================================================================
-- Correctif — paiements.numero_recu était unique() global, mais le compteur
-- (compteurs_recus) est scopé par (ecole_id, annee) : deux écoles différentes
-- génèrent donc chacune "RECU-2026-000001" en premier reçu -> collision.
-- La bonne contrainte est l'unicité PAR ÉCOLE, pas globale.
-- ============================================================================

alter table paiements drop constraint if exists paiements_numero_recu_key;

alter table paiements add constraint paiements_ecole_numero_recu_key unique (ecole_id, numero_recu);

-- ============================================================================
-- Vérification :
--   select conname from pg_constraint where conrelid = 'paiements'::regclass;
--   -- doit montrer "paiements_ecole_numero_recu_key", plus de
--   "paiements_numero_recu_key"
-- ============================================================================
