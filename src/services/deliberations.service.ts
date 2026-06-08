// src/services/deliberations.service.ts
import { supabase } from './supabase';
import type { LigneDelib, DecisionJury } from '../types/deliberations.types';

const RELEVE_FN_URL = `https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/publish-releve`;

function releveHeaders(): Record<string, string> {
  const session = (supabase as any).auth?.session?.();
  const token = session?.access_token
    ?? (supabase as any)._session?.access_token
    ?? '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ── Charger lignes délibération ───────────────────────────────────────────────
export async function fetchLignesDelib(
  semId: string, ecoleId: string
): Promise<LigneDelib[]> {
  const [{ data: ins }, { data: cache }, { data: releves }] = await Promise.all([
    supabase
      .from('inscriptions_semestre')
      .select('etudiant_id, etudiants(id,nom,prenom,matricule,filiere)')
      .eq('semestre_id', semId)
      .eq('statut', 'active'),
    supabase
      .from('resultats_cache')
      .select('etudiant_id,moyenne_semestre,credits_valides,mention,decision,semestre_valide')
      .eq('semestre_id', semId)
      .eq('ecole_id', ecoleId),
    supabase
      .from('releves_notes')
      .select('etudiant_id,verrouille')
      .eq('semestre_id', semId),
  ]);

  const cacheMap: Record<string, any> = {};
  (cache ?? []).forEach((c: any) => { cacheMap[c.etudiant_id] = c; });
  const releveMap: Record<string, any> = {};
  (releves ?? []).forEach((r: any) => { releveMap[r.etudiant_id] = r; });

  return ((ins ?? [])
    .map((i: any) => i.etudiants)
    .filter(Boolean) as any[])
    .sort((a: any, b: any) => a.nom.localeCompare(b.nom))
    .map((et: any) => {
      const c = cacheMap[et.id];
      const r = releveMap[et.id];
      return {
        etudiant_id:       et.id,
        nom:               et.nom,
        prenom:            et.prenom,
        matricule:         et.matricule ?? '—',
        filiere:           et.filiere ?? '—',
        moyenne_semestre:  c?.moyenne_semestre ?? null,
        credits_valides:   c?.credits_valides ?? 0,
        mention:           c?.mention ?? null,
        decision:          c?.decision ?? null,
        decision_jury:     null, // pas encore de champ override — extensible
        semestre_valide:   c?.semestre_valide ?? false,
        releve_publie:     !!r,
        releve_verrouille: !!r?.verrouille,
      } as LigneDelib;
    });
}

// ── Override décision jury ────────────────────────────────────────────────────
export async function ajusterDecisionJury(
  etudiantId: string, semId: string, ecoleId: string,
  decision: DecisionJury
): Promise<void> {
  const semestre_valide = decision === 'admis' || decision === 'mention_speciale';
  const { error } = await supabase.from('resultats_cache').upsert({
    etudiant_id: etudiantId, semestre_id: semId, ecole_id: ecoleId,
    decision, semestre_valide,
  }, { onConflict: 'etudiant_id,semestre_id' });
  if (error) throw error;
}

// ── Clôturer semestre ─────────────────────────────────────────────────────────
export async function cloturerSemestre(semId: string): Promise<void> {
  const { error } = await supabase
    .from('semestres').update({ statut: 'cloture' }).eq('id', semId);
  if (error) throw error;
  // Clôturer toutes les sessions d'évaluation
  await supabase
    .from('sessions_evaluation')
    .update({ statut: 'close' })
    .eq('semestre_id', semId);
}

// ── Publier relevé individuel ─────────────────────────────────────────────────
export async function publierReleve(
  etudiantId: string, semId: string,
  options: { republish?: boolean; sendEmail?: boolean } = {}
): Promise<{ success: boolean; blocked?: boolean; error?: string }> {
  const { data: session } = await supabase
    .from('sessions_evaluation')
    .select('id')
    .eq('semestre_id', semId)
    .eq('type_session', 'normale')
    .single();

  try {
    const res = await fetch(RELEVE_FN_URL, {
      method: 'POST',
      headers: releveHeaders(),
      body: JSON.stringify({
        etudiant_id: etudiantId, semestre_id: semId,
        session_id: session?.id,
        mode: 'publish',
        sendEmail: options.sendEmail ?? true,
        republish: options.republish ?? false,
      }),
    });
    const data = await res.json();
    return data.success ? { success: true } : { success: false, blocked: data.blocked, error: data.error };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Publier tous les relevés ──────────────────────────────────────────────────
export async function publierTousReleves(
  semId: string, lignes: LigneDelib[], sendEmail: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: number; blocked: number; failed: number }> {
  const nonPublies = lignes.filter(l => !l.releve_publie);
  let ok = 0, blocked = 0, failed = 0;
  for (let i = 0; i < nonPublies.length; i++) {
    const r = await publierReleve(nonPublies[i].etudiant_id, semId, { sendEmail });
    if (r.success) ok++;
    else if (r.blocked) blocked++;
    else failed++;
    onProgress?.(i + 1, nonPublies.length);
  }
  return { ok, blocked, failed };
}

// ── Verrouiller / déverrouiller relevé ───────────────────────────────────────
export async function basculerVerrouReleve(
  etudiantId: string, semId: string, mode: 'lock' | 'unlock'
): Promise<void> {
  const { data: session } = await supabase
    .from('sessions_evaluation')
    .select('id')
    .eq('semestre_id', semId)
    .eq('type_session', 'normale')
    .single();

  const res = await fetch(RELEVE_FN_URL, {
    method: 'POST',
    headers: releveHeaders(),
    body: JSON.stringify({
      etudiant_id: etudiantId, semestre_id: semId,
      session_id: session?.id, mode,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Erreur inconnue');
}

// ── Statut du semestre ────────────────────────────────────────────────────────
export async function fetchSemestreStatut(semId: string): Promise<string> {
  const { data } = await supabase
    .from('semestres').select('statut').eq('id', semId).single();
  return data?.statut ?? 'planifie';
}
