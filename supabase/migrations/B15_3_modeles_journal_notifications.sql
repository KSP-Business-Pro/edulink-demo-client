-- =============================================================================
-- EduLink Sup — Sprint B15, Action 3
-- Migration : modeles_notification + journal_notifications
-- RLS aligné sur le pattern existant (cf. policies de `factures`) :
-- peut_voir_ecole(ecole_id) + get_my_role() = ANY ([...]).
-- destinataire_id générique (sans FK stricte), cohérent avec fn_audit_log.
-- =============================================================================

-- ── Table modeles_notification ──────────────────────────────────────────────
create table if not exists modeles_notification (
  id           uuid primary key default gen_random_uuid(),
  ecole_id     uuid not null references ecoles(id) on delete cascade,
  type         text not null,              -- 'releve' | 'paiement' | 'absence' | ...
  canal        text not null,              -- 'email' | 'sms' | 'push'
  actif        boolean not null default true,
  sujet        text,                       -- objet email / titre push
  corps_html   text,                       -- email uniquement
  corps_texte  text,                       -- sms / push
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint modeles_notification_canal_check
    check (canal in ('email', 'sms', 'push')),
  constraint modeles_notification_unique_par_ecole
    unique (ecole_id, type, canal)
);

create index if not exists idx_modeles_notification_ecole
  on modeles_notification(ecole_id);

-- Pas de trigger updated_at (fn_touch_updated_at n'existe pas dans ce repo) —
-- la colonne updated_at sera mise a jour explicitement cote applicatif,
-- comme le fait deja regles_ecole.

alter table modeles_notification enable row level security;

create policy "modeles_notification_select"
  on modeles_notification
  for select
  using (peut_voir_ecole(ecole_id));

create policy "modeles_notification_insert"
  on modeles_notification
  for insert
  with check (
    peut_voir_ecole(ecole_id)
    and get_my_role() = ANY (ARRAY['directeur', 'admin', 'comptable', 'direction']::text[])
  );

create policy "modeles_notification_update"
  on modeles_notification
  for update
  using (
    peut_voir_ecole(ecole_id)
    and get_my_role() = ANY (ARRAY['directeur', 'admin', 'comptable', 'direction']::text[])
  );

create policy "modeles_notification_delete"
  on modeles_notification
  for delete
  using (
    peut_voir_ecole(ecole_id)
    and get_my_role() = ANY (ARRAY['directeur', 'admin', 'comptable', 'direction']::text[])
  );

-- ── Table journal_notifications ─────────────────────────────────────────────
create table if not exists journal_notifications (
  id                     uuid primary key default gen_random_uuid(),
  ecole_id               uuid not null references ecoles(id) on delete cascade,
  type                   text not null,
  canal                  text not null,
  destinataire_id        uuid,             -- pas de FK stricte : etudiant OU utilisateur
  destinataire_type      text,             -- 'etudiant' | 'utilisateur'
  destinataire_contact   text,             -- email/téléphone au moment de l'envoi (snapshot)
  destinataire_nom       text,             -- snapshot du nom
  sujet                  text,
  statut                 text not null default 'en_attente',
  erreur                 text,
  provider_id            text,             -- ID Brevo / SID Twilio / ID message FCM
  envoye_par             uuid references utilisateurs(id) on delete set null,
  envoye_le              timestamptz not null default now(),

  constraint journal_notifications_canal_check
    check (canal in ('email', 'sms', 'push')),
  constraint journal_notifications_statut_check
    check (statut in ('envoye', 'echec', 'en_attente'))
);

create index if not exists idx_journal_notifications_ecole
  on journal_notifications(ecole_id);
create index if not exists idx_journal_notifications_envoye_le
  on journal_notifications(envoye_le desc);
create index if not exists idx_journal_notifications_type_canal
  on journal_notifications(type, canal);

alter table journal_notifications enable row level security;

-- Lecture : tout utilisateur de l'ecole (consultation du journal, pas de restriction de role)
create policy "journal_notifications_select"
  on journal_notifications
  for select
  using (peut_voir_ecole(ecole_id));

-- Ecriture : les Edge Functions utilisent la cle service_role, qui contourne RLS.
-- Cette policy couvre uniquement les insertions faites depuis le frontend authentifie,
-- si jamais un envoi manuel passe par le client plutot que par une Edge Function.
create policy "journal_notifications_insert"
  on journal_notifications
  for insert
  with check (
    peut_voir_ecole(ecole_id)
    and get_my_role() = ANY (ARRAY['directeur', 'admin', 'comptable', 'direction', 'scolarite']::text[])
  );
