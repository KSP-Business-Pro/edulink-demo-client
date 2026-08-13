// src/services/mfa.service.ts
// B12.1 — Authentification à deux facteurs (2FA) pour le personnel
// Le mot de passe reste le premier facteur (Supabase Auth) ; ce service
// gère le SECOND facteur, sous deux formes :
//   1. OTP email/SMS (existant B12) — Edge Functions send-otp / verify-otp
//   2. TOTP par application d'authentification (13/08/2026) — MFA native
//      Supabase Auth (enroll/challenge/verify) + codes de secours maison.
// Quand un facteur TOTP vérifié existe, il REMPLACE l'OTP email à la
// connexion (le fallback est le code de secours, pas l'email).

import { supabase } from './supabase';
import type { UserRole } from '../types/auth.types';

const SEND_OTP_URL     = 'https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/send-otp';
const VERIFY_OTP_URL   = 'https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/verify-otp';
const MFA_RECOVERY_URL = 'https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/auth-mfa-recovery';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Rôles concernés par le 2FA : tous ceux ayant accès aux notes et/ou paiements.
// Étudiants et parents (lecture seule de leurs propres données) sont exclus.
export const ROLES_2FA: UserRole[] = ['admin', 'direction', 'scolarite', 'enseignant', 'comptable'];

export function mfaRequisPourRole(role: UserRole): boolean {
  return ROLES_2FA.includes(role);
}

// ── État "vérifié pour cette session" — sessionStorage, effacé à la fermeture
// de l'onglet/navigateur ou à la déconnexion. Scope par user id pour éviter
// qu'une vérification reste valide après changement de compte sur le même
// appareil. Posé indifféremment après un OTP email OU un TOTP réussi :
// le reste de l'app ne fait pas la différence.
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

// ═══════════════════════════════════════════════════════════════════════════
// TOTP — application d'authentification (Google Authenticator, Microsoft
// Authenticator, Aegis, FreeOTP…). MFA NATIVE Supabase Auth : le secret et la
// vérification sont gérés par GoTrue (auth.mfa_factors), rien ne transite par
// nos Edge Functions. L'enforcement reste APPLICATIF (écran "Vérification en
// deux étapes") — pas de RLS aal2, pour ne bloquer ni les utilisateurs en OTP
// email (aal1 à vie) ni le bypass e2e.
// ═══════════════════════════════════════════════════════════════════════════

export interface TotpStatut {
  actif: boolean;
  factorId: string | null;
}

// À la connexion : facteur TOTP vérifié présent ? → écran TOTP, sinon OTP email
export async function getStatutTotp(): Promise<TotpStatut> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { actif: false, factorId: null };
  const facteur = (data.totp ?? []).find(f => f.status === 'verified') ?? null;
  return { actif: facteur !== null, factorId: facteur?.id ?? null };
}

export interface EnrollTotpResult {
  success: boolean;
  factorId?: string;
  qrCodeSvg?: string;   // SVG inline fourni par Supabase (data URL), à afficher tel quel
  secret?: string;      // pour saisie manuelle si le scan échoue
  error?: string;
}

