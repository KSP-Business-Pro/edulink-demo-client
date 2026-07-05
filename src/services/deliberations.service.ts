// src/services/deliberations.service.ts
// B4.2 — decision_jury, PV délibération, recalcul, stats avancées, export Excel

import { supabase } from './supabase';
import type {
  LigneDelib, DecisionJury, PVDelib, StatsDelib, StatutDelib,
} from '../types/deliberations.types';

const RELEVE_FN_URL = `https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/publish-releve`;

async function getReleveToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

function releveHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ── Charger lignes délibération ────────────────────────────────────────────
export async function fetchLignesDelib(
  semId: string, ecoleId: string,
): Promise<LigneDelib[]> {
  const [{ data: ins }, { data: cache }, { data: releves }] = await Promise.all([
    supabase
      .from('inscriptions_semestre')
      .select('etudiant_id, etudiants(id,nom,prenom,matricule,filiere)')
      .eq('semestre_id', semId)
      .eq('statut', 'active'),
    supabase
      .from('resultats_cache')
      .select('etudiant_id,moyenne_semestre,credits_valides,mention,decision,decision_jury,note_jury,semestre_valide')
      .eq('semestre_id', semId)
      .eq('ecole_id', ecoleId),
    supabase
      .from('releves_notes')
      .select('etudiant_id,verrouille')
      .eq('semestre_id', semId),
  ]);

  const cacheMap: Record<string, Record<string, unknown>> = {};
  (cache ?? []).forEach((c: Record<string, unknown>) => {
    cacheMap[c.etudiant_id as string] = c;
  });
  const releveMap: Record<string, Record<string, unknown>> = {};
  (releves ?? []).forEach((r: Record<string, unknown>) => {
    releveMap[r.etudiant_id as string] = r;
  });

  return ((ins ?? []) as Record<string, unknown>[])
    .map(i => i.etudiants as Record<string, unknown>)
    .filter(Boolean)
    .sort((a, b) => (a.nom as string).localeCompare(b.nom as string))
    .map(et => {
      const c = cacheMap[et.id as string];
      const r = releveMap[et.id as string];
      return {
        etudiant_id:      et.id as string,
        nom:              et.nom as string,
        prenom:           et.prenom as string,
        matricule:        (et.matricule as string) ?? '—',
        filiere:          (et.filiere as string) ?? '—',
        moyenne_semestre: (c?.moyenne_semestre as number) ?? null,
        credits_valides:  (c?.credits_valides as number) ?? 0,
        mention:          (c?.mention as string) ?? null,
        decision:         (c?.decision as DecisionJury) ?? null,
        decision_jury:    (c?.decision_jury as DecisionJury) ?? null,
        note_jury:        (c?.note_jury as string) ?? null,
        semestre_valide:  (c?.semestre_valide as boolean) ?? false,
        releve_publie:    !!r,
        releve_verrouille: !!(r?.verrouille),
      } as LigneDelib;
    });
}

// ── Override décision jury ─────────────────────────────────────────────────
export async function ajusterDecisionJury(
  etudiantId: string, semId: string, ecoleId: string,
  decision:   DecisionJury, noteJury?: string,
): Promise<void> {
  const semestre_valide = decision === 'admis' || decision === 'mention_speciale';
  const payload: Record<string, unknown> = {
    etudiant_id:   etudiantId,
    semestre_id:   semId,
    ecole_id:      ecoleId,
    decision_jury: decision,
    decision,
    semestre_valide,
    derniere_maj:  new Date().toISOString(),
  };
  if (noteJury !== undefined) payload.note_jury = noteJury;

  const { error } = await supabase.from('resultats_cache').upsert(payload, {
    onConflict: 'etudiant_id,semestre_id',
  });
  if (error) throw new Error(error.message);
}

// ── Recalcul résultats semestre ────────────────────────────────────────────
export async function recalculerResultats(
  semId: string, ecoleId: string,
): Promise<{ ok: number; erreurs: number }> {
  const { data, error } = await supabase.rpc('fn_recalcul_semestre', {
    p_semestre_id: semId,
    p_ecole_id:    ecoleId,
  });
  if (error) throw new Error(error.message);
  return data as { ok: number; erreurs: number };
}

// ── Stats délibération ─────────────────────────────────────────────────────
export async function fetchStatsDelib(
  semId: string, ecoleId: string,
): Promise<StatsDelib> {
  const { data, error } = await supabase.rpc('fn_stats_deliberation', {
    p_semestre_id: semId,
    p_ecole_id:    ecoleId,
  });
  if (error) throw new Error(error.message);
  return data as StatsDelib;
}

// ── PV Délibération ────────────────────────────────────────────────────────
export async function fetchPV(
  semId: string, ecoleId: string,
): Promise<PVDelib | null> {
  const { data } = await supabase
    .from('deliberations')
    .select('*')
    .eq('semestre_id', semId)
    .eq('ecole_id', ecoleId)
    .maybeSingle();
  return data as PVDelib | null;
}

