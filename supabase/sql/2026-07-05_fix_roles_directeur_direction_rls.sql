-- =============================================================================
-- Fix : harmonisation des roles 'directeur' (ancien format) / 'direction' (nouveau)
-- Contexte : donatien2424@gmail.com a le role 'direction' en base, mais les
-- policies RLS ne reconnaissaient que 'directeur', bloquant silencieusement
-- ses acces (suppression etudiants, factures, etc.)
-- Strategie : transition douce - les deux valeurs sont acceptees en parallele.
-- Executee en production le 2026-07-05 via SQL Editor Supabase.
-- =============================================================================

BEGIN;

-- Fonction helper
CREATE OR REPLACE FUNCTION public.is_admin_or_directeur()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM utilisateurs
    WHERE auth_id = auth.uid()
      AND actif = true
      AND role IN ('admin', 'directeur', 'direction')
  );
$function$;

-- utilisateurs
ALTER POLICY utilisateurs_update_admin ON utilisateurs
USING ((get_my_role() = ANY (ARRAY['admin'::text, 'directeur'::text, 'direction'::text])) AND ((ecole_id = get_user_ecole_id()) OR (get_user_ecole_id() IS NULL)))
WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::text, 'directeur'::text, 'direction'::text])) AND ((ecole_id = get_user_ecole_id()) OR (get_user_ecole_id() IS NULL)));

ALTER POLICY utilisateurs_insert ON utilisateurs
WITH CHECK (get_my_role() = ANY (ARRAY['admin'::text, 'directeur'::text, 'direction'::text]));

ALTER POLICY utilisateurs_select_admin ON utilisateurs
USING ((get_my_role() = ANY (ARRAY['admin'::text, 'directeur'::text, 'direction'::text])) AND ((ecole_id = get_user_ecole_id()) OR (get_user_ecole_id() IS NULL)));

-- etudiants
ALTER POLICY etudiants_insert ON etudiants
WITH CHECK ((get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])) AND peut_voir_ecole(ecole_id));

ALTER POLICY etudiants_delete ON etudiants
USING ((ecole_id = get_user_ecole_id()) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- profiles
ALTER POLICY profiles_delete ON profiles
USING ((id = auth.uid()) OR (get_my_role() = ANY (ARRAY['directeur'::text, 'direction'::text])));

-- classes_legacy
ALTER POLICY classes_insert ON classes_legacy
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

ALTER POLICY classes_update ON classes_legacy
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

ALTER POLICY classes_delete ON classes_legacy
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- audit_log
ALTER POLICY audit_log_select ON audit_log
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- roles
ALTER POLICY roles_modify_admin_only ON roles
USING (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text]))
WITH CHECK (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text]));

-- evenements
ALTER POLICY evenements_insert ON evenements
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

ALTER POLICY evenements_update ON evenements
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

ALTER POLICY evenements_delete ON evenements
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- absences
ALTER POLICY absences_insert ON absences
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'enseignant'::text, 'direction'::text])));

ALTER POLICY absences_update ON absences
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'enseignant'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'enseignant'::text, 'direction'::text])));

ALTER POLICY absences_delete ON absences
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'enseignant'::text, 'direction'::text])));

-- factures
ALTER POLICY factures_insert ON factures
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'comptable'::text, 'direction'::text])));

ALTER POLICY factures_update ON factures
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'comptable'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'comptable'::text, 'direction'::text])));

ALTER POLICY factures_delete ON factures
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'comptable'::text, 'direction'::text])));

-- notifications_config
ALTER POLICY notifications_config_insert ON notifications_config
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

ALTER POLICY notifications_config_update ON notifications_config
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

ALTER POLICY notifications_config_delete ON notifications_config
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- campagnes_admission
ALTER POLICY campagnes_admission_modify ON campagnes_admission
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- candidatures
ALTER POLICY candidatures_modify ON candidatures
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- portail_config
ALTER POLICY portail_config_modify ON portail_config
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- inscriptions_demandes
ALTER POLICY inscriptions_demandes_modify ON inscriptions_demandes
USING (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])))
WITH CHECK (peut_voir_ecole(ecole_id) AND (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text])));

-- prospects_diagnostic
ALTER POLICY prospects_admin_all ON prospects_diagnostic
USING (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text]))
WITH CHECK (get_my_role() = ANY (ARRAY['directeur'::text, 'admin'::text, 'direction'::text]));

COMMIT;