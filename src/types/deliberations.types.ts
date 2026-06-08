// src/types/deliberations.types.ts

export type DecisionJury =
  | 'admis'
  | 'ajourné'
  | 'redoublant'
  | 'exclus'
  | 'mention_speciale';

export interface LigneDelib {
  etudiant_id: string;
  nom: string;
  prenom: string;
  matricule: string;
  filiere: string;
  moyenne_semestre: number | null;
  credits_valides: number;
  mention: string | null;
  decision: DecisionJury | null;       // décision calculée
  decision_jury: DecisionJury | null;  // override jury (si différent)
  semestre_valide: boolean;
  releve_publie: boolean;
  releve_verrouille: boolean;
}

export interface DeliStatut {
  semId: string;
  nbTotal: number;
  nbCalcules: number;
  nbValides: number;
  nbAjournes: number;
  nbPublies: number;
  semStatut: string;
}

export const DECISION_LABEL: Record<string, string> = {
  admis:           'Admis',
  'ajourné':       'Ajourné',
  redoublant:      'Redoublant',
  exclus:          'Exclus',
  mention_speciale:'Mention spéciale',
};

export const DECISION_COLOR: Record<string, string> = {
  admis:           'green',
  'ajourné':       'amber',
  redoublant:      'red',
  exclus:          'gray',
  mention_speciale:'purple',
};

export const MENTION_LABEL: Record<string, string> = {
  tres_bien:   'Très bien',
  bien:        'Bien',
  assez_bien:  'Assez bien',
  passable:    'Passable',
  insuffisant: 'Insuffisant',
};

export const MENTION_COLOR: Record<string, string> = {
  tres_bien:   'purple',
  bien:        'green',
  assez_bien:  'blue',
  passable:    'gray',
  insuffisant: 'red',
};
