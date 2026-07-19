-- B16: Ajout d'une contrainte UNIQUE sur push_tokens.token
-- Corrige l'erreur PostgREST "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" rencontrée lors de l'upsert
-- du token FCM depuis le portail famille (on_conflict=token).
-- Un même token FCM identifie un appareil/navigateur donné et ne doit
-- jamais appartenir à deux lignes.

ALTER TABLE push_tokens
ADD CONSTRAINT push_tokens_token_key UNIQUE (token);