export async function upsertPV(payload: {
  ecoleId:          string;
  semestreId:       string;
  dateDeliberation: string;
  presidentJury:    string;
  membresJury:      string[];
  observations:     string;
}): Promise<void> {
  const { error } = await supabase.from('deliberations').upsert({
    ecole_id:          payload.ecoleId,
    semestre_id:       payload.semestreId,
    date_deliberation: payload.dateDeliberation,
    president_jury:    payload.presidentJury,
    membres_jury:      payload.membresJury,
    observations:      payload.observations,
    statut:            'brouillon',
  }, { onConflict: 'ecole_id,semestre_id' });
  if (error) throw new Error(error.message);
}

export async function validerPV(
  semId: string, ecoleId: string,
): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('deliberations')
    .update({
      statut:    'valide',
      valide_le: new Date().toISOString(),
      valide_par: user.user?.id,
    })
    .eq('semestre_id', semId)
    .eq('ecole_id', ecoleId);
  if (error) throw new Error(error.message);
}

// ── Clôturer semestre ──────────────────────────────────────────────────────
export async function cloturerSemestre(semId: string): Promise<void> {
  const { error } = await supabase
    .from('semestres').update({ statut: 'cloture' }).eq('id', semId);
  if (error) throw new Error(error.message);
  await supabase
    .from('sessions_evaluation')
    .update({ statut: 'close' })
    .eq('semestre_id', semId);
}

// ── Publier relevé individuel ──────────────────────────────────────────────
export async function publierReleve(
  etudiantId: string, semId: string,
  options: { republish?: boolean; sendEmail?: boolean } = {},
): Promise<{ success: boolean; blocked?: boolean; error?: string }> {
  const { data: session } = await supabase
    .from('sessions_evaluation')
    .select('id')
    .eq('semestre_id', semId)
    .eq('type_session', 'normale')
    .single();

  try {
    const token = await getReleveToken();
    const res = await fetch(RELEVE_FN_URL, {
      method: 'POST',
      headers: releveHeaders(token),
      body: JSON.stringify({
        etudiant_id: etudiantId, semestre_id: semId,
        session_id:  (session as { id: string } | null)?.id,
        mode:        'publish',
        send_email:  options.sendEmail ?? true,
        republish:   options.republish ?? false,
      }),
    });
    const data = await res.json();
    return data.success
      ? { success: true }
      : { success: false, blocked: data.blocked, error: data.error };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}

// ── Publier tous les relevés ───────────────────────────────────────────────
export async function publierTousReleves(
  semId:       string,
  lignes:      LigneDelib[],
  sendEmail:   boolean,
  onProgress?: (done: number, total: number) => void,
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

// ── Verrouiller / déverrouiller relevé ────────────────────────────────────
export async function basculerVerrouReleve(
  etudiantId: string, semId: string, mode: 'lock' | 'unlock',
): Promise<void> {
  const { data: session } = await supabase
    .from('sessions_evaluation')
    .select('id')
    .eq('semestre_id', semId)
    .eq('type_session', 'normale')
    .single();

  const token = await getReleveToken();
  const res = await fetch(RELEVE_FN_URL, {
    method: 'POST',
    headers: releveHeaders(token),
    body: JSON.stringify({
      etudiant_id: etudiantId, semestre_id: semId,
      session_id:  (session as { id: string } | null)?.id,
      mode,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? 'Erreur inconnue');
}

// ── Statut du semestre ─────────────────────────────────────────────────────
export async function fetchSemestreStatut(semId: string): Promise<string> {
  const { data } = await supabase
    .from('semestres').select('statut').eq('id', semId).single();
  return (data as { statut: string } | null)?.statut ?? 'planifie';
}

// ── Export Excel PV ────────────────────────────────────────────────────────
export async function exportPVExcel(
  lignes:      LigneDelib[],
  semLibelle:  string,
  pv:          PVDelib | null,
): Promise<void> {
  const mod  = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm') as Record<string, unknown>;
  const XLSX = (mod.default ?? mod) as {
    utils: {
      aoa_to_sheet: (data: unknown[][]) => unknown;
      book_new: () => unknown;
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    writeFile: (wb: unknown, name: string) => void;
  };

  const headers = [
    'N°', 'Matricule', 'Nom', 'Prénom', 'Filière',
    'Moyenne', 'Crédits', 'Mention', 'Décision calculée',
    'Décision jury', 'Observation jury', 'Relevé publié',
  ];

  const rows = lignes.map((l, i) => [
    i + 1,
    l.matricule,
    l.nom,
    l.prenom ?? '',
    l.filiere,
    l.moyenne_semestre !== null ? Number(l.moyenne_semestre).toFixed(2) : '—',
    l.credits_valides,
    l.mention ?? '—',
    l.decision ?? '—',
    l.decision_jury ?? l.decision ?? '—',
    l.note_jury ?? '',
    l.releve_publie ? 'Oui' : 'Non',
  ]);

  // En-tête PV
  const meta = [
    [`PV DE DÉLIBÉRATION — ${semLibelle.toUpperCase()}`],
    [`Date : ${pv?.date_deliberation ?? new Date().toLocaleDateString('fr-FR')}`],
    [`Président du jury : ${pv?.president_jury ?? '—'}`],
    [`Membres : ${(pv?.membres_jury ?? []).join(', ') || '—'}`],
    [],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...meta, headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PV Délibération');
  XLSX.writeFile(wb, `PV_${semLibelle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}
