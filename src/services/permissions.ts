// src/services/permissions.ts
// Matrice complète des permissions pour les 7 rôles EduLink Sup
// Basée sur les règles CAMES + règles métier HEMEC/ESM

import type { UserRole } from '../types/auth.types';

// ── Définition des permissions ────────────────────────────────────────────
export interface Permissions {
  // Navigation — modules visibles
  voir_dashboard:       boolean;
  voir_etudiants:       boolean;
  voir_programmes:      boolean;
  voir_semestres:       boolean;
  voir_annees: boolean;
  voir_promotions:      boolean;
  voir_saisie_notes:    boolean;
  voir_presences:       boolean;
  voir_resultats:       boolean;
  voir_deliberations:   boolean;
  voir_releves:         boolean;
  voir_enseignants:     boolean;
  voir_comptabilite:    boolean;
  voir_messages:        boolean;
  voir_parametres:      boolean;
  voir_parametres_ecole: boolean;
  voir_prospects:       boolean;
  voir_monitoring:      boolean;
  voir_audit:           boolean;
  voir_utilisateurs:    boolean;
  voir_portail_enseignant: boolean;
  voir_rh_personnel: boolean;
  voir_email_parents: boolean;
  voir_portail_public: boolean;
  voir_analytics_ia: boolean;

  // Actions critiques
  modifier_notes:       boolean;
  publier_releves:      boolean;
  verrouiller_releves:  boolean;
  gerer_utilisateurs:   boolean;
  gerer_ecole:          boolean;
  voir_toutes_ecoles:   boolean; // super-admin uniquement
  exporter_donnees:     boolean;
  supprimer_etudiant:   boolean;
  valider_paiements:    boolean;
  override_deliberation:boolean;
}

