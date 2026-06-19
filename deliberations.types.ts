// src/types/deliberations.types.ts
// B4.2 — Ajout decision_jury, StatsDelib, PVDelib

export type DecisionJury =
  | 'admis'
  | 'ajourné'
  | 'redoublant'
  | 'exclus'
  | 'mention_speciale';

export type StatutDelib = 'brouillon' | 'valide' | 'archive';

export interface LigneDelib {
  etudiant_id:       string;
  nom:               string;
  prenom:            string;
  matricule:         string;
  filiere:           string;
  moyenne_semestre:  number | null;
  credits_valides:   number;
  mention:           string | null;
  decision:          DecisionJury | null;       // décision calculée automatiquement
  decision_jury:     DecisionJury | null;       // override jury (nouveau B4.2)
  note_jury:         string | null;             // observation jury sur l'étudiant
  semestre_valide:   boolean;
  releve_publie:     boolean;
  releve_verrouille: boolean;
}

export interface PVDelib {
  id:                string;
  ecole_id:          string;
  semestre_id:       string;
  date_deliberation: string;
  president_jury:    string | null;
  membres_jury:      string[];
  statut:            StatutDelib;
  observations:      string | null;
  valide_le:         string | null;
  created_at:        string;
}

export interface StatsDelib {
  total:        number;
  calcules:     number;
  admis:        number;
  ajournes:     number;
  redoublants:  number;
  exclus:       number;
  moyenne_promo: number | null;
  min_moyenne:   number | null;
  max_moyenne:   number | null;
  mentions: {
    tres_bien:   number;
    bien:        number;
    assez_bien:  number;
    passable:    number;
    insuffisant: number;
  };
  publies: number;
}

export interface DeliStatut {
  semId:      string;
  nbTotal:    number;
  nbCalcules: number;
  nbValides:  number;
  nbAjournes: number;
  nbPublies:  number;
  semStatut:  string;
}

export const DECISION_LABEL: Record<string, string> = {
  admis:            'Admis',
  'ajourné':        'Ajourné',
  redoublant:       'Redoublant',
  exclus:           'Exclus',
  mention_speciale: 'Mention spéciale',
};

export const DECISION_COLOR: Record<string, string> = {
  admis:            'green',
  'ajourné':        'amber',
  redoublant:       'red',
  exclus:           'gray',
  mention_speciale: 'purple',
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
