// src/services/comptabilite.service.ts
import { supabase } from './supabase';

export type StatutFacture = 'en_attente' | 'partiel' | 'paye' | 'annule';
export type TypeFrais = 'scolarite' | 'inscription' | 'examen' | 'bibliotheque' | 'autre';
export type ModePaiement = 'especes' | 'virement' | 'mobile_money' | 'cheque';

export interface Facture {
  id: string;
  ecole_id: string;
  etudiant_id: string;
  type_frais: TypeFrais;
  libelle: string;
  reference: string | null;
  montant_total: number;
  montant: number | null;
  montant_paye: number;
  statut: StatutFacture;
  annee_scolaire: string | null;
  trimestre: string | null;
  date_echeance: string | null;
  mode_paiement: string | null;
  created_at: string;
  etudiants?: { id: string; nom: string; prenom: string; matricule: string; filiere: string; niveau: string };
}

export interface EtudiantCompta {
  etudiant: Facture['etudiants'];
  factures: Facture[];
  attendu: number;
  encaisse: number;
}

export const RUBRIQUE_LABELS: Record<TypeFrais, string> = {
  scolarite:    'Frais de scolarité',
  inscription:  "Frais d'inscription",
  examen:       "Frais d'examen",
  bibliotheque: 'Bibliothèque',
  autre:        'Autres frais',
};

export const RUBRIQUE_COLORS: Record<TypeFrais, string> = {
  scolarite:    'blue',
  inscription:  'purple',
  examen:       'amber',
  bibliotheque: 'teal',
  autre:        'gray',
};

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}

// ── Fetch factures ────────────────────────────────────────────────────────────
export async function fetchFactures(ecoleId: string): Promise<Facture[]> {
  const { data, error } = await supabase
    .from('factures')
    .select('*, etudiants(id,nom,prenom,matricule,filiere,niveau)')
    .eq('ecole_id', ecoleId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Facture[];
}

export async function fetchFacturesEtudiant(etudiantId: string): Promise<Facture[]> {
  const { data, error } = await supabase
    .from('factures')
    .select('*')
    .eq('etudiant_id', etudiantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Facture[];
}

// ── Groupement par étudiant ───────────────────────────────────────────────────
export function grouperParEtudiant(factures: Facture[]): EtudiantCompta[] {
  const map: Record<string, EtudiantCompta> = {};
  factures.forEach(f => {
    const id = f.etudiant_id;
    if (!map[id]) map[id] = { etudiant: f.etudiants, factures: [], attendu: 0, encaisse: 0 };
    map[id].factures.push(f);
    map[id].attendu  += f.montant_total || f.montant || 0;
    map[id].encaisse += f.montant_paye || 0;
  });
  return Object.values(map).sort((a, b) => (b.attendu - b.encaisse) - (a.attendu - a.encaisse));
}

// ── Créer facture ─────────────────────────────────────────────────────────────
export async function creerFacture(payload: {
  ecole_id: string; etudiant_id: string; type_frais: TypeFrais;
  libelle: string; montant_total: number; annee_scolaire?: string | null;
  date_echeance?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('factures').insert({
    ...payload, montant_paye: 0, statut: 'en_attente',
  });
  if (error) throw error;
}

// ── Enregistrer paiement ──────────────────────────────────────────────────────
export async function enregistrerPaiement(
  factureId: string, montant: number, mode: ModePaiement
): Promise<void> {
  const { data: f } = await supabase
    .from('factures').select('montant_total,montant,montant_paye').eq('id', factureId).single();
  if (!f) throw new Error('Facture introuvable');
  const total    = f.montant_total || f.montant || 0;
  const nouvPaye = Math.min((f.montant_paye || 0) + montant, total);
  const statut   = nouvPaye >= total ? 'paye' : nouvPaye > 0 ? 'partiel' : 'en_attente';
  const { error } = await supabase.from('factures')
    .update({ montant_paye: nouvPaye, statut, mode_paiement: mode }).eq('id', factureId);
  if (error) throw error;
}

// ── Supprimer facture ─────────────────────────────────────────────────────────
export async function supprimerFacture(factureId: string): Promise<void> {
  const { error } = await supabase.from('factures').delete().eq('id', factureId);
  if (error) throw error;
}

// ── Facturation en masse ──────────────────────────────────────────────────────
export async function fetchSemestresActifs(ecoleId: string) {
  const { data } = await supabase
    .from('semestres').select('id,libelle,niveau')
    .eq('ecole_id', ecoleId).in('statut', ['en_cours', 'planifie']).order('numero');
  return data ?? [];
}

export async function facturationMasse(payload: {
  ecoleId: string; semestreId: string; typeFrais: TypeFrais;
  libelle: string; montant: number; anneeScolaire: string;
  dateEcheance: string | null;
}): Promise<{ ok: number; skip: number }> {
  const { data: ins } = await supabase
    .from('inscriptions_semestre')
    .select('etudiant_id')
    .eq('semestre_id', payload.semestreId)
    .eq('statut', 'active');

  let ok = 0, skip = 0;
  for (const row of (ins ?? [])) {
    // Vérifier doublons
    const { data: exist } = await supabase
      .from('factures')
      .select('id')
      .eq('etudiant_id', row.etudiant_id)
      .eq('type_frais', payload.typeFrais)
      .eq('annee_scolaire', payload.anneeScolaire)
      .maybeSingle();
    if (exist) { skip++; continue; }
    const { error } = await supabase.from('factures').insert({
      ecole_id: payload.ecoleId, etudiant_id: row.etudiant_id,
      type_frais: payload.typeFrais, libelle: payload.libelle,
      montant_total: payload.montant, montant_paye: 0, statut: 'en_attente',
      annee_scolaire: payload.anneeScolaire,
      date_echeance: payload.dateEcheance || null,
    });
    error ? skip++ : ok++;
  }
  return { ok, skip };
}
