-- Migration : seed du modèle global note/email
-- Chantier D (messagerie) — module Notes, contexte "saisie de note".
--
-- Aucun gabarit 'note' n'existait nulle part (ni école, ni global) au moment
-- de ce câblage. Créé directement en global (ecole_id NULL), résolu par
-- fn_notifier_evenement pour toute école. Variables disponibles au moment de
-- l'appel (notifierNote côté client) : {matiere}, {evaluation}, {note}.
--
-- À exécuter UNE SEULE FOIS.

insert into modeles_notification
select (jsonb_populate_record(
          null::modeles_notification,
          to_jsonb(m) || jsonb_build_object(
            'id', gen_random_uuid(),
            'type', 'note',
            'sujet', 'Nouvelle note — {matiere}',
            'corps_texte', 'Une nouvelle note a été enregistrée pour {matiere} ({evaluation}) : {note}/20.'
          )
       )).*
from modeles_notification m
where m.ecole_id is null and m.canal = 'email' and m.type = 'absence';