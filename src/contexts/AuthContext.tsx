// src/contexts/AuthContext.tsx
// Contexte global auth — fournit user, loading, login, logout à toute l'app
// + timeout de session automatique après inactivité (B9 — sécurité)

import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  login as authLogin,
  logout as authLogout,
  getCurrentSession,
  onAuthStateChange,
} from '../services/auth.service';
import { clearMfaVerifie } from '../services/mfa.service';
import type { UserProfil } from '../types/auth.types';

// ── Paramètres du timeout d'inactivité ──────────────────────────────────────
const INACTIVITE_LIMITE_MS = 30 * 60 * 1000; // 30 min avant déconnexion
const AVERTISSEMENT_AVANT_MS = 2 * 60 * 1000; // avertir 2 min avant l'expiration
const VERIF_INTERVALLE_MS = 5 * 1000; // fréquence de vérification

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
  activeEcoleId: string | null;
  setActiveEcoleId: (id: string | null) => void;
}

// ── Création du contexte ───────────────────────────────────────────────────
export const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<UserProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [activeEcoleId, setActiveEcoleIdState] = useState<string | null>(null);

  // ── État du timeout d'inactivité ──────────────────────────────────────────
  const [showWarning, setShowWarning]           = useState(false);
  const [secondesRestantes, setSecondesRestantes] = useState(0);
  const derniereActivite = useRef<number>(Date.now());

  // Charger la session au montage.
  // Une seule source de verite : onAuthStateChange emet un evenement
  // INITIAL_SESSION des l'abonnement (session deja lue depuis le storage
  // local par le client Supabase). L'appel getCurrentSession() en parallele
  // etait redondant et creait une race condition sous latence reseau
  // (l'event INITIAL_SESSION pouvait arriver avant la resolution complete
  // du profil via getCurrentSession(), provoquant une deconnexion
  // fantome vers /login -- reproduit systematiquement sous throttling
  // Lighthouse / connexion lente).
  useEffect(() => {
    let cancelled = false;

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

  // Ecole active (super-admins uniquement — comptes lies a une ecole gardent la leur)
  useEffect(() => {
    if (!user) { setActiveEcoleIdState(null); return; }
    if (user.ecole_id) { setActiveEcoleIdState(user.ecole_id); return; }
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('edulink_active_ecole_id') : null;
    setActiveEcoleIdState(saved || null);
  }, [user]);

  const setActiveEcoleId = useCallback((id: string | null) => {
    setActiveEcoleIdState(id);
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem('edulink_active_ecole_id', id);
      else window.localStorage.removeItem('edulink_active_ecole_id');
    }
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
    derniereActivite.current = Date.now();
    setShowWarning(false);
    return true;
  }, []);

  // Logout
  const logout = useCallback(async () => {
    setLoading(true);
    clearMfaVerifie(user?.id);
    await authLogout();
    setUser(null);
    setLoading(false);
    setShowWarning(false);
  }, [user]);

  // ── Timeout de session automatique ─────────────────────────────────────
  // Actif uniquement si un utilisateur est connecté.
  useEffect(() => {
    if (!user) return;

    const marquerActivite = () => {
      derniereActivite.current = Date.now();
      setShowWarning(prev => (prev ? false : prev)); // referme l'avertissement si l'utilisateur revient
    };

    const evenements = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    evenements.forEach(ev => window.addEventListener(ev, marquerActivite, { passive: true }));

    const interval = setInterval(() => {
      const ecoule = Date.now() - derniereActivite.current;
      const restant = INACTIVITE_LIMITE_MS - ecoule;

      if (restant <= 0) {
        // Temps écoulé → déconnexion automatique
        logout();
      } else if (restant <= AVERTISSEMENT_AVANT_MS) {
        setShowWarning(true);
        setSecondesRestantes(Math.ceil(restant / 1000));
      } else {
        setShowWarning(false);
      }
    }, VERIF_INTERVALLE_MS);

    return () => {
      evenements.forEach(ev => window.removeEventListener(ev, marquerActivite));
      clearInterval(interval);
    };
  }, [user, logout]);

  // Helpers rôle
  const isSuperAdmin = user?.ecole_id === null && user?.role === 'admin';
  const isAdmin      = user?.role === 'admin';
  const hasRole      = useCallback(
    (roles: string[]) => !!user && roles.includes(user.role),
    [user]
  );

  const resterConnecte = () => {
    derniereActivite.current = Date.now();
    setShowWarning(false);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, error,
      login, logout,
      isSuperAdmin, isAdmin, hasRole,
      activeEcoleId, setActiveEcoleId,
    }}>
      {children}

      {/* ── Avertissement d'inactivité ── */}
      {showWarning && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: '1.5rem 1.75rem', maxWidth: 380,
            boxShadow: '0 20px 40px rgba(0,0,0,.2)', fontFamily: 'inherit',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1B2A4A', marginBottom: 8 }}>
              ⏱ Session sur le point d'expirer
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18, lineHeight: 1.5 }}>
              Par mesure de sécurité, vous allez être déconnecté(e) dans{' '}
              <strong style={{ color: '#DC2626' }}>{secondesRestantes}s</strong> par inactivité.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => logout()}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Se déconnecter
              </button>
              <button onClick={resterConnecte}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#C8932E', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Rester connecté(e)
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