// ── Matrice par rôle ──────────────────────────────────────────────────────
const MATRIX: Record<UserRole, Permissions> = {

  // Super-admin réseau (ecole_id = null) — accès total
  admin: {
    voir_dashboard: true, voir_etudiants: true, voir_programmes: true,
    voir_semestres: true, voir_promotions: true, voir_saisie_notes: true, voir_annees: true,
    voir_presences: true, voir_resultats: true, voir_deliberations: true,
    voir_releves: true, voir_enseignants: true, voir_comptabilite: true,
    voir_messages: true, voir_parametres: true, voir_prospects: true, voir_monitoring: true, voir_audit: true, voir_utilisateurs: true, voir_portail_enseignant: true, voir_rh_personnel: true, voir_email_parents: true, voir_portail_public: true, voir_analytics_ia: true, voir_parametres_ecole: true,
    modifier_notes: true, publier_releves: true, verrouiller_releves: true,
    gerer_utilisateurs: true, gerer_ecole: true, voir_toutes_ecoles: true,
    exporter_donnees: true, supprimer_etudiant: true, valider_paiements: true,
    override_deliberation: true,
  },

  // Direction — vue générale, pas de saisie
  direction: {
    voir_dashboard: true, voir_etudiants: true, voir_programmes: true,
    voir_semestres: true, voir_promotions: true, voir_saisie_notes: false, voir_annees: true,
    voir_presences: true, voir_resultats: true, voir_deliberations: true,
    voir_releves: true, voir_enseignants: true, voir_comptabilite: true,
    voir_messages: true, voir_parametres: false, voir_prospects: true, voir_monitoring: false, voir_audit: true, voir_utilisateurs: false, voir_portail_enseignant: false, voir_rh_personnel: false, voir_email_parents: false, voir_portail_public: false, voir_analytics_ia: false, voir_parametres_ecole: false,
    modifier_notes: false, publier_releves: false, verrouiller_releves: true,
    gerer_utilisateurs: false, gerer_ecole: false, voir_toutes_ecoles: false,
    exporter_donnees: true, supprimer_etudiant: false, valider_paiements: false,
    override_deliberation: true,
  },

  // Scolarité — gestion académique complète sauf finances et paramètres
  scolarite: {
    voir_dashboard: true, voir_etudiants: true, voir_programmes: true,
    voir_semestres: true, voir_promotions: true, voir_saisie_notes: true, voir_annees: true,
    voir_presences: true, voir_resultats: true, voir_deliberations: true,
    voir_releves: true, voir_enseignants: true, voir_comptabilite: false,
    voir_messages: true, voir_parametres: false, voir_prospects: false, voir_monitoring: false, voir_audit: false, voir_utilisateurs: false, voir_portail_enseignant: false, voir_rh_personnel: false, voir_email_parents: false, voir_portail_public: false, voir_analytics_ia: false, voir_parametres_ecole: false,
    modifier_notes: true, publier_releves: true, verrouiller_releves: true,
    gerer_utilisateurs: false, gerer_ecole: false, voir_toutes_ecoles: false,
    exporter_donnees: true, supprimer_etudiant: false, valider_paiements: false,
    override_deliberation: false,
  },

  // Enseignant — saisie notes de ses matières uniquement
  enseignant: {
    voir_dashboard: true, voir_etudiants: false, voir_programmes: false,
    voir_semestres: false, voir_promotions: false, voir_saisie_notes: true, voir_annees: false,
    voir_presences: true, voir_resultats: false, voir_deliberations: false,
    voir_releves: false, voir_enseignants: false, voir_comptabilite: false,
    voir_messages: true, voir_parametres: false, voir_prospects: false, voir_monitoring: false, voir_audit: false, voir_utilisateurs: false, voir_portail_enseignant: true, voir_rh_personnel: true, voir_email_parents: true, voir_portail_public: true, voir_analytics_ia: true, voir_parametres_ecole: false,
    modifier_notes: true, publier_releves: false, verrouiller_releves: false,
    gerer_utilisateurs: false, gerer_ecole: false, voir_toutes_ecoles: false,
    exporter_donnees: false, supprimer_etudiant: false, valider_paiements: false,
    override_deliberation: false,
  },

  // Comptable — uniquement finances
  comptable: {
    voir_dashboard: true, voir_etudiants: true, voir_programmes: false,
    voir_semestres: false, voir_promotions: false, voir_saisie_notes: false, voir_annees: false,
    voir_presences: false, voir_resultats: false, voir_deliberations: false,
    voir_releves: false, voir_enseignants: false, voir_comptabilite: true,
    voir_messages: true, voir_parametres: false, voir_prospects: false, voir_monitoring: false, voir_audit: false, voir_utilisateurs: false, voir_portail_enseignant: false, voir_rh_personnel: false, voir_email_parents: false, voir_portail_public: false, voir_analytics_ia: false, voir_parametres_ecole: false,
    modifier_notes: false, publier_releves: false, verrouiller_releves: false,
    gerer_utilisateurs: false, gerer_ecole: false, voir_toutes_ecoles: false,
    exporter_donnees: true, supprimer_etudiant: false, valider_paiements: true,
    override_deliberation: false,
  },

  // Étudiant (portail) — accès lecture seule à ses propres données
  etudiant: {
    voir_dashboard: false, voir_etudiants: false, voir_programmes: false,
    voir_semestres: false, voir_promotions: false, voir_saisie_notes: false, voir_annees: false,
    voir_presences: false, voir_resultats: false, voir_deliberations: false,
    voir_releves: true, voir_enseignants: false, voir_comptabilite: false,
    voir_messages: false, voir_parametres: false, voir_prospects: false, voir_monitoring: false, voir_audit: false, voir_utilisateurs: false, voir_portail_enseignant: false, voir_rh_personnel: false, voir_email_parents: false, voir_portail_public: false, voir_analytics_ia: false, voir_parametres_ecole: false,
    modifier_notes: false, publier_releves: false, verrouiller_releves: false,
    gerer_utilisateurs: false, gerer_ecole: false, voir_toutes_ecoles: false,
    exporter_donnees: false, supprimer_etudiant: false, valider_paiements: false,
    override_deliberation: false,
  },

  // Parent — lecture relevés de son enfant uniquement
  parent: {
    voir_dashboard: false, voir_etudiants: false, voir_programmes: false,
    voir_semestres: false, voir_promotions: false, voir_saisie_notes: false, voir_annees: false,
    voir_presences: false, voir_resultats: false, voir_deliberations: false,
    voir_releves: true, voir_enseignants: false, voir_comptabilite: false,
    voir_messages: false, voir_parametres: false, voir_prospects: false, voir_monitoring: false, voir_audit: false, voir_utilisateurs: false, voir_portail_enseignant: false, voir_rh_personnel: false, voir_email_parents: false, voir_portail_public: false, voir_analytics_ia: false, voir_parametres_ecole: false,
    modifier_notes: false, publier_releves: false, verrouiller_releves: false,
    gerer_utilisateurs: false, gerer_ecole: false, voir_toutes_ecoles: false,
    exporter_donnees: false, supprimer_etudiant: false, valider_paiements: false,
    override_deliberation: false,
  },

  // Anonyme — aucune permission
  anon: {
    voir_dashboard: false, voir_etudiants: false, voir_programmes: false,
    voir_semestres: false, voir_promotions: false, voir_saisie_notes: false, voir_annees: false,
    voir_presences: false, voir_resultats: false, voir_deliberations: false,
    voir_releves: false, voir_enseignants: false, voir_comptabilite: false,
    voir_messages: false, voir_parametres: false, voir_prospects: false, voir_monitoring: false, voir_audit: false, voir_utilisateurs: false, voir_portail_enseignant: false, voir_rh_personnel: false, voir_email_parents: false, voir_portail_public: false, voir_analytics_ia: false, voir_parametres_ecole: false,
    modifier_notes: false, publier_releves: false, verrouiller_releves: false,
    gerer_utilisateurs: false, gerer_ecole: false, voir_toutes_ecoles: false,
    exporter_donnees: false, supprimer_etudiant: false, valider_paiements: false,
    override_deliberation: false,
  },
};

