-- Migration : seed des gabarits globaux SMS et Push (Chantier E)
-- Absence/paiement clonés depuis l'école e3b029b5 (existants) puis enrichis
-- avec les vraies variables (comme fait pour email). Note créé de zéro
-- (aucun gabarit sms/push n'existait pour ce type nulle part).
--
-- releve volontairement EXCLU ici : publish-releve gère déjà son propre
-- envoi SMS (Twilio direct) et n'envoie pas de push — ne pas dupliquer.
--
-- À exécuter UNE SEULE FOIS.

-- 1) Absence + Paiement : clone global depuis e3b029b5, corps enrichi
insert into modeles_notification
select (jsonb_populate_record(
          null::modeles_notification,
          to_jsonb(m) || jsonb_build_object(
            'id', gen_random_uuid(),
            'ecole_id', null,
            'corps_texte', CASE m.type
              WHEN 'absence'  THEN 'Bonjour {etudiant}, une absence a été enregistrée en {ue}.'
              WHEN 'paiement' THEN 'Bonjour {etudiant}, paiement de {montant} FCFA reçu (reçu n° {numero_recu}).'
            END
          )
       )).*
from modeles_notification m
where m.ecole_id = 'e3b029b5-f98f-4314-9654-054a0dbcfcde'
  and m.canal in ('sms', 'push')
  and m.type in ('absence', 'paiement');

-- 2) Note : nouveau gabarit global, sms + push (aucune ligne existante à cloner)
insert into modeles_notification (id, ecole_id, type, canal, actif, sujet, corps_texte)
values
  (gen_random_uuid(), null, 'note', 'sms',  true, null,
   'Bonjour {etudiant}, nouvelle note en {matiere} ({evaluation}) : {note}/20.'),
  (gen_random_uuid(), null, 'note', 'push', true, 'Nouvelle note — {matiere}',
   'Bonjour {etudiant}, nouvelle note en {matiere} ({evaluation}) : {note}/20.');
