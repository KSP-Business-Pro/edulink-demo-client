// src/services/mfa.service.ts
// B12.1 — Authentification à deux facteurs (2FA) pour le personnel
// Le mot de passe reste le premier facteur (Supabase Auth) ; ce service
// gère le SECOND facteur (code OTP email/SMS) déclenché une fois par
// session côté navigateur.

import { supabase } from './supabase';
import type { UserRole } from '../types/auth.types';

const SEND_OTP_URL   = 'https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/send-otp';
const VERIFY_OTP_URL = 'https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/verify-otp';

// Rôles concernés par le 2FA : tous ceux ayant accès aux notes et/ou paiements.
// Étudiants et parents (lecture seule de leurs propres données) sont exclus.
export const ROLES_2FA: UserRole[] = ['admin', 'direction', 'scolarite', 'enseignant', 'comptable'];

export function mfaRequisPourRole(role: UserRole): boolean {
  return ROLES_2FA.includes(role);
}

// ── État "vérifié pour cette session" — sessionStorage, effacé à la fermeture
// de l'onglet/navigateur ou à la déconnexion. Scope par user id pour éviter
// qu'une vérification reste valide après changement de compte sur le même
// appareil.
function storageKey(userId: string): string {
  return `edulink_mfa_verified_${userId}`;
}

export function isMfaVerifie(userId: string): boolean {
  return sessionStorage.getItem(storageKey(userId)) === 'true';
}

export function setMfaVerifie(userId: string): void {
  sessionStorage.setItem(storageKey(userId), 'true');
}

export function clearMfaVerifie(userId?: string): void {
  if (userId) {
    sessionStorage.removeItem(storageKey(userId));
  } else {
    // Déconnexion générique : nettoyer toutes les clés MFA connues
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('edulink_mfa_verified_'))
      .forEach(k => sessionStorage.removeItem(k));
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export interface SendOtpResult {
  success: boolean;
  channel?: 'email' | 'sms';
  destination?: string;
  expiresInMinutes?: number;
  error?: string;
}

export async function envoyerCodeOtp(channel: 'email' | 'sms'): Promise<SendOtpResult> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(SEND_OTP_URL, { method: 'POST', headers, body: JSON.stringify({ channel }) });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data?.error || 'Erreur lors de l\'envoi du code' };
    return { success: true, channel: data.channel, destination: data.destination, expiresInMinutes: data.expiresInMinutes };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
}

export async function verifierCodeOtp(code: string): Promise<VerifyOtpResult> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(VERIFY_OTP_URL, { method: 'POST', headers, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data?.error || 'Code incorrect' };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}
