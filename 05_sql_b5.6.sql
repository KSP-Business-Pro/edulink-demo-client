-- ============================================================
-- B5.6 — Portail Public
-- ============================================================

-- 1. Colonne slug sur ecoles (URL publique unique)
ALTER TABLE ecoles
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS site_web text,
  ADD COLUMN IF NOT EXISTS adresse text,
  ADD COLUMN IF NOT EXISTS telephone text,
  ADD COLUMN IF NOT EXISTS email_contact text,
  ADD COLUMN IF NOT EXISTS annee_creation int,
  ADD COLUMN IF NOT EXISTS portail_actif boolean NOT NULL DEFAULT false;

-- Générer slug depuis nom pour les écoles existantes
UPDATE ecoles
SET slug = lower(regexp_replace(regexp_replace(nom, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL;

-- 2. Table actualités école
CREATE TABLE IF NOT EXISTS actualites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id    uuid NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  titre       text NOT NULL,
  contenu     text NOT NULL,
  image_url   text,
  categorie   text DEFAULT 'general', -- general, evenement, resultat, inscription
  publie      boolean NOT NULL DEFAULT false,
  date_pub    date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actualites_ecole ON actualites(ecole_id);
CREATE INDEX IF NOT EXISTS idx_actualites_publie ON actualites(publie);

-- 3. Table programmes publics (pour affichage sur portail)
-- (utilise la table programmes existante, on ajoute juste un flag)
ALTER TABLE programmes
  ADD COLUMN IF NOT EXISTS afficher_portail boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS frais_scolarite numeric(12,2),
  ADD COLUMN IF NOT EXISTS duree_mois int;

-- 4. RLS actualites
ALTER TABLE actualites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actualites_public_read" ON actualites
  FOR SELECT TO anon, authenticated
  USING (publie = true);

CREATE POLICY "actualites_manage" ON actualites
  FOR ALL TO authenticated
  USING (peut_voir_ecole(ecole_id));

-- 5. ecoles lisibles publiquement (portail_actif)
-- (la table ecoles a déjà RLS — on ajoute une policy pour anon)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ecoles' AND policyname = 'ecoles_public_portail'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "ecoles_public_portail" ON ecoles
        FOR SELECT TO anon
        USING (portail_actif = true)
    $pol$;
  END IF;
END;
$$;

SELECT 'B5.6 SQL OK' AS status;