// ── API publique ───────────────────────────────────────────────────────────

export function getPermissions(role: UserRole): Permissions {
  return MATRIX[role] ?? MATRIX.anon;
}

export function can(role: UserRole, action: keyof Permissions): boolean {
  return getPermissions(role)[action] ?? false;
}

// Modules visibles pour un rôle donné — utilisé pour filtrer la sidebar
export function getVisibleModules(role: UserRole): string[] {
  const p = getPermissions(role);
  const modules: string[] = [];
  if (p.voir_dashboard)    modules.push('dashboard');
  if (p.voir_etudiants)    modules.push('etudiants');
  if (p.voir_programmes)   modules.push('programmes');
  if (p.voir_semestres)    modules.push('semestres');
  if (p.voir_annees) modules.push('annees');
  if (p.voir_promotions)   modules.push('promotions');
  if (p.voir_saisie_notes) modules.push('saisie-notes');
  if (p.voir_presences)    modules.push('presences');
  if (p.voir_resultats)    modules.push('resultats');
  if (p.voir_deliberations)modules.push('deliberations');
  if (p.voir_releves)      modules.push('releves');
  if (p.voir_enseignants)  modules.push('enseignants');
  if (p.voir_comptabilite) modules.push('comptabilite');
  if (p.voir_messages)     modules.push('messages');
  if (p.voir_parametres_ecole) modules.push('parametres-ecole');
  if (p.voir_parametres)       modules.push('parametres');
  if (p.voir_prospects)    modules.push('prospects');
  if (p.voir_monitoring)   modules.push('monitoring');
  if (p.voir_audit)        modules.push('audit');
  if (p.voir_utilisateurs)        modules.push('utilisateurs');
  if (p.voir_portail_enseignant) modules.push('portail-enseignant');
  if (p.voir_rh_personnel)      modules.push('rh-personnel');
  if (p.voir_email_parents)     modules.push('email-parents');
  if (p.voir_portail_public)    modules.push('portail-public');
  if (p.voir_analytics_ia)     modules.push('analytics-ia');
  // dashboard-reseau : visible uniquement superadmin (voir_toutes_ecoles)
  if (p.voir_toutes_ecoles) modules.push('dashboard-reseau');
  return modules;
}
