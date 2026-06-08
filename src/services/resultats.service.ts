// @ts-nocheck
// src/services/resultats.service.ts
import { supabase } from './supabase';
import type {
  ResultatCache, UEResultat, ReglesEcole, EtudiantResultat,
} from '../types/resultats.types';

// ── Règles école (cachées en module) ─────────────────────────────────────────
let _reglesCache: ReglesEcole | null = null;

export async function getRegles(ecoleId: string): Promise<ReglesEcole> {
  if (_reglesCache) return _reglesCache;
  const { data } = await supabase
    .from('regles_ecole')
    .select('seuil_validation_ue,note_plancher_active,seuil_note_plancher,compensation_active,regle_rattrapage')
    .eq('ecole_id', ecoleId)
    .maybeSingle();
  _reglesCache = {
    seuil_validation_ue:  data?.seuil_validation_ue  ?? 10,
    note_plancher_active: data?.note_plancher_active  ?? false,
    seuil_note_plancher:  data?.seuil_note_plancher   ?? 5,
    compensation_active:  data?.compensation_active   ?? false,
    regle_rattrapage:     data?.regle_rattrapage       ?? 'max',
  };
  return _reglesCache;
}

export function clearReglesCache() { _reglesCache = null; }

// ── Étudiants inscrits ────────────────────────────────────────────────────────
export async function fetchInscrits(semId: string, ecoleId: string): Promise<EtudiantResultat[]> {
  const { data, error } = await supabase
    .from('inscriptions_semestre')
    .select('etudiant_id, etudiants(id,nom,prenom,matricule,filiere)')
    .eq('semestre_id', semId)
    .eq('statut', 'active');
  if (error) throw error;
  return ((data ?? []).map((i: any) => i.etudiants).filter(Boolean) as EtudiantResultat[])
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

// ── Cache résultats ───────────────────────────────────────────────────────────
export async function fetchCache(semId: string, ecoleId: string): Promise<ResultatCache[]> {
  const { data, error } = await supabase
    .from('resultats_cache')
    .select('etudiant_id,credits_valides,semestre_valide,moyenne_semestre,mention,decision')
    .eq('semestre_id', semId)
    .eq('ecole_id', ecoleId);
  if (error) throw error;
  return data ?? [];
}

// ── Calcul un étudiant (port fidèle de _calculerUnEtudiant) ──────────────────
export async function calculerUnEtudiant(
  etudiantId: string, semId: string, ecoleId: string
): Promise<{ ok: boolean }> {
  const regles = await getRegles(ecoleId);
  const { seuil_validation_ue: seuilUE, note_plancher_active: plancherActif,
          seuil_note_plancher: seuilPlancher, compensation_active } = regles;

  // RPC fn_resultats_semestre
  const { data: res, error } = await supabase.rpc('fn_resultats_semestre', {
    p_etudiant_id: etudiantId, p_semestre_id: semId,
  });
  if (error || !res?.length) return { ok: false };

  let ueResults: UEResultat[] = [...res];

  // Note plancher
  if (plancherActif && seuilPlancher > 0) {
    const { data: violations } = await supabase.rpc('fn_check_plancher', {
      p_etudiant_id: etudiantId, p_semestre_id: semId, p_seuil: seuilPlancher,
    });
    if (violations?.length) {
      const vSet = new Set(violations.map((v: any) => v.ue_id));
      ueResults = ueResults.map(ue =>
        vSet.has(ue.ue_id) ? { ...ue, ue_validee: false, credits_acquis: 0 } : ue
      );
    }
  }

  // Seuil validation UE
  ueResults = ueResults.map(ue => {
    if (!ue.est_exclu && ue.moyenne_ue !== null && ue.moyenne_ue < seuilUE && ue.ue_validee)
      return { ...ue, ue_validee: false, credits_acquis: 0 };
    return ue;
  });

  // Compensation LMD-CAMES
  if (compensation_active) {
    let tmpN = 0, tmpW = 0;
    ueResults.forEach(r => {
      if (r.moyenne_ue !== null && !r.est_exclu) { tmpN += r.moyenne_ue * (r.ue_credits || 1); tmpW += (r.ue_credits || 1); }
    });
    const moyProv = tmpW > 0 ? tmpN / tmpW : null;
    if (moyProv !== null && moyProv >= seuilUE) {
      ueResults = ueResults.map(ue => {
        if (!ue.ue_validee && !ue.est_exclu && ue.moyenne_ue !== null && ue.moyenne_ue >= seuilPlancher)
          return { ...ue, ue_validee: true, credits_acquis: ue.ue_credits || 0, compensee: true };
        return ue;
      });
    }
  }

  const { credits_valides, semestre_valide, moyenne, mention } = _totaux(ueResults, seuilUE);
  const decision = semestre_valide ? 'admis' : 'ajourné';

  const { error: uErr } = await supabase.from('resultats_cache').upsert({
    etudiant_id: etudiantId, semestre_id: semId, ecole_id: ecoleId,
    credits_valides, semestre_valide, moyenne_semestre: moyenne, mention, decision,
  }, { onConflict: 'etudiant_id,semestre_id' });

  return { ok: !uErr };
}

// ── Calcul batch ──────────────────────────────────────────────────────────────
export async function calculerBatch(
  semId: string, ecoleId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: number; ko: number }> {
  const { data: ins } = await supabase
    .from('inscriptions_semestre')
    .select('etudiant_id')
    .eq('semestre_id', semId)
    .eq('statut', 'active');
  if (!ins?.length) return { ok: 0, ko: 0 };
  let ok = 0, ko = 0;
  for (let i = 0; i < ins.length; i++) {
    const r = await calculerUnEtudiant(ins[i].etudiant_id, semId, ecoleId);
    r.ok ? ok++ : ko++;
    onProgress?.(i + 1, ins.length);
  }
  return { ok, ko };
}

// ── Détail UE d'un étudiant ───────────────────────────────────────────────────
export async function fetchDetailUE(
  etudiantId: string, semId: string
): Promise<UEResultat[]> {
  const { data, error } = await supabase.rpc('fn_resultats_semestre', {
    p_etudiant_id: etudiantId, p_semestre_id: semId,
  });
  if (error) throw error;
  return data ?? [];
}

// ── Rattrapage ────────────────────────────────────────────────────────────────
export async function fetchRattNotes(
  etudiantId: string, semId: string
): Promise<{ ue_id: string; moy_rattrapage: number }[]> {
  const { data } = await supabase.rpc('fn_moy_ue_rattrapage', {
    p_etudiant_id: etudiantId, p_semestre_id: semId,
  });
  return data ?? [];
}

export async function calculerRattrapageBatch(
  semId: string, ecoleId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ nbAmeliorations: number }> {
  const regles = await getRegles(ecoleId);
  const { seuil_validation_ue: seuilUE, seuil_note_plancher: seuilPlancher,
          compensation_active, regle_rattrapage: regleRatt } = regles;

  const { data: ajournes } = await supabase
    .from('resultats_cache')
    .select('etudiant_id')
    .eq('semestre_id', semId)
    .eq('ecole_id', ecoleId)
    .in('decision', ['ajourné', 'redoublant']);

  let nbAmeliorations = 0;
  const list = ajournes ?? [];

  for (let i = 0; i < list.length; i++) {
    const etuId = list[i].etudiant_id;
    const [rattMoy, normRes] = await Promise.all([
      fetchRattNotes(etuId, semId),
      fetchDetailUE(etuId, semId),
    ]);
    if (!rattMoy.length || !normRes.length) { onProgress?.(i + 1, list.length); continue; }

    const rattMap: Record<string, number> = {};
    rattMoy.forEach(r => { rattMap[r.ue_id] = parseFloat(r.moy_rattrapage as any); });

    let finalRes = normRes.map(ue => {
      const mRatt = rattMap[ue.ue_id];
      if (mRatt !== undefined) {
        const mNorm = parseFloat(ue.moyenne_ue as any) || 0;
        const mFinal = regleRatt === 'ecrase' ? mRatt : Math.max(mNorm, mRatt);
        const validee = mFinal >= seuilUE;
        return { ...ue, moyenne_ue: Math.round(mFinal * 100) / 100, ue_validee: validee, credits_acquis: validee ? ue.ue_credits : 0 };
      }
      return ue;
    });

    // Compensation post-rattrapage
    if (compensation_active) {
      let tmpN = 0, tmpW = 0;
      finalRes.forEach(r => {
        if (r.moyenne_ue !== null && !r.est_exclu) { tmpN += r.moyenne_ue * (r.ue_credits || 1); tmpW += (r.ue_credits || 1); }
      });
      const moyProv = tmpW > 0 ? tmpN / tmpW : null;
      if (moyProv !== null && moyProv >= seuilUE) {
        finalRes = finalRes.map(ue => {
          if (!ue.ue_validee && !ue.est_exclu && ue.moyenne_ue !== null && ue.moyenne_ue >= seuilPlancher)
            return { ...ue, ue_validee: true, credits_acquis: ue.ue_credits || 0, compensee: true };
          return ue;
        });
      }
    }

    const { credits_valides, semestre_valide, moyenne, mention } = _totaux(finalRes, seuilUE);
    const decision = semestre_valide ? 'admis' : 'redoublant';

    await supabase.from('resultats_cache').upsert({
      etudiant_id: etuId, semestre_id: semId, ecole_id: ecoleId,
      credits_valides, semestre_valide, moyenne_semestre: moyenne, mention, decision,
    }, { onConflict: 'etudiant_id,semestre_id' });

    if (semestre_valide) nbAmeliorations++;
    onProgress?.(i + 1, list.length);
  }
  return { nbAmeliorations };
}

// ── Helper totaux ─────────────────────────────────────────────────────────────
function _totaux(ueResults: UEResultat[], seuilUE: number) {
  const credits_valides = ueResults.reduce((s, r) => s + (r.ue_validee ? (r.credits_acquis || 0) : 0), 0);
  const oblig = ueResults.filter(r => r.obligatoire);
  const semestre_valide = oblig.length > 0 ? oblig.every(r => r.ue_validee) : ueResults.every(r => r.ue_validee);
  let totalN = 0, totalW = 0;
  ueResults.forEach(r => {
    if (r.moyenne_ue !== null) { totalN += r.moyenne_ue * (r.ue_credits || 1); totalW += (r.ue_credits || 1); }
  });
  const moyenne = totalW > 0 ? Math.round(totalN / totalW * 100) / 100 : null;
  const mention = moyenne === null ? null
    : moyenne >= 16 ? 'tres_bien' : moyenne >= 14 ? 'bien' : moyenne >= 12 ? 'assez_bien'
    : moyenne >= seuilUE ? 'passable' : 'insuffisant';
  return { credits_valides, semestre_valide, moyenne, mention };
}

