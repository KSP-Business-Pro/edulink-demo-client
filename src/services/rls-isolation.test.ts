// src/services/rls-isolation.test.ts
// Test d'INTEGRATION (pas unitaire) - verifie en conditions reelles que RLS
// bloque bien tout acces anonyme aux tables sensibles. Lecture seule, aucune
// mutation de donnees. Necessite un reseau et les variables d'environnement
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (deja utilisees par l'app).

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Client minimal, sans Realtime, pour ce test d'isolation en lecture seule.
const anonClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Tables portant des donnees academiques, financieres ou personnelles -
// aucune ne doit jamais etre lisible sans authentification.
const TABLES_SENSIBLES = [
  'etudiants',
  'notes_lmd',
  'factures',
  'utilisateurs',
  'releves_notes',
  'audit_log',
  'notes_historique',
];

describe('Isolation RLS - acces anonyme (sans authentification)', () => {
  it.each(TABLES_SENSIBLES)(
    "la table '%s' ne retourne aucune ligne pour un client anonyme",
    async (table) => {
      const { data, error } = await anonClient.from(table).select('*').limit(1);
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    },
    15000,
  );
});

describe('Isolation RLS - portail public (acces volontairement ouvert)', () => {
  it("la table 'actualites' reste accessible en lecture pour le portail public (comportement attendu)", async () => {
    const { error } = await anonClient.from('actualites').select('*').limit(1);
    expect(error).toBeFalsy();
  });
});