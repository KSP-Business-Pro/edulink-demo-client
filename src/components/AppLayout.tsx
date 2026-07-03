// src/components/AppLayout.tsx
// Layout principal — sidebar + contenu
// Navigation via <Link> React Router + Recherche globale + ToastContainer B2.2
// B10 — Drawer mobile (hamburger + overlay + fermeture auto)
// B11.A — Accessibilité WCAG 2.1 AA : icônes SVG + texte, aria-current, role=navigation,
//         focus visible, cibles tactiles 44px, skip link, raccourci Ctrl+K / ⌘K

import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../services/supabase';
import { ToastContainer } from './ErrorComponents';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
}

interface SearchResult {
  type: 'etudiant' | 'enseignant' | 'facture';
  id: string;
  label: string;
  sublabel: string;
  href: string;
  ico: IconName;
}

// ─────────────────────────────────────────────────────────────────────────────
// B11.1 — Icônes SVG (remplacent les émojis de navigation). Chaque icône a
// toujours un libellé texte visible juste à côté dans le DOM (WCAG 1.1.1).
// ─────────────────────────────────────────────────────────────────────────────
type IconName =
  | 'home' | 'chart' | 'graduationCap' | 'calendarDays' | 'listChecks'
  | 'calendar' | 'users' | 'userGraduate' | 'pencil' | 'clipboardCheck'
  | 'barChart' | 'scale' | 'fileText' | 'chalkboard' | 'wallet'
  | 'message' | 'radio' | 'target' | 'settings' | 'search' | 'close' | 'menu'
  | 'globe' | 'layers' | 'sparkles' | 'mail' | 'briefcase' | 'chevronDown';

const ICON_PATHS: Record<IconName, string> = {
  home:            'M3 11l9-8 9 8M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10',
  chart:           'M4 19V10M10 19V4M16 19v-7M22 19H2',
  graduationCap:   'M2 9l10-5 10 5-10 5-10-5zM6 11.5V17c0 1.5 3 3 6 3s6-1.5 6-3v-5.5M22 9v6',
  calendarDays:    'M4 5h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 9h18M8 3v4M16 3v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01',
  listChecks:      'M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9',
  calendar:        'M4 5h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 9h18M8 3v4M16 3v4',
  users:           'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 016-6h2a6 6 0 016 6v1M17 11a4 4 0 000-8M23 21v-1a6 6 0 00-4-5.65',
  userGraduate:    'M12 3L2 8l10 5 10-5-10-5zM6 10.5V16c0 1.5 2.5 3 6 3s6-1.5 6-3v-5.5',
  pencil:          'M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z',
  clipboardCheck:  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 14l2 2 4-4',
  barChart:        'M18 20V10M12 20V4M6 20v-6',
  scale:           'M12 3v18M5 8l-3 6a3 3 0 006 0l-3-6zM19 8l-3 6a3 3 0 006 0l-3-6zM5 8h14M8.5 4.5h7',
  fileText:        'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M9 13h6M9 17h6M9 9h1',
  chalkboard:      'M20 3H4a1 1 0 00-1 1v12a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1zM8 21l4-4 4 4M12 17v4',
  wallet:          'M3 7a2 2 0 012-2h13a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l9 6 9-6M17 13h.01',
  message:         'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
  radio:           'M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M12 12a1 1 0 100 0M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9c3.9 3.9 3.9 10.3 0 14.1',
  target:          'M12 12a1 1 0 100 0M12 6a6 6 0 100 12 6 6 0 000-12zM12 2a10 10 0 100 20 10 10 0 000-20z',
  settings:        'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  search:          'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  close:           'M18 6L6 18M6 6l12 12',
  menu:            'M3 12h18M3 6h18M3 18h18',
  globe:           'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z',
  layers:          'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  sparkles:        'M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z',
  mail:            'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM22 6l-10 7L2 6',
  briefcase:       'M20 7h-4V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM8 5h8v2H8V5zM2 13h20',
  chevronDown:     'M6 9l6 6 6-6',
};

