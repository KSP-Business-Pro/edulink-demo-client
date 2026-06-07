// src/services/auth.service.ts
// Toutes les opérations d'authentification centralisées ici
// Le reste de l'app ne touche jamais supabase.auth directement

import { supabase } from './supabase';
import type { UserProfil, UtilisateurRow, EcoleRow } from '../types/auth.types';

// ── Login ──────────────────────────────────────────────────────────────────
export async function login(
  email: string,
  password: string
): Promise<{ profil: UserProfil; error: null } | { profil: null; error: string }> {
  // 1. Authentification Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { profil: null, error: authError?.message ?? 'Identifiants invalides' };
  }

  // 2. Charger le profil depuis la table utilisateurs
  const profilResult = await loadProfil(authData.user.id, email);
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
    .select('id, auth_id, nom, prenom, role, ecole_id, actif')
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
    id:        authId,
    email,
    nom:       utilisateur.nom,
    prenom:    utilisateur.prenom ?? undefined,
    role:      utilisateur.role,
    ecole_id:  utilisateur.ecole_id,
    ecole_nom,
    actif:     utilisateur.actif,
  };
}