// Étape 1 de l'enrôlement : créer le facteur, récupérer QR + secret
export async function demarrerEnrolementTotp(): Promise<EnrollTotpResult> {
  try {
    // Purger les enrôlements interrompus (facteurs restés "unverified"),
    // sinon Supabase peut refuser un nouvel enroll du même nom.
    const { data: existants } = await supabase.auth.mfa.listFactors();
    for (const f of existants?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Application d\'authentification',
    });
    if (error || !data) {
      return { success: false, error: error?.message ?? 'Impossible de démarrer l\'activation' };
    }
    return {
      success: true,
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}

export interface ConfirmerEnrolementResult {
  success: boolean;
  codesSecours?: string[];  // affichés UNE SEULE FOIS — jamais récupérables ensuite
  error?: string;
}

// Étape 2 de l'enrôlement : vérifier le premier code, puis générer les codes
// de secours (fn_generer_codes_secours exige un facteur vérifié).
export async function confirmerEnrolementTotp(factorId: string, code: string): Promise<ConfirmerEnrolementResult> {
  try {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challengeData) {
      return { success: false, error: challengeError?.message ?? 'Erreur lors de la vérification' };
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code.trim(),
    });
    if (verifyError) {
      return { success: false, error: 'Code incorrect. Vérifiez que l\'heure de votre téléphone est à jour et réessayez.' };
    }

    // Facteur vérifié (la session passe en aal2) → générer les codes de secours
    const { data: codes, error: codesError } = await supabase.rpc('fn_generer_codes_secours');
    if (codesError || !codes) {
      // TOTP actif malgré tout : l'utilisateur pourra régénérer depuis la section Sécurité
      return {
        success: true,
        codesSecours: [],
        error: 'TOTP activé, mais échec de génération des codes de secours. Utilisez « Régénérer mes codes » ci-dessous.',
      };
    }
    return { success: true, codesSecours: codes as string[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}

// À la connexion : vérification du code TOTP (écran "Vérification en deux étapes").
// En cas de succès la session passe en aal2 ; l'appelant pose setMfaVerifie(userId).
export async function verifierCodeTotp(factorId: string, code: string): Promise<VerifyOtpResult> {
  try {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challengeData) {
      return { success: false, error: challengeError?.message ?? 'Erreur lors de la vérification' };
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code.trim(),
    });
    if (verifyError) return { success: false, error: 'Code incorrect' };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}

// Nombre de codes de secours non utilisés (affichage section Sécurité)
export async function codesSecoursRestants(): Promise<number | null> {
  const { data, error } = await supabase.rpc('fn_codes_secours_restants');
  if (error || data === null || data === undefined) return null;
  return data as number;
}

// Régénération : invalide l'ancien jeu, en produit 10 nouveaux (affichés une fois)
export async function regenererCodesSecours(): Promise<{ success: boolean; codes?: string[]; error?: string }> {
  const { data, error } = await supabase.rpc('fn_generer_codes_secours');
  if (error || !data) {
    return { success: false, error: error?.message ?? 'Impossible de régénérer les codes' };
  }
  return { success: true, codes: data as string[] };
}

// Désactivation self-service depuis le profil. Fonctionne car la session est
// aal2 (code TOTP validé à la connexion, ou enrôlement tout juste terminé) —
// le unenroll natif Supabase exige aal2 pour un facteur vérifié.
export async function desactiverTotp(factorId: string): Promise<VerifyOtpResult> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { success: false, error: error.message };
  // Purge de ses propres codes de secours (best effort — sans conséquence si échec)
  await supabase.rpc('fn_purger_mes_codes_secours');
  return { success: true };
}

// Téléphone perdu (depuis l'écran "Vérification en deux étapes") : consomme un
// code de secours via l'Edge Function auth-mfa-recovery, qui supprime le
// facteur TOTP côté serveur (Admin API). L'utilisateur repasse alors sur le
// parcours OTP email pour cette connexion, et peut ré-enrôler ensuite.
export interface RecoveryResult {
  success: boolean;
  error?: string;
  essaisRestants?: number;
  reessayerDansS?: number;
}

export async function utiliserCodeSecours(code: string): Promise<RecoveryResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token ?? '';
    if (!accessToken) return { success: false, error: 'Session absente. Reconnectez-vous.' };

    const res = await fetch(MFA_RECOVERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ access_token: accessToken, code }),
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status === 429) {
        return {
          success: false,
          error: 'Trop d\'essais. Réessayez dans quelques minutes.',
          reessayerDansS: payload?.reessayer_dans_s,
        };
      }
      if (payload?.error === 'code_invalide') {
        return {
          success: false,
          error: 'Code de secours invalide.',
          essaisRestants: payload?.essais_restants,
        };
      }
      return { success: false, error: 'Erreur lors de la récupération. Réessayez ou contactez l\'administrateur.' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}