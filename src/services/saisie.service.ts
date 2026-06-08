// src/services/saisie.service.ts
import { supabase } from './supabase';
import type {
  SessionEvaluation, Evaluation, NoteLMD,
  EtudiantSaisie, MatiereSaisie, UESaisie, ImportRow,
} from '../types/saisie.types';

// ── Semestres actifs ──────────────────────────────────────────────────────────
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

// ── UE du semestre ────────────────────────────────────────────────────────────
export async function fetchUEsBySemestre(semestreId: string): Promise<UESaisie[]> {
  const { data, error } = await supabase
    .from('programme_ue')
    .select('ue_id, unites_enseignement(id,code,intitule,type_ue,poids_cc,poids_examen)')
    .eq('semestre_id', semestreId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.unites_enseignement)
    .filter(Boolean) as UESaisie[];
}

// ── Matières d'une UE ─────────────────────────────────────────────────────────
export async function fetchMatieresByUESaisie(ueId: string): Promise<MatiereSaisie[]> {
  const { data, error } = await supabase
    .from('matieres_lmd')
    .select('id,code,nom,coefficient,ue_id,unites_enseignement(code,intitule,poids_cc,poids_examen)')
    .eq('ue_id', ueId)
    .order('code');
  if (error) throw error;
  return (data ?? []) as MatiereSaisie[];
}

// ── Sessions évaluation ───────────────────────────────────────────────────────
export async function fetchSessions(semestreId: string): Promise<SessionEvaluation[]> {
  const { data, error } = await supabase
    .from('sessions_evaluation')
    .select('id,semestre_id,ecole_id,type_session,statut')
    .eq('semestre_id', semestreId);
  if (error) throw error;
  return data ?? [];
}

