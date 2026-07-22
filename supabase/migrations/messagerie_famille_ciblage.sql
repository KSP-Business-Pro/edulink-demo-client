-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- messagerie_famille_ciblage.sql
-- Phase famille : ciblage message_destinataires par Ã©tudiant + RLS portail
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ALTER TABLE message_destinataires
  ALTER COLUMN destinataire_id DROP NOT NULL;

ALTER TABLE message_destinataires
  ADD CONSTRAINT chk_message_destinataires_cible
  CHECK (destinataire_id IS NOT NULL OR etudiant_id IS NOT NULL);

CREATE OR REPLACE FUNCTION fn_is_etudiant_destinataire(p_etudiant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM etudiants e
    WHERE e.id = p_etudiant_id AND e.auth_id = auth.uid()
  );
$$;

CREATE POLICY message_destinataires_select_famille ON message_destinataires
  FOR SELECT
  USING (
    etudiant_id IS NOT NULL AND fn_is_etudiant_destinataire(etudiant_id)
  );

CREATE POLICY messages_select_famille ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM message_destinataires md
      WHERE md.message_id = messages.id
        AND md.etudiant_id IS NOT NULL
        AND fn_is_etudiant_destinataire(md.etudiant_id)
    )
  );