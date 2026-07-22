-- ═══════════════════════════════════════════════════════════════
-- backfill_messages_famille_orphelins.sql
-- Rattache les messages envoyés depuis le portail avant le fix RPC fn_envoyer_message_famille
-- ═══════════════════════════════════════════════════════════════

insert into message_destinataires (message_id, etudiant_id, destinataire_role, lu, lu_at)
values
  ('e3d423f7-dd56-4bcf-a088-4151b03c17d7', 'a1000001-0000-0000-0000-000000000001', 'famille', true, now()),
  ('d09aab81-e1d6-40ef-bde2-21aed0bb4092', 'a1000001-0000-0000-0000-000000000001', 'famille', true, now()),
  ('dd358a8b-2019-4dd6-b817-c758afdbf14c', 'a1000001-0000-0000-0000-000000000001', 'famille', true, now()),
  ('0df6c871-6ec2-42b4-a03a-275a5e8ee5c3', 'a1000001-0000-0000-0000-000000000001', 'famille', true, now()),
  ('63b936bd-7808-481f-b773-84b6886081d3', 'a1000001-0000-0000-0000-000000000001', 'famille', true, now()),
  ('40ca66a2-1a19-47f4-9fba-bb84c6e69ad0', '50f333ae-004c-4922-a37f-28be37da6ff9', 'famille', true, now()),
  ('135e28b8-dd23-4756-a290-bbda36c4fc25', '50f333ae-004c-4922-a37f-28be37da6ff9', 'famille', true, now()),
  ('c8fb80bf-ce17-403a-b5a5-b16a0a4f53a2', '4b57793e-9dff-4dfe-8b9b-dacf0f28593c', 'famille', true, now());

insert into message_destinataires (message_id, destinataire_id, destinataire_role)
select m.id, u.id, u.role
from messages m
cross join utilisateurs u
where m.id in (
  'e3d423f7-dd56-4bcf-a088-4151b03c17d7', 'd09aab81-e1d6-40ef-bde2-21aed0bb4092',
  'dd358a8b-2019-4dd6-b817-c758afdbf14c', '0df6c871-6ec2-42b4-a03a-275a5e8ee5c3',
  '63b936bd-7808-481f-b773-84b6886081d3', '40ca66a2-1a19-47f4-9fba-bb84c6e69ad0',
  '135e28b8-dd23-4756-a290-bbda36c4fc25', 'c8fb80bf-ce17-403a-b5a5-b16a0a4f53a2'
)
and u.ecole_id = '8916ae3b-eaba-4f64-b785-9f2b00ab1334'
and u.actif = true
and u.role = 'admin';