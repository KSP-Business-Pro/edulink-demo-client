// src/services/saisie.service.ts
// B4.1 — Retrait @ts-nocheck, typage explicite
// B13 — calculerLigneGrille et parseCSV deplaces vers saisie.calc.ts (fonctions pures, sans Supabase)

import { supabase } from './supabase';
import type {
  SessionEvaluation, Evaluation, NoteLMD,
  EtudiantSaisie, MatiereSaisie, UESaisie, ImportRow,
} from '../types/saisie.types';

export { parseCSV, calculerLigneGrille } from './lmd/saisie.calc';

// -- Semestres actifs ---------------------------------------------------------
export async function fetchSemestresActifsSaisie(ecoleId: string) {
  const { data, error } = await supabase
    .from('semestres')
    .select('id,libelle,niveau,programmes_lmd(intitule)')
    .eq('ecole_id', ecoleId)
    .in('statut', ['en_cours', 'planifie'])
    .order('numero');
  if (error) throw error;
  return data ?? [];
}

// -- UE du semestre ------------------------------------------------------------
export async function fetchUEsBySemestre(semestreId: string): Promise<UESaisie[]> {
  const { data, error } = await supabase
    .from('programme_ue')
    .select('ue_id, unites_enseignement(id,code,intitule,type_ue,poids_cc,poids_examen)')
    .eq('semestre_id', semestreId);
  if (error) throw error;
  return ((data ?? []) as unknown[])
    .map((r: unknown) => (r as { unites_enseignement: UESaisie }).unites_enseignement)
    .filter(Boolean) as UESaisie[];
}

// -- Matieres d'une UE ----------------------------------------------------------
export async function fetchMatieresByUESaisie(ueId: string): Promise<MatiereSaisie[]> {
  const { data, error } = await supabase
    .from('matieres_lmd')
    .select('id,code,nom,coefficient,ue_id,unites_enseignement(code,intitule,poids_cc,poids_examen)')
    .eq('ue_id', ueId)
    .order('code');
  if (error) throw error;
  return (data ?? []) as unknown as MatiereSaisie[];
}

// -- Sessions evaluation ---------------------------------------------------------
export async function fetchSessions(semestreId: string): Promise<SessionEvaluation[]> {
  const { data, error } = await supabase
    .from('sessions_evaluation')
    .select('id,semestre_id,ecole_id,type_session,statut')
    .eq('semestre_id', semestreId);
  if (error) throw error;
  return (data ?? []) as SessionEvaluation[];
}

export async function creerSessions(semestreId: string, ecoleId: string): Promise<void> {
  const { data: semestre } = await supabase
    .from('semestres')
    .select('date_debut, date_fin')
    .eq('id', semestreId)
    .single();
  const date_debut = (semestre as { date_debut: string } | null)?.date_debut ?? new Date().toISOString().split('T')[0];
  const date_fin   = (semestre as { date_fin: string }   | null)?.date_fin   ?? new Date().toISOString().split('T')[0];
  const existing = await fetchSessions(semestreId);
  const types = existing.map(s => s.type_session);
  const toCreate: {
    semestre_id: string; ecole_id: string; type_session: string;
    statut: string; date_debut: string; date_fin: string;
  }[] = [];
  if (!types.includes('normale'))
    toCreate.push({ semestre_id: semestreId, ecole_id: ecoleId, type_session: 'normale',   statut: 'ouverte',   date_debut, date_fin });
  if (!types.includes('rattrapage'))
    toCreate.push({ semestre_id: semestreId, ecole_id: ecoleId, type_session: 'rattrapage', statut: 'planifiee', date_debut, date_fin });
  if (!toCreate.length) throw new Error('Sessions deja creees');
  const { error } = await supabase.from('sessions_evaluation').insert(toCreate);
  if (error) throw error;
}

export async function changerStatutSession(sessionId: string, statut: string): Promise<void> {
  const { error } = await supabase
    .from('sessions_evaluation')
    .update({ statut })
    .eq('id', sessionId);
  if (error) throw error;
}

// -- Evaluations ------------------------------------------------------------------
export async function fetchEvaluations(
  matiereId: string, sessionIds: string[]
): Promise<Evaluation[]> {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('matiere_id', matiereId)
    .in('session_id', sessionIds);
  if (error) throw error;
  return (data ?? []) as Evaluation[];
}

export async function ajouterEvaluation(
  matiereId:     string,
  sessionId:     string,
  ecoleId:       string,
  categorie:     'CC' | 'EXAMEN',
  intitule:      string,
  existingEvals: Evaluation[],
): Promise<void> {
  const sameType   = existingEvals.filter(e => e.categorie === categorie && e.session_id === sessionId);
  const totalPond  = sameType.reduce((s, e) => s + e.ponderation, 0);
  const ponderation = categorie === 'CC'
    ? Math.max(0.1, parseFloat((1 - totalPond).toFixed(2)))
    : 1.0;
  const { error } = await supabase.from('evaluations').insert({
    matiere_id: matiereId, session_id: sessionId, ecole_id: ecoleId,
    categorie, format: 'ecrit', intitule, ponderation,
  });
  if (error) throw error;
}

