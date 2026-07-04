// src/components/ProtectedRoute.tsx
// Guard de routes — redirige vers /login si non authentifié
// Affiche un spinner pendant le chargement de la session

import { Navigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import type { UserRole } from '../types/auth.types';
import type { Permissions } from '../services/permissions';
import { mfaRequisPourRole, isMfaVerifie } from '../services/mfa.service';
import { Mfa2FAScreen } from './Mfa2FAScreen';

interface ProtectedRouteProps {
  children:       React.ReactNode;
  allowedRoles?:  UserRole[];          // si absent → tout utilisateur connecté passe
  requiredPerm?:  keyof Permissions;   // permission spécifique requise
}

export function ProtectedRoute({ children, allowedRoles, requiredPerm }: ProtectedRouteProps) {
  const { user, loading, logout } = useAuth();
  const { can } = usePermissions();
  const location = useLocation();
  const [mfaOk, setMfaOk] = useState(false);

  // Pendant la vérification de session — spinner sobre
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#f1f5f9',
      }}>
        <div style={{
          width: 36, height: 36, border: '3px solid #e2e8f0',
          borderTopColor: '#1e3a5f', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Non authentifié → /login avec mémoire de la page demandée
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // B12.1 — Second facteur requis pour ce rôle, pas encore vérifié cette session
  if (mfaRequisPourRole(user.role) && !isMfaVerifie(user.id) && !mfaOk) {
    return (
      <Mfa2FAScreen
        user={user}
        onVerified={() => setMfaOk(true)}
        onLogout={() => logout()}
      />
    );
  }

  // Rôle insuffisant → page 403
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 12,
        fontFamily: 'Segoe UI, sans-serif', color: '#1e293b',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ margin: 0 }}>Accès refusé</h2>
        <p style={{ color: '#64748b', margin: 0 }}>
          Votre rôle <strong>{user.role}</strong> ne permet pas d'accéder à cette page.
        </p>
      </div>
    );
  }

  // Permission spécifique insuffisante
  if (requiredPerm && !can(requiredPerm)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 12,
        fontFamily: 'Segoe UI, sans-serif', color: '#1e293b',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ margin: 0 }}>Permission insuffisante</h2>
        <p style={{ color: '#64748b', margin: 0 }}>
          Votre rôle <strong>{user?.role}</strong> ne permet pas cette action.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
