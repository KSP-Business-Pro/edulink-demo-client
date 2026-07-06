// src/services/saisie.service.test.ts
// Tests unitaires — calculerLigneGrille (moteur de calcul LMD utilise dans /saisie-notes)

import { describe, it, expect } from 'vitest';
import { calculerLigneGrille, parseCSV } from './lmd/saisie.calc';
import type { Evaluation, EtudiantSaisie, NoteLMD } from '../types/saisie.types';

// -- Fixtures ----------------------------------------------------------------
const etudiant: EtudiantSaisie = {
  id: 'etu-1',
  nom: 'AGBODEKA',
  prenom: 'Jean',
  matricule: 'hemec-AUD-0006',
};

function evalCC(id: string, ponderation: number): Evaluation {
  return {
    id, matiere_id: 'mat-1', session_id: 'sess-1', ecole_id: 'ecole-1',
    categorie: 'CC', format: 'ecrit', intitule: `CC ${id}`, ponderation,
  };
}

function evalEx(id: string): Evaluation {
  return {
    id, matiere_id: 'mat-1', session_id: 'sess-1', ecole_id: 'ecole-1',
    categorie: 'EXAMEN', format: 'ecrit', intitule: `EX ${id}`, ponderation: 1.0,
  };
}

function note(etuId: string, evalId: string, valeur: number | null, absent = false): NoteLMD {
  return {
    etudiant_id: etuId, evaluation_id: evalId, session_id: 'sess-1',
    ecole_id: 'ecole-1', valeur, absent,
  };
}

function buildNotesMap(notes: NoteLMD[]): Record<string, Record<string, NoteLMD>> {
  const map: Record<string, Record<string, NoteLMD>> = {};
  for (const n of notes) {
    map[n.etudiant_id] ??= {};
    map[n.etudiant_id][n.evaluation_id] = n;
  }
  return map;
}

describe('calculerLigneGrille', () => {
  it('calcule la moyenne CC ponderee quand deux evaluations CC sont notees', () => {
    const cc1 = evalCC('cc1', 0.4);
    const cc2 = evalCC('cc2', 0.6);
    const notesMap = buildNotesMap([
      note('etu-1', 'cc1', 12),
      note('etu-1', 'cc2', 16),
    ]);
    const res = calculerLigneGrille(etudiant, [cc1, cc2], [], notesMap, 0.4, 0.6);
    expect(res.moyCC).toBeCloseTo(14.4, 2);
    expect(res.finale).toBeCloseTo(14.4, 2);
  });

  it('combine moyCC et moyEX selon les poids UE quand les deux existent', () => {
    const cc1 = evalCC('cc1', 1.0);
    const ex1 = evalEx('ex1');
    const notesMap = buildNotesMap([
      note('etu-1', 'cc1', 10),
      note('etu-1', 'ex1', 16),
    ]);
    const res = calculerLigneGrille(etudiant, [cc1], [ex1], notesMap, 0.4, 0.6);
    expect(res.moyCC).toBe(10);
    expect(res.finale).toBeCloseTo(13.6, 2);
  });

  it("retourne finale = moyEX quand il n'y a aucune evaluation CC", () => {
    const ex1 = evalEx('ex1');
    const notesMap = buildNotesMap([note('etu-1', 'ex1', 15)]);
    const res = calculerLigneGrille(etudiant, [], [ex1], notesMap, 0.4, 0.6);
    expect(res.moyCC).toBeNull();
    expect(res.finale).toBe(15);
  });

  it("retourne moyCC et finale = null tant qu'une note CC manque", () => {
    const cc1 = evalCC('cc1', 0.5);
    const cc2 = evalCC('cc2', 0.5);
    const notesMap = buildNotesMap([note('etu-1', 'cc1', 12)]);
    const res = calculerLigneGrille(etudiant, [cc1, cc2], [], notesMap, 0.4, 0.6);
    expect(res.moyCC).toBeNull();
    expect(res.finale).toBeNull();
  });

  it('traite un etudiant absent a une evaluation CC comme une note de 0 (comportement actuel)', () => {
    const cc1 = evalCC('cc1', 1.0);
    const notesMap = buildNotesMap([note('etu-1', 'cc1', 0, true)]);
    const res = calculerLigneGrille(etudiant, [cc1], [], notesMap, 0.4, 0.6);
    expect(res.absentsCC).toEqual([true]);
    expect(res.moyCC).toBe(0);
    expect(res.finale).toBe(0);
  });

  it("retourne moyCC et finale = null si aucune note n'a encore ete saisie", () => {
    const cc1 = evalCC('cc1', 1.0);
    const notesMap = buildNotesMap([]);
    const res = calculerLigneGrille(etudiant, [cc1], [], notesMap, 0.4, 0.6);
    expect(res.moyCC).toBeNull();
    expect(res.finale).toBeNull();
  });
});

describe('parseCSV', () => {
  it('parse un CSV separe par virgules avec en-tetes Matricule/Note', () => {
    const csv = 'Matricule,Note\nhemec-AUD-0006,15.87\nhemec-AUD-0009,11.11';
    const rows = parseCSV(csv);
    expect(rows).toEqual([
      { matricule: 'hemec-AUD-0006', note: 15.87 },
      { matricule: 'hemec-AUD-0009', note: 11.11 },
    ]);
  });

  it('parse un CSV separe par points-virgules', () => {
    const csv = 'Matricule;Note\nhemec-AUD-0006;12';
    const rows = parseCSV(csv);
    expect(rows).toEqual([{ matricule: 'hemec-AUD-0006', note: 12 }]);
  });

  it('reconnait les en-tetes alternatifs (mark, valeur) insensibles a la casse', () => {
    const csv = 'MATRICULE,VALEUR\nhemec-AUD-0006,10';
    const rows = parseCSV(csv);
    expect(rows).toEqual([{ matricule: 'hemec-AUD-0006', note: 10 }]);
  });

  it('rejette une ligne avec une note non numerique', () => {
    const csv = 'Matricule,Note\nhemec-AUD-0006,abc\nhemec-AUD-0009,12';
    const rows = parseCSV(csv);
    expect(rows).toEqual([{ matricule: 'hemec-AUD-0009', note: 12 }]);
  });

  it('rejette une note negative ou superieure a 20', () => {
    const csv = 'Matricule,Note\nhemec-AUD-0001,-5\nhemec-AUD-0002,25\nhemec-AUD-0003,20\nhemec-AUD-0004,0';
    const rows = parseCSV(csv);
    expect(rows).toEqual([
      { matricule: 'hemec-AUD-0003', note: 20 },
      { matricule: 'hemec-AUD-0004', note: 0 },
    ]);
  });

  it('rejette une ligne avec un matricule vide', () => {
    const csv = 'Matricule,Note\n,15\nhemec-AUD-0006,12';
    const rows = parseCSV(csv);
    expect(rows).toEqual([{ matricule: 'hemec-AUD-0006', note: 12 }]);
  });

  it('supprime les espaces autour du matricule', () => {
    const csv = 'Matricule,Note\n  hemec-AUD-0006  ,15';
    const rows = parseCSV(csv);
    expect(rows).toEqual([{ matricule: 'hemec-AUD-0006', note: 15 }]);
  });

  it('leve une erreur si les colonnes Matricule/Note sont introuvables', () => {
    const csv = 'Nom,Prenom\nAGBODEKA,Jean';
    expect(() => parseCSV(csv)).toThrow('Colonnes Matricule/Note introuvables dans le CSV');
  });
});