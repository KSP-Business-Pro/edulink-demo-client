// src/services/saisie.service.test.ts
// Tests unitaires — calculerLigneGrille (moteur de calcul LMD utilise dans /saisie-notes)

import { describe, it, expect } from 'vitest';
import { calculerLigneGrille } from './saisie.service';
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