// -- Etudiants inscrits -----------------------------------------------------------
export async function fetchEtudiantsInscrits(semestreId: string): Promise<EtudiantSaisie[]> {
  const { data, error } = await supabase
    .from('inscriptions_semestre')
    .select('etudiant_id, etudiants(id,nom,prenom,matricule)')
    .eq('semestre_id', semestreId)
    .eq('statut', 'active');
  if (error) throw error;
  return (((data ?? []) as unknown[])
    .map((i: unknown) => (i as { etudiants: EtudiantSaisie }).etudiants)
    .filter(Boolean) as EtudiantSaisie[])
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

// -- Notes --------------------------------------------------------------------------
export async function fetchNotes(evaluationIds: string[]): Promise<NoteLMD[]> {
  if (!evaluationIds.length) return [];
  const { data, error } = await supabase
    .from('notes_lmd')
    .select('etudiant_id,evaluation_id,valeur,absent')
    .in('evaluation_id', evaluationIds);
  if (error) throw error;
  return (data ?? []) as NoteLMD[];
}

export async function sauvegarderNote(
  etudiantId:   string,
  evaluationId: string,
  valeur:       number,
  ecoleId:      string,
): Promise<void> {
  const { data: ev } = await supabase
    .from('evaluations').select('session_id').eq('id', evaluationId).single();
  const sessionId = (ev as { session_id: string } | null)?.session_id;

  const { data: existing } = await supabase
    .from('notes_lmd').select('valeur')
    .eq('etudiant_id', etudiantId).eq('evaluation_id', evaluationId).maybeSingle();

  const { error } = await supabase.from('notes_lmd').upsert({
    etudiant_id: etudiantId, evaluation_id: evaluationId,
    session_id: sessionId, ecole_id: ecoleId,
    valeur, absent: false,
  }, { onConflict: 'etudiant_id,evaluation_id' });
  if (error) throw error;

  const ancienne = (existing as { valeur: number | null } | null)?.valeur ?? null;
  await _logNote(etudiantId, evaluationId, ecoleId, ancienne, valeur);
}

export async function toggleAbsent(
  etudiantId:        string,
  evaluationId:      string,
  isCurrentlyAbsent: boolean,
  ecoleId:           string,
): Promise<void> {
  const { data: ev } = await supabase
    .from('evaluations').select('session_id').eq('id', evaluationId).single();
  const sessionId = (ev as { session_id: string } | null)?.session_id;

  const { data: existing } = await supabase
    .from('notes_lmd').select('valeur')
    .eq('etudiant_id', etudiantId).eq('evaluation_id', evaluationId).maybeSingle();

  const { error } = await supabase.from('notes_lmd').upsert({
    etudiant_id: etudiantId, evaluation_id: evaluationId,
    session_id: sessionId, ecole_id: ecoleId,
    absent: !isCurrentlyAbsent, valeur: null,
  }, { onConflict: 'etudiant_id,evaluation_id' });
  if (error) throw error;

  if (!isCurrentlyAbsent) {
    const ancienne = (existing as { valeur: number | null } | null)?.valeur ?? null;
    await _logNote(etudiantId, evaluationId, ecoleId, ancienne, null);
  }
}

async function _logNote(
  etudiantId:   string,
  evaluationId: string,
  ecoleId:      string,
  ancienne:     number | null,
  nouvelle:     number | null,
): Promise<void> {
  try {
    await supabase.from('notes_historique').insert({
      etudiant_id:    etudiantId,
      evaluation_id:  evaluationId,
      ecole_id:       ecoleId,
      valeur_ancienne: ancienne,
      valeur_nouvelle: nouvelle,
      modifie_le:     new Date().toISOString(),
    });
  } catch { /* silencieux si table absente */ }
}

// -- Import CSV -----------------------------------------------------------------
export async function importerNotes(
  rows:         ImportRow[],
  evaluationId: string,
  ecoleId:      string,
  etudiants:    EtudiantSaisie[],
): Promise<{ ok: number; skip: number }> {
  const { data: ev } = await supabase
    .from('evaluations').select('session_id').eq('id', evaluationId).single();
  const sessionId = (ev as { session_id: string } | null)?.session_id;

  const matMap: Record<string, string> = {};
  etudiants.forEach(e => { if (e.matricule) matMap[e.matricule.trim().toLowerCase()] = e.id; });

  let ok = 0, skip = 0;
  for (const row of rows) {
    const etuId = matMap[row.matricule.trim().toLowerCase()];
    if (!etuId) { skip++; continue; }

    const { data: existing } = await supabase
      .from('notes_lmd').select('valeur')
      .eq('etudiant_id', etuId).eq('evaluation_id', evaluationId).maybeSingle();

    const { error } = await supabase.from('notes_lmd').upsert({
      etudiant_id:  etuId,
      evaluation_id: evaluationId,
      session_id:   sessionId,
      ecole_id:     ecoleId,
      valeur:       row.note,
      absent:       false,
    }, { onConflict: 'etudiant_id,evaluation_id' });

    if (!error) {
      ok++;
      const ancienne = (existing as { valeur: number | null } | null)?.valeur ?? null;
      await _logNote(etuId, evaluationId, ecoleId, ancienne, row.note);
    } else {
      skip++;
    }
  }
  return { ok, skip };
}