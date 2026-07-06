// src/services/permissions.test.ts
// Tests de securite - matrice de permissions par role (B13)
// Objectif : garantir l'isolation des privileges (moindre privilege, fail-safe
// par defaut) plutot que de dupliquer la matrice ligne par ligne.

import { describe, it, expect } from 'vitest';
import { getPermissions, can, getVisibleModules } from './permissions';
import type { Permissions } from './permissions';
import type { UserRole } from '../types/auth.types';

const TOUS_LES_ROLES: UserRole[] = [
  'admin', 'direction', 'scolarite', 'enseignant', 'comptable', 'etudiant', 'parent', 'anon',
];

describe('anon - aucune permission', () => {
  it("n'accorde aucun droit vrai pour le role anon", () => {
    const p = getPermissions('anon');
    const permissionsVraies = Object.values(p).filter(v => v === true);
    expect(permissionsVraies).toHaveLength(0);
  });

  it('ne rend visible aucun module pour anon', () => {
    expect(getVisibleModules('anon')).toEqual([]);
  });
});

describe('role inconnu - repli securise (fail-safe)', () => {
  it("retombe sur les permissions d'anon si le role n'existe pas dans la matrice", () => {
    const p = getPermissions('role_invalide_qui_n_existe_pas' as UserRole);
    const permissionsVraies = Object.values(p).filter(v => v === true);
    expect(permissionsVraies).toHaveLength(0);
  });

  it("can() retourne false pour un role inconnu, quelle que soit l'action", () => {
    expect(can('role_invalide' as UserRole, 'gerer_utilisateurs')).toBe(false);
    expect(can('role_invalide' as UserRole, 'voir_toutes_ecoles')).toBe(false);
  });
});

describe('isolation superadmin - voir_toutes_ecoles', () => {
  it('seul le role admin a voir_toutes_ecoles = true', () => {
    const rolesAvecAcces = TOUS_LES_ROLES.filter(r => getPermissions(r).voir_toutes_ecoles);
    expect(rolesAvecAcces).toEqual(['admin']);
  });

  it('seul le role admin voit le module dashboard-reseau', () => {
    const rolesAvecDashboardReseau = TOUS_LES_ROLES.filter(r =>
      getVisibleModules(r).includes('dashboard-reseau')
    );
    expect(rolesAvecDashboardReseau).toEqual(['admin']);
  });
});

describe('gestion des utilisateurs - action sensible', () => {
  it('seul le role admin peut gerer les utilisateurs (gerer_utilisateurs)', () => {
    const rolesAvecAcces = TOUS_LES_ROLES.filter(r => getPermissions(r).gerer_utilisateurs);
    expect(rolesAvecAcces).toEqual(['admin']);
  });
});

describe('verrouillage des releves - coherence avec B12.3', () => {
  it('admin, direction et scolarite ont verrouiller_releves = true, aucun autre role', () => {
    const rolesAvecAcces = TOUS_LES_ROLES.filter(r => getPermissions(r).verrouiller_releves).sort();
    expect(rolesAvecAcces).toEqual(['admin', 'direction', 'scolarite'].sort());
  });

  it('enseignant ne peut ni publier ni verrouiller de releves', () => {
    const p = getPermissions('enseignant');
    expect(p.publier_releves).toBe(false);
    expect(p.verrouiller_releves).toBe(false);
  });
});

describe('roles externes (etudiant, parent) - acces minimal en lecture', () => {
  const CHAMPS_AUTORISES: (keyof Permissions)[] = ['voir_releves'];

  it.each(['etudiant', 'parent'] as UserRole[])(
    "le role %s n'a aucune permission vraie en dehors de voir_releves",
    (role) => {
      const p = getPermissions(role);
      const permissionsVraies = (Object.keys(p) as (keyof Permissions)[])
        .filter(k => p[k] === true);
      expect(permissionsVraies).toEqual(CHAMPS_AUTORISES);
    }
  );
});

describe('comptable - perimetre financier uniquement', () => {
  it("n'a pas acces aux notes, resultats ou deliberations", () => {
    const p = getPermissions('comptable');
    expect(p.voir_saisie_notes).toBe(false);
    expect(p.voir_resultats).toBe(false);
    expect(p.voir_deliberations).toBe(false);
    expect(p.modifier_notes).toBe(false);
  });

  it('a bien acces a la comptabilite et a la validation des paiements', () => {
    const p = getPermissions('comptable');
    expect(p.voir_comptabilite).toBe(true);
    expect(p.valider_paiements).toBe(true);
  });
});

describe('can() - coherence avec getPermissions()', () => {
  it("can() reflete exactement la valeur de getPermissions() pour chaque role et action", () => {
    const actions: (keyof Permissions)[] = [
      'gerer_utilisateurs', 'voir_toutes_ecoles', 'modifier_notes', 'supprimer_etudiant',
    ];
    for (const role of TOUS_LES_ROLES) {
      const p = getPermissions(role);
      for (const action of actions) {
        expect(can(role, action)).toBe(p[action]);
      }
    }
  });
});

describe("suppression d'etudiant - action destructive", () => {
  it('aucun role autre que admin ne peut supprimer un etudiant', () => {
    const rolesAvecAcces = TOUS_LES_ROLES.filter(r => getPermissions(r).supprimer_etudiant);
    expect(rolesAvecAcces).toEqual(['admin']);
  });
});