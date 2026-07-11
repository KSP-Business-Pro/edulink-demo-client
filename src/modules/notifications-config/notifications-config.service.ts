// src/modules/notifications-config/notifications-config.service.ts
import { supabase } from '../../services/supabase';
export type CanalNotif = 'email' | 'sms' | 'push';
export type TypeNotif = 'releve' | 'paiement' | 'absence';
export interface ModeleNotification {
  id?: string;
  ecole_id: string;
  type: TypeNotif;
  canal: CanalNotif;
  actif: boolean;
  sujet: string | null;
  corps_html: string | null;
  corps_texte: string | null;
  created_at?: string;
  updated_at?: string;
}
export const TYPES_NOTIF: { id: TypeNotif; label: string; icon: string; desc: string; variables: string[]}[] = [
  { id: 'releve',   label: 'Publication de relevé',    icon: '📋', desc: "Envoyé lors de la publication d'un relevé officiel", variables: ['{etudiant}', '{semestre}', '{etablissement}'] },
  { id: 'paiement', label: 'Confirmation de paiement',  icon: '💳', desc: "Envoyé après enregistrement d'un paiement",          variables: ['{etudiant}', '{montant}', '{etablissement}'] },
  { id: 'absence',  label: 'Alerte absences',           icon: '⚠️', desc: "Envoyé quand le taux d'absence dépasse le seuil",    variables: ['{etudiant}', '{ue}', '{taux}', '{etablissement}'] },
];
export const CANAUX_NOTIF: { id: CanalNotif; label: string; icon: string; champSujet: boolean }[] = [
  { id: 'email', label: 'Email', icon: '📧', champSujet: true },
  { id: 'sms',   label: 'SMS',   icon: '💬', champSujet: false },
  { id: 'push',  label: 'Push',  icon: '🔔', champSujet: true },
];
export function defaultSujet(type: TypeNotif): string {
  const defaults: Record<TypeNotif, string> = {
    releve: 'Relevé de notes — {semestre}',
    paiement: 'Confirmation de paiement — {etablissement}',
    absence: 'Alerte absences — {ue}',
  };
  return defaults[type];
}
export async function fetchModeles(ecoleId: string): Promise<ModeleNotification[]> {
  const { data, error } = await supabase
    .from('modeles_notification')
    .select('*')
    .eq('ecole_id', ecoleId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ModeleNotification[];
}
export async function upsertModele(modele: ModeleNotification): Promise<void> {
  const { error } = await supabase
    .from('modeles_notification')
    .upsert(
      { ...modele, updated_at: new Date().toISOString() },
      { onConflict: 'ecole_id,type,canal' }
    );
  if (error) throw new Error(error.message);
}

// ── Chantier 4 : journal des envois ──

export type StatutEnvoi = 'en_attente' | 'envoye' | 'echec';

export interface EntreeJournal {
  id: string;
  ecole_id: string;
  type: TypeNotif;
  canal: CanalNotif;
  destinataire_id: string | null;
  destinataire_type: string | null;
  destinataire_contact: string | null;
  destinataire_nom: string | null;
  sujet: string | null;
  statut: StatutEnvoi;
  erreur: string | null;
  provider_id: string | null;
  envoye_par: string | null;
  envoye_le: string;
}

export const STATUTS_ENVOI: { id: StatutEnvoi; label: string; badge: string }[] = [
  { id: 'en_attente', label: 'En attente', badge: 'amber' },
  { id: 'envoye',     label: 'Envoyé',     badge: 'green' },
  { id: 'echec',      label: 'Échec',      badge: 'red' },
];

export interface FiltresJournal {
  canal?: CanalNotif;
  statut?: StatutEnvoi;
  dateDebut?: string;
  dateFin?: string;
  recherche?: string;
}

export async function fetchJournal(ecoleId: string, filtres: FiltresJournal = {}): Promise<EntreeJournal[]> {
  let query = supabase
    .from('journal_notifications')
    .select('*')
    .eq('ecole_id', ecoleId)
    .order('envoye_le', { ascending: false })
    .limit(200);

  if (filtres.canal) query = query.eq('canal', filtres.canal);
  if (filtres.statut) query = query.eq('statut', filtres.statut);
  if (filtres.dateDebut) query = query.gte('envoye_le', `${filtres.dateDebut}T00:00:00`);
  if (filtres.dateFin) query = query.lte('envoye_le', `${filtres.dateFin}T23:59:59`);
  if (filtres.recherche?.trim()) {
    const q = filtres.recherche.trim().replace(/[%,]/g, '');
    query = query.or(`destinataire_nom.ilike.%${q}%,sujet.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as EntreeJournal[];
}