export async function creerSessions(semestreId: string, ecoleId: string): Promise<void> {
  const existing = await fetchSessions(semestreId);
  const types = existing.map(s => s.type_session);
  const toCreate = [];
  if (!types.includes('normale'))
    toCreate.push({ semestre_id: semestreId, ecole_id: ecoleId, type_session: 'normale', statut: 'ouverte' });
  if (!types.includes('rattrapage'))
    toCreate.push({ semestre_id: semestreId, ecole_id: ecoleId, type_session: 'rattrapage', statut: 'planifiee' });
  if (!toCreate.length) throw new Error('Sessions déjà créées');
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

// ── Évaluations ───────────────────────────────────────────────────────────────
export async function fetchEvaluations(matiereId: string, sessionIds: string[]): Promise<Evaluation[]> {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('matiere_id', matiereId)
    .in('session_id', sessionIds);
  if (error) throw error;
  return data ?? [];
}

export async function ajouterEvaluation(
  matiereId: string, sessionId: string, ecoleId: string,
  categorie: 'CC' | 'EXAMEN', intitule: string, existingEvals: Evaluation[]
): Promise<void> {
  const sameType = existingEvals.filter(e => e.categorie === categorie && e.session_id === sessionId);
  const totalPond = sameType.reduce((s, e) => s + e.ponderation, 0);
  const ponderation = categorie === 'CC'
    ? Math.max(0.1, parseFloat((1 - totalPond).toFixed(2)))
    : 1.0;
  const { error } = await supabase.from('evaluations').insert({
    matiere_id: matiereId, session_id: sessionId, ecole_id: ecoleId,
    categorie, format: 'ecrit', intitule, ponderation,
  });
  if (error) throw error;
}

// ── Étudiants inscrits ────────────────────────────────────────────────────────
export async function fetchEtudiantsInscrits(semestreId: string): Promise<EtudiantSaisie[]> {
  const { data, error } = await supabase
    .from('inscriptions_semestre')
    .select('etudiant_id, etudiants(id,nom,prenom,matricule)')
    .eq('semestre_id', semestreId)
    .eq('statut', 'active');
  if (error) throw error;
  return ((data ?? []).map((i: any) => i.etudiants).filter(Boolean) as EtudiantSaisie[])
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

// ── Notes ─────────────────────────────────────────────────────────────────────
export async function fetchNotes(evaluationIds: string[]): Promise<NoteLMD[]> {
  if (!evaluationIds.length) return [];
  const { data, error } = await supabase
    .from('notes_lmd')
    .select('etudiant_id,evaluation_id,valeur,absent')
    .in('evaluation_id', evaluationIds);
  if (error) throw error;
  return data ?? [];
}

export async function sauvegarderNote(
  etudiantId: string, evaluationId: string,
  valeur: number, ecoleId: string
): Promise<void> {
  // Récupérer session_id
  const { data: ev } = await supabase
    .from('evaluations').select('session_id').eq('id', evaluationId).single();
  const sessionId = ev?.session_id;

  // Note précédente pour historique
  const { data: existing } = await supabase
    .from('notes_lmd')
    .select('valeur')
    .eq('etudiant_id', etudiantId)
    .eq('evaluation_id', evaluationId)
    .maybeSingle();

  const { error } = await supabase.from('notes_lmd').upsert({
    etudiant_id: etudiantId, evaluation_id: evaluationId,
    session_id: sessionId, ecole_id: ecoleId,
    valeur, absent: false,
  }, { onConflict: 'etudiant_id,evaluation_id' });
  if (error) throw error;

  // Historique silencieux
  await _logNote(etudiantId, evaluationId, ecoleId, existing?.valeur ?? null, valeur);
}

export async function toggleAbsent(
  etudiantId: string, evaluationId: string,
  isCurrentlyAbsent: boolean, ecoleId: string
): Promise<void> {
  const { data: ev } = await supabase
    .from('evaluations').select('session_id').eq('id', evaluationId).single();
  const { data: existing } = await supabase
    .from('notes_lmd').select('valeur')
    .eq('etudiant_id', etudiantId).eq('evaluation_id', evaluationId).maybeSingle();

  const { error } = await supabase.from('notes_lmd').upsert({
    etudiant_id: etudiantId, evaluation_id: evaluationId,
    session_id: ev?.session_id, ecole_id: ecoleId,
    absent: !isCurrentlyAbsent, valeur: null,
  }, { onConflict: 'etudiant_id,evaluation_id' });
  if (error) throw error;

  if (!isCurrentlyAbsent)
    await _logNote(etudiantId, evaluationId, ecoleId, existing?.valeur ?? null, null);
}

async function _logNote(
  etudiantId: string, evaluationId: string, ecoleId: string,
  ancienne: number | null, nouvelle: number | null
): Promise<void> {
  try {
    await supabase.from('notes_historique').insert({
      etudiant_id: etudiantId, evaluation_id: evaluationId, ecole_id: ecoleId,
      valeur_ancienne: ancienne, valeur_nouvelle: nouvelle,
      modifie_le: new Date().toISOString(),
    });
  } catch { /* silencieux si table absente */ }
}

// ── Import CSV/Excel ──────────────────────────────────────────────────────────
export function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
  const matIdx  = headers.findIndex(h => h.includes('matri'));
  const noteIdx = headers.findIndex(h => h.includes('note') || h.includes('mark'));
  if (matIdx < 0 || noteIdx < 0) throw new Error('Colonnes Matricule/Note non trouvées');
  return lines.slice(1)
    .map(l => { const c = l.split(/[,;]/); return { matricule: c[matIdx]?.trim(), note: parseFloat(c[noteIdx]) }; })
    .filter(r => r.matricule && !isNaN(r.note));
}

export async function importerNotes(
  rows: ImportRow[], evaluationId: string, ecoleId: string,
  etudiants: EtudiantSaisie[]
): Promise<{ ok: number; skip: number }> {
  const { data: ev } = await supabase
    .from('evaluations').select('session_id').eq('id', evaluationId).single();
  const matMap: Record<string, string> = {};
  etudiants.forEach(e => { matMap[e.matricule] = e.id; });
  let ok = 0, skip = 0;
  for (const row of rows) {
    const etuId = matMap[row.matricule];
    if (!etuId) { skip++; continue; }
    const { data: existing } = await supabase
      .from('notes_lmd').select('valeur')
      .eq('etudiant_id', etuId).eq('evaluation_id', evaluationId).maybeSingle();
    const { error } = await supabase.from('notes_lmd').upsert({
      etudiant_id: etuId, evaluation_id: evaluationId,
      session_id: ev?.session_id, ecole_id: ecoleId,
      valeur: row.note, absent: false,
    }, { onConflict: 'etudiant_id,evaluation_id' });
    if (!error) { ok++; await _logNote(etuId, evaluationId, ecoleId, existing?.valeur ?? null, row.note); }
    else skip++;
  }
  return { ok, skip };
}

// ── Calcul moyennes ───────────────────────────────────────────────────────────
export function calculerLigneGrille(
  etudiant: EtudiantSaisie,
  evalsCC: Evaluation[], evalsEX: Evaluation[],
  notesMap: Record<string, Record<string, NoteLMD>>,
  poids_cc: number, poids_ex: number
) {
  const rowNotes = notesMap[etudiant.id] ?? {};

  const notesCC  = evalsCC.map(e => { const n = rowNotes[e.id]; return n?.absent ? 0 : (n?.valeur ?? null); });
  const absCC    = evalsCC.map(e => !!rowNotes[e.id]?.absent);
  const notesEX  = evalsEX.map(e => { const n = rowNotes[e.id]; return n?.absent ? 0 : (n?.valeur ?? null); });
  const absEX    = evalsEX.map(e => !!rowNotes[e.id]?.absent);

  let moyCC: number | null = null;
  if (notesCC.every(n => n !== null)) {
    const tot = evalsCC.reduce((s, e) => s + e.ponderation, 0);
    moyCC = tot > 0
      ? Math.round(notesCC.reduce((s, n, i) => s + (n ?? 0) * evalsCC[i].ponderation, 0) / tot * 100) / 100
      : null;
  }

  let finale: number | null = null;
  const moyEX = notesEX.length && notesEX.every(n => n !== null) ? notesEX[0] : null;
  if (moyCC !== null && moyEX !== null)          finale = Math.round((moyCC * poids_cc + moyEX * poids_ex) * 100) / 100;
  else if (moyCC !== null && evalsEX.length === 0) finale = moyCC;
  else if (moyEX !== null && evalsCC.length === 0) finale = moyEX;

  return { etudiant, notesCC, notesEX, absentsCC: absCC, absentsEX: absEX, moyCC, finale };
}
