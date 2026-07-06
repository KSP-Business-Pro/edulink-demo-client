// src/services/saisie.calc.ts
// Fonctions de calcul PURES pour la saisie des notes (aucun appel Supabase).
// Extrait de saisie.service.ts (B13) pour permettre des tests unitaires rapides
// sans dependance sur l'initialisation du client Supabase/Realtime.

import type {
  Evaluation, EtudiantSaisie, NoteLMD, ImportRow,
} from '../types/saisie.types';

// -- Import CSV ---------------------------------------------------------------
export function parseCSV(text: string): ImportRow[] {
  const lines   = text.trim().split('\n');
  const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
  const matIdx  = headers.findIndex(h => h.includes('matri'));
  const noteIdx = headers.findIndex(h =>
    h.includes('note') || h.includes('mark') || h.includes('valeur')
  );
  if (matIdx < 0 || noteIdx < 0)
    throw new Error('Colonnes Matricule/Note introuvables dans le CSV');
  return lines.slice(1)
    .map(l => {
      const c = l.split(/[,;]/);
      return { matricule: c[matIdx]?.trim() ?? '', note: parseFloat(c[noteIdx]) };
    })
    .filter(r => r.matricule && !isNaN(r.note) && r.note >= 0 && r.note <= 20);
}

// -- Calcul moyennes ------------------------------------------------------------
export function calculerLigneGrille(
  etudiant: EtudiantSaisie,
  evalsCC:  Evaluation[],
  evalsEX:  Evaluation[],
  notesMap: Record<string, Record<string, NoteLMD>>,
  poids_cc: number,
  poids_ex: number,
) {
  const rowNotes = notesMap[etudiant.id] ?? {};

  const notesCC = evalsCC.map(e => {
    const n = rowNotes[e.id];
    return n?.absent ? 0 : (n?.valeur ?? null);
  });
  const absCC = evalsCC.map(e => !!rowNotes[e.id]?.absent);

  const notesEX = evalsEX.map(e => {
    const n = rowNotes[e.id];
    return n?.absent ? 0 : (n?.valeur ?? null);
  });
  const absEX = evalsEX.map(e => !!rowNotes[e.id]?.absent);

  let moyCC: number | null = null;
  if (notesCC.every(n => n !== null)) {
    const tot = evalsCC.reduce((s, e) => s + e.ponderation, 0);
    moyCC = tot > 0
      ? Math.round(notesCC.reduce((s, n, i) => s + (n ?? 0) * evalsCC[i].ponderation, 0) / tot * 100) / 100
      : null;
  }

  const moyEX = notesEX.length && notesEX.every(n => n !== null) ? notesEX[0] : null;

  let finale: number | null = null;
  if (moyCC !== null && moyEX !== null)
    finale = Math.round((moyCC * poids_cc + moyEX * poids_ex) * 100) / 100;
  else if (moyCC !== null && evalsEX.length === 0)
    finale = moyCC;
  else if (moyEX !== null && evalsCC.length === 0)
    finale = moyEX;

  return { etudiant, notesCC, notesEX, absentsCC: absCC, absentsEX: absEX, moyCC, finale };
}