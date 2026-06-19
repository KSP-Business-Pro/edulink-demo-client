// src/modules/inscriptions/inscriptions.service.ts

import { supabase } from '../../services/supabase';

// ── Types ──────────────────────────────────────────────────────────────────
export type InscriptionStatut = 'active' | 'suspendue' | 'abandonnee';

export interface Inscription {
  inscription_id:        string;
  etudiant_id:           string;
  etudiant_nom:          string;
  etudiant_prenom:       string | null;
  etudiant_matricule:    string | null;
  etudiant_niveau:       string | null;
  semestre_id:           string;
  semestre_libelle:      string;
  promotion_id:          string | null;
  promotion_nom:         string | null;
  annee_academique_id:   string | null;
  annee_libelle:         string | null;
  statut:                InscriptionStatut;
  date_inscription:      string;
  created_at:            string;
  facture_statut:        string | null;
  facture_montant_total: number | null;
}

export interface Semestre {
  id:      string;
  libelle: string;
  niveau:  string;
  statut:  string;
  annee:   string | null;
}

export interface Promotion {
  id:                  string;
  nom:                 string;
  niveau:              string;
  effectif_max:        number | null;
  statut:              string;
  annee_academique_id: string;
}

export interface BatchResult {
  ok:       boolean;
  inscrits: number;
  doublons: number;
  erreurs:  number;
  factures: number;
}

// ── Fetch inscriptions (via RPC) ───────────────────────────────────────────
export async function fetchInscriptions(
  ecoleId:    string,
  semestreId?: string,
  statut?:    string,
): Promise<Inscription[]> {
  const { data, error } = await supabase.rpc('fn_get_inscriptions_semestre', {
    p_ecole_id:    ecoleId,
    p_semestre_id: semestreId ?? null,
    p_statut_filtre: statut   ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Inscription[];
}

// ── Fetch semestres ────────────────────────────────────────────────────────
export async function fetchSemestres(ecoleId: string): Promise<Semestre[]> {
  const { data, error } = await supabase
    .from('semestres')
    .select('id, libelle, niveau, statut, annees_academiques(libelle)')
    .eq('ecole_id', ecoleId)
    .order('libelle');
  if (error) throw new Error(error.message);
  return (data ?? []).map((s: any) => ({
    id:      s.id,
    libelle: s.libelle,
    niveau:  s.niveau,
    statut:  s.statut,
    annee:   s.annees_academiques?.libelle ?? null,
  }));
}

// ── Fetch promotions ───────────────────────────────────────────────────────
export async function fetchPromotions(ecoleId: string): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('id, nom, niveau, effectif_max, statut, annee_academique_id')
    .eq('ecole_id', ecoleId)
    .eq('statut', 'active')
    .order('niveau');
  if (error) throw new Error(error.message);
  return (data ?? []) as Promotion[];
}

// ── Fetch étudiants d'une promotion (pour inscription individuelle) ────────
export async function fetchEtudiantsPromotion(
  ecoleId:     string,
  promotionId: string,
  semestreId:  string,
): Promise<{ id: string; nom: string; prenom: string | null; matricule: string | null; niveau: string | null; deja_inscrit: boolean }[]> {
  const { data: etudiants } = await supabase
    .from('etudiants')
    .select('id, nom, prenom, matricule, niveau')
    .eq('ecole_id', ecoleId)
    .eq('statut', 'actif')
    .order('nom');

  const { data: inscExist } = await supabase
    .from('inscriptions_semestre')
    .select('etudiant_id')
    .eq('semestre_id', semestreId)
    .eq('promotion_id', promotionId);

  const dejaInscrits = new Set((inscExist ?? []).map((i: any) => i.etudiant_id));

  return (etudiants ?? []).map((e: any) => ({
    ...e,
    deja_inscrit: dejaInscrits.has(e.id),
  }));
}

// ── Inscription individuelle ───────────────────────────────────────────────
export async function inscrireEtudiant(params: {
  etudiantId:          string;
  semestreId:          string;
  promotionId:         string;
  anneeAcademiqueId:   string;
  ecoleId:             string;
  montantScolarite:    number;
  genererFacture:      boolean;
}): Promise<{ ok: boolean; error?: string; inscription_id?: string; facture_id?: string }> {
  const { data, error } = await supabase.rpc('fn_inscrire_etudiant_semestre', {
    p_etudiant_id:          params.etudiantId,
    p_semestre_id:          params.semestreId,
    p_promotion_id:         params.promotionId,
    p_annee_academique_id:  params.anneeAcademiqueId,
    p_ecole_id:             params.ecoleId,
    p_montant_scolarite:    params.montantScolarite,
    p_generer_facture:      params.genererFacture,
  });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string; inscription_id?: string; facture_id?: string };
}

// ── Inscription batch (promotion entière) ──────────────────────────────────
export async function inscrirePromotion(params: {
  promotionId:          string;
  semestreId:           string;
  anneeAcademiqueId:    string;
  ecoleId:              string;
  montantScolarite:     number;
  genererFactures:      boolean;
}): Promise<BatchResult> {
  const { data, error } = await supabase.rpc('fn_inscrire_promotion', {
    p_promotion_id:         params.promotionId,
    p_semestre_id:          params.semestreId,
    p_annee_academique_id:  params.anneeAcademiqueId,
    p_ecole_id:             params.ecoleId,
    p_montant_scolarite:    params.montantScolarite,
    p_generer_factures:     params.genererFactures,
  });
  if (error) throw new Error(error.message);
  return data as BatchResult;
}

// ── Changer statut inscription ─────────────────────────────────────────────
export async function updateStatutInscription(
  inscriptionId: string,
  statut:        InscriptionStatut,
): Promise<void> {
  const { error } = await supabase
    .from('inscriptions_semestre')
    .update({ statut })
    .eq('id', inscriptionId);
  if (error) throw new Error(error.message);
}

// ── Supprimer inscription ──────────────────────────────────────────────────
export async function deleteInscription(inscriptionId: string): Promise<void> {
  const { error } = await supabase
    .from('inscriptions_semestre')
    .delete()
    .eq('id', inscriptionId);
  if (error) throw new Error(error.message);
}

