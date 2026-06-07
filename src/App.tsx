// src/App.tsx
// Router principal — gère les routes React
// Les routes /app/* redirigent vers le monolithe index.html (migration progressive)

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';

// Placeholder Dashboard — sera remplacé module par module
function DashboardPlaceholder() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'Segoe UI, sans-serif',
      flexDirection: 'column', gap: 12, color: '#1e293b',
    }}>
      <div style={{ fontSize: 48 }}>🎓</div>
      <h2 style={{ margin: 0 }}>EduLink Sup</h2>
      <p style={{ color: '#64748b', margin: 0 }}>
        Module Dashboard React — en cours de migration
      </p>
      <a
        href="/index.html"
        style={{
          marginTop: 8, padding: '10px 20px', background: '#1e3a5f',
          color: '#fff', borderRadius: 8, textDecoration: 'none',
          fontSize: 14, fontWeight: 600,
        }}
      >
        Accéder au back-office complet →
      </a>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Route publique */}
          <Route path="/login" element={<LoginPage />} />

          {/* Routes protégées */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPlaceholder />
              </ProtectedRoute>
            }
          />

          {/* Routes avec restriction de rôle — exemple */}
          {/* <Route
            path="/admin/*"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminModule />
              </ProtectedRoute>
            }
          /> */}

          {/* Redirect racine → dashboard (auth) ou login (non auth) */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
