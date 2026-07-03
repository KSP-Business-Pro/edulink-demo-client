// src/services/recouvrement.service.ts
// Bloc 3 comptabilité — Suivi et recouvrement (impayés, relances, dérogations)

import { supabase } from './supabase';
import { fetchFactures, grouperParEtudiant, type EtudiantCompta } from './comptabilite.service';

export interface Impaye extends EtudiantCompta {
  solde: number;
  joursRetard: number;      // jours écoulés depuis la 1ère échéance dépassée non soldée (0 si aucune échéance dépassée)
  nbRelances: number;
  derniereRelance: string | null;
}

export interface Relance {
  id:             string;
  ecole_id:       string;
  etudiant_id:    string;
  canal:          'email' | 'sms' | 'appel' | 'autre';
  message:        string | null;
  montant_du:     number;
  envoye_par_nom: string;
  envoye_le:      string;
}

export interface Derogation {
  id:               string;
  ecole_id:         string;
  etudiant_id:      string;
  type_derogation:  'acces_releve' | 'inscription' | 'examen' | 'autre';
  motif:            string;
  accordee_par_nom: string;
  date_debut:       string;
  date_fin:         string | null;
  active:           boolean;
  created_at:       string;
}

const TYPE_DEROGATION_LABEL: Record<Derogation['type_derogation'], string> = {
  acces_releve: 'Accès relevé de notes',
  inscription:  'Inscription semestre suivant',
  examen:       "Participation à l'examen",
  autre:        'Autre',
};
export { TYPE_DEROGATION_LABEL };

async function resolveUtilisateurId(authUserId: string): Promise<string | null> {
  const { data } = await supabase.from('utilisateurs').select('id').eq('auth_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

// ── Liste des étudiants en situation d'impayé, triés par ancienneté ──────────
export async function fetchImpayes(ecoleId: string): Promise<Impaye[]> {
  const factures = await fetchFactures(ecoleId);
  const groupes = grouperParEtudiant(factures).filter(g => (g.attendu - g.encaisse) > 0 && g.etudiant);

  const etudiantIds = groupes.map(g => g.etudiant!.id);
  const { data: relances } = etudiantIds.length
    ? await supabase.from('relances_paiement').select('etudiant_id,envoye_le').eq('ecole_id', ecoleId).in('etudiant_id', etudiantIds)
    : { data: [] as { etudiant_id: string; envoye_le: string }[] };

  const relancesParEtudiant: Record<string, string[]> = {};
  for (const r of (relances ?? [])) {
    (relancesParEtudiant[r.etudiant_id] ??= []).push(r.envoye_le);
  }

  const today = Date.now();
  return groupes.map(g => {
    const echeancesDepassees = g.factures
      .filter(f => (f.montant_total - f.montant_paye) > 0 && f.date_echeance)
      .map(f => new Date(f.date_echeance!).getTime())
      .filter(t => t < today);
    const plusAncienne = echeancesDepassees.length ? Math.min(...echeancesDepassees) : null;
    const joursRetard = plusAncienne ? Math.floor((today - plusAncienne) / 86400000) : 0;
    const dates = (relancesParEtudiant[g.etudiant!.id] ?? []).sort().reverse();
    return {
      ...g,
      solde: g.attendu - g.encaisse,
      joursRetard,
      nbRelances: dates.length,
      derniereRelance: dates[0] ?? null,
    };
  }).sort((a, b) => b.joursRetard - a.joursRetard || b.solde - a.solde);
}

// ── Relances ──────────────────────────────────────────────────────────────────
export async function fetchRelancesEtudiant(etudiantId: string): Promise<Relance[]> {
  const { data, error } = await supabase
    .from('relances_paiement').select('*').eq('etudiant_id', etudiantId).order('envoye_le', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Relance[];
}

export async function enregistrerRelance(payload: {
  ecoleId: string; etudiantId: string; canal: Relance['canal']; message: string;
  montantDu: number; authUserId: string; envoyeParNom: string;
}): Promise<void> {
  const utilisateurId = await resolveUtilisateurId(payload.authUserId);
  const { error } = await supabase.from('relances_paiement').insert({
    ecole_id: payload.ecoleId, etudiant_id: payload.etudiantId, canal: payload.canal,
    message: payload.message.trim() || null, montant_du: payload.montantDu,
    envoye_par: utilisateurId, envoye_par_nom: payload.envoyeParNom,
  });
  if (error) throw new Error(error.message);
}

// ── Dérogations ───────────────────────────────────────────────────────────────
export async function fetchDerogationsEtudiant(etudiantId: string): Promise<Derogation[]> {
  const { data, error } = await supabase
    .from('derogations_financieres').select('*').eq('etudiant_id', etudiantId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Derogation[];
}

export async function accorderDerogation(payload: {
  ecoleId: string; etudiantId: string; type: Derogation['type_derogation']; motif: string;
  dateFin: string | null; authUserId: string; accordeeParNom: string;
}): Promise<void> {
  const utilisateurId = await resolveUtilisateurId(payload.authUserId);
  const { error } = await supabase.from('derogations_financieres').insert({
    ecole_id: payload.ecoleId, etudiant_id: payload.etudiantId, type_derogation: payload.type,
    motif: payload.motif.trim(), date_fin: payload.dateFin || null,
    accordee_par: utilisateurId, accordee_par_nom: payload.accordeeParNom,
  });
  if (error) throw new Error(error.message);
}

export async function revoquerDerogation(id: string, authUserId: string): Promise<void> {
  const utilisateurId = await resolveUtilisateurId(authUserId);
  const { error } = await supabase.from('derogations_financieres')
    .update({ active: false, revoquee_le: new Date().toISOString(), revoquee_par: utilisateurId })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Vérifie si un étudiant a une dérogation active (et non expirée) pour un type donné. */
export async function aDerogationActive(etudiantId: string, type: Derogation['type_derogation']): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('derogations_financieres').select('id,date_fin')
    .eq('etudiant_id', etudiantId).eq('type_derogation', type).eq('active', true);
  return (data ?? []).some(d => !d.date_fin || d.date_fin >= today);
}
