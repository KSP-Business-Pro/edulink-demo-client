-- Migration : seed des modèles de notification GLOBAUX (ecole_id IS NULL)
-- Chantier D (messagerie) — fallback par défaut pour toute école non provisionnée.
--
-- Contexte : fn_notifier_evenement résout désormais le modèle via
--   WHERE type=p_type AND canal='email' AND (ecole_id=p_ecole_id OR ecole_id IS NULL)
--   ORDER BY ecole_id NULLS LAST LIMIT 1
-- L'école-spécifique prime ; ces modèles globaux servent de filet quand une école
-- n'a créé aucun modèle pour un type donné → plus de no-op silencieux.
--
-- Cloné depuis les gabarits email de l'école e3b029b5-f98f-4314-9654-054a0dbcfcde
-- (absence, paiement, releve). Technique JSONB : on copie toute la ligne puis on
-- écrase id (nouveau) et ecole_id (NULL) sans énumérer le schéma.
--
-- NB : le type 'note' n'est PAS seedé ici — voir messagerie_modele_note_global.sql.
--
-- NB RLS : les policies de modeles_notification conditionnent sur
-- peut_voir_ecole(ecole_id), qui renverra probablement false pour ecole_id NULL
-- côté un directeur/admin d'école. Les modèles globaux restent invisibles/non
-- éditables depuis l'UI notifications-config — gérables uniquement par
-- migration ou accès direct en base. fn_notifier_evenement (SECURITY DEFINER)
-- n'est pas affectée. Assumé comme choix de conception, pas une régression.
--
-- À exécuter UNE SEULE FOIS (relancer créerait des doublons globaux).

-- 0) pré-requis : la colonne était NOT NULL à l'origine (table conçue per-école)
alter table modeles_notification alter column ecole_id drop not null;

insert into modeles_notification
select (jsonb_populate_record(
          null::modeles_notification,
          to_jsonb(m) || jsonb_build_object(
            'id', gen_random_uuid(),
            'ecole_id', null
          )
       )).*
from modeles_notification m
where m.ecole_id = 'e3b029b5-f98f-4314-9654-054a0dbcfcde'
  and m.canal = 'email'
  and m.type in ('absence', 'paiement', 'releve');