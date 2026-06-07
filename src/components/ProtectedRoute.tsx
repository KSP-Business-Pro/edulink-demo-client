// src/components/ProtectedRoute.tsx
// Guard de routes — redirige vers /login si non authentifié
// Affiche un spinner pendant le chargement de la session

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types/auth.types';

interface ProtectedRouteProps {
  children:      React.ReactNode;
  allowedRoles?: UserRole[];   // si absent → tout utilisateur connecté passe
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

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

  return <>{children}</>;
}
