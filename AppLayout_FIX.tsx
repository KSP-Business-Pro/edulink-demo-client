// src/components/AppLayout.tsx
// Layout principal — sidebar + contenu
// Navigation via <Link> React Router + Recherche globale + ToastContainer B2.2

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

export function AppLayout({ children, currentPage }: AppLayoutProps) {
  const { user, logout, isSuperAdmin } = useAuth();
  const { visibleModules } = usePermissions();
  const navigate = useNavigate();

  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const searchRef               = useRef<HTMLDivElement>(null);
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
        ico: '🧑‍🎓',
      }));

      (ensRes.data ?? []).forEach((e: any) => items.push({
        type: 'enseignant',
        id: e.id,
        label: `${e.nom} ${e.prenom ?? ''}`,
        sublabel: e.specialite ?? 'Enseignant',
        href: '/enseignants',
        ico: '👨‍🏫',
      }));

      (facRes.data ?? []).forEach((f: any) => items.push({
        type: 'facture',
        id: f.id,
        label: f.reference ?? f.id.slice(0, 8),
        sublabel: `${(f.etudiants as any)?.nom ?? ''} · ${Number(f.montant_total ?? 0).toLocaleString('fr-FR')} FCFA · ${f.statut}`,
        href: '/comptabilite',
        ico: '💰',
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

  const navItems = [
    { group: 'TABLEAU DE BORD', items: [
      { id: 'dashboard', label: 'Dashboard', ico: '🏠', href: '/dashboard' },
      { id: 'analytics', label: 'Analytique', ico: '📊', href: '/analytics' },
    ]},
    { group: 'PÉDAGOGIE LMD', items: [
      { id: 'programmes', label: 'Programmes & UE', ico: '🎓', href: '/programmes' },
      { id: 'emploi-du-temps', label: 'Emploi du temps', ico: '📆', href: '/emploi-du-temps' },
      { id: 'inscriptions', label: 'Inscriptions', ico: '📋', href: '/inscriptions' },
      { id: 'semestres',  label: 'Semestres',       ico: '📅', href: '/semestres' },
      { id: 'promotions', label: 'Promotions',      ico: '👥', href: '/promotions' },
      { id: 'etudiants',  label: 'Étudiants',       ico: '🧑‍🎓', href: '/etudiants' },
    ]},
    { group: 'ÉVALUATION', items: [
      { id: 'saisie-notes', label: 'Saisie des notes', ico: '✏️', href: '/saisie-notes' },
      { id: 'presences',    label: 'Présences',        ico: '📋', href: '/presences' },
      { id: 'resultats',    label: 'Résultats',        ico: '📊', href: '/resultats' },
      { id: 'deliberations',label: 'Délibérations',   ico: '⚖️', href: '/deliberations' },
      { id: 'releves',      label: 'Relevés',          ico: '📄', href: '/releves' },
    ]},
    { group: 'ÉTABLISSEMENT', items: [
      { id: 'enseignants',  label: 'Enseignants',  ico: '👨‍🏫', href: '/enseignants' },
      { id: 'comptabilite', label: 'Comptabilité', ico: '💰', href: '/comptabilite' },
      { id: 'messages',     label: 'Messages',     ico: '💬', href: '/messages' },
    ]},
    { group: 'SYSTÈME', items: [
      { id: 'monitoring', label: 'Monitoring', ico: '📡', href: '/monitoring' },
      { id: 'prospects',  label: 'Prospects',  ico: '🎯', href: '/prospects' },
      { id: 'parametres', label: 'Paramètres', ico: '⚙️', href: '/parametres' },
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
                if (!visibleModules.includes(item.id)) return null;
                const isActive = currentPage === item.id;
                return (
                  <Link
                    key={item.id}
                    to={item.href}
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
                  </Link>
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

      {/* Zone principale */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Barre de recherche globale */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #f1f5f9',
          padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 14, color: '#94a3b8', pointerEvents: 'none',
              }}>🔍</span>
              <input
                type="search"
                id="global-search"
                name="global-search"
                autoComplete="off"
                value={query}
                onChange={handleQueryChange}
                onFocus={() => { if (results.length > 0) setShowDrop(true); }}
                placeholder="Rechercher un étudiant, enseignant, facture…"
                style={{
                  width: '100%', padding: '7px 12px 7px 32px',
                  border: '1px solid #e2e8f0', borderRadius: 10,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  background: '#f8fafc', color: '#1e293b',
                  boxSizing: 'border-box',
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
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
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
