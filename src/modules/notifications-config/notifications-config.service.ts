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

export const TYPES_NOTIF: { id: TypeNotif; label: string; icon: string; desc: string; variables: string[] }[] = [
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
