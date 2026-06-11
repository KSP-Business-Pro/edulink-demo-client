// @ts-nocheck
// src/services/dashboard.service.ts
// Toutes les requêtes Supabase pour le Dashboard centralisées ici

import { supabase } from './supabase';

export interface DashboardKPIs {
  nbEtudiants:     number;
  nbInscrits:      number;
  nbSemestresActifs: number;
  nbProgrammes:    number;
  nbUE:            number;
  anneeLibelle:    string;
  tauxValidation:  number;
  nbValides:       number;
  creditsTotal:    number;
}

export interface SemestreEnCours {
  id:       string;
  libelle:  string;
  niveau:   string;
  programme: string;
}

export interface ProgrammeRepartition {
  id:       string;
  intitule: string;
  inscrits: number;
  color:    string;
}

export interface DashboardData {
  kpis:       DashboardKPIs;
  semestres:  SemestreEnCours[];
  programmes: ProgrammeRepartition[];
}

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];

export async function loadDashboard(ecoleId: string): Promise<DashboardData> {
  const [
    { data: etudiants },
    { data: ues },
    { data: semestres },
    { data: inscriptions },
    { data: cache },
    { data: annee },
    { data: regles },
  ] = await Promise.all([
    // RPC SECURITY DEFINER — contourne RLS sur etudiants
    supabase.rpc('fn_dashboard_etudiants', { p_ecole_id: ecoleId }),
    // RPC SECURITY DEFINER — contourne RLS sur unites_enseignement
    supabase.rpc('fn_dashboard_ues', { p_ecole_id: ecoleId }),
    supabase.from('semestres')
      .select('id,libelle,niveau,statut,programme_id,programmes_lmd(intitule,grade)')
      .eq('ecole_id', ecoleId).order('numero'),
    supabase.from('inscriptions_semestre').select('id,statut,semestre_id').eq('ecole_id', ecoleId),
    supabase.from('resultats_cache')
      .select('etudiant_id,semestre_valide,credits_valides,moyenne_semestre')
      .eq('ecole_id', ecoleId),
    supabase.from('annees_academiques')
      .select('libelle').eq('ecole_id', ecoleId).eq('est_courante', true).maybeSingle(),
    supabase.from('regles_ecole')
      .select('compensation_active,seuil_validation_ue').eq('ecole_id', ecoleId).maybeSingle(),
  ]);

  // KPIs de base
  const nbEtudiants       = etudiants?.length ?? 0;
  const nbInscrits        = inscriptions?.filter(i => i.statut === 'active').length ?? 0;
  const nbSemestresActifs = semestres?.filter(s => s.statut === 'en_cours').length ?? 0;
  const nbUE              = ues?.length ?? 0;

  // Programmes uniques
  const progMap = new Map<string, { intitule: string; inscrits: number }>();
  semestres?.forEach(s => {
    const prog = (s.programmes_lmd as { intitule: string } | null);
    if (s.programme_id && prog?.intitule && !progMap.has(s.programme_id)) {
      progMap.set(s.programme_id, { intitule: prog.intitule, inscrits: 0 });
    }
  });

  // Répartition inscriptions par programme
  inscriptions?.filter(i => i.statut === 'active').forEach(i => {
    const sem = semestres?.find(s => s.id === i.semestre_id);
    if (sem?.programme_id && progMap.has(sem.programme_id)) {
      progMap.get(sem.programme_id)!.inscrits++;
    }
  });

  // Taux de validation
  const compActive = regles?.compensation_active ?? false;
  const seuilUE    = regles?.seuil_validation_ue ?? 10;
  const parEtu: Record<string, typeof cache> = {};
  (cache ?? []).forEach(c => {
    if (!parEtu[c.etudiant_id]) parEtu[c.etudiant_id] = [];
    parEtu[c.etudiant_id]!.push(c);
  });
  const nbValides = Object.values(parEtu).filter(rows => {
    if (!rows) return false;
    const semVal = rows.filter(r => r.semestre_valide).length;
    const nbSem  = rows.length;
    if (semVal === nbSem && nbSem > 0) return true;
    if (compActive) {
      const moys = rows.filter(r => r.moyenne_semestre !== null).map(r => Number(r.moyenne_semestre));
      const moy  = moys.length ? moys.reduce((a, b) => a + b, 0) / moys.length : null;
      if (moy !== null && moy >= seuilUE && (nbSem - semVal) <= 1) return true;
    }
    return false;
  }).length;
  const tauxValidation = nbInscrits > 0 ? Math.round(nbValides / nbInscrits * 100) : 0;

  // Semestres en cours
  const semestresEnCours: SemestreEnCours[] = (semestres ?? [])
    .filter(s => s.statut === 'en_cours')
    .map(s => ({
      id:        s.id,
      libelle:   s.libelle,
      niveau:    s.niveau,
      programme: (s.programmes_lmd as { intitule: string } | null)?.intitule ?? '—',
    }));

  // Programmes avec couleurs
  const programmes: ProgrammeRepartition[] = Array.from(progMap.entries())
    .filter(([, v]) => v.inscrits > 0)
    .map(([id, v], i) => ({
      id,
      intitule: v.intitule,
      inscrits: v.inscrits,
      color: COLORS[i % COLORS.length],
    }));

  const creditsTotal = (cache ?? []).reduce((s, c) => s + (c.credits_valides || 0), 0);

  return {
    kpis: {
      nbEtudiants, nbInscrits, nbSemestresActifs,
      nbProgrammes: progMap.size,
      nbUE, anneeLibelle: annee?.libelle ?? '—',
      tauxValidation, nbValides, creditsTotal,
    },
    semestres: semestresEnCours,
    programmes,
  };
}
