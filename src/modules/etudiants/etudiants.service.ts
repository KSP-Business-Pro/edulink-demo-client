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
  // RPC SECURITY DEFINER — contourne RLS sur etudiants
  const { data, error } = await supabase
    .rpc('fn_get_etudiants_ecole', { p_ecole_id: ecoleId });
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

// ── Import Excel/CSV ───────────────────────────────────────────────────────

export interface ImportEtudiantRow {
  nom:               string;
  prenom:            string;
  matricule?:        string;
  sexe?:             'M' | 'F';
  email_auth?:       string;
  telephone?:        string;
  telephone_parent?: string;
  email_parent?:     string;
  filiere?:          string;
  niveau?:           string;
  statut?:           string;
  date_naissance?:   string;
  lieu_naissance?:   string;
  nationalite?:      string;
  adresse?:          string;
}

export interface ImportResult {
  inserted: number;
  updated:  number;
  errors:   string[];
}

const BATCH_SIZE = 50;

function genMatricule(ecoleId: string, nom: string): string {
  const prefix  = ecoleId.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const nomPart = nom.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const rand    = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${nomPart}-${rand}`;
}

export async function importEtudiants(
  ecoleId: string,
  rows: ImportEtudiantRow[],
  onProgress?: (pct: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, errors: [] };

  const { data: existing } = await supabase
    .from('etudiants')
    .select('id, matricule')
    .eq('ecole_id', ecoleId);

  const matriculeToId = new Map<string, string>();
  (existing ?? []).forEach((e: { id: string; matricule: string }) => {
    if (e.matricule) matriculeToId.set(e.matricule.toLowerCase(), e.id);
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch     = rows.slice(i, i + BATCH_SIZE);
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];

    batch.forEach((row, bIdx) => {
      const lineNum = i + bIdx + 2;
      try {
        const matricule = row.matricule?.trim() || genMatricule(ecoleId, row.nom);
        const payload: Record<string, unknown> = {
          ecole_id:  ecoleId,
          nom:       row.nom.trim().toUpperCase(),
          prenom:    row.prenom.trim(),
          matricule,
          statut:    row.statut ?? 'actif',
        };
        if (row.sexe)             payload.sexe             = row.sexe;
        if (row.email_auth)       payload.email_auth       = row.email_auth.toLowerCase();
        if (row.telephone)        payload.telephone        = row.telephone;
        if (row.telephone_parent) payload.telephone_parent = row.telephone_parent;
        if (row.email_parent)     payload.email_parent     = row.email_parent.toLowerCase();
        if (row.filiere)          payload.filiere          = row.filiere;
        if (row.niveau)           payload.niveau           = row.niveau;
        if (row.date_naissance)   payload.date_naissance   = row.date_naissance;
        if (row.lieu_naissance)   payload.lieu_naissance   = row.lieu_naissance;
        if (row.nationalite)      payload.nationalite      = row.nationalite;
        if (row.adresse)          payload.adresse          = row.adresse;

        const existingId = matriculeToId.get(matricule.toLowerCase());
        if (existingId) toUpdate.push({ ...payload, id: existingId });
        else            toInsert.push(payload);
      } catch (e) {
        result.errors.push(`Ligne ${lineNum} (${row.nom}) : ${e instanceof Error ? e.message : 'Erreur'}`);
      }
    });

    if (toInsert.length) {
      const { error } = await supabase.from('etudiants').insert(toInsert);
      if (error) result.errors.push(`Batch insert [${i + 1}-${i + toInsert.length}] : ${error.message}`);
      else       result.inserted += toInsert.length;
    }

    for (const row of toUpdate) {
      const { id, ...fields } = row;
      const { error } = await supabase.from('etudiants').update(fields).eq('id', id as string);
      if (error) result.errors.push(`Mise à jour ${row.matricule} : ${error.message}`);
      else       result.updated++;
    }

    onProgress?.(Math.round(((i + batch.length) / rows.length) * 100));
  }

  return result;
}
