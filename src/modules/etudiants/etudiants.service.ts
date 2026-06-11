// src/modules/etudiants/etudiants.service.ts

import { supabase } from '../../services/supabase';

export type EtudiantStatut = 'actif' | 'inactif' | 'diplome' | 'abandonne';

export interface Etudiant {
  id:          string;
  matricule:   string;
  nom:         string;
  prenom:      string;
  sexe:        'M' | 'F' | null;
  email_auth:  string | null;
  telephone:   string | null;
  filiere:     string | null;
  niveau:      string | null;
  statut:      EtudiantStatut;
  ecole_id:    string;
  date_naissance: string | null;
  lieu_naissance: string | null;
  nationalite:    string | null;
  adresse:        string | null;
  created_at:     string;
}

export interface InscriptionSemestre {
  id:         string;
  statut:     string;
  created_at: string;
  semestres: {
    libelle:  string;
    niveau:   string;
    programmes_lmd: { intitule: string } | null;
  } | null;
}

// ── Liste étudiants ────────────────────────────────────────────────────────
export async function fetchEtudiants(ecoleId: string): Promise<Etudiant[]> {
  const { data, error } = await supabase
    .from('etudiants')
    .select('*')
    .eq('ecole_id', ecoleId)
    .order('nom,prenom');
  if (error) throw new Error(error.message);
  return (data ?? []) as Etudiant[];
}

// ── Fiche étudiant ─────────────────────────────────────────────────────────
export async function fetchEtudiant(id: string): Promise<Etudiant | null> {
  const { data } = await supabase
    .from('etudiants').select('*').eq('id', id).maybeSingle();
  return data as Etudiant | null;
}

// ── Inscriptions semestrielles ─────────────────────────────────────────────
export async function fetchInscriptions(etudiantId: string): Promise<InscriptionSemestre[]> {
  const { data } = await supabase
    .from('inscriptions_semestre')
    .select('id, statut, created_at, semestres(libelle, niveau, programmes_lmd(intitule))')
    .eq('etudiant_id', etudiantId)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as InscriptionSemestre[];
}

// ── Upsert étudiant ────────────────────────────────────────────────────────
export async function upsertEtudiant(
  data: Partial<Etudiant> & { ecole_id: string }
): Promise<string> {
  const { data: result, error } = await supabase
    .from('etudiants')
    .upsert(data, { onConflict: 'id' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return result.id;
}

// ── Supprimer étudiant ─────────────────────────────────────────────────────
export async function deleteEtudiant(id: string): Promise<void> {
  const { error } = await supabase
    .from('etudiants').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
