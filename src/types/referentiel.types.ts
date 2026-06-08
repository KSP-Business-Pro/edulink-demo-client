// ─────────────────────────────────────────────────────────────────────────────
//  Référentiel académique — Types Sprint 2
// ─────────────────────────────────────────────────────────────────────────────

export type GradeLMD = 'licence' | 'master' | 'doctorat';
export type TypeUE   = 'fondamentale' | 'optionnelle' | 'transversale';
export type StatutSemestre = 'planifie' | 'en_cours' | 'cloture' | 'archive';
export type NiveauLMD = 'L1' | 'L2' | 'L3' | 'M1' | 'M2' | 'D1' | 'D2' | 'D3';

export interface Programme {
  id: string;
  ecole_id: string;
  code: string;
  intitule: string;
  grade: GradeLMD;
  credits_total: number;
  duree_annees: number;
  actif: boolean;
  created_at?: string;
}

export interface UniteEnseignement {
  id: string;
  ecole_id: string;
  code: string;
  intitule: string;
  type_ue: TypeUE;
  credits_cect: number;
  poids_cc: number;
  poids_examen: number;
  created_at?: string;
}

export interface ProgrammeUE {
  id: string;
  programme_id: string;
  ue_id: string;
  semestre_id?: string;
  obligatoire: boolean;
  ecole_id: string;
  unites_enseignement?: UniteEnseignement;
  semestres?: Pick<Semestre, 'libelle' | 'niveau'>;
}

export interface Semestre {
  id: string;
  ecole_id: string;
  programme_id: string | null;
  annee_academique_id: string | null;
  numero: number;
  libelle: string;
  niveau: NiveauLMD;
  statut: StatutSemestre;
  date_debut: string | null;
  date_fin: string | null;
  created_at?: string;
  programmes_lmd?: Pick<Programme, 'intitule' | 'grade'>;
  annees_academiques?: { libelle: string };
}

export interface MatiereLMD {
  id: string;
  ecole_id: string;
  ue_id: string;
  code: string;
  nom: string;
  coefficient: number;
  heures_cm: number;
  heures_td: number;
  enseignant_id: string | null;
  enseignants?: { nom: string; prenom: string };
}

export interface AnneeAcademique {
  id: string;
  ecole_id: string;
  libelle: string;
  active?: boolean;
}

// ── Crédits CAMES validés par grade ──────────────────────────────────────────
export const CREDITS_DEFAULTS: Record<GradeLMD, { credits: number; duree: number }> = {
  licence:  { credits: 180, duree: 3 },
  master:   { credits: 120, duree: 2 },
  doctorat: { credits: 180, duree: 3 },
};

export const CREDITS_PAR_SEMESTRE = 30; // CECT/semestre CAMES

export const NIVEAUX_BY_GRADE: Record<GradeLMD, NiveauLMD[]> = {
  licence:  ['L1', 'L2', 'L3'],
  master:   ['M1', 'M2'],
  doctorat: ['D1', 'D2', 'D3'],
};

export const GRADE_LABEL: Record<GradeLMD, string> = {
  licence:  'Licence',
  master:   'Master',
  doctorat: 'Doctorat',
};

export const STATUT_SEMESTRE_LABEL: Record<StatutSemestre, string> = {
  planifie:  'Planifié',
  en_cours:  'En cours',
  cloture:   'Clôturé',
  archive:   'Archivé',
};
