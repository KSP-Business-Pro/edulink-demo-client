// src/contexts/AuthContext.tsx
// Contexte global auth — fournit user, loading, login, logout à toute l'app

import React, { createContext, useEffect, useState, useCallback } from 'react';
import {
  login as authLogin,
  logout as authLogout,
  getCurrentSession,
  onAuthStateChange,
} from '../services/auth.service';
import type { UserProfil } from '../types/auth.types';

// ── Types du contexte ──────────────────────────────────────────────────────
interface AuthContextValue {
  user:      UserProfil | null;
  loading:   boolean;
  error:     string | null;
  login:     (email: string, password: string) => Promise<boolean>;
  logout:    () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin:      boolean;
  hasRole:   (roles: string[]) => boolean;
}

// ── Création du contexte ───────────────────────────────────────────────────
export const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<UserProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Charger la session au montage
  useEffect(() => {
    let cancelled = false;

    getCurrentSession().then(profil => {
      if (!cancelled) {
        setUser(profil);
        setLoading(false);
      }
    });

    // Écouter les changements (logout depuis un autre onglet, expiration JWT…)
    const { data: { subscription } } = onAuthStateChange(profil => {
      if (!cancelled) {
        setUser(profil);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Login
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    const result = await authLogin(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return false;
    }
    setUser(result.profil);
    setLoading(false);
    return true;
  }, []);

  // Logout
  const logout = useCallback(async () => {
    setLoading(true);
    await authLogout();
    setUser(null);
    setLoading(false);
  }, []);

  // Helpers rôle
  const isSuperAdmin = user?.ecole_id === null && user?.role === 'admin';
  const isAdmin      = user?.role === 'admin';
  const hasRole      = useCallback(
    (roles: string[]) => !!user && roles.includes(user.role),
    [user]
  );

  return (
    <AuthContext.Provider value={{
      user, loading, error,
      login, logout,
      isSuperAdmin, isAdmin, hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
