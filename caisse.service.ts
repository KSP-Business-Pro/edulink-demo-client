// src/services/caisse.service.ts
// Bloc 2 comptabilité (fin) — Caisse journalière

import { supabase } from './supabase';

export interface CaisseJour {
  id:           string;
  ecole_id:     string;
  date_jour:    string;
  caissier_id:  string | null;
  caissier_nom: string;
  statut:       'ouverte' | 'fermee';
  fond_initial: number;
  total_compte: number | null;
  ecart:        number | null;
  observations: string | null;
  ouverte_le:   string;
  fermee_le:    string | null;
}

export interface RecapCaisse {
  especes:      number;
  virement:     number;
  mobile_money: number;
  cheque:       number;
  total:        number;
  nbPaiements:  number;
}

async function resolveUtilisateurId(authUserId: string): Promise<string | null> {
  const { data } = await supabase.from('utilisateurs').select('id').eq('auth_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

// ── Récupérer (ou constater l'absence de) la caisse du jour pour ce caissier ──
export async function fetchCaisseDuJour(ecoleId: string, authUserId: string): Promise<CaisseJour | null> {
  const utilisateurId = await resolveUtilisateurId(authUserId);
  if (!utilisateurId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('caisse_journaliere').select('*')
    .eq('ecole_id', ecoleId).eq('caissier_id', utilisateurId).eq('date_jour', today)
    .maybeSingle();
  return data as CaisseJour | null;
}

// ── Récapitulatif des encaissements du jour pour ce caissier (par mode) ──────
export async function fetchRecapCaisseDuJour(ecoleId: string, authUserId: string): Promise<RecapCaisse> {
  const utilisateurId = await resolveUtilisateurId(authUserId);
  const today = new Date().toISOString().slice(0, 10);
  const vide: RecapCaisse = { especes: 0, virement: 0, mobile_money: 0, cheque: 0, total: 0, nbPaiements: 0 };
  if (!utilisateurId) return vide;

  const { data } = await supabase
    .from('paiements').select('montant,mode_paiement')
    .eq('ecole_id', ecoleId).eq('caissier_id', utilisateurId).eq('statut', 'valide')
    .gte('date_paiement', `${today}T00:00:00`).lte('date_paiement', `${today}T23:59:59`);

  const recap = { ...vide };
  for (const p of (data ?? [])) {
    const m = Number(p.montant);
    recap.total += m;
    recap.nbPaiements++;
    if (p.mode_paiement === 'especes')      recap.especes += m;
    if (p.mode_paiement === 'virement')     recap.virement += m;
    if (p.mode_paiement === 'mobile_money') recap.mobile_money += m;
    if (p.mode_paiement === 'cheque')       recap.cheque += m;
  }
  return recap;
}

// ── Ouvrir la caisse ──────────────────────────────────────────────────────────
export async function ouvrirCaisse(
  ecoleId: string, authUserId: string, caissierNom: string, fondInitial: number
): Promise<CaisseJour> {
  const utilisateurId = await resolveUtilisateurId(authUserId);
  const { data, error } = await supabase.from('caisse_journaliere')
    .insert({ ecole_id: ecoleId, caissier_id: utilisateurId, caissier_nom: caissierNom, fond_initial: fondInitial })
    .select('*').single();
  if (error) throw new Error(error.message);
  return data as CaisseJour;
}

// ── Clôturer la caisse ────────────────────────────────────────────────────────
export async function fermerCaisse(
  caisseId: string, totalCompte: number, totalTheoriqueEspeces: number, fondInitial: number, observations: string
): Promise<void> {
  const ecart = totalCompte - (fondInitial + totalTheoriqueEspeces);
  const { error } = await supabase.from('caisse_journaliere')
    .update({
      statut: 'fermee', total_compte: totalCompte, ecart,
      observations: observations.trim() || null, fermee_le: new Date().toISOString(),
    })
    .eq('id', caisseId);
  if (error) throw new Error(error.message);
}

// ── Historique des caisses (pour un rappel rapide, école entière) ────────────
export async function fetchHistoriqueCaisses(ecoleId: string, limite = 15): Promise<CaisseJour[]> {
  const { data, error } = await supabase
    .from('caisse_journaliere').select('*')
    .eq('ecole_id', ecoleId).order('date_jour', { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as CaisseJour[];
}
