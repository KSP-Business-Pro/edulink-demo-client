-- ============================================================
-- B5.2 — Gestion Utilisateurs
-- RPC fn_get_user_emails (lecture emails depuis auth.users)
-- ============================================================

-- Fonction RPC pour récupérer les emails depuis auth.users
-- (la table auth.users n'est pas accessible directement en RLS)
CREATE OR REPLACE FUNCTION fn_get_user_emails(p_auth_ids uuid[])
RETURNS TABLE(auth_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- Seuls les admins peuvent voir tous les emails
  IF (SELECT role FROM utilisateurs WHERE utilisateurs.auth_id = auth.uid())
     NOT IN ('superadmin', 'admin', 'admin_ecole', 'direction') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE u.id = ANY(p_auth_ids);
END;
$func$;

-- Vue matérialisée utilisateurs_avec_email (optionnel, pour perf)
-- Accessible uniquement aux admins via RLS
CREATE OR REPLACE VIEW v_utilisateurs_email AS
SELECT
  u.id,
  u.auth_id,
  u.nom,
  u.prenom,
  u.role,
  u.ecole_id,
  u.actif,
  a.email,
  a.last_sign_in_at
FROM utilisateurs u
LEFT JOIN auth.users a ON a.id = u.auth_id;

-- Accorder accès à la vue aux authenticated users
GRANT SELECT ON v_utilisateurs_email TO authenticated;
