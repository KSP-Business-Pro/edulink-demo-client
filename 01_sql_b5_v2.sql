-- ============================================================
-- B5.1 v2 — Adapté à la table roles existante
-- Structure réelle : id, ecole_id, nom, ico, color, perms (text[])
-- ============================================================

-- ── 1. Compléter la table roles existante ──────────────────

-- Ajouter les colonnes manquantes (sans toucher aux existantes)
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS code        text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS est_systeme boolean NOT NULL DEFAULT false;

-- Générer un code depuis le nom pour les rôles existants
UPDATE roles SET code = lower(regexp_replace(nom, '\s+', '_', 'g'))
WHERE code IS NULL;

-- Rendre code NOT NULL + UNIQUE par école après backfill
ALTER TABLE roles ALTER COLUMN code SET NOT NULL;

-- Contrainte unique (ecole_id, code) — tolère NULL pour rôles système
CREATE UNIQUE INDEX IF NOT EXISTS roles_ecole_code_unique
  ON roles (ecole_id, code)
  WHERE ecole_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS roles_system_code_unique
  ON roles (code)
  WHERE ecole_id IS NULL;

-- ── 2. Seed rôles système (ecole_id = NULL) ────────────────

INSERT INTO roles (ecole_id, nom, code, description, est_systeme, ico, color)
VALUES
  (NULL, 'Super Administrateur', 'superadmin',   'Accès total à toutes les écoles',        true, 'ShieldCheck', '#7c3aed'),
  (NULL, 'Administrateur École', 'admin_ecole',  'Accès complet à son école',              true, 'Building2',   '#1d4ed8'),
  (NULL, 'Scolarité',            'scolarite',    'Gestion inscriptions, notes, présences', true, 'ClipboardList','#0369a1'),
  (NULL, 'Enseignant',           'enseignant',   'Saisie notes et présences de ses cours', true, 'GraduationCap','#047857'),
  (NULL, 'Étudiant',             'etudiant',     'Consultation de son dossier',            true, 'BookOpen',    '#b45309')
ON CONFLICT DO NOTHING;

-- ── 3. Table permissions ───────────────────────────────────

CREATE TABLE IF NOT EXISTS permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module      text NOT NULL,
  action      text NOT NULL,
  description text,
  UNIQUE(module, action)
);

INSERT INTO permissions (module, action, description) VALUES
  ('inscriptions',    'read',     'Voir les inscriptions'),
  ('inscriptions',    'write',    'Créer/modifier inscriptions'),
  ('inscriptions',    'delete',   'Supprimer inscriptions'),
  ('inscriptions',    'export',   'Exporter inscriptions'),
  ('notes',           'read',     'Voir les notes'),
  ('notes',           'write',    'Saisir/modifier notes'),
  ('notes',           'delete',   'Supprimer notes'),
  ('notes',           'export',   'Exporter notes'),
  ('presences',       'read',     'Voir les présences'),
  ('presences',       'write',    'Saisir présences'),
  ('deliberations',   'read',     'Voir les délibérations'),
  ('deliberations',   'write',    'Gérer délibérations'),
  ('deliberations',   'validate', 'Valider/publier résultats'),
  ('emploi_du_temps', 'read',     'Voir emploi du temps'),
  ('emploi_du_temps', 'write',    'Modifier emploi du temps'),
  ('rh',              'read',     'Voir le personnel'),
  ('rh',              'write',    'Gérer le personnel'),
  ('finances',        'read',     'Voir les finances'),
  ('finances',        'write',    'Gérer les finances'),
  ('finances',        'export',   'Exporter finances'),
  ('parametres',      'read',     'Voir les paramètres'),
  ('parametres',      'write',    'Modifier les paramètres'),
  ('analytics',       'read',     'Voir les tableaux de bord'),
  ('users',           'read',     'Voir les utilisateurs'),
  ('users',           'write',    'Gérer les utilisateurs')
ON CONFLICT (module, action) DO NOTHING;

-- ── 4. Table role_permissions ──────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Seed permissions par rôle système
DO $$
DECLARE
  r_superadmin uuid;
  r_admin      uuid;
  r_scolarite  uuid;
  r_enseignant uuid;
  r_etudiant   uuid;
