// src/modules/etudiants/etudiants.service.ts
// Matricule supprimé du payload INSERT — généré par trigger SQL trg_auto_matricule

import { supabase } from '../../services/supabase';

export type EtudiantStatut = 'actif' | 'inactif' | 'diplome' | 'abandonne';

export interface Etudiant {
  id:               string;
  matricule:        string | null;
  sequence_matricule: number | null;
  nom:              string;
  prenom:           string;
  sexe:             'M' | 'F' | null;
  email_auth:       string | null;
  filiere:          string | null;
  niveau:           string | null;
  statut:           EtudiantStatut;
  ecole_id:         string;
  date_naissance:   string | null;
  lieu_naissance:   string | null;
  adresse:          string | null;
  telephone_parent: string | null;
  email_parent:     string | null;
  created_at:       string;
}

// Payload création — matricule EXCLU (trigger SQL le génère)
export interface EtudiantCreatePayload {
  nom:              string;
  prenom:           string;
  sexe:             'M' | 'F' | string;
  email_auth:       string;
  filiere:          string;
  niveau:           string;
  date_naissance:   string;
  lieu_naissance:   string;
  telephone_parent: string;
  email_parent:     string;
  adresse:          string;
  statut:           string;
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

export interface FetchEtudiantsParams {
  ecoleId:   string | null;
  search?:   string;
  niveau?:   string;
  page?:     number;   // 0-based
  pageSize?: number;
}
export interface FetchEtudiantsResult {
  data:  Etudiant[];
  total: number;
}

// ── Liste étudiants — pagination + recherche + filtre côté serveur ─────────
export async function fetchEtudiants(params: FetchEtudiantsParams): Promise<FetchEtudiantsResult> {
  const { ecoleId, search, niveau, page = 0, pageSize = 20 } = params;
  const { data, error } = await supabase.rpc('fn_get_etudiants_ecole', {
    p_ecole_id: ecoleId,
    p_search:   search?.trim() || null,
    p_niveau:   niveau || null,
    p_limit:    pageSize,
    p_offset:   page * pageSize,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (Etudiant & { total_count: number })[];
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return {
    data: rows.map(({ total_count, ...rest }) => rest as Etudiant),
    total,
  };
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

// ── Créer étudiant — matricule NON fourni, trigger SQL prend le relais ─────
export async function upsertEtudiant(
  payload: EtudiantCreatePayload & { ecole_id: string; id?: string }
): Promise<string> {
  // On s'assure explicitement que 'matricule' n'est pas dans le payload
  const { ...safePayload } = payload;

  // Nettoyer les champs vides pour ne pas écraser des valeurs existantes
  const clean: Record<string, unknown> = { ecole_id: safePayload.ecole_id };
  if (safePayload.id) clean.id = safePayload.id;

  const fields: (keyof EtudiantCreatePayload)[] = [
    'nom','prenom','sexe','email_auth','filiere','niveau',
    'date_naissance','lieu_naissance','telephone_parent',
    'email_parent','adresse','statut',
  ];
  fields.forEach(k => {
    const v = safePayload[k];
    if (v !== undefined && v !== '') clean[k] = v;
  });

  // Normalisation
  if (clean.nom)    clean.nom    = (clean.nom as string).trim().toUpperCase();
  if (clean.prenom) clean.prenom = (clean.prenom as string).trim();

  const { data: result, error } = await supabase
    .from('etudiants')
    .upsert(clean, { onConflict: 'id' })
    .select('id, matricule')
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
  // matricule optionnel : si absent → trigger génère ; si présent → conservé tel quel
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

export async function importEtudiants(
  ecoleId: string,
  rows: ImportEtudiantRow[],
  onProgress?: (pct: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, errors: [] };

  // Récupère les étudiants existants pour détecter les mises à jour
  const { data: existing } = await supabase
    .from('etudiants')
    .select('id, matricule')
    .eq('ecole_id', ecoleId);

  const matriculeToId = new Map<string, string>();
  (existing ?? []).forEach((e: { id: string; matricule: string }) => {
    if (e.matricule) matriculeToId.set(e.matricule.toLowerCase(), e.id);
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch    = rows.slice(i, i + BATCH_SIZE);
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];

    batch.forEach((row, bIdx) => {
      const lineNum = i + bIdx + 2;
      try {
        // IMPORTANT : si matricule absent dans la ligne Excel,
        // on ne met rien → le trigger SQL fn_generate_matricule prend le relais
        const payload: Record<string, unknown> = {
          ecole_id: ecoleId,
          nom:      row.nom.trim().toUpperCase(),
          prenom:   row.prenom.trim(),
          statut:   row.statut ?? 'actif',
        };

        // Matricule fourni explicitement dans l'Excel → on le conserve
        if (row.matricule?.trim()) payload.matricule = row.matricule.trim();
        // Sinon : on n'inclut pas la clé → trigger génère

        if (row.sexe)             payload.sexe             = row.sexe;
        if (row.email_auth)       payload.email_auth       = row.email_auth.toLowerCase();
        if (row.telephone_parent) payload.telephone_parent = row.telephone_parent;
        if (row.email_parent)     payload.email_parent     = row.email_parent.toLowerCase();
        if (row.filiere)          payload.filiere          = row.filiere;
        if (row.niveau)           payload.niveau           = row.niveau;
        if (row.date_naissance)   payload.date_naissance   = row.date_naissance;
        if (row.lieu_naissance)   payload.lieu_naissance   = row.lieu_naissance;
        if (row.adresse)          payload.adresse          = row.adresse;

        // Mise à jour si matricule connu, sinon insertion
        const mat = row.matricule?.trim().toLowerCase();
        const existingId = mat ? matriculeToId.get(mat) : undefined;
        if (existingId) toUpdate.push({ ...payload, id: existingId });
        else            toInsert.push(payload);

      } catch (e) {
        result.errors.push(`Ligne ${lineNum} (${row.nom}) : ${e instanceof Error ? e.message : 'Erreur'}`);
      }
    });

    if (toInsert.length) {
      const { error } = await supabase.from('etudiants').insert(toInsert);
      if (error) result.errors.push(`Batch insert [${i + 1}–${i + toInsert.length}] : ${error.message}`);
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
