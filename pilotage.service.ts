// src/services/pilotage.service.ts
// Bloc 4 comptabilité — Pilotage financier (dashboard, rapports, audit, clôtures)

import { supabase } from './supabase';
import { fetchFactures, grouperParEtudiant, type TypeFrais, RUBRIQUE_LABELS } from './comptabilite.service';

export interface StatsGlobales {
  totalAttendu:  number;
  totalEncaisse: number;
  totalImpaye:   number;
  tauxRecouvrement: number;
  parType: { type: TypeFrais; label: string; attendu: number; encaisse: number }[];
  evolutionMensuelle: { mois: string; montant: number }[];
}

export interface EntreeAudit {
  id:         string;
  created_at: string;
  action:     string;
  table_name: string;
  details:    string;
  user_email: string | null;
  user_role:  string | null;
  statut:     string;
}

export interface Cloture {
  id:               string;
  ecole_id:         string;
  periode_debut:    string;
  periode_fin:      string;
  libelle:          string;
  total_attendu:    number;
  total_encaisse:   number;
  total_impaye:     number;
  cloturee_par_nom: string;
  observations:     string | null;
  created_at:       string;
}

async function resolveUtilisateurId(authUserId: string): Promise<string | null> {
  const { data } = await supabase.from('utilisateurs').select('id').eq('auth_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

// ── Statistiques globales pour le dashboard ──────────────────────────────────
export async function fetchStatsGlobales(ecoleId: string): Promise<StatsGlobales> {
  const factures = await fetchFactures(ecoleId);

  let totalAttendu = 0, totalEncaisse = 0;
  const parTypeMap: Record<string, { attendu: number; encaisse: number }> = {};
  factures.forEach(f => {
    const attendu = f.montant_total || f.montant || 0;
    const encaisse = f.montant_paye || 0;
    totalAttendu += attendu;
    totalEncaisse += encaisse;
    if (!parTypeMap[f.type_frais]) parTypeMap[f.type_frais] = { attendu: 0, encaisse: 0 };
    parTypeMap[f.type_frais].attendu += attendu;
    parTypeMap[f.type_frais].encaisse += encaisse;
  });

  const parType = Object.entries(parTypeMap).map(([type, v]) => ({
    type: type as TypeFrais, label: RUBRIQUE_LABELS[type as TypeFrais] ?? type, ...v,
  })).sort((a, b) => b.attendu - a.attendu);

  // Évolution mensuelle des encaissements (paiements valides, 6 derniers mois)
  const sixMoisAgo = new Date();
  sixMoisAgo.setMonth(sixMoisAgo.getMonth() - 5);
  sixMoisAgo.setDate(1);
  const { data: paiements } = await supabase
    .from('paiements').select('montant,date_paiement')
    .eq('ecole_id', ecoleId).eq('statut', 'valide').gte('date_paiement', sixMoisAgo.toISOString());

  const moisMap: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const d = new Date(sixMoisAgo); d.setMonth(d.getMonth() + i);
    moisMap[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
  }
  (paiements ?? []).forEach(p => {
    const d = new Date(p.date_paiement);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in moisMap) moisMap[key] += Number(p.montant);
  });
  const MOIS_LABEL = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const evolutionMensuelle = Object.entries(moisMap).map(([key, montant]) => {
    const [, m] = key.split('-');
    return { mois: MOIS_LABEL[parseInt(m) - 1], montant };
  });

  return {
    totalAttendu, totalEncaisse, totalImpaye: totalAttendu - totalEncaisse,
    tauxRecouvrement: totalAttendu > 0 ? Math.round((totalEncaisse / totalAttendu) * 100) : 0,
    parType, evolutionMensuelle,
  };
}

// ── Journal des paiements (pour export) ──────────────────────────────────────
export async function fetchJournalPaiements(ecoleId: string, dateDebut: string, dateFin: string) {
  const { data, error } = await supabase
    .from('paiements')
    .select('numero_recu,montant,mode_paiement,reference,date_paiement,caissier_nom,statut,motif_annulation,etudiants(nom,prenom,matricule),factures(libelle,type_frais)')
    .eq('ecole_id', ecoleId)
    .gte('date_paiement', `${dateDebut}T00:00:00`).lte('date_paiement', `${dateFin}T23:59:59`)
    .order('date_paiement', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Journal d'audit comptable (factures + paiements) ─────────────────────────
export async function fetchAuditComptable(ecoleId: string, limite = 40): Promise<EntreeAudit[]> {
  const { data, error } = await supabase
    .from('audit_log').select('id,created_at,action,table_name,details,user_email,user_role,statut')
    .eq('ecole_id', ecoleId).in('table_name', ['factures', 'paiements'])
    .order('created_at', { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as EntreeAudit[];
}

// ── Clôtures comptables ───────────────────────────────────────────────────────
export async function fetchClotures(ecoleId: string): Promise<Cloture[]> {
  const { data, error } = await supabase
    .from('clotures_comptables').select('*').eq('ecole_id', ecoleId).order('periode_debut', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Cloture[];
}

export async function cloturerPeriode(payload: {
  ecoleId: string; periodeDebut: string; periodeFin: string; libelle: string;
  totalAttendu: number; totalEncaisse: number; observations: string; authUserId: string; clotureeParNom: string;
}): Promise<void> {
  const utilisateurId = await resolveUtilisateurId(payload.authUserId);
  const { error } = await supabase.from('clotures_comptables').insert({
    ecole_id: payload.ecoleId, periode_debut: payload.periodeDebut, periode_fin: payload.periodeFin,
    libelle: payload.libelle, total_attendu: payload.totalAttendu, total_encaisse: payload.totalEncaisse,
    total_impaye: payload.totalAttendu - payload.totalEncaisse,
    cloturee_par: utilisateurId, cloturee_par_nom: payload.clotureeParNom,
    observations: payload.observations.trim() || null,
  });
  if (error) throw new Error(error.message);
}