BEGIN
  SELECT id INTO r_superadmin FROM roles WHERE code = 'superadmin'  AND ecole_id IS NULL;
  SELECT id INTO r_admin      FROM roles WHERE code = 'admin_ecole' AND ecole_id IS NULL;
  SELECT id INTO r_scolarite  FROM roles WHERE code = 'scolarite'   AND ecole_id IS NULL;
  SELECT id INTO r_enseignant FROM roles WHERE code = 'enseignant'  AND ecole_id IS NULL;
  SELECT id INTO r_etudiant   FROM roles WHERE code = 'etudiant'    AND ecole_id IS NULL;

  -- superadmin + admin : tout
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_superadmin, id FROM permissions ON CONFLICT DO NOTHING;
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_admin, id FROM permissions ON CONFLICT DO NOTHING;

  -- scolarite : tout sauf parametres.write
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_scolarite, p.id FROM permissions p
    WHERE NOT (p.module = 'parametres' AND p.action = 'write')
    ON CONFLICT DO NOTHING;

  -- enseignant : notes rw, presences rw, edt read
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_enseignant, p.id FROM permissions p
    WHERE (p.module = 'notes'           AND p.action IN ('read','write'))
       OR (p.module = 'presences'       AND p.action IN ('read','write'))
       OR (p.module = 'emploi_du_temps' AND p.action  = 'read')
    ON CONFLICT DO NOTHING;

  -- etudiant : read only sur dossier
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_etudiant, p.id FROM permissions p
    WHERE p.module IN ('inscriptions','notes','deliberations','emploi_du_temps')
      AND p.action = 'read'
    ON CONFLICT DO NOTHING;
END;
$$;

-- ── 5. Migrer perms (text[]) existant → role_permissions ──

-- Si des rôles existants avaient déjà des perms en tableau text[],
-- on les migre vers la nouvelle table (best-effort, ignore les inconnues)
DO $$
DECLARE
  r RECORD;
  p_id uuid;
  perm_str text;
  parts text[];
BEGIN
  FOR r IN SELECT id, perms FROM roles WHERE perms IS NOT NULL AND array_length(perms, 1) > 0 LOOP
    FOREACH perm_str IN ARRAY r.perms LOOP
      -- Format attendu dans l'ancien système : "module.action" ou juste "module"
      parts := string_to_array(perm_str, '.');
      IF array_length(parts, 1) = 2 THEN
        SELECT id INTO p_id FROM permissions
        WHERE module = parts[1] AND action = parts[2];
        IF p_id IS NOT NULL THEN
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (r.id, p_id) ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ── 6. role_id sur utilisateurs + backfill ─────────────────

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id);

UPDATE utilisateurs u
SET role_id = r.id
FROM roles r
WHERE r.code = u.role
  AND r.ecole_id IS NULL
  AND u.role_id IS NULL;

-- ── 7. config jsonb sur ecoles ──────────────────────────────

ALTER TABLE ecoles
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';

-- ── 8. Table audit_logs ────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id      uuid REFERENCES ecoles(id) ON DELETE SET NULL,
  user_id       uuid,
  user_email    text,
  action        text NOT NULL,
  module        text NOT NULL,
  ressource_id  text,
  ressource_ref text,
  avant         jsonb,
  apres         jsonb,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ecole_id   ON audit_logs(ecole_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module     ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ── 9. RPC fn_audit_log ────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_log(
  p_ecole_id      uuid,
  p_action        text,
  p_module        text,
  p_ressource_id  text DEFAULT NULL,
  p_ressource_ref text DEFAULT NULL,
  p_avant         jsonb DEFAULT NULL,
  p_apres         jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  INSERT INTO audit_logs (
    ecole_id, user_id, user_email,
    action, module, ressource_id, ressource_ref,
    avant, apres
  )
  VALUES (
    p_ecole_id,
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    p_action, p_module, p_ressource_id, p_ressource_ref,
    p_avant, p_apres
  );
END;
$func$;

-- ── 10. Storage bucket ecole-assets ───────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ecole-assets', 'ecole-assets', true, 5242880,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon']
)
ON CONFLICT (id) DO NOTHING;

-- ── 11. RLS ────────────────────────────────────────────────

ALTER TABLE permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;

-- roles : RLS déjà activée probablement — on ajoute les policies manquantes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'roles' AND policyname = 'roles_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "roles_select" ON roles
        FOR SELECT TO authenticated
        USING (ecole_id IS NULL OR peut_voir_ecole(ecole_id))
    $pol$;
  END IF;
END;
$$;

CREATE POLICY "permissions_select" ON permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_permissions_select" ON role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_permissions_manage" ON role_permissions
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM utilisateurs WHERE auth_id = auth.uid())
    IN ('superadmin','admin_ecole')
  );

CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (ecole_id IS NULL OR peut_voir_ecole(ecole_id));

-- Storage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'assets_public_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "assets_public_read" ON storage.objects
        FOR SELECT TO public USING (bucket_id = 'ecole-assets')
    $pol$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'assets_auth_upload'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "assets_auth_upload" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'ecole-assets'
          AND (SELECT role FROM utilisateurs WHERE auth_id = auth.uid())
              IN ('superadmin','admin_ecole')
        )
    $pol$;
  END IF;
END;
$$;

-- ── Vérification finale ────────────────────────────────────
SELECT
  (SELECT count(*) FROM roles)            AS nb_roles,
  (SELECT count(*) FROM permissions)      AS nb_permissions,
  (SELECT count(*) FROM role_permissions) AS nb_role_permissions;
