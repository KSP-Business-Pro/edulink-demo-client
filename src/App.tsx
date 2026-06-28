// src/App.tsx
// Router principal avec lazy loading par module
// Chaque module est chargé à la demande — bundle splitting automatique

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { default as PortailPublicPage } from './pages/PortailPublicPage';
import { DashboardPage } from './pages/DashboardPage';
import { DashboardReseauPage } from './pages/DashboardReseauPage';

// ── Lazy loading par module ────────────────────────────────────────────────
const EtudiantsPage    = lazy(() => import('./modules/etudiants'));
const MonitoringPage   = lazy(() => import('./modules/monitoring'));
const ProspectsPage    = lazy(() => import('./modules/prospects'));
const PromotionsPage   = lazy(() => import('./modules/promotions'));
const MessagesPage     = lazy(() => import('./modules/messages'));
const SemestresPage    = lazy(() => import('./modules/semestres'));
const ProgrammesPage   = lazy(() => import('./modules/programmes/ProgrammesPage'));
const ResultatsPage    = lazy(() => import('./modules/resultats'));
const RelevesPage      = lazy(() => import('./modules/releves'));
const SaisieNotesPage  = lazy(() => import('./modules/saisie-notes'));
const PresencesPage    = lazy(() => import('./modules/presences'));
const DeliberationsPage= lazy(() => import('./modules/deliberations'));
const EnseignantsPage  = lazy(() => import('./modules/enseignants'));
const ComptabilitePage = lazy(() => import('./modules/comptabilite'));
const ParametresPage   = lazy(() => import('./modules/parametres'));
const UtilisateursPage      = lazy(() => import('./modules/utilisateurs'));
const PortailEnseignantPage = lazy(() => import('./modules/portail-enseignant'));
const RHPersonnelPage       = lazy(() => import('./modules/rh-personnel'));
const EmailParentsPage      = lazy(() => import('./modules/email-parents'));
const PortailPublicMgmt    = lazy(() => import('./modules/portail-public'));
const AnalyticsIAPage      = lazy(() => import('./modules/analytics-ia'));
const InscriptionsPage  = lazy(() => import('./modules/inscriptions'));
const EmploiDuTempsPage = lazy(() => import('./modules/emploi-du-temps'));
const AnalyticsPage     = lazy(() => import('./modules/analytics'));

// ── Spinner de chargement lazy ─────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── HOC route protégée avec layout ─────────────────────────────────────────
function AppRoute({ page, children }: { page: string; children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout currentPage={page}>
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Route publique */}
          <Route path="/ecole/:slug" element={<PortailPublicPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Dashboard */}
          <Route path="/dashboard-reseau" element={<AppRoute page="dashboard-reseau"><DashboardReseauPage /></AppRoute>} />
          <Route path="/dashboard" element={
            <AppRoute page="dashboard"><DashboardPage /></AppRoute>
          } />

          {/* Modules pédagogie */}
          <Route path="/etudiants"    element={<AppRoute page="etudiants">   <EtudiantsPage /></AppRoute>} />
          <Route path="/inscriptions" element={<AppRoute page="inscriptions"><InscriptionsPage /></AppRoute>} />
          <Route path="/analytics" element={<AppRoute page="analytics"><AnalyticsPage /></AppRoute>} />
          <Route path="/emploi-du-temps" element={<AppRoute page="emploi-du-temps"><EmploiDuTempsPage /></AppRoute>} />
          <Route path="/semestres" element={<AppRoute page="semestres"><SemestresPage /></AppRoute>} />
          <Route path="/programmes" element={<AppRoute page="programmes"><ProgrammesPage /></AppRoute>} />
          <Route path="/resultats"    element={<AppRoute page="resultats">   <ResultatsPage /></AppRoute>} />
          <Route path="/releves"      element={<AppRoute page="releves">     <RelevesPage /></AppRoute>} />
          <Route path="/saisie-notes" element={<AppRoute page="saisie-notes"><SaisieNotesPage /></AppRoute>} />
          <Route path="/presences"    element={<AppRoute page="presences">   <PresencesPage /></AppRoute>} />
          <Route path="/deliberations"element={<AppRoute page="deliberations"><DeliberationsPage /></AppRoute>} />

          {/* Établissement */}
          <Route path="/enseignants"  element={<AppRoute page="enseignants"> <EnseignantsPage /></AppRoute>} />
          <Route path="/comptabilite" element={<AppRoute page="comptabilite"><ComptabilitePage /></AppRoute>} />
          <Route path="/monitoring" element={<AppRoute page="monitoring"><MonitoringPage /></AppRoute>} />
          <Route path="/prospects" element={<AppRoute page="prospects"><ProspectsPage /></AppRoute>} />
          <Route path="/promotions" element={<AppRoute page="promotions"><PromotionsPage /></AppRoute>} />
          <Route path="/messages" element={<AppRoute page="messages"><MessagesPage /></AppRoute>} />
          <Route path="/parametres"   element={<AppRoute page="parametres">  <ParametresPage /></AppRoute>} />
          <Route path="/analytics-ia" element={<AppRoute page="analytics-ia"><AnalyticsIAPage /></AppRoute>} />
          <Route path="/portail-public" element={<AppRoute page="portail-public"><PortailPublicMgmt /></AppRoute>} />
          <Route path="/email-parents" element={<AppRoute page="email-parents"><EmailParentsPage /></AppRoute>} />
          <Route path="/rh-personnel" element={<AppRoute page="rh-personnel"><RHPersonnelPage /></AppRoute>} />
          <Route path="/portail-enseignant" element={<AppRoute page="portail-enseignant"><PortailEnseignantPage /></AppRoute>} />
          <Route path="/utilisateurs" element={<AppRoute page="utilisateurs"><UtilisateursPage /></AppRoute>} />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
