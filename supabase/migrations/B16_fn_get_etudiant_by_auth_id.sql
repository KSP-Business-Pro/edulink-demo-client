-- B16: RPC pour retrouver un etudiant a partir de son auth_id
-- Corrige le bug de session OTP invalidee a chaque rechargement de page :
-- l'IIFE d'initialisation du portail appelait systematiquement chargerProfil()
-- (table profiles), qui echoue en 406 pour les comptes OTP (aucune ligne
-- profiles associee). Cette RPC permet de retrouver l'etudiant directement
-- via auth_id, sans dependre de profiles.

CREATE OR REPLACE FUNCTION fn_get_etudiant_by_auth_id(p_auth_id uuid)
RETURNS SETOF etudiants
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT * FROM etudiants WHERE auth_id = p_auth_id LIMIT 1;
$$;
