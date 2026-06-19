// src/modules/emploi-du-temps/emploi-du-temps.service.ts

import { supabase } from '../../services/supabase';

// ── Types ──────────────────────────────────────────────────────────────────
export type TypeSeance =
  | 'CM' | 'TD' | 'TP'
  | 'devoir_surveille' | 'partiel' | 'examen_final' | 'examen'
  | 'rattrapage' | 'expose' | 'projet' | 'autre';

export interface Seance {
  id:           string;
  ecole_id:     string;
  matiere_id:   string | null;
  semestre_id:  string | null;
  enseignant_id:string | null;
  date_seance:  string;
  heure_debut:  string;
  heure_fin:    string;
  type_seance:  TypeSeance;
  salle:        string | null;
  observations: string | null;
  created_at:   string;
  // Jointures
  matiere_nom:      string | null;
  matiere_code:     string | null;
  enseignant_nom:   string | null;
  enseignant_prenom:string | null;
  semestre_libelle: string | null;
}

export interface SeancePayload {
  matiere_id:    string;
  semestre_id:   string;
  enseignant_id: string | null;
  date_seance:   string;
  heure_debut:   string;
  heure_fin:     string;
  type_seance:   TypeSeance;
  salle:         string;
  observations:  string;
}

export interface MatiereOption {
  id:          string;
  nom:         string;
  code:        string;
  semestre_id: string;
}

export interface EnseignantOption {
  id:        string;
  nom:       string;
  prenom:    string | null;
  specialite:string | null;
}

export interface SemestreOption {
  id:      string;
  libelle: string;
  niveau:  string;
}

// ── Couleurs par type ──────────────────────────────────────────────────────
export const TYPE_COLORS: Record<TypeSeance, { bg: string; color: string; border: string }> = {
  CM:              { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  TD:              { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  TP:              { bg: '#fed7aa', color: '#c2410c', border: '#fdba74' },
  devoir_surveille:{ bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
  partiel:         { bg: '#fce7f3', color: '#be185d', border: '#f9a8d4' },
  examen_final:    { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
  examen:          { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
  rattrapage:      { bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' },
  expose:          { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
  projet:          { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  autre:           { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' },
};

export const TYPE_LABELS: Record<TypeSeance, string> = {
  CM: 'Cours Magistral', TD: 'Travaux Dirigés', TP: 'Travaux Pratiques',
  devoir_surveille: 'Devoir surveillé', partiel: 'Partiel',
  examen_final: 'Examen final', examen: 'Examen',
  rattrapage: 'Rattrapage', expose: 'Exposé',
  projet: 'Projet', autre: 'Autre',
};

// ── Fetch séances ──────────────────────────────────────────────────────────
export async function fetchSeances(
  ecoleId:    string,
  semestreId?: string,
  dateDebut?:  string,
  dateFin?:    string,
): Promise<Seance[]> {
  let q = supabase
    .from('seances')
    .select(`
      id, ecole_id, matiere_id, semestre_id, enseignant_id,
      date_seance, heure_debut, heure_fin, type_seance,
      salle, observations, created_at,
      matieres_lmd(nom, code),
      enseignants(nom, prenom),
      semestres(libelle)
    `)
    .eq('ecole_id', ecoleId)
    .order('date_seance', { ascending: true })
    .order('heure_debut', { ascending: true });

  if (semestreId) q = q.eq('semestre_id', semestreId);
  if (dateDebut)  q = q.gte('date_seance', dateDebut);
  if (dateFin)    q = q.lte('date_seance', dateFin);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((s: any) => ({
    id:            s.id,
    ecole_id:      s.ecole_id,
    matiere_id:    s.matiere_id,
    semestre_id:   s.semestre_id,
    enseignant_id: s.enseignant_id,
    date_seance:   s.date_seance,
    heure_debut:   s.heure_debut,
    heure_fin:     s.heure_fin,
    type_seance:   s.type_seance as TypeSeance,
    salle:         s.salle,
    observations:  s.observations,
    created_at:    s.created_at,
    matiere_nom:       s.matieres_lmd?.nom   ?? null,
    matiere_code:      s.matieres_lmd?.code  ?? null,
    enseignant_nom:    s.enseignants?.nom    ?? null,
    enseignant_prenom: s.enseignants?.prenom ?? null,
    semestre_libelle:  s.semestres?.libelle  ?? null,
  }));
}

// ── Fetch matières par semestre ────────────────────────────────────────────
export async function fetchMatieresBySemestre(
  ecoleId:    string,
  semestreId: string,
): Promise<MatiereOption[]> {
  const { data, error } = await supabase
    .from('matieres_lmd')
    .select('id, nom, code, unites_enseignement!inner(programme_ue!inner(semestre_id))')
    .eq('ecole_id', ecoleId);
  if (error) throw new Error(error.message);

  // Filtrer par semestre_id via la jointure
  return (data ?? [])
    .filter((m: any) =>
      m.unites_enseignement?.programme_ue?.some((pu: any) => pu.semestre_id === semestreId)
    )
    .map((m: any) => ({
      id:          m.id,
      nom:         m.nom,
      code:        m.code,
      semestre_id: semestreId,
    }));
}

// ── Fetch enseignants ──────────────────────────────────────────────────────
export async function fetchEnseignants(ecoleId: string): Promise<EnseignantOption[]> {
  const { data, error } = await supabase
    .from('enseignants')
    .select('id, nom, prenom, specialite')
    .eq('ecole_id', ecoleId)
    .order('nom');
  if (error) throw new Error(error.message);
  return (data ?? []) as EnseignantOption[];
}

// ── Fetch semestres ────────────────────────────────────────────────────────
export async function fetchSemestres(ecoleId: string): Promise<SemestreOption[]> {
  const { data, error } = await supabase
    .from('semestres')
    .select('id, libelle, niveau')
    .eq('ecole_id', ecoleId)
    .order('libelle');
  if (error) throw new Error(error.message);
  return (data ?? []) as SemestreOption[];
}

// ── Créer séance ───────────────────────────────────────────────────────────
export async function createSeance(
  ecoleId: string,
  payload: SeancePayload,
): Promise<string> {
  const { data, error } = await supabase
    .from('seances')
    .insert({ ...payload, ecole_id: ecoleId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// ── Modifier séance ────────────────────────────────────────────────────────
export async function updateSeance(
  id:      string,
  payload: Partial<SeancePayload>,
): Promise<void> {
  const { error } = await supabase
    .from('seances')
    .update(payload)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Supprimer séance ───────────────────────────────────────────────────────
export async function deleteSeance(id: string): Promise<void> {
  const { error } = await supabase.from('seances').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Utilitaires dates ──────────────────────────────────────────────────────
export function getLundiDeSemaine(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatDateFR(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
}

export function heureToMinutes(h: string): number {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}