function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function AppLayout({ children, currentPage }: AppLayoutProps) {
  const { user, logout, isSuperAdmin } = useAuth();
  const { visibleModules } = usePermissions();
  const navigate = useNavigate();

  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['TABLEAU DE BORD', 'PÉDAGOGIE LMD', 'ÉVALUATION', 'ÉTABLISSEMENT', 'SYSTÈME'])
  );
  const PINNED_GROUPS = new Set(['TABLEAU DE BORD']);
  const [searchFocused, setSearchFocused] = useState(false);
  const [isMac, setIsMac]       = useState(false);
  const searchRef               = useRef<HTMLDivElement>(null);
  const searchInputRef          = useRef<HTMLInputElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ecoleId = user?.ecole_id ?? '';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Détection plateforme pour afficher le bon badge (⌘K vs Ctrl+K)
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent));
  }, []);

  // Raccourci clavier global Ctrl+K / ⌘K → focus la recherche
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  // Fermer le drawer mobile avec Echap
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && sidebarOpen) setSidebarOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setShowDrop(false); return; }
    setSearching(true);
    const s = q.trim();
    try {
      let etudQ = supabase.from('etudiants')
        .select('id, nom, prenom, matricule, filiere')
        .or(`nom.ilike.%${s}%,prenom.ilike.%${s}%,matricule.ilike.%${s}%`)
        .limit(5);
      let ensQ = supabase.from('enseignants')
        .select('id, nom, prenom, specialite')
        .or(`nom.ilike.%${s}%,prenom.ilike.%${s}%`)
        .limit(3);
      let facQ = supabase.from('factures')
        .select('id, reference, montant_total, statut, etudiants(nom, prenom)')
        .ilike('reference', `%${s}%`)
        .limit(3);
      if (ecoleId) {
        etudQ = etudQ.eq('ecole_id', ecoleId);
        ensQ  = ensQ.eq('ecole_id', ecoleId);
        facQ  = facQ.eq('ecole_id', ecoleId);
      }
      const [etudRes, ensRes, facRes] = await Promise.all([etudQ, ensQ, facQ]);

      const items: SearchResult[] = [];

      (etudRes.data ?? []).forEach((e: any) => items.push({
        type: 'etudiant',
        id: e.id,
        label: `${e.nom} ${e.prenom}`,
        sublabel: `${e.matricule ?? '—'} · ${e.filiere ?? '—'}`,
        href: '/etudiants',
        ico: 'userGraduate',
      }));

      (ensRes.data ?? []).forEach((e: any) => items.push({
        type: 'enseignant',
        id: e.id,
        label: `${e.nom} ${e.prenom ?? ''}`,
        sublabel: e.specialite ?? 'Enseignant',
        href: '/enseignants',
        ico: 'chalkboard',
      }));

      (facRes.data ?? []).forEach((f: any) => items.push({
        type: 'facture',
        id: f.id,
        label: f.reference ?? f.id.slice(0, 8),
        sublabel: `${(f.etudiants as any)?.nom ?? ''} · ${Number(f.montant_total ?? 0).toLocaleString('fr-FR')} FCFA · ${f.statut}`,
        href: '/comptabilite',
        ico: 'wallet',
      }));

      setResults(items);
      setShowDrop(true);
    } finally {
      setSearching(false);
    }
  }, [ecoleId]);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  }

  function handleSelect(r: SearchResult) {
    setQuery('');
    setResults([]);
    setShowDrop(false);
    navigate(r.href);
  }

  const navItems: { group: string; items: { id: string; label: string; ico: IconName; href: string }[] }[] = [
    { group: 'TABLEAU DE BORD', items: [
      { id: 'dashboard', label: 'Dashboard', ico: 'home', href: '/dashboard' },
      ...(isSuperAdmin ? [{ id: 'dashboard-reseau', label: 'Dashboard Réseau', ico: 'globe' as IconName, href: '/dashboard-reseau' }] : []),
      { id: 'analytics', label: 'Analytique', ico: 'chart', href: '/analytics' },
    ]},
    { group: 'PÉDAGOGIE LMD', items: [
      { id: 'programmes', label: 'Programmes & UE', ico: 'graduationCap', href: '/programmes' },
      { id: 'emploi-du-temps', label: 'Emploi du temps', ico: 'calendarDays', href: '/emploi-du-temps' },
      { id: 'inscriptions', label: 'Inscriptions', ico: 'listChecks', href: '/inscriptions' },
      { id: 'annees', label: 'Années acad.', ico: 'layers', href: '/annees' },
      { id: 'semestres',  label: 'Semestres',       ico: 'calendar', href: '/semestres' },
      { id: 'promotions', label: 'Promotions',      ico: 'users', href: '/promotions' },
      { id: 'etudiants',  label: 'Étudiants',       ico: 'userGraduate', href: '/etudiants' },
    ]},
    { group: 'ÉVALUATION', items: [
      { id: 'saisie-notes', label: 'Saisie des notes', ico: 'pencil', href: '/saisie-notes' },
      { id: 'presences',    label: 'Présences',        ico: 'clipboardCheck', href: '/presences' },
      { id: 'resultats',    label: 'Résultats',        ico: 'barChart', href: '/resultats' },
      { id: 'deliberations',label: 'Délibérations',   ico: 'scale', href: '/deliberations' },
      { id: 'releves',      label: 'Relevés',          ico: 'fileText', href: '/releves' },
    ]},
    { group: 'ÉTABLISSEMENT', items: [
      { id: 'analytics-ia', label: 'Analytics IA', ico: 'sparkles', href: '/analytics-ia' },
      { id: 'portail-public', label: 'Portail Public', ico: 'globe', href: '/portail-public' },
      { id: 'email-parents', label: 'Email Parents', ico: 'mail', href: '/email-parents' },
      { id: 'rh-personnel', label: 'RH & Personnel', ico: 'briefcase', href: '/rh-personnel' },
      { id: 'portail-enseignant', label: 'Portail Enseignant', ico: 'chalkboard', href: '/portail-enseignant' },
      { id: 'enseignants',  label: 'Enseignants',  ico: 'chalkboard', href: '/enseignants' },
      { id: 'utilisateurs', label: 'Utilisateurs', ico: 'users', href: '/utilisateurs' },
      { id: 'comptabilite', label: 'Comptabilité', ico: 'wallet', href: '/comptabilite' },
      { id: 'messages',     label: 'Messages',     ico: 'message', href: '/messages' },
    ]},
    { group: 'SYSTÈME', items: [
      { id: 'monitoring', label: 'Monitoring', ico: 'radio', href: '/monitoring' },
      { id: 'prospects',  label: 'Prospects',  ico: 'target', href: '/prospects' },
      { id: 'parametres-ecole', label: 'Paramètres', ico: 'settings', href: '/parametres-ecole' },
      { id: 'parametres', label: 'Param. avancés', ico: 'settings', href: '/parametres' },
    ]},
  ];

  function toggleGroup(groupName: string) {
    if (PINNED_GROUPS.has(groupName)) return;
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName); else next.add(groupName);
      return next;
    });
  }

  // Nav — B11.3 : role="navigation" + aria-current sur l'item actif ; groupes repliables
  const navContent = (
    <nav role="navigation" aria-label="Navigation principale" style={{ flex: 1, padding: '0.5rem 0.75rem' }}>
      {navItems.map(group => {
        const isPinned = PINNED_GROUPS.has(group.group);
        const isExpanded = isPinned || expandedGroups.has(group.group);
        const groupId = `el-group-${group.group.replace(/\s+/g, '-')}`;
        return (
          <div key={group.group} style={{ marginBottom: '1rem' }}>
            {isPinned ? (
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(247,244,237,0.4)', letterSpacing: '0.06em', marginBottom: '0.25rem', paddingLeft: 4 }}>
                {group.group}
              </div>
            ) : (
              <button
                onClick={() => toggleGroup(group.group)}
                aria-expanded={isExpanded}
                aria-controls={groupId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', minHeight: 32, background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '4px 4px', fontFamily: 'inherit',
                  fontSize: 10, fontWeight: 600, color: 'rgba(247,244,237,0.4)', letterSpacing: '0.06em',
                }}
              >
                <span>{group.group}</span>
                <span style={{
                  display: 'flex', transition: 'transform 0.15s ease',
                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}>
                  <Icon name="chevronDown" size={13} />
                </span>
              </button>
            )}
            {isExpanded && (
              <div id={groupId}>
                {group.items.map(item => {
                  if (!visibleModules.includes(item.id)) return null;
                  const isActive = currentPage === item.id;
                  return (
                    <Link
                      key={item.id}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 10px', minHeight: 44, borderRadius: 8, textDecoration: 'none',
                        fontSize: 13, fontWeight: isActive ? 600 : 400,
                        color: isActive ? '#F7F4ED' : 'rgba(247,244,237,0.75)',
                        background: isActive ? 'rgba(200,147,46,0.18)' : 'transparent',
                        borderLeft: isActive ? '2px solid #C8932E' : '2px solid transparent',
                        marginBottom: 1,
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Icon name={item.ico} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Segoe UI', sans-serif" }}>
      <style>{`
        .el-hamburger { display: none; }
        .el-overlay { display: none; }
        .el-sidebar-close { display: none; }

        /* B11.4 — Focus clavier visible sur tous les éléments interactifs */
        .el-skip-link:focus,
        a:focus-visible,
        button:focus-visible,
        input:focus-visible,
        select:focus-visible,
        textarea:focus-visible,
        [tabindex]:focus-visible {
          outline: 3px solid #2563eb;
          outline-offset: 2px;
          border-radius: 4px;
        }

        /* B11.9 — Lien d'évitement, visible seulement au focus clavier */
        .el-skip-link {
          position: absolute;
          left: -9999px;
          top: 0;
          z-index: 10000;
          background: #1B2A4A;
          color: #fff;
          padding: 10px 16px;
          border-radius: 0 0 8px 0;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
        }
        .el-skip-link:focus {
          left: 0;
        }

        @media (max-width: 768px) {
          .el-sidebar {
            position: fixed !important;
            left: 0;
            top: 0;
            height: 100vh !important;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            z-index: 1200;
            box-shadow: 4px 0 24px rgba(0,0,0,.25);
          }
          .el-sidebar.el-sidebar-open {
            transform: translateX(0);
          }
          .el-hamburger {
            display: inline-flex !important;
          }
          .el-overlay.el-overlay-open {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(17,24,39,.5);
            z-index: 1100;
          }
          .el-sidebar-close {
            display: inline-flex !important;
          }
        }
      `}</style>

      {/* B11.9 — Skip link */}
      <a href="#el-main-content" className="el-skip-link">Aller au contenu principal</a>

      {/* Overlay mobile — clic pour fermer le drawer */}
      <div
        className={`el-overlay${sidebarOpen ? ' el-overlay-open' : ''}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`el-sidebar${sidebarOpen ? ' el-sidebar-open' : ''}`} style={{
        width: 240, background: '#1B2A4A', color: '#F7F4ED',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '1.25rem 1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 19, fontWeight: 600, color: '#F7F4ED' }}>
              EduLink <span style={{ color: '#C8932E' }}>Sup</span>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(247,244,237,0.55)', marginTop: 2 }}>LMD · CAMES</div>
          </div>
          <button
            className="el-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
            style={{
              alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 8, flexShrink: 0,
              background: 'rgba(255,255,255,0.08)', border: 'none', color: '#F7F4ED',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* École */}
        {user?.ecole_nom && (
          <div style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.06)', margin: '0.5rem 0.75rem', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F7F4ED', lineHeight: 1.4 }}>{user.ecole_nom}</div>
            {isSuperAdmin && <div style={{ fontSize: 10, color: '#C8932E' }}>super-admin</div>}
          </div>
        )}

        {navContent}

        {/* User + logout */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#C8932E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: '#1B2A4A', flexShrink: 0,
            }} aria-hidden="true">
              {user?.nom?.charAt(0) ?? 'U'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#F7F4ED', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nom ?? ''}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(247,244,237,0.5)' }}>{user?.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%', minHeight: 44, padding: '7px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, fontSize: 12, color: '#F7F4ED', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Zone principale */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Barre de recherche globale */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #f1f5f9',
          padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            className="el-hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
            style={{
              alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 8, flexShrink: 0,
              background: '#1B2A4A', border: 'none', color: '#F7F4ED',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Icon name="menu" size={18} />
          </button>
          <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: '#94a3b8', pointerEvents: 'none', display: 'flex',
              }} aria-hidden="true">
                <Icon name="search" size={15} />
              </span>
              <label htmlFor="global-search" style={{
                position: 'absolute', width: 1, height: 1, overflow: 'hidden',
                clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
              }}>
                Rechercher un étudiant, enseignant ou facture
              </label>
              <input
                ref={searchInputRef}
                type="search"
                id="global-search"
                name="global-search"
                autoComplete="off"
                value={query}
                onChange={handleQueryChange}
                onFocus={() => { setSearchFocused(true); if (results.length > 0) setShowDrop(true); }}
                onBlur={() => setSearchFocused(false)}
                placeholder="Rechercher un étudiant, enseignant, facture…"
                style={{
                  width: '100%', minHeight: 44, boxSizing: 'border-box',
                  padding: `7px ${(!searchFocused && !query) ? 60 : 12}px 7px 32px`,
                  border: '1px solid #e2e8f0', borderRadius: 10,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  background: '#f8fafc', color: '#1e293b',
                  transition: 'padding 0.1s ease',
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setShowDrop(false); setQuery(''); searchInputRef.current?.blur(); }
                }}
              />
              {searching && (
                <span style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 11, color: '#94a3b8',
                }} role="status">…</span>
              )}
              {!searching && !searchFocused && !query && (
                <span aria-hidden="true" style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 10, fontWeight: 600, color: '#94a3b8',
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 5,
                  padding: '2px 6px', pointerEvents: 'none', letterSpacing: 0.3,
                  fontFamily: "'Segoe UI', sans-serif",
                }}>{isMac ? '⌘K' : 'Ctrl+K'}</span>
              )}
            </div>

            {/* Dropdown résultats */}
            {showDrop && results.length > 0 && (
              <div role="listbox" aria-label="Résultats de recherche" style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 9999,
                overflow: 'hidden',
              }}>
                {results.map((r, i) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    role="option"
                    aria-selected="false"
                    onClick={() => handleSelect(r)}
                    style={{
                      width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', border: 'none', background: 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      borderBottom: i < results.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: '#64748b', flexShrink: 0, display: 'flex' }}>
                      <Icon name={r.ico} size={16} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.sublabel}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
                      background: r.type === 'etudiant' ? '#dbeafe' : r.type === 'enseignant' ? '#dcfce7' : '#fef3c7',
                      color: r.type === 'etudiant' ? '#1d4ed8' : r.type === 'enseignant' ? '#15803d' : '#b45309',
                    }}>
                      {r.type}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {showDrop && query.length >= 2 && results.length === 0 && !searching && (
              <div role="status" style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                padding: '12px 14px', fontSize: 13, color: '#94a3b8',
                boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 9999,
              }}>
                Aucun résultat pour « {query} »
              </div>
            )}
          </div>
        </div>

        {/* Contenu — cible du skip link (B11.9) */}
        <main id="el-main-content" tabIndex={-1} style={{ flex: 1, overflow: 'auto', outline: 'none' }}>
          {children}
        </main>

        {/* Toast notifications — B2.2 */}
        <ToastContainer />
      </div>
    </div>
  );
}
