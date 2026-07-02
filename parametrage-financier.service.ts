// src/services/parametrage-financier.service.ts
// Bloc 1 comptabilité — Types de frais, grilles tarifaires, échéanciers

import { supabase } from './supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TypeFraisConfig {
  id:          string;
  ecole_id:    string;
  code:        string;
  libelle:     string;
  description: string | null;
  obligatoire: boolean;
  actif:       boolean;
  created_at:  string;
}

export interface GrilleTarifaire {
  id:                  string;
  ecole_id:            string;
  annee_academique_id: string | null;
  programme_id:        string | null;
  niveau:              string | null;
  type_frais_id:       string;
  montant:             number;
  obligatoire:         boolean;
  created_at:          string;
  // Jointures (retournées par fetchGrillesTarifaires)
  types_frais?:         { code: string; libelle: string } | null;
  programmes_lmd?:      { code: string; intitule: string } | null;
  annees_academiques?:  { libelle: string } | null;
}

export interface Echeancier {
  id:                  string;
  ecole_id:            string;
  grille_tarifaire_id: string;
  tranche:             number;
  pourcentage:         number | null;
  montant:             number | null;
  date_echeance:       string | null;
  created_at:          string;
}

// ── Types de frais ────────────────────────────────────────────────────────

export async function fetchTypesFrais(ecoleId: string): Promise<TypeFraisConfig[]> {
  const { data, error } = await supabase
    .from('types_frais')
    .select('*')
    .eq('ecole_id', ecoleId)
    .order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as TypeFraisConfig[];
}

export async function upsertTypeFrais(payload: {
  id?: string; ecole_id: string; code: string; libelle: string;
  description: string | null; obligatoire: boolean; actif: boolean;
}): Promise<void> {
  const { error } = await supabase.from('types_frais').upsert(payload, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteTypeFrais(id: string): Promise<void> {
  const { error } = await supabase.from('types_frais').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error('Ce type de frais est utilisé dans une grille tarifaire — impossible à supprimer. Désactivez-le plutôt.');
    }
    throw new Error(error.message);
  }
}

// ── Grilles tarifaires ───────────────────────────────────────────────────

export async function fetchGrillesTarifaires(ecoleId: string): Promise<GrilleTarifaire[]> {
  const { data, error } = await supabase
    .from('grilles_tarifaires')
    .select('*, types_frais(code,libelle), programmes_lmd(code,intitule), annees_academiques(libelle)')
    .eq('ecole_id', ecoleId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GrilleTarifaire[];
}

export async function upsertGrilleTarifaire(payload: {
  id?: string; ecole_id: string; annee_academique_id: string | null;
  programme_id: string | null; niveau: string | null;
  type_frais_id: string; montant: number; obligatoire: boolean;
}): Promise<string> {
  const { data, error } = await supabase
    .from('grilles_tarifaires').upsert(payload, { onConflict: 'id' })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteGrilleTarifaire(id: string): Promise<void> {
  const { error } = await supabase.from('grilles_tarifaires').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Échéanciers ───────────────────────────────────────────────────────────

export async function fetchEcheanciers(grilleTarifaireId: string): Promise<Echeancier[]> {
  const { data, error } = await supabase
    .from('echeanciers')
    .select('*')
    .eq('grille_tarifaire_id', grilleTarifaireId)
    .order('tranche');
  if (error) throw new Error(error.message);
  return (data ?? []) as Echeancier[];
}

export async function upsertEcheance(payload: {
  id?: string; ecole_id: string; grille_tarifaire_id: string;
  tranche: number; pourcentage: number | null; montant: number | null;
  date_echeance: string | null;
}): Promise<void> {
  const { error } = await supabase.from('echeanciers').upsert(payload, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteEcheance(id: string): Promise<void> {
  const { error } = await supabase.from('echeanciers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Génère un échéancier standard 40/30/30 pour une grille donnée (aide au démarrage rapide). */
export async function genererEcheancierStandard(
  ecoleId: string, grilleTarifaireId: string, montantTotal: number
): Promise<void> {
  const tranches = [
    { tranche: 1, pourcentage: 40, montant: Math.round(montantTotal * 0.4) },
    { tranche: 2, pourcentage: 30, montant: Math.round(montantTotal * 0.3) },
    { tranche: 3, pourcentage: 30, montant: montantTotal - Math.round(montantTotal * 0.4) - Math.round(montantTotal * 0.3) },
  ];
  const { error } = await supabase.from('echeanciers').insert(
    tranches.map(t => ({ ecole_id: ecoleId, grille_tarifaire_id: grilleTarifaireId, ...t, date_echeance: null }))
  );
  if (error) throw new Error(error.message);
}
