// src/pages/DashboardPage.tsx
// Dashboard React — réplique fidèle du legacy avec couche services propre

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { loadDashboard } from '../services/dashboard.service';
import type { DashboardData } from '../services/dashboard.service';

// ── Composants locaux ──────────────────────────────────────────────────────

function KPICard({ ico, val, label, sub }: { ico: string; val: string | number; label: string; sub: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '1.25rem 1.5rem',
      border: '1px solid #f1f5f9', flex: 1, minWidth: 160,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{ico}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function DonutChart({ programmes }: { programmes: DashboardData['programmes'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !programmes.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const total  = programmes.reduce((s, p) => s + p.inscrits, 0);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const R = 80, r = 50;
    let angle = -Math.PI / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    programmes.forEach(p => {
      const slice = (p.inscrits / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.fill();
      angle += slice;
    });

    // Trou central
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Texte central
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 18px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 8);
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('étudiants', cx, cy + 10);
  }, [programmes]);

  if (!programmes.length) return (
    <div style={{ padding: '1.5rem', color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
      Aucun programme configuré
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <canvas ref={canvasRef} width={220} height={220} />
      <div style={{ width: '100%' }}>
        {programmes.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, marginBottom: 6,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.intitule}
            </span>
            <span style={{ color: '#6b7280', fontWeight: 600 }}>{p.inscrits}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Accès rapides ──────────────────────────────────────────────────────────
const QUICK_LINKS = [
  { ico: '✏️', label: 'Saisie notes', href: 'https://app.edulink.bj', color: '#dbeafe' },
  { ico: '📋', label: 'Résultats',    href: 'https://app.edulink.bj', color: '#dcfce7' },
  { ico: '📄', label: 'Relevés',      href: 'https://app.edulink.bj', color: '#ede9fe' },
  { ico: '👥', label: 'Promotions',   href: 'https://app.edulink.bj', color: '#fef9c3' },
  { ico: '🧑‍🎓', label: 'Étudiants',  href: 'https://app.edulink.bj', color: '#ffedd5' },
  { ico: '👨‍🏫', label: 'Enseignants', href: 'https://app.edulink.bj', color: '#ccfbf1' },
];

function QuickAccess() {
  return (
    <div style={styles.block}>
      <div style={styles.blockTitle}>⚡ Accès rapides</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {QUICK_LINKS.map(link => (
          <a
            key={link.label}
            href={link.href}
            style={{
              background: link.color, borderRadius: 10, padding: '0.85rem',
              textAlign: 'center', cursor: 'pointer', textDecoration: 'none',
              transition: 'opacity .15s', display: 'block',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <div style={{ fontSize: 22, marginBottom: 4 }}>{link.ico}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#374151' }}>{link.label}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Crédits CAMES ──────────────────────────────────────────────────────────
function CreditsCAMES({ kpis }: { kpis: DashboardData['kpis'] }) {
  const hasData = kpis.creditsTotal > 0;
  return (
    <div style={styles.block}>
      <div style={styles.blockTitle}>🏅 Crédits CAMES validés</div>
      {hasData ? (
        <>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: '#1e3a5f', lineHeight: 1 }}>
              {kpis.creditsTotal}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              crédits CECT validés au total
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
            {[
              { val: kpis.nbValides,                   label: 'Validés',     color: '#059669' },
              { val: kpis.nbInscrits - kpis.nbValides, label: 'Non validés', color: '#dc2626' },
              { val: `${kpis.tauxValidation}%`,        label: 'Taux',        color: '#7c3aed' },
            ].map(({ val, label, color }) => (
              <div key={label} style={{ textAlign: 'center', background: '#f9fafb', borderRadius: 10, padding: '0.75rem', border: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10.5, color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ ...styles.empty, padding: '1.5rem' }}>
          <p>Aucune note saisie pour l'instant</p>
          <a href="https://app.edulink.bj" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, color: '#1e3a5f' }}>
            Commencer la saisie →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user, isSuperAdmin } = useAuth();
  const [data,       setData]       = useState<DashboardData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [ecoles,     setEcoles]     = useState<{id:string;nom:string}[]>([]);
  const [ecoleId,    setEcoleId]    = useState<string | null>(user?.ecole_id ?? null);

  // Super-admin : charger la liste des écoles
  useEffect(() => {
    if (!isSuperAdmin) return;
    import('../services/supabase').then(({ supabase }) => {
      supabase.from('ecoles').select('id,nom').order('nom').then(({ data: ec }) => {
        if (ec?.length) {
          setEcoles(ec);
          if (!ecoleId) setEcoleId(ec[0].id); // HEMEC par défaut
        }
      });
    });
  }, [isSuperAdmin]);

  useEffect(() => {
    const eid = ecoleId ?? user?.ecole_id;
    if (!eid) { setLoading(false); return; }
    setLoading(true);
    loadDashboard(eid)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [ecoleId, user?.ecole_id]);

  // Sélecteur école pour super-admin
  const ecoleSelector = isSuperAdmin && ecoles.length > 0 ? (
    <select
      value={ecoleId ?? ''}
      onChange={e => setEcoleId(e.target.value)}
      style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', cursor: 'pointer' }}
    >
      {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
    </select>
  ) : null;

  if (loading) return (
    <div style={styles.centered}>
      <div style={styles.spinner} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={styles.centered}>
      <div style={{ color: '#dc2626', fontSize: 13 }}>Erreur : {error}</div>
    </div>
  );

  if (!data) return null;

  const { kpis, semestres, programmes } = data;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>Tableau de bord</h1>
          <p style={styles.subtitle}>Vue générale LMD</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{ecoleSelector}<span style={styles.annee}>{kpis.anneeLibelle}</span></div>
      </div>

      {/* KPIs */}
      <div style={styles.kpiGrid}>
        <KPICard ico="🧑‍🎓" val={kpis.nbEtudiants}       label="Étudiants"             sub={`${kpis.nbInscrits} inscrits ce semestre`} />
        <KPICard ico="📅"   val={kpis.nbSemestresActifs} label="Semestres en cours"    sub={`${kpis.nbProgrammes} programme${kpis.nbProgrammes > 1 ? 's' : ''}`} />
        <KPICard ico="📚"   val={kpis.nbUE}              label="Unités d'enseignement" sub={`Année ${kpis.anneeLibelle}`} />
        <KPICard ico="🏆"   val={`${kpis.tauxValidation}%`} label="Taux de validation" sub={`${kpis.nbValides} / ${kpis.nbInscrits} étudiants`} />
      </div>

      {/* Grille */}
      <div style={styles.grid}>

        {/* Semestres en cours */}
        <div style={styles.block}>
          <div style={styles.blockTitle}>📅 Semestres en cours</div>
          {semestres.length === 0 ? (
            <div style={styles.empty}>Aucun semestre actif</div>
          ) : (
            semestres.map(s => (
              <div key={s.id} style={styles.semRow}>
                <div style={styles.niveauBadge}>{s.niveau}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.semLibelle}>{s.libelle}</div>
                  <div style={styles.semProg}>{s.programme}</div>
                </div>
                <span style={styles.badgeGreen}>En cours</span>
              </div>
            ))
          )}
          <button style={styles.btnOutline} onClick={() => window.location.href = '/index_legacy.html#semestres'}>
            Voir tous les semestres
          </button>
        </div>

        {/* Répartition par programme */}
        <div style={styles.block}>
          <div style={styles.blockTitle}>🎓 Inscriptions par programme</div>
          <DonutChart programmes={programmes} />
          <button style={{ ...styles.btnOutline, marginTop: 12 }} onClick={() => window.location.href = '/index_legacy.html#programmes'}>
            Gérer les programmes
          </button>
        </div>

      </div>

      {/* Ligne 2 — Accès rapides + Crédits CAMES */}
      <div style={styles.grid}>
        <QuickAccess />
        <CreditsCAMES kpis={kpis} />
      </div>

      {/* Lien back-office */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <a href="/index_legacy.html" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
          Accéder au back-office complet →
        </a>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  page:       { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' } as React.CSSProperties,
  h1:         { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  subtitle:   { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  annee:      { fontSize: 13, color: '#94a3b8', fontWeight: 500 } as React.CSSProperties,
  kpiGrid:    { display: 'flex', gap: 14, flexWrap: 'wrap' as const, marginBottom: '1.5rem' },
  grid:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1rem' } as React.CSSProperties,
  block:      { background: '#fff', borderRadius: 14, padding: '1.25rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  blockTitle: { fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem' } as React.CSSProperties,
  semRow:     { display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem', background: '#f9fafb', borderRadius: 10, marginBottom: 6, border: '1px solid #f3f4f6' } as React.CSSProperties,
  niveauBadge:{ width: 38, height: 38, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#1d4ed8', flexShrink: 0 } as React.CSSProperties,
  semLibelle: { fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  semProg:    { fontSize: 11, color: '#6b7280' } as React.CSSProperties,
  badgeGreen: { background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, flexShrink: 0 } as React.CSSProperties,
  btnOutline: { width: '100%', marginTop: 8, padding: '8px 0', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  empty:      { padding: '1.5rem', color: '#9ca3af', fontSize: 13, textAlign: 'center' as const },
  centered:   { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 8 },
  spinner:    { width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
};
