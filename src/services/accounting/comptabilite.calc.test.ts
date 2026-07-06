// src/services/accounting/comptabilite.calc.test.ts
// Tests unitaires - fmt et grouperParEtudiant (comptabilite)

import { describe, it, expect } from 'vitest';
import { fmt, grouperParEtudiant } from './comptabilite.calc';
import type { Facture } from '../comptabilite.service';

function facture(overrides: Partial<Facture> & { etudiant_id: string }): Facture {
  return {
    id: 'fact-' + Math.random().toString(36).slice(2),
    ecole_id: 'ecole-1',
    type_frais: 'scolarite',
    libelle: 'Scolarite',
    reference: null,
    montant_total: 0,
    montant: null,
    montant_paye: 0,
    statut: 'en_attente',
    annee_scolaire: '2025-2026',
    trimestre: null,
    date_echeance: null,
    mode_paiement: null,
    grille_tarifaire_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('fmt', () => {
  it('formate un montant avec separateur de milliers et suffixe FCFA', () => {
    expect(fmt(1500)).toMatch(/^1\s500 FCFA$/);
  });

  it('arrondit les montants decimaux', () => {
    expect(fmt(1500.6)).toMatch(/^1\s501 FCFA$/);
    expect(fmt(1500.4)).toMatch(/^1\s500 FCFA$/);
  });

  it('gere un montant nul', () => {
    expect(fmt(0)).toBe('0 FCFA');
  });

  it("n'ajoute pas de separateur sous 1000", () => {
    expect(fmt(999)).toBe('999 FCFA');
  });

  it('gere les montants a sept chiffres (deux separateurs)', () => {
    expect(fmt(1000000)).toMatch(/^1\s000\s000 FCFA$/);
  });
});

describe('grouperParEtudiant', () => {
  it('regroupe plusieurs factures du meme etudiant et cumule attendu/encaisse', () => {
    const factures = [
      facture({ etudiant_id: 'etu-1', montant_total: 50000, montant_paye: 20000 }),
      facture({ etudiant_id: 'etu-1', montant_total: 30000, montant_paye: 30000 }),
    ];
    const res = grouperParEtudiant(factures);
    expect(res).toHaveLength(1);
    expect(res[0].attendu).toBe(80000);
    expect(res[0].encaisse).toBe(50000);
    expect(res[0].factures).toHaveLength(2);
  });

  it('trie par solde du decroissant (attendu - encaisse), pas par montant brut', () => {
    const factures = [
      facture({ etudiant_id: 'etu-petit-solde', montant_total: 100000, montant_paye: 95000 }),
      facture({ etudiant_id: 'etu-gros-solde', montant_total: 60000, montant_paye: 0 }),
    ];
    const res = grouperParEtudiant(factures);
    expect(res.map(e => e.factures[0].etudiant_id)).toEqual(['etu-gros-solde', 'etu-petit-solde']);
  });

  it('utilise montant en repli quand montant_total est absent (0)', () => {
    const factures = [
      facture({ etudiant_id: 'etu-1', montant_total: 0, montant: 15000, montant_paye: 5000 }),
    ];
    const res = grouperParEtudiant(factures);
    expect(res[0].attendu).toBe(15000);
  });

  it('retourne un tableau vide pour une liste de factures vide', () => {
    expect(grouperParEtudiant([])).toEqual([]);
  });

  it("conserve l'objet etudiants de la premiere facture rencontree pour un etudiant donne", () => {
    const etu = { id: 'etu-1', nom: 'AGBODEKA', prenom: 'Jean', matricule: 'M1', filiere: 'Audit', niveau: 'L3' };
    const factures = [
      facture({ etudiant_id: 'etu-1', etudiants: etu, montant_total: 10000, montant_paye: 0 }),
      facture({ etudiant_id: 'etu-1', montant_total: 5000, montant_paye: 5000 }),
    ];
    const res = grouperParEtudiant(factures);
    expect(res[0].etudiant).toEqual(etu);
  });
});