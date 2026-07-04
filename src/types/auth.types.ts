// src/types/auth.types.ts
// Types partagés — auth, utilisateur, école

export type UserRole =
  | 'admin'
  | 'scolarite'
  | 'enseignant'
  | 'etudiant'
  | 'parent'
  | 'comptable'
  | 'direction'
  | 'anon';

export interface UserProfil {
  id: string;             // UUID auth.users
  email: string;
  nom: string;
  prenom?: string;
  role: UserRole;
  ecole_id: string | null; // null = super-admin
  ecole_nom?: string;
  telephone?: string | null;
  actif: boolean;
}

export interface AuthState {
  user: UserProfil | null;
  loading: boolean;
  error: string | null;
}

// Réponse Supabase table utilisateurs
export interface UtilisateurRow {
  id: string;
  auth_id: string;
  nom: string;
  prenom: string | null;
  role: UserRole;
  ecole_id: string | null;
  telephone?: string | null;
  actif: boolean;
}

// Réponse Supabase table ecoles
export interface EcoleRow {
  id: string;
  nom: string;
  logo_url: string | null;
}
