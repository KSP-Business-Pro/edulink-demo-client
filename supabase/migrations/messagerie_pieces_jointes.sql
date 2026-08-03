-- Migration : pièces jointes sécurisées (Chantier F, §7 + §8)
-- Bucket Storage PRIVÉ dédié + table message_pieces_jointes + RLS.
--
-- Sécurité :
-- - Bucket privé : téléchargement uniquement via URL signée (utilisateur
--   authentifié), jamais d'accès public direct — contrairement à ecole-assets
--   (logos, public par design).
-- - Liste blanche MIME : PDF, images, Word/Excel. Limite 10 Mo/fichier.
--   Pas de scan antivirus (non natif Supabase) — écart assumé vs §8.
-- - RLS de la table : s'appuie sur un EXISTS vers messages — la RLS de
--   messages s'applique dans la sous-requête, donc on ne peut voir/joindre
--   une PJ que sur un message qu'on a le droit de voir. Zéro duplication
--   des règles de visibilité.

-- 1) Bucket privé dédié
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messages-pieces-jointes',
  'messages-pieces-jointes',
  false,
  10485760, -- 10 Mo
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- 2) Table des pièces jointes (§7 du doc)
create table if not exists message_pieces_jointes (
  id             uuid primary key default gen_random_uuid(),
  message_id     uuid not null references messages(id) on delete cascade,
  ecole_id       uuid not null references ecoles(id),
  nom_fichier    text not null,          -- nom original affiché
  chemin_storage text not null unique,   -- chemin dans le bucket
  taille_octets  bigint not null,
  mime_type      text not null,
  uploade_par    uuid,                   -- auth.uid() de l'uploadeur
  created_at     timestamptz not null default now()
);

create index if not exists idx_mpj_message on message_pieces_jointes(message_id);

-- 3) RLS
alter table message_pieces_jointes enable row level security;

-- Lecture : si on peut voir le message lié (RLS de messages appliquée
-- automatiquement dans le EXISTS)
create policy mpj_select on message_pieces_jointes
  for select using (
    exists (select 1 from messages m where m.id = message_id)
  );

-- Insertion : authentifié + le message lié est visible par l'appelant
-- (donc un expéditeur back-office sur son école, ou une famille sur
-- son propre message de réponse)
create policy mpj_insert on message_pieces_jointes
  for insert with check (
    auth.uid() is not null
    and exists (select 1 from messages m where m.id = message_id)
  );

-- Pas de policy UPDATE/DELETE : une PJ ne se modifie pas ; la suppression
-- suit le message (cascade) via l'archivage/purge côté messages.

-- 4) Policies Storage : accès au bucket réservé aux authentifiés.
-- La granularité fine (qui voit quel fichier) est portée par la table
-- ci-dessus : le client ne connaît le chemin_storage d'un fichier que
-- s'il a pu lire la ligne correspondante.
create policy "mpj_storage_select" on storage.objects
  for select using (
    bucket_id = 'messages-pieces-jointes' and auth.uid() is not null
  );

create policy "mpj_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'messages-pieces-jointes' and auth.uid() is not null
  );
