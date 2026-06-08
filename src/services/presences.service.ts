// src/services/presences.service.ts
import { supabase } from './supabase';

export type StatutPresence = 'present' | 'absent' | 'retard' | 'justifie';
export type TypeSeance = 'CM' | 'TD' | 'TP' | 'examen' | 'autre';

export interface Seance {
  id: string;
  ecole_id: string;
  matiere_id: string;
  semestre_id: string;
  date_seance: string;
  type_seance: TypeSeance;
  heure_debut: string | null;
  heure_fin: string | null;
  observations: string | null;
  matieres_lmd?: { nom: string; code: string };
}

export interface Presence {
  seance_id: string;
  etudiant_id: string;
  statut: StatutPresence;
}

export interface EtudiantPresence {
  id: string; nom: string; prenom: string; matricule: string;
}

export interface AbsenceUE {
  etudiant_id: string;
  etudiant_nom: string;
  etudiant_prenom: string;
  matricule: string;
  ue_id: string;
  ue_code: string;
  ue_intitule: string;
  semestre_id: string;
  nb_seances_total: number;
  nb_presents: number;
  nb_absences: number;
  nb_absences_justifiees: number;
  nb_retards: number;
  taux_absence_pct: number;
  est_exclu: boolean;
}

export interface MatiereSaisie {
  id: string; code: string; nom: string; ue_id: string;
  unites_enseignement?: { code: string; intitule: string };
}

// ── Matières du semestre ──────────────────────────────────────────────────────
export async function fetchMatieresSemestre(semId: string): Promise<MatiereSaisie[]> {
  const { data: pues } = await supabase
    .from('programme_ue')
    .select('ue_id')
    .eq('semestre_id', semId);
  const ueIds = (pues ?? []).map((p: any) => p.ue_id);
  if (!ueIds.length) return [];
  const { data, error } = await supabase
    .from('matieres_lmd')
    .select('id,code,nom,ue_id,unites_enseignement(code,intitule)')
    .in('ue_id', ueIds)
    .order('code');
  if (error) throw error;
  return (data ?? []) as MatiereSaisie[];
}

// ── Séances ───────────────────────────────────────────────────────────────────
export async function fetchSeances(semId: string): Promise<Seance[]> {
  const { data, error } = await supabase
    .from('seances')
    .select('*, matieres_lmd(nom,code)')
    .eq('semestre_id', semId)
    .order('date_seance', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Seance[];
}

export async function creerSeance(payload: Omit<Seance, 'id' | 'matieres_lmd'>): Promise<Seance> {
  const { data, error } = await supabase
    .from('seances')
    .insert(payload)
    .select('*, matieres_lmd(nom,code)')
    .single();
  if (error) throw error;
  return data as Seance;
}

export async function supprimerSeance(seanceId: string): Promise<void> {
  await supabase.from('presences').delete().eq('seance_id', seanceId);
  const { error } = await supabase.from('seances').delete().eq('id', seanceId);
  if (error) throw error;
}

// ── Présences ─────────────────────────────────────────────────────────────────
export async function fetchPresences(seanceId: string): Promise<Presence[]> {
  const { data, error } = await supabase
    .from('presences')
    .select('seance_id,etudiant_id,statut')
    .eq('seance_id', seanceId);
  if (error) throw error;
  return (data ?? []) as Presence[];
}

export async function marquerPresence(
  seanceId: string, etudiantId: string,
  statut: StatutPresence, ecoleId: string
): Promise<void> {
  const { error } = await supabase.from('presences').upsert({
    seance_id: seanceId, etudiant_id: etudiantId,
    ecole_id: ecoleId, statut,
  }, { onConflict: 'seance_id,etudiant_id' });
  if (error) throw error;
}

export async function toutMarquerPresent(
  seanceId: string, etudiantIds: string[], ecoleId: string
): Promise<void> {
  const rows = etudiantIds.map(id => ({
    seance_id: seanceId, etudiant_id: id, ecole_id: ecoleId, statut: 'present' as StatutPresence,
  }));
  const { error } = await supabase.from('presences')
    .upsert(rows, { onConflict: 'seance_id,etudiant_id' });
  if (error) throw error;
}

// ── Étudiants inscrits ────────────────────────────────────────────────────────
export async function fetchEtudiantsInscrits(semId: string): Promise<EtudiantPresence[]> {
  const { data, error } = await supabase
    .from('inscriptions_semestre')
    .select('etudiant_id, etudiants(id,nom,prenom,matricule)')
    .eq('semestre_id', semId)
    .eq('statut', 'active');
  if (error) throw error;
  return ((data ?? []).map((i: any) => i.etudiants).filter(Boolean) as EtudiantPresence[])
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

// ── Suivi absences (vue v_absences_ue) ───────────────────────────────────────
export async function fetchAbsences(semId: string): Promise<AbsenceUE[]> {
  const { data, error } = await supabase
    .from('v_absences_ue')
    .select('*')
    .eq('semestre_id', semId)
    .order('taux_absence_pct', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AbsenceUE[];
}

export async function fetchAbsencesRisque(semId: string, seuil: number): Promise<AbsenceUE[]> {
  const { data, error } = await supabase
    .from('v_absences_ue')
    .select('*')
    .eq('semestre_id', semId)
    .gte('taux_absence_pct', seuil)
    .order('taux_absence_pct', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AbsenceUE[];
}

// ── Exclusions ────────────────────────────────────────────────────────────────
export interface Exclusion {
  id: string; etudiant_id: string; ue_id: string; semestre_id: string;
  etudiant_nom: string; etudiant_prenom: string; matricule: string;
  ue_code: string; ue_intitule: string; motif: string;
  date_exclusion: string; source: 'auto' | 'manuel';
}

export async function fetchExclusions(semId: string): Promise<Exclusion[]> {
  const { data } = await supabase.rpc('fn_exclusions_semestre', { p_semestre_id: semId });
  return (data ?? []) as Exclusion[];
}

export async function exclureEtudiant(
  etudiantId: string, ueId: string, semId: string, ecoleId: string,
  motif: string, decideParId: string
): Promise<void> {
  const { error } = await supabase.rpc('fn_exclure_etudiant_ue', {
    p_etudiant_id: etudiantId, p_ue_id: ueId, p_semestre_id: semId,
    p_ecole_id: ecoleId, p_motif: motif, p_decide_par: decideParId,
  });
  if (error) throw error;
}

export async function leverExclusion(exclusionId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_lever_exclusion_ue', { p_exclusion_id: exclusionId });
  if (error) throw error;
}

export async function appliquerExclusionsAuto(semId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_auto_exclure_absences', { p_semestre_id: semId });
  if (error) throw error;
  return data ?? 0;
}

export async function fetchSeuilAbsence(ecoleId: string): Promise<number> {
  const { data } = await supabase
    .from('regles_ecole')
    .select('seuil_absence_pct')
    .eq('ecole_id', ecoleId)
    .maybeSingle();
  return data?.seuil_absence_pct ?? 30;
}
