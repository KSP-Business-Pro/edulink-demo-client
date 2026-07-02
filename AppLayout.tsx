// src/components/AppLayout.tsx
// Layout principal — sidebar + contenu
// Navigation via <Link> React Router + Recherche globale + ToastContainer B2.2
// B7 — Charte graphique : sidebar bleu nuit + sections repliables + palette ocre
// B10 — Sidebar transformée en drawer mobile (hamburger + overlay + fermeture auto)

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
  ico: string;
}

// Icones par groupe pour la sidebar repliable
const GROUP_ICONS: Record<string, string> = {
  'TABLEAU DE BORD': '⊞',
  'PÉDAGOGIE LMD':  '🎓',
  'ÉVALUATION':     '✏️',
  'ÉTABLISSEMENT':  '🏢',
  'SYSTÈME':        '⚙️',
};

// Groupes toujours visibles (non repliables)
const PINNED_GROUPS = new Set(['TABLEAU DE BORD']);

// ── B10 — Styles responsive pour la sidebar en drawer mobile ────────────────
// Sur desktop (> 768px) : comportement inchangé (sidebar sticky à gauche).
// Sur mobile (≤ 768px) : sidebar hors-écran par défaut, glisse au-dessus du
// contenu quand ouverte ; hamburger visible ; overlay cliquable pour fermer.
const MOBILE_STYLES = `
  .el-hamburger { display: none; }
  .el-overlay { display: none; }

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
`;

export function AppLayout({ children, currentPage }: AppLayoutProps) {
  const { user, logout, isSuperAdmin } = useAuth();
  const { visibleModules } = usePermissions();
  const navigate = useNavigate();

  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop]   = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['TABLEAU DE BORD', 'PÉDAGOGIE LMD'])
  );
  const [mobileOpen, setMobileOpen] = useState(false); // B10 — état du drawer mobile
  const searchRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // B10 — ferme le drawer mobile automatiquement à chaque changement de page
  useEffect(() => { setMobileOpen(false); }, [currentPage]);

  // B10 — ferme le drawer avec la touche Échap
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

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
        type: 'etudiant', id: e.id,
        label: `${e.nom} ${e.prenom}`,
        sublabel: `${e.matricule ?? '—'} · ${e.filiere ?? '—'}`,
        href: '/etudiants', ico: '\u{1F9D1}\u200D\u{1F393}',
      }));
      (ensRes.data ?? []).forEach((e: any) => items.push({
        type: 'enseignant', id: e.id,
        label: `${e.nom} ${e.prenom ?? ''}`,
        sublabel: e.specialite ?? 'Enseignant',
        href: '/enseignants', ico: '\u{1F468}\u200D\u{1F3EB}',
      }));
      (facRes.data ?? []).forEach((f: any) => items.push({
        type: 'facture', id: f.id,
        label: f.reference ?? f.id.slice(0, 8),
        sublabel: `${(f.etudiants as any)?.nom ?? ''} · ${Number(f.montant_total ?? 0).toLocaleString('fr-FR')} FCFA · ${f.statut}`,
        href: '/comptabilite', ico: '\u{1F4B0}',
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
    setQuery(''); setResults([]); setShowDrop(false);
    navigate(r.href);
  }

  function toggleGroup(group: string) {
    if (PINNED_GROUPS.has(group)) return;
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }

  const navItems = [
    { group: 'TABLEAU DE BORD', items: [
      { id: 'dashboard',         label: 'Dashboard',        ico: '\u{1F3E0}', href: '/dashboard' },
      ...(isSuperAdmin ? [{ id: 'dashboard-reseau', label: 'Dashboard R\u00E9seau', ico: '\u{1F310}', href: '/dashboard-reseau' }] : []),
      { id: 'analytics',         label: 'Analytique',       ico: '\u{1F4CA}', href: '/analytics' },
    ]},
    { group: 'P\u00C9DAGOGIE LMD', items: [
      { id: 'programmes',        label: 'Programmes & UE',  ico: '\u{1F393}', href: '/programmes' },
      { id: 'emploi-du-temps',   label: 'Emploi du temps',  ico: '\u{1F4C6}', href: '/emploi-du-temps' },
      { id: 'inscriptions',      label: 'Inscriptions',     ico: '\u{1F4CB}', href: '/inscriptions' },
      { id: 'annees',            label: 'Ann\u00E9es acad.',ico: '\u{1F4C6}', href: '/annees' },
      { id: 'semestres',         label: 'Semestres',        ico: '\u{1F4C5}', href: '/semestres' },
      { id: 'promotions',        label: 'Promotions',       ico: '\u{1F465}', href: '/promotions' },
      { id: 'etudiants',         label: '\u00C9tudiants',   ico: '\u{1F9D1}\u200D\u{1F393}', href: '/etudiants' },
    ]},
    { group: '\u00C9VALUATION', items: [
      { id: 'saisie-notes',      label: 'Saisie des notes', ico: '\u270F\uFE0F', href: '/saisie-notes' },
      { id: 'presences',         label: 'Pr\u00E9sences',   ico: '\u{1F4CB}', href: '/presences' },
      { id: 'resultats',         label: 'R\u00E9sultats',   ico: '\u{1F4CA}', href: '/resultats' },
      { id: 'deliberations',     label: 'D\u00E9lib\u00E9rations', ico: '\u2696\uFE0F', href: '/deliberations' },
      { id: 'releves',           label: 'Relev\u00E9s',     ico: '\u{1F4C4}', href: '/releves' },
    ]},
    { group: '\u00C9TABLISSEMENT', items: [
      { id: 'analytics-ia',      label: 'Analytics IA',     ico: '\u{1F916}', href: '/analytics-ia' },
      { id: 'portail-public',    label: 'Portail Public',   ico: '\u{1F310}', href: '/portail-public' },
      { id: 'email-parents',     label: 'Email Parents',    ico: '\u{1F4E7}', href: '/email-parents' },
      { id: 'rh-personnel',      label: 'RH & Personnel',   ico: '\u{1F3E2}', href: '/rh-personnel' },
      { id: 'portail-enseignant',label: 'Portail Enseignant',ico: '\u{1F4CB}',href: '/portail-enseignant' },
      { id: 'enseignants',       label: 'Enseignants',      ico: '\u{1F468}\u200D\u{1F3EB}', href: '/enseignants' },
      { id: 'utilisateurs',      label: 'Utilisateurs',     ico: '\u{1F464}', href: '/utilisateurs' },
      { id: 'comptabilite',      label: 'Comptabilit\u00E9',ico: '\u{1F4B0}', href: '/comptabilite' },
      { id: 'messages',          label: 'Messages',         ico: '\u{1F4AC}', href: '/messages' },
    ]},
    { group: 'SYST\u00C8ME', items: [
      { id: 'monitoring',        label: 'Monitoring',       ico: '\u{1F4E1}', href: '/monitoring' },
      { id: 'prospects',         label: 'Prospects',        ico: '\u{1F3AF}', href: '/prospects' },
      { id: 'parametres-ecole',  label: 'Param\u00E8tres',  ico: '\u2699\uFE0F', href: '/parametres-ecole' },
      { id: 'parametres',        label: 'Param. avanc\u00E9s', ico: '\u{1F527}', href: '/parametres' },
    ]},
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F7F4ED', fontFamily: "'Segoe UI', sans-serif" }}>
      <style>{MOBILE_STYLES}</style>

      {/* B10 — Overlay mobile (cliquable pour fermer le drawer) */}
      <div
        className={`el-overlay${mobileOpen ? ' el-overlay-open' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={`el-sidebar${mobileOpen ? ' el-sidebar-open' : ''}`}
        style={{
          width: 240, background: '#1B2A4A', borderRight: 'none',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid rgba(247,244,237,0.1)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="26" height="26" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="none" stroke="#C8932E" strokeWidth="1.5" />
                <circle cx="20" cy="20" r="13" fill="none" stroke="#C8932E" strokeWidth="1" />
                <path d="M20 11 L26 16 L20 20 L14 16 Z" fill="#C8932E" />
                <path d="M14 17.5 L14 23 M26 17.5 L26 23" stroke="#C8932E" strokeWidth="1.2" />
              </svg>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 16, fontWeight: 600, color: '#F7F4ED', lineHeight: 1.1 }}>
                EduLink <span style={{ color: '#C8932E' }}>Sup</span>
              </div>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(247,244,237,0.45)', marginTop: 5, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>LMD · CAMES</div>
          </div>
          {/* B10 — bouton de fermeture, visible uniquement sur mobile */}
          <button
            className="el-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            style={{
              display: 'none', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: 'rgba(247,244,237,0.08)', border: '1px solid rgba(247,244,237,0.15)',
              color: '#F7F4ED', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ✕
          </button>
        </div>

        {/* École */}
        {user?.ecole_nom && (
          <div style={{ padding: '0.6rem 1rem', background: 'rgba(247,244,237,0.08)', margin: '0.5rem 0.75rem', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F7F4ED', lineHeight: 1.4 }}>{user.ecole_nom}</div>
            {isSuperAdmin && <div style={{ fontSize: 10, color: 'rgba(247,244,237,0.5)' }}>super-admin</div>}
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.25rem 0.75rem' }}>
          {navItems.map(group => {
            const isPinned = PINNED_GROUPS.has(group.group);
            const isExpanded = expandedGroups.has(group.group);
            const hasVisible = group.items.some(item => visibleModules.includes(item.id));
            if (!hasVisible) return null;

            return (
              <div key={group.group} style={{ marginBottom: '0.25rem' }}>
                {/* En-tête de groupe */}
                <div
                  onClick={() => toggleGroup(group.group)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 6,
                    cursor: isPinned ? 'default' : 'pointer',
                    marginBottom: 2,
                  }}
                  onMouseEnter={e => { if (!isPinned) (e.currentTarget as HTMLElement).style.background = 'rgba(247,244,237,0.05)'; }}
                  onMouseLeave={e => { if (!isPinned) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{GROUP_ICONS[group.group] ?? '•'}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(247,244,237,0.7)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                      {group.group}
                    </span>
                  </div>
                  {!isPinned && (
                    <span style={{ fontSize: 10, color: 'rgba(247,244,237,0.4)', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  )}
                </div>

                {/* Items du groupe */}
                {isExpanded && (
                  <div style={{ paddingLeft: isPinned ? 0 : 8 }}>
                    {group.items.map(item => {
                      if (!visibleModules.includes(item.id)) return null;
                      const isActive = currentPage === item.id;
                      return (
                        <Link
                          key={item.id}
                          to={item.href}
                          onClick={() => setMobileOpen(false)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 6, textDecoration: 'none',
                            fontSize: 13, fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#F7F4ED' : 'rgba(247,244,237,0.65)',
                            background: isActive ? 'rgba(200,147,46,0.18)' : 'transparent',
                            borderLeft: isActive ? '2px solid #C8932E' : '2px solid transparent',
                            marginBottom: 1,
                          }}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(247,244,237,0.07)'; }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <span style={{ fontSize: 14 }}>{item.ico}</span>
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

        {/* User + logout */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(247,244,237,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#C8932E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: '#1B2A4A', flexShrink: 0,
            }}>
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
              width: '100%', padding: '7px', background: 'rgba(247,244,237,0.08)',
              border: '1px solid rgba(247,244,237,0.15)',
              borderRadius: 8, fontSize: 12, color: 'rgba(247,244,237,0.7)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(247,244,237,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(247,244,237,0.08)')}
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
          {/* B10 — bouton hamburger, visible uniquement sur mobile */}
          <button
            className="el-hamburger"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            style={{
              alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
              background: '#1B2A4A', border: 'none',
              color: '#F7F4ED', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ☰
          </button>

          <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 14, color: '#94a3b8', pointerEvents: 'none',
              }}>🔍</span>
              <input
                type="search"
                value={query}
                onChange={handleQueryChange}
                onFocus={() => { if (results.length > 0) setShowDrop(true); }}
                placeholder="Rechercher un étudiant, enseignant, facture…"
                style={{
                  width: '100%', padding: '7px 12px 7px 32px',
                  border: '1px solid #e2e8f0', borderRadius: 10,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  background: '#f8fafc', color: '#1e293b',
                  boxSizing: 'border-box' as const,
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setShowDrop(false); setQuery(''); }
                }}
              />
              {searching && (
                <span style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 11, color: '#94a3b8',
                }}>…</span>
              )}
            </div>

            {/* Dropdown résultats */}
            {showDrop && results.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 9999,
                overflow: 'hidden',
              }}>
                {results.map((r, i) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleSelect(r)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', border: 'none', background: 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
                      borderBottom: i < results.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{r.ico}</span>
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
              <div style={{
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

        {/* Contenu */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </main>

        {/* Toast notifications — B2.2 */}
        <ToastContainer />
      </div>
    </div>
  );
}
