// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
//  referentiel.service.ts — Couche données Référentiel académique Sprint 2
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { getOrFetch, invalidate } from './cache';
import type {
  Programme, UniteEnseignement, Semestre, MatiereLMD,
  AnneeAcademique, ProgrammeUE,
} from '../types/referentiel.types';

// ── Programmes ────────────────────────────────────────────────────────────────

export async function fetchProgrammes(ecoleId: string): Promise<Programme[]> {
  return getOrFetch(`programmes:${ecoleId}`, async () => {
    // RPC SECURITY DEFINER — contourne RLS
    const { data, error } = await supabase
      .rpc('fn_get_programmes_lmd', { p_ecole_id: ecoleId });
    if (error) throw error;
    return data ?? [];
  });
}

export async function createProgramme(
  payload: Omit<Programme, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('programmes_lmd').insert(payload);
  if (error) throw error;
  invalidate(`programmes:${payload.ecole_id}`);
}

export async function updateProgramme(
  id: string,
  payload: Partial<Omit<Programme, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('programmes_lmd')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
  invalidate('programmes:');
}

export async function deleteProgramme(id: string): Promise<void> {
  const { error } = await supabase
    .from('programmes_lmd')
    .delete()
    .eq('id', id);
  if (error) throw error;
  invalidate('programmes:');
}

// ── Unités d'Enseignement ─────────────────────────────────────────────────────

export async function fetchUEs(ecoleId: string): Promise<UniteEnseignement[]> {
  return getOrFetch(`ues:${ecoleId}`, async () => {
    // RPC SECURITY DEFINER — contourne RLS
    const { data, error } = await supabase.rpc('fn_dashboard_ues', { p_ecole_id: ecoleId });
    if (error) throw error;
    return data ?? [];
  });
}

export async function fetchUEsByProgramme(programmeId: string): Promise<ProgrammeUE[]> {
  const { data, error } = await supabase
    .from('programme_ue')
    .select('*, unites_enseignement(*), semestres(libelle,niveau)')
    .eq('programme_id', programmeId);
  if (error) throw error;
  return data ?? [];
}

export async function createUE(
  payload: Omit<UniteEnseignement, 'id' | 'created_at'>,
  programmeId?: string
): Promise<void> {
  const { data: newUE, error } = await supabase
    .from('unites_enseignement')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  if (programmeId && newUE?.id) {
    const { error: linkErr } = await supabase
      .from('programme_ue')
      .insert({ programme_id: programmeId, ue_id: newUE.id, ecole_id: payload.ecole_id });
    if (linkErr) console.warn('Lien programme_ue non créé :', linkErr.message);
  }
  invalidate(`ues:${payload.ecole_id}`);
}

export async function updateUE(
  id: string,
  payload: Partial<Omit<UniteEnseignement, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('unites_enseignement')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
  invalidate('ues:');
}

export async function deleteUE(id: string): Promise<void> {
  const { error } = await supabase
    .from('unites_enseignement')
    .delete()
    .eq('id', id);
  if (error) throw error;
  invalidate('ues:');
}

// ── Semestres ─────────────────────────────────────────────────────────────────

export async function fetchSemestres(ecoleId: string): Promise<Semestre[]> {
  return getOrFetch(`semestres:${ecoleId}`, async () => {
    // RPC SECURITY DEFINER — contourne RLS
    const { data, error } = await supabase
      .rpc('fn_get_semestres', { p_ecole_id: ecoleId });
    if (error) throw error;
    return data ?? [];
  });
}

export async function fetchSemestresActifs(ecoleId: string): Promise<Semestre[]> {
  const data = await fetchSemestres(ecoleId);
  return data.filter((s: any) => ['en_cours', 'planifie'].includes(s.statut));
}

export async function createSemestre(
  payload: Omit<Semestre, 'id' | 'created_at' | 'programmes_lmd' | 'annees_academiques'>
): Promise<void> {
  const { error } = await supabase.from('semestres').insert(payload);
  if (error) throw error;
  invalidate(`semestres:${payload.ecole_id}`);
}

export async function updateSemestre(
  id: string,
  payload: Partial<Omit<Semestre, 'id' | 'created_at' | 'programmes_lmd' | 'annees_academiques'>>
): Promise<void> {
  const { error } = await supabase
    .from('semestres')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
  invalidate('semestres:');
}

export async function deleteSemestre(id: string): Promise<void> {
  const { error } = await supabase
    .from('semestres')
    .delete()
    .eq('id', id);
  if (error) throw error;
  invalidate('semestres:');
}

// ── Matières ──────────────────────────────────────────────────────────────────

export async function fetchMatieresByUE(ueId: string): Promise<MatiereLMD[]> {
  const { data, error } = await supabase
    .from('matieres_lmd')
    .select('*, enseignants(nom,prenom)')
    .eq('ue_id', ueId)
    .order('code');
  if (error) throw error;
  return data ?? [];
}

export async function createMatiere(
  payload: Omit<MatiereLMD, 'id' | 'enseignants'>
): Promise<void> {
  const { error } = await supabase.from('matieres_lmd').insert(payload);
  if (error) throw error;
}

export async function updateMatiere(
  id: string,
  payload: Partial<Omit<MatiereLMD, 'id' | 'enseignants'>>
): Promise<void> {
  const { error } = await supabase
    .from('matieres_lmd')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteMatiere(id: string): Promise<void> {
  const { error } = await supabase
    .from('matieres_lmd')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Années académiques ────────────────────────────────────────────────────────

export async function fetchAnneesAcademiques(ecoleId: string): Promise<AnneeAcademique[]> {
  // RPC SECURITY DEFINER — contourne RLS
  const { data, error } = await supabase
    .rpc('fn_get_annees_academiques', { p_ecole_id: ecoleId });
  if (error) throw error;
  return data ?? [];
}

// ── Validation crédits CAMES ──────────────────────────────────────────────────

export interface CreditCheck {
  totalCredits: number;
  valid: boolean;
  delta: number; // positif = excès, négatif = manque
}

export function checkCreditsUE(
  ues: UniteEnseignement[],
  expectedTotal = 30
): CreditCheck {
  const totalCredits = ues.reduce((sum, ue) => sum + (ue.credits_cect ?? 0), 0);
  return { totalCredits, valid: totalCredits === expectedTotal, delta: totalCredits - expectedTotal };
}


