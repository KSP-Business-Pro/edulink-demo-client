-- ═══════════════════════════════════════════════════════════════
-- fix_messages_rls_recursion.sql
-- Corrige la récursion infinie entre les policies messages ⇄ message_destinataires
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_is_message_destinataire(p_message_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM message_destinataires md
    JOIN utilisateurs u ON u.auth_id = auth.uid() AND u.actif = true
    WHERE md.message_id = p_message_id AND md.destinataire_id = u.id
  );
$$;

CREATE OR REPLACE FUNCTION fn_is_message_expediteur(p_message_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM messages m
    JOIN utilisateurs u ON u.auth_id = auth.uid() AND u.actif = true
    WHERE m.id = p_message_id AND m.expediteur_id = u.id
  );
$$;

DROP POLICY IF EXISTS messages_select_scope ON messages;
CREATE POLICY messages_select_scope ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.auth_id = auth.uid() AND u.actif = true AND u.id = messages.expediteur_id
    )
    OR fn_is_message_destinataire(messages.id)
  );

DROP POLICY IF EXISTS message_destinataires_select ON message_destinataires;
CREATE POLICY message_destinataires_select ON message_destinataires
  FOR SELECT
  USING (
    destinataire_id IN (
      SELECT id FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true
    )
    OR fn_is_message_expediteur(message_destinataires.message_id)
    OR EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.auth_id = auth.uid() AND u.actif = true AND u.ecole_id IS NULL AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS message_destinataires_insert ON message_destinataires;
CREATE POLICY message_destinataires_insert ON message_destinataires
  FOR INSERT
  WITH CHECK (
    fn_is_message_expediteur(message_destinataires.message_id)
  );