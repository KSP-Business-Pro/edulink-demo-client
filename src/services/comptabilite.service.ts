// src/services/comptabilite.service.ts
import { supabase } from './supabase';

export type StatutFacture = 'en_attente' | 'partiel' | 'paye' | 'annule';
export type TypeFrais = 'scolarite' | 'inscription' | 'examen' | 'bibliotheque' | 'autre';
export type ModePaiement = 'especes' | 'virement' | 'mobile_money' | 'cheque';

export interface Paiement {
  id:               string;
  ecole_id:         string;
  facture_id:       string;
  etudiant_id:      string;
  montant:          number;
  mode_paiement:    ModePaiement;
  reference:        string | null;
  date_paiement:    string;
  caissier_id:      string | null;
  caissier_nom:     string | null;
  numero_recu:      string;
  statut:           'valide' | 'annule';
  motif_annulation: string | null;
  annule_par:       string | null;
  annule_le:        string | null;
  observation:      string | null;
  created_at:       string;
}

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
  grille_tarifaire_id: string | null;
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

export { fmt, grouperParEtudiant } from './accounting/comptabilite.calc';

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


// ── Créer facture ─────────────────────────────────────────────────────────────
export async function creerFacture(payload: {
  ecole_id: string; etudiant_id: string; type_frais: TypeFrais;
  libelle: string; montant_total: number; annee_scolaire?: string | null;
  date_echeance?: string | null; grille_tarifaire_id?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('factures').insert({
    ...payload, montant_paye: 0, statut: 'en_attente',
  });
  if (error) throw error;
}

// ── Mappe un code de type_frais configurable vers l'enum legacy de `factures` ──
function mapCodeVersTypeFraisLegacy(code: string): TypeFrais {
  const c = code.toUpperCase();
  if (c.startsWith('SCO')) return 'scolarite';
  if (c.startsWith('INS')) return 'inscription';
  if (c.startsWith('EXA')) return 'examen';
  if (c.startsWith('BIB')) return 'bibliotheque';
  return 'autre';
}

// ── Facturation individuelle depuis une grille tarifaire ─────────────────────
export async function genererFactureDepuisGrille(
  grilleTarifaireId: string, etudiantId: string
): Promise<{ skipped: boolean }> {
  const { data: g, error: errG } = await supabase
    .from('grilles_tarifaires')
    .select('*, types_frais(code,libelle), annees_academiques(libelle)')
    .eq('id', grilleTarifaireId).single();
  if (errG || !g) throw new Error(errG?.message ?? 'Grille tarifaire introuvable');

  // Anti-doublon : une seule facture par (étudiant, grille)
  const { data: exist } = await supabase.from('factures')
    .select('id').eq('etudiant_id', etudiantId).eq('grille_tarifaire_id', grilleTarifaireId).maybeSingle();
  if (exist) return { skipped: true };

  // Échéance = dernière tranche de l'échéancier de cette grille (si défini)
  const { data: echs } = await supabase.from('echeanciers')
    .select('date_echeance').eq('grille_tarifaire_id', grilleTarifaireId).order('tranche', { ascending: false }).limit(1);
  const dateEcheance = echs?.[0]?.date_echeance ?? null;

  const anneeLibelle = (g as any).annees_academiques?.libelle ?? null;
  const typeFraisLibelle = (g as any).types_frais?.libelle ?? 'Frais';
  const typeFraisCode    = (g as any).types_frais?.code ?? 'AUT';

  const { error } = await supabase.from('factures').insert({
    ecole_id: g.ecole_id, etudiant_id: etudiantId,
    type_frais: mapCodeVersTypeFraisLegacy(typeFraisCode),
    libelle: `${typeFraisLibelle}${anneeLibelle ? ' ' + anneeLibelle : ''}`,
    montant_total: g.montant, montant_paye: 0, statut: 'en_attente',
    annee_scolaire: anneeLibelle, date_echeance: dateEcheance,
    grille_tarifaire_id: grilleTarifaireId,
  });
  if (error) throw new Error(error.message);
  return { skipped: false };
}

// ── Facturation en masse depuis une grille tarifaire, pour un semestre/promo ─
export async function genererFacturesDepuisGrillePourPromotion(
  grilleTarifaireId: string, semestreId: string
): Promise<{ ok: number; skip: number }> {
  const { data: ins } = await supabase
    .from('inscriptions_semestre').select('etudiant_id')
    .eq('semestre_id', semestreId).eq('statut', 'active');

  let ok = 0, skip = 0;
  for (const row of (ins ?? [])) {
    try {
      const { skipped } = await genererFactureDepuisGrille(grilleTarifaireId, row.etudiant_id);
      if (skipped) skip++; else ok++;
    } catch { skip++; }
  }
  return { ok, skip };
}

// ── Résolution caissier (utilisateurs.id à partir de l'auth_id courant) ────────
async function resolveCaissierId(authUserId: string): Promise<string | null> {
  const { data } = await supabase.from('utilisateurs').select('id,nom,prenom').eq('auth_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

// ── Enregistrer paiement (détaillé, avec reçu numéroté) ─────────────────────
export async function enregistrerPaiement(
  factureId: string,
  montant: number,
  mode: ModePaiement,
  opts: { reference?: string; observation?: string; authUserId: string; caissierNom: string }
): Promise<{ numeroRecu: string; paiementId: string }> {
  const { data: f } = await supabase
    .from('factures').select('ecole_id,etudiant_id,montant_total,montant,montant_paye').eq('id', factureId).single();
  if (!f) throw new Error('Facture introuvable');

  if ((mode === 'virement' || mode === 'mobile_money') && !opts.reference?.trim()) {
    throw new Error('La référence de transaction est obligatoire pour ce mode de paiement.');
  }

  // Numéro de reçu — atomique côté serveur (RPC SECURITY DEFINER)
  const { data: numeroRecu, error: errRecu } = await supabase.rpc('fn_generate_numero_recu', { p_ecole_id: f.ecole_id });
  if (errRecu || !numeroRecu) throw new Error(errRecu?.message ?? 'Impossible de générer le numéro de reçu');

  const caissierId = await resolveCaissierId(opts.authUserId);

  const { data: nouveauPaiement, error: errPaiement } = await supabase.from('paiements').insert({
    ecole_id:      f.ecole_id,
    facture_id:    factureId,
    etudiant_id:   f.etudiant_id,
    montant,
    mode_paiement: mode,
    reference:     opts.reference?.trim() || null,
    caissier_id:   caissierId,
    caissier_nom:  opts.caissierNom,
    numero_recu:   numeroRecu,
    observation:   opts.observation?.trim() || null,
  }).select('id').single();
  if (errPaiement) throw new Error(errPaiement.message);

  // Met à jour le cumul sur la facture (conservé pour compat avec le reste de l'UI)
  const total    = f.montant_total || f.montant || 0;
  const nouvPaye = Math.min((f.montant_paye || 0) + montant, total);
  const statut   = nouvPaye >= total ? 'paye' : nouvPaye > 0 ? 'partiel' : 'en_attente';
  const { error: errFacture } = await supabase.from('factures')
    .update({ montant_paye: nouvPaye, statut, mode_paiement: mode }).eq('id', factureId);
  if (errFacture) throw new Error(errFacture.message);

  return { numeroRecu, paiementId: nouveauPaiement.id };
}

// ── Historique des paiements d'une facture ───────────────────────────────────
export async function fetchPaiementsFacture(factureId: string): Promise<Paiement[]> {
  const { data, error } = await supabase
    .from('paiements').select('*').eq('facture_id', factureId).order('date_paiement', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Paiement[];
}

// ── Annuler un paiement (jamais de suppression physique — écriture inverse) ──
export async function annulerPaiement(
  paiementId: string, motif: string, authUserId: string
): Promise<void> {
  const { data: p } = await supabase.from('paiements').select('facture_id,montant,statut').eq('id', paiementId).single();
  if (!p) throw new Error('Paiement introuvable');
  if (p.statut === 'annule') throw new Error('Ce paiement est déjà annulé');

  const annulePar = await resolveCaissierId(authUserId);

  const { error: errAnnul } = await supabase.from('paiements').update({
    statut: 'annule', motif_annulation: motif.trim(), annule_par: annulePar, annule_le: new Date().toISOString(),
  }).eq('id', paiementId);
  if (errAnnul) throw new Error(errAnnul.message);

  // Recalcule le cumul de la facture à partir des paiements encore valides
  const { data: f } = await supabase.from('factures').select('montant_total,montant').eq('id', p.facture_id).single();
  const { data: valides } = await supabase.from('paiements').select('montant').eq('facture_id', p.facture_id).eq('statut', 'valide');
  const totalPaye = (valides ?? []).reduce((s, x) => s + Number(x.montant), 0);
  const total     = f?.montant_total || f?.montant || 0;
  const statut    = totalPaye >= total && total > 0 ? 'paye' : totalPaye > 0 ? 'partiel' : 'en_attente';
  const { error: errMaj } = await supabase.from('factures').update({ montant_paye: totalPaye, statut }).eq('id', p.facture_id);
  if (errMaj) throw new Error(errMaj.message);
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

// ── Données complètes pour affichage/impression d'un reçu ─────────────────────
export async function fetchDonneesRecu(paiementId: string) {
  const { data: p, error } = await supabase
    .from('paiements')
    .select(`
      numero_recu, montant, mode_paiement, reference, date_paiement, caissier_nom, observation,
      factures ( libelle, reference, montant_total, montant, montant_paye ),
      etudiants ( nom, prenom, matricule ),
      ecoles ( nom )
    `)
    .eq('id', paiementId)
    .single();
  if (error || !p) throw new Error(error?.message ?? 'Reçu introuvable');

  const f = p.factures as any;
  const e = p.etudiants as any;
  const ec = p.ecoles as any;
  const totalFacture = f?.montant_total ?? f?.montant ?? 0;
  const montantPayeApres = f?.montant_paye ?? 0;

  return {
    paiement: {
      numero_recu: p.numero_recu, montant: p.montant, mode_paiement: p.mode_paiement,
      reference: p.reference, date_paiement: p.date_paiement,
      caissier_nom: p.caissier_nom, observation: p.observation,
    },
    facture: {
      libelle: f?.libelle ?? '', reference: f?.reference ?? null,
      montant_total: totalFacture,
      montant_paye_avant: Math.max(0, montantPayeApres - p.montant),
    },
    etudiant: { nom: e?.nom ?? '', prenom: e?.prenom ?? '', matricule: e?.matricule ?? '' },
    ecole: { nom: ec?.nom ?? '' },
  };
}
