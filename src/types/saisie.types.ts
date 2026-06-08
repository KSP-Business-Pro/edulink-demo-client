// src/types/saisie.types.ts
export type TypeSession   = 'normale' | 'rattrapage';
export type StatutSession = 'ouverte' | 'planifiee' | 'close';
export type CategorieEval = 'CC' | 'EXAMEN';

export interface SessionEvaluation {
  id: string;
  semestre_id: string;
  ecole_id: string;
  type_session: TypeSession;
  statut: StatutSession;
}

export interface Evaluation {
  id: string;
  matiere_id: string;
  session_id: string;
  ecole_id: string;
  categorie: CategorieEval;
  format: string;
  intitule: string;
  ponderation: number; // 0..1
}

export interface NoteLMD {
  etudiant_id: string;
  evaluation_id: string;
  session_id: string;
  ecole_id: string;
  valeur: number | null;
  absent: boolean;
}

export interface EtudiantSaisie {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
}

export interface MatiereSaisie {
  id: string;
  nom: string;
  code: string;
  coefficient: number;
  ue_id: string;
  unites_enseignement: {
    code: string;
    intitule: string;
    poids_cc: number;
    poids_examen: number;
  };
}

export interface UESaisie {
  id: string;
  code: string;
  intitule: string;
  type_ue: string;
  poids_cc: number;
  poids_examen: number;
}

// Données agrégées pour la grille
export interface LigneGrille {
  etudiant: EtudiantSaisie;
  notesCC:  (number | null)[];  // valeurs par evaluation CC
  notesEX:  (number | null)[];
  absentsCC: boolean[];
  absentsEX: boolean[];
  moyCC:    number | null;
  finale:   number | null;
}

export interface ImportRow {
  matricule: string;
  note: number;
}
