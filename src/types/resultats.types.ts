// src/types/resultats.types.ts

export interface ResultatCache {
  etudiant_id: string;
  semestre_id: string;
  ecole_id: string;
  credits_valides: number;
  semestre_valide: boolean;
  moyenne_semestre: number | null;
  mention: string | null;
  decision: string | null;
}

export interface UEResultat {
  ue_id: string;
  ue_code: string;
  ue_intitule: string;
  type_ue: string;
  obligatoire: boolean;
  ue_credits: number;
  credits_acquis: number;
  moyenne_ue: number | null;
  ue_validee: boolean;
  est_exclu: boolean;
  poids_cc: number;
  poids_examen: number;
  compensee?: boolean;
}

export interface ReglesEcole {
  seuil_validation_ue: number;
  note_plancher_active: boolean;
  seuil_note_plancher: number;
  compensation_active: boolean;
  regle_rattrapage: 'max' | 'ecrase';
}

export interface EtudiantResultat {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  filiere: string;
}

export interface LigneResultat {
  etudiant: EtudiantResultat;
  cache: ResultatCache | null;
}

export interface RattrapageRow {
  etudiant: EtudiantResultat;
  cacheNormal: ResultatCache | null;
  hasRattNotes: boolean;
  rattNbUE: number;
  decisionFinale: string | null;
}

export type TabResultat = 'semestre' | 'rattrapage';

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
