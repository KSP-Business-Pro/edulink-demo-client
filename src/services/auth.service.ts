// src/services/auth.service.ts
// Toutes les opérations d'authentification centralisées ici
// Le reste de l'app ne touche jamais supabase.auth directement

import { supabase } from './supabase';
import type { UserProfil, UtilisateurRow, EcoleRow } from '../types/auth.types';
// ── Rate limiting (Sprint B9) ───────────────────────────────────────────────
// La connexion passe par l'Edge Function `auth-login` au lieu d'appeler
// signInWithPassword depuis le navigateur : le comptage des tentatives et le
// blocage (5 essais → 15 min) sont ainsi appliqués côté serveur, avant tout
// appel à Supabase Auth, et ne peuvent pas être contournés depuis le client.
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const AUTH_LOGIN_URL    = `${SUPABASE_URL}/functions/v1/auth-login`;

// ── Login ──────────────────────────────────────────────────────────────────
export async function login(
  email: string,
  password: string
): Promise<{ profil: UserProfil; error: null } | { profil: null; error: string }> {
  // 1. Authentification via le proxy de connexion (rate limiting côté serveur)
  let reponse: Response;
  try {
    reponse = await fetch(AUTH_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { profil: null, error: 'Service de connexion injoignable. Vérifiez votre connexion internet et réessayez.' };
  }

  const payload = await reponse.json().catch(() => null);

  if (!reponse.ok) {
    // 429 = blocage rate limiting, 401 = identifiants invalides
    return {
      profil: null,
      error: payload?.message ?? 'Identifiants invalides',
    };
  }

  if (!payload?.access_token || !payload?.refresh_token) {
    return { profil: null, error: 'Réponse de connexion invalide. Contactez l\'administrateur.' };
  }

  // 2. Réinjection de la session dans le client Supabase du navigateur
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token:  payload.access_token,
    refresh_token: payload.refresh_token,
  });

  if (sessionError || !sessionData.user) {
    return { profil: null, error: sessionError?.message ?? 'Impossible d\'établir la session.' };
  }

  // 3. Charger le profil depuis la table utilisateurs
  const profilResult = await loadProfil(sessionData.user.id, email);
  if (!profilResult) {
    await supabase.auth.signOut();
    return {
      profil: null,
      error: 'Compte auth OK mais profil utilisateurs introuvable. Vérifiez la table utilisateurs.',
    };
  }

  return { profil: profilResult, error: null };
}

// ── Logout ─────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

// ── Session courante ───────────────────────────────────────────────────────
export async function getCurrentSession(): Promise<UserProfil | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return await loadProfil(session.user.id, session.user.email ?? '');
}

// ── Écoute des changements de session ─────────────────────────────────────
export function onAuthStateChange(
  callback: (profil: UserProfil | null) => void
) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      callback(null);
      return;
    }
    const profil = await loadProfil(session.user.id, session.user.email ?? '');
    callback(profil);
  });
}

// ── Chargement profil (privé) ──────────────────────────────────────────────
async function loadProfil(authId: string, email: string): Promise<UserProfil | null> {
  const { data: utilisateur, error } = await supabase
    .from('utilisateurs')
    .select('id, auth_id, nom, prenom, role, ecole_id, telephone, actif')
    .eq('auth_id', authId)
    .eq('actif', true)
    .maybeSingle<UtilisateurRow>();

  if (error || !utilisateur) return null;

  // Charger le nom de l'école si pas super-admin
  let ecole_nom: string | undefined;
  if (utilisateur.ecole_id) {
    const { data: ecole } = await supabase
      .from('ecoles')
      .select('id, nom, logo_url')
      .eq('id', utilisateur.ecole_id)
      .maybeSingle<EcoleRow>();
    ecole_nom = ecole?.nom;
  }

  return {
    id:             authId,
    utilisateur_id: utilisateur.id,
    email,
    nom:       utilisateur.nom,
    prenom:    utilisateur.prenom ?? undefined,
    role:      utilisateur.role,
    ecole_id:  utilisateur.ecole_id,
    ecole_nom,
    telephone: utilisateur.telephone ?? null,
    actif:     utilisateur.actif,
  };
}
