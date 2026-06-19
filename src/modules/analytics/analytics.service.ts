// src/modules/analytics/analytics.service.ts
// B3.3 — Tableau de bord analytique avancé

import { supabase } from '../../services/supabase';

// ── Types ──────────────────────────────────────────────────────────────────
export interface KpiGlobal {
  total_etudiants:    number;
  etudiants_actifs:   number;
  total_inscriptions: number;
  taux_presence:      number;  // %
  taux_recouvrement:  number;  // %
  montant_recouvre:   number;  // FCFA
  montant_attendu:    number;  // FCFA
  total_seances:      number;
}

export interface RepartitionNiveau {
  niveau:  string;
  filiere: string;
  total:   number;
}

export interface StatutFacture {
  statut:     string;
  nb:         number;
  total_fcfa: number;
}

export interface InscriptionSemestre {
  libelle:  string;
  inscrits: number;
  statut:   string;
}

export interface StatutPresence {
  statut: string;
  total:  number;
}

export interface SeanceParType {
  type_seance: string;
  nb:          number;
}

export interface AnalyticsData {
  kpi:              KpiGlobal;
  repartitionNiveau: RepartitionNiveau[];
  facturesStatut:   StatutFacture[];
  inscriptions:     InscriptionSemestre[];
  presences:        StatutPresence[];
  seancesParType:   SeanceParType[];
}

// ── Fetch toutes les analytics en parallèle ────────────────────────────────
export async function fetchAnalytics(ecoleId: string): Promise<AnalyticsData> {
  const [
    etudRes, inscRes, presRes, facRes, seanceRes,
  ] = await Promise.all([
    // Étudiants par niveau/filière
    supabase
      .from('etudiants')
      .select('niveau, filiere, statut')
      .eq('ecole_id', ecoleId),

    // Inscriptions par semestre
    supabase
      .from('inscriptions_semestre')
      .select('statut, semestres(libelle)')
      .eq('ecole_id', ecoleId),

    // Présences
    supabase
      .from('presences')
      .select('statut')
      .eq('ecole_id', ecoleId),

    // Factures
    supabase
      .from('factures')
      .select('statut, montant_total')
      .eq('ecole_id', ecoleId),

    // Séances par type
    supabase
      .from('seances')
      .select('type_seance')
      .eq('ecole_id', ecoleId),
  ]);

  const etudiants  = etudRes.data   ?? [];
  const inscr      = inscRes.data   ?? [];
  const pres       = presRes.data   ?? [];
  const factures   = facRes.data    ?? [];
  const seances    = seanceRes.data ?? [];

  // ── KPI globaux ───────────────────────────────────────────────────────────
  const totalEtu    = etudiants.length;
  const actifs      = etudiants.filter((e: any) => e.statut === 'actif').length;
  const totalInscr  = inscr.length;

  const totalPres   = pres.length;
  const presents    = pres.filter((p: any) => p.statut === 'present').length;
  const tauxPres    = totalPres > 0 ? Math.round((presents / totalPres) * 100) : 0;

  const montantAttendu  = factures.reduce((s: number, f: any) => s + (Number(f.montant_total) || 0), 0);
  const montantRecouvre = factures
    .filter((f: any) => f.statut === 'paye')
    .reduce((s: number, f: any) => s + (Number(f.montant_total) || 0), 0);
  const tauxRecouvrement = montantAttendu > 0
    ? Math.round((montantRecouvre / montantAttendu) * 100) : 0;

  // ── Répartition niveaux ───────────────────────────────────────────────────
  const niveauMap: Record<string, RepartitionNiveau> = {};
  etudiants.forEach((e: any) => {
    const key = `${e.niveau}__${e.filiere}`;
    if (!niveauMap[key]) niveauMap[key] = { niveau: e.niveau ?? '?', filiere: e.filiere ?? '?', total: 0 };
    niveauMap[key].total++;
  });
  const repartitionNiveau = Object.values(niveauMap).sort((a, b) => a.niveau.localeCompare(b.niveau));

  // ── Factures par statut ───────────────────────────────────────────────────
  const facMap: Record<string, StatutFacture> = {};
  factures.forEach((f: any) => {
    const st = f.statut ?? 'inconnu';
    if (!facMap[st]) facMap[st] = { statut: st, nb: 0, total_fcfa: 0 };
    facMap[st].nb++;
    facMap[st].total_fcfa += Number(f.montant_total) || 0;
  });
  const facturesStatut = Object.values(facMap).sort((a, b) => b.nb - a.nb);

  // ── Inscriptions par semestre ─────────────────────────────────────────────
  const inscrMap: Record<string, InscriptionSemestre> = {};
  inscr.forEach((i: any) => {
    const lib = (i.semestres as any)?.libelle ?? 'Inconnu';
    const key = `${lib}__${i.statut}`;
    if (!inscrMap[key]) inscrMap[key] = { libelle: lib, inscrits: 0, statut: i.statut };
    inscrMap[key].inscrits++;
  });
  const inscriptions = Object.values(inscrMap).sort((a, b) => a.libelle.localeCompare(b.libelle));

  // ── Présences par statut ──────────────────────────────────────────────────
  const presMap: Record<string, number> = {};
  pres.forEach((p: any) => { presMap[p.statut] = (presMap[p.statut] ?? 0) + 1; });
  const presences = Object.entries(presMap).map(([statut, total]) => ({ statut, total }));

  // ── Séances par type ──────────────────────────────────────────────────────
  const seanceMap: Record<string, number> = {};
  seances.forEach((s: any) => { seanceMap[s.type_seance] = (seanceMap[s.type_seance] ?? 0) + 1; });
  const seancesParType = Object.entries(seanceMap)
    .map(([type_seance, nb]) => ({ type_seance, nb }))
    .sort((a, b) => b.nb - a.nb);

  return {
    kpi: {
      total_etudiants:    totalEtu,
      etudiants_actifs:   actifs,
      total_inscriptions: totalInscr,
      taux_presence:      tauxPres,
      taux_recouvrement:  tauxRecouvrement,
      montant_recouvre:   montantRecouvre,
      montant_attendu:    montantAttendu,
      total_seances:      seances.length,
    },
    repartitionNiveau,
    facturesStatut,
    inscriptions,
    presences,
    seancesParType,
  };
}
