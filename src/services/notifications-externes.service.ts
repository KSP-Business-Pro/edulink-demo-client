// src/services/notifications-externes.service.ts
// Chantier E — appel des fonctions d'envoi email/SMS/push réels (absence/note/
// paiement uniquement — le releve garde son propre circuit via publish-releve).

import { supabase } from './supabase';

const NOTIF_EMAIL_FN_URL    = `https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/send-notification-email`;
const NOTIF_SMS_PUSH_FN_URL = `https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/send-notification-sms-push`;

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

/**
 * Déclenche l'envoi réel (email + SMS + push, en parallèle) pour une
 * notification déjà créée en interne via fn_notifier_evenement. À appeler
 * UNIQUEMENT si ce dernier a renvoyé un id de message (sinon il n'y a pas de
 * modèle actif, donc rien à envoyer). Ne bloque jamais l'action métier
 * appelante — toute erreur est avalée (chaque fonction gère aussi ses propres
 * cas d'échec individuellement, journalisés côté serveur).
 */
export async function notifierCanauxExternes(
  ecoleId:    string,
  etudiantId: string,
  type:       'absence' | 'note' | 'paiement',
  vars:       Record<string, string>,
): Promise<void> {
  try {
    const token = await getToken();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const body = JSON.stringify({ ecole_id: ecoleId, etudiant_id: etudiantId, type, vars });
    await Promise.allSettled([
      fetch(NOTIF_EMAIL_FN_URL, { method: 'POST', headers, body }),
      fetch(NOTIF_SMS_PUSH_FN_URL, { method: 'POST', headers, body }),
    ]);
  } catch {
    // silencieux — ne doit jamais bloquer l'action métier appelante
  }
}
