-- ============================================================
-- B5.5 — Email Parents
-- ============================================================

-- 1. Table des communications envoyées
CREATE TABLE IF NOT EXISTS communications_parents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id      uuid NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  objet         text NOT NULL,
  corps         text NOT NULL,
  type_comm     text NOT NULL DEFAULT 'email', -- email, sms, notification
  categorie     text NOT NULL DEFAULT 'general', -- general, releve, absence, paiement, urgence
  destinataires jsonb NOT NULL DEFAULT '[]', -- [{etudiant_id, nom, email_parent}]
  nb_envoyes    int NOT NULL DEFAULT 0,
  nb_erreurs    int NOT NULL DEFAULT 0,
  statut        text NOT NULL DEFAULT 'brouillon', -- brouillon, envoye, partiel
  envoye_par    uuid,
  envoye_le     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_parents_ecole ON communications_parents(ecole_id);
CREATE INDEX IF NOT EXISTS idx_comm_parents_cat   ON communications_parents(categorie);

-- 2. Table des modèles de messages
CREATE TABLE IF NOT EXISTS modeles_communication (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id    uuid REFERENCES ecoles(id) ON DELETE CASCADE,
  nom         text NOT NULL,
  categorie   text NOT NULL,
  objet       text NOT NULL,
  corps       text NOT NULL,
  variables   text[] DEFAULT '{}', -- variables disponibles: {nom_etudiant}, {prenom}, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Modèles système par défaut
INSERT INTO modeles_communication (ecole_id, nom, categorie, objet, corps, variables) VALUES
(NULL, 'Relevé de notes disponible', 'releve',
 'Relevé de notes de {prenom} {nom} — {semestre}',
 'Cher(e) parent/tuteur,

Nous avons le plaisir de vous informer que le relevé de notes de {prenom} {nom} pour le semestre {semestre} est désormais disponible sur le portail EduLink.

Résultats : Moyenne générale {moyenne}/20 — Mention : {mention}

Vous pouvez consulter le relevé détaillé en vous connectant sur le portail étudiant.

Cordialement,
La Direction de {ecole_nom}',
ARRAY['{prenom}','{nom}','{semestre}','{moyenne}','{mention}','{ecole_nom}']),

(NULL, 'Notification d''absence', 'absence',
 'Absence de {prenom} {nom} — {date}',
 'Cher(e) parent/tuteur,

Nous vous informons que votre enfant {prenom} {nom} a été absent(e) le {date} au cours de {matiere}.

Merci de prendre contact avec la scolarité si cette absence était justifiée.

Cordialement,
La Scolarité de {ecole_nom}',
ARRAY['{prenom}','{nom}','{date}','{matiere}','{ecole_nom}']),

(NULL, 'Rappel de paiement', 'paiement',
 'Rappel : Frais de scolarité — {prenom} {nom}',
 'Cher(e) parent/tuteur,

Nous vous rappelons que des frais de scolarité sont en attente de règlement pour {prenom} {nom}.

Montant dû : {montant} FCFA
Date limite : {date_limite}

Merci de régulariser votre situation auprès de notre service comptable.

Cordialement,
La Direction Financière de {ecole_nom}',
ARRAY['{prenom}','{nom}','{montant}','{date_limite}','{ecole_nom}'])
ON CONFLICT DO NOTHING;

-- 3. RLS
ALTER TABLE communications_parents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE modeles_communication    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_parents_select" ON communications_parents
  FOR SELECT TO authenticated USING (peut_voir_ecole(ecole_id));

CREATE POLICY "comm_parents_manage" ON communications_parents
  FOR ALL TO authenticated
  USING (peut_voir_ecole(ecole_id));

CREATE POLICY "modeles_select" ON modeles_communication
  FOR SELECT TO authenticated
  USING (ecole_id IS NULL OR peut_voir_ecole(ecole_id));

CREATE POLICY "modeles_manage" ON modeles_communication
  FOR ALL TO authenticated
  USING (ecole_id IS NULL OR peut_voir_ecole(ecole_id));

SELECT count(*) AS nb_modeles FROM modeles_communication;
