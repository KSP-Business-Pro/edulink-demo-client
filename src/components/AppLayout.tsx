// src/components/AppLayout.tsx
// Layout principal — sidebar + contenu — réplique fidèle du legacy

import { useAuth } from '../hooks/useAuth';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
}

export function AppLayout({ children, currentPage }: AppLayoutProps) {
  const { user, logout, isSuperAdmin } = useAuth();

  const navItems = [
    { group: 'TABLEAU DE BORD', items: [
      { id: 'dashboard', label: 'Dashboard', ico: '🏠', href: '/dashboard' },
    ]},
    { group: 'PÉDAGOGIE LMD', items: [
      { id: 'programmes', label: 'Programmes & UE', ico: '🎓', href: '/index_legacy.html' },
      { id: 'semestres',  label: 'Semestres',       ico: '📅', href: '/index_legacy.html' },
      { id: 'promotions', label: 'Promotions',      ico: '👥', href: '/index_legacy.html' },
      { id: 'etudiants',  label: 'Étudiants',       ico: '🧑‍🎓', href: '/index_legacy.html' },
    ]},
    { group: 'ÉVALUATION', items: [
      { id: 'saisie-notes', label: 'Saisie des notes', ico: '✏️', href: '/index_legacy.html' },
      { id: 'presences',    label: 'Présences',        ico: '📋', href: '/index_legacy.html' },
      { id: 'resultats',    label: 'Résultats',        ico: '📊', href: '/index_legacy.html' },
      { id: 'deliberations',label: 'Délibérations',   ico: '⚖️', href: '/index_legacy.html' },
      { id: 'releves',      label: 'Relevés',          ico: '📄', href: '/index_legacy.html' },
    ]},
    { group: 'ÉTABLISSEMENT', items: [
      { id: 'enseignants',  label: 'Enseignants',  ico: '👨‍🏫', href: '/index_legacy.html' },
      { id: 'comptabilite', label: 'Comptabilité', ico: '💰', href: '/index_legacy.html' },
      { id: 'messages',     label: 'Messages',     ico: '💬', href: '/index_legacy.html' },
    ]},
    { group: 'SYSTÈME', items: [
      { id: 'parametres', label: 'Paramètres', ico: '⚙️', href: '/index_legacy.html' },
    ]},
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Sidebar */}
      <aside style={{
        width: 240, background: '#fff', borderRight: '1px solid #f1f5f9',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '1.25rem 1rem 0.75rem', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
            EduLink <span style={{ color: '#d97706' }}>Sup</span>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>LMD · CAMES</div>
        </div>

        {/* École */}
        {user?.ecole_nom && (
          <div style={{ padding: '0.6rem 1rem', background: '#f8fafc', margin: '0.5rem 0.75rem', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>{user.ecole_nom}</div>
            {isSuperAdmin && <div style={{ fontSize: 10, color: '#94a3b8' }}>super-admin</div>}
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.5rem 0.75rem' }}>
          {navItems.map(group => (
            <div key={group.group} style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', marginBottom: '0.25rem', paddingLeft: 4 }}>
                {group.group}
              </div>
              {group.items.map(item => {
                const isActive = currentPage === item.id;
                const isReact  = item.href === '/dashboard';
                return (
                  <a
                    key={item.id}
                    href={isReact ? item.href : (window.location.hostname === 'localhost' ? 'https://app.edulink.bj' : '/index_legacy.html')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, textDecoration: 'none',
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      color: isActive ? '#1e3a5f' : '#374151',
                      background: isActive ? '#eff6ff' : 'transparent',
                      marginBottom: 1,
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 15 }}>{item.ico}</span>
                    {item.label}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User + logout */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#1e3a5f',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: '#fff', flexShrink: 0,
            }}>
              {user?.nom?.charAt(0) ?? 'U'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nom ?? ''}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{user?.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%', padding: '7px', background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: 8, fontSize: 12, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Contenu */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
