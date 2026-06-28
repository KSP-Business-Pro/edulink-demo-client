-- ============================================================
-- B5.4 — RH & Personnel
-- ============================================================

-- 1. Table personnel administratif
CREATE TABLE IF NOT EXISTS personnel (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id      uuid NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  nom           text NOT NULL,
  prenom        text,
  poste         text NOT NULL,  -- DG, DAF, Scolarité, Comptable, Secrétaire, etc.
  departement   text,           -- Administration, Finance, Pédagogie, IT, etc.
  email         text,
  telephone     text,
  date_embauche date,
  type_contrat  text NOT NULL DEFAULT 'CDI', -- CDI, CDD, Stage, Vacataire, Consultant
  salaire_brut  numeric(12,2),
  statut        text NOT NULL DEFAULT 'actif', -- actif, inactif, conge, suspendu
  photo_url     text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personnel_ecole_id ON personnel(ecole_id);
CREATE INDEX IF NOT EXISTS idx_personnel_statut   ON personnel(statut);

-- 2. Table congés & absences
CREATE TABLE IF NOT EXISTS conges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id  uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  ecole_id      uuid NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  type_conge    text NOT NULL, -- annuel, maladie, maternite, sans_solde, formation
  date_debut    date NOT NULL,
  date_fin      date NOT NULL,
  nb_jours      int  GENERATED ALWAYS AS (date_fin - date_debut + 1) STORED,
  statut        text NOT NULL DEFAULT 'en_attente', -- en_attente, approuve, refuse
  motif         text,
  approuve_par  uuid REFERENCES personnel(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conges_personnel_id ON conges(personnel_id);
CREATE INDEX IF NOT EXISTS idx_conges_ecole_id     ON conges(ecole_id);

-- 3. Table évaluations annuelles
CREATE TABLE IF NOT EXISTS evaluations_rh (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id  uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  ecole_id      uuid NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  annee         int  NOT NULL,
  note_globale  numeric(3,1), -- /10
  ponctualite   numeric(3,1),
  competence    numeric(3,1),
  initiative    numeric(3,1),
  travail_equipe numeric(3,1),
  commentaire   text,
  evalue_par    uuid REFERENCES personnel(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(personnel_id, annee)
);

-- 4. RLS
ALTER TABLE personnel      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations_rh ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personnel_select" ON personnel
  FOR SELECT TO authenticated
  USING (peut_voir_ecole(ecole_id));

CREATE POLICY "personnel_manage" ON personnel
  FOR ALL TO authenticated
  USING (
    peut_voir_ecole(ecole_id) AND
    (SELECT role FROM utilisateurs WHERE auth_id = auth.uid())
    IN ('superadmin','admin','admin_ecole','direction','scolarite')
  );

CREATE POLICY "conges_select" ON conges
  FOR SELECT TO authenticated
  USING (peut_voir_ecole(ecole_id));

CREATE POLICY "conges_manage" ON conges
  FOR ALL TO authenticated
  USING (peut_voir_ecole(ecole_id));

CREATE POLICY "evaluations_rh_select" ON evaluations_rh
  FOR SELECT TO authenticated
  USING (peut_voir_ecole(ecole_id));

CREATE POLICY "evaluations_rh_manage" ON evaluations_rh
  FOR ALL TO authenticated
  USING (peut_voir_ecole(ecole_id));

-- 5. Audit trigger sur personnel
CREATE OR REPLACE FUNCTION trg_personnel_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_personnel_updated
  BEFORE UPDATE ON personnel
  FOR EACH ROW EXECUTE FUNCTION trg_personnel_updated_at();
