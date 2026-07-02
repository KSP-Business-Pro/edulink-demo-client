// src/pages/DashboardPage.tsx
// Dashboard React — B2.3 : skeleton loaders + retry + dernière sync
// B7 — Charte graphique : palette ocre/ivoire + Lora

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { loadDashboard } from '../services/dashboard.service';
import type { DashboardData } from '../services/dashboard.service';

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ w = '100%', h = 16, radius = 6, style = {} }: {
  w?: string | number; h?: number; radius?: number; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      flexShrink: 0,
      ...style,
    }} />
  );
}

function KPICardSkeleton() {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '1.25rem 1.5rem',
      borderTop: '2px solid #C8932E', border: '1px solid #f1f5f9',
      flex: 1, minWidth: 160,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <Skeleton w={32} h={32} radius={8} />
      <Skeleton w="60%" h={28} radius={6} />
      <Skeleton w="80%" h={14} radius={4} />
      <Skeleton w="50%" h={12} radius={4} />
    </div>
  );
}

function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ ...styles.block, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton w="40%" h={16} radius={4} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Skeleton w={38} h={38} radius={10} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton w="70%" h={13} radius={4} />
            <Skeleton w="45%" h={11} radius={4} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── KPICard ────────────────────────────────────────────────────────────────

function KPICard({ ico, val, label, sub }: { ico: string; val: string | number; label: string; sub: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '1.25rem 1.5rem',
      borderTop: '2px solid #C8932E', border: '1px solid #f1f5f9',
      flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{ico}</div>
      <div style={{ fontFamily: "'Lora', serif", fontSize: 28, fontWeight: 600, color: '#1B2A4A', lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── DonutChart ─────────────────────────────────────────────────────────────

function DonutChart({ programmes }: { programmes: DashboardData['programmes'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !programmes.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const total = programmes.reduce((s, p) => s + p.inscrits, 0);
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
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FBFAF6';
    ctx.fill();
    ctx.fillStyle = '#1B2A4A';
    ctx.font = "bold 18px 'Lora', serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 8);
    ctx.font = "11px 'Segoe UI', sans-serif";
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
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
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
          <a key={link.label} href={link.href} style={{
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
            <div style={{ fontFamily: "'Lora', serif", fontSize: 48, fontWeight: 600, color: '#1B2A4A', lineHeight: 1 }}>
              {kpis.creditsTotal}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>crédits CECT validés au total</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
            {[
              { val: kpis.nbValides,                   label: 'Validés',     color: '#059669' },
              { val: kpis.nbInscrits - kpis.nbValides, label: 'Non validés', color: '#dc2626' },
              { val: `${kpis.tauxValidation}%`,        label: 'Taux',        color: '#C8932E' },
            ].map(({ val, label, color }) => (
              <div key={label} style={{ textAlign: 'center', background: '#F7F4ED', borderRadius: 10, padding: '0.75rem', border: '1px solid #f3f4f6' }}>
                <div style={{ fontFamily: "'Lora', serif", fontSize: 18, fontWeight: 600, color }}>{val}</div>
                <div style={{ fontSize: 10.5, color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ ...styles.empty, padding: '1.5rem' }}>
          <p>Aucune note saisie pour l'instant</p>
          <a href="https://app.edulink.bj" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, color: '#1B2A4A' }}>
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
  const { error, loading, run } = useErrorHandler();

  const [data,    setData]    = useState<DashboardData | null>(null);
  const [ecoles,  setEcoles]  = useState<{ id: string; nom: string }[]>([]);
  const [ecoleId, setEcoleId] = useState<string | null>(user?.ecole_id ?? null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    import('../services/supabase').then(({ supabase }) => {
      supabase.from('ecoles').select('id,nom').order('nom').then(({ data: ec }) => {
        if (ec?.length) {
          setEcoles(ec);
          if (!ecoleId) setEcoleId(ec[0].id);
        }
      });
    });
  }, [isSuperAdmin]);

  const load = useCallback(async (eid: string) => {
    const d = await run(
      () => loadDashboard(eid),
      { context: 'Chargement dashboard' }
    );
    if (d) {
      setData(d);
      setLastSync(new Date());
    }
  }, [run]);

  useEffect(() => {
    const eid = ecoleId ?? user?.ecole_id;
    if (!eid) return;
    load(eid);
  }, [ecoleId, user?.ecole_id]);

  const ecoleSelector = isSuperAdmin && ecoles.length > 0 ? (
    <select
      value={ecoleId ?? ''}
      onChange={e => setEcoleId(e.target.value)}
      style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#1B2A4A', cursor: 'pointer' }}
    >
      {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
    </select>
  ) : null;

  const keyframes = `
    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes shimmer { 0%,100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }
  `;

  if (error && !data) return (
    <div style={styles.centered}>
      <style>{keyframes}</style>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontFamily: "'Lora', serif", fontSize: 14, fontWeight: 600, color: '#1B2A4A', marginBottom: 4 }}>
        Impossible de charger le tableau de bord
      </div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, maxWidth: 320, textAlign: 'center' }}>
        {error}
      </div>
      <button
        style={styles.retryBtn}
        onClick={() => {
          const eid = ecoleId ?? user?.ecole_id;
          if (eid) load(eid);
        }}
      >
        🔄 Réessayer
      </button>
    </div>
  );

  if (loading && !data) return (
    <div style={styles.page}>
      <style>{keyframes}</style>
      <div style={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton w={200} h={22} radius={6} />
          <Skeleton w={120} h={13} radius={4} />
        </div>
        <Skeleton w={110} h={32} radius={8} />
      </div>
      <div style={styles.kpiGrid}>
        {[0,1,2,3].map(i => <KPICardSkeleton key={i} />)}
      </div>
      <div style={styles.grid}>
        <BlockSkeleton rows={3} />
        <BlockSkeleton rows={4} />
      </div>
      <div style={styles.grid}>
        <BlockSkeleton rows={2} />
        <BlockSkeleton rows={2} />
      </div>
    </div>
  );

  if (!data) return null;

  const { kpis, semestres, programmes } = data;

  return (
    <div style={styles.page}>
      <style>{keyframes}</style>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>
            Tableau de bord
            <svg width="16" height="16" viewBox="0 0 40 40" style={{ marginLeft: 8, verticalAlign: 'middle', opacity: 0.3 }}>
              <circle cx="20" cy="20" r="18" fill="none" stroke="#C8932E" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="13" fill="none" stroke="#C8932E" strokeWidth="1" />
              <path d="M20 11 L26 16 L20 20 L14 16 Z" fill="#C8932E" />
            </svg>
          </h1>
          <p style={styles.subtitle}>Vue générale LMD</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {ecoleSelector}
          <span style={styles.annee}>{kpis.anneeLibelle}</span>
          {lastSync && (
            <span style={styles.syncBadge} title="Dernière synchronisation">
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={styles.syncSpinner} />
                  Sync…
                </span>
              ) : (
                <>🕐 {lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>
              )}
            </span>
          )}
          <button
            style={styles.refreshBtn}
            onClick={() => { const eid = ecoleId ?? user?.ecole_id; if (eid) load(eid); }}
            disabled={loading}
            title="Rafraîchir"
          >
            🔄
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={styles.kpiGrid}>
        <KPICard ico="🧑‍🎓" val={kpis.nbEtudiants}          label="Étudiants"             sub={`${kpis.nbInscrits} inscrits ce semestre`} />
        <KPICard ico="📅"   val={kpis.nbSemestresActifs}    label="Semestres en cours"    sub={`${kpis.nbProgrammes} programme${kpis.nbProgrammes > 1 ? 's' : ''}`} />
        <KPICard ico="📚"   val={kpis.nbUE}                 label="Unités d'enseignement" sub={`Année ${kpis.anneeLibelle}`} />
        <KPICard ico="🏆"   val={`${kpis.tauxValidation}%`} label="Taux de validation"    sub={`${kpis.nbValides} / ${kpis.nbInscrits} étudiants`} />
      </div>

      {/* Grille */}
      <div style={styles.grid}>
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

        <div style={styles.block}>
          <div style={styles.blockTitle}>🎓 Inscriptions par programme</div>
          <DonutChart programmes={programmes} />
          <button style={{ ...styles.btnOutline, marginTop: 12 }} onClick={() => window.location.href = '/index_legacy.html#programmes'}>
            Gérer les programmes
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        <QuickAccess />
        <CreditsCAMES kpis={kpis} />
      </div>

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
  page:        { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap' as const, gap: 10 },
  h1:          { fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 600, color: '#1B2A4A', margin: 0, display: 'flex', alignItems: 'center' } as React.CSSProperties,
  subtitle:    { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  annee:       { fontSize: 13, color: '#94a3b8', fontWeight: 500 } as React.CSSProperties,
  kpiGrid:     { display: 'flex', gap: 14, flexWrap: 'wrap' as const, marginBottom: '1.5rem' },
  grid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1rem' } as React.CSSProperties,
  block:       { background: '#fff', borderRadius: 10, padding: '1.25rem', borderTop: '2px solid #C8932E', border: '1px solid #f1f5f9' } as React.CSSProperties,
  blockTitle:  { fontFamily: "'Lora', serif", fontSize: 14, fontWeight: 600, color: '#1B2A4A', marginBottom: '0.75rem' } as React.CSSProperties,
  semRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem', background: '#F7F4ED', borderRadius: 8, marginBottom: 6, border: '1px solid #f3f4f6' } as React.CSSProperties,
  niveauBadge: { width: 38, height: 38, borderRadius: 8, background: '#1B2A4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#C8932E', flexShrink: 0 } as React.CSSProperties,
  semLibelle:  { fontSize: 13, fontWeight: 600, color: '#1B2A4A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  semProg:     { fontSize: 11, color: '#6b7280' } as React.CSSProperties,
  badgeGreen:  { background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, flexShrink: 0 } as React.CSSProperties,
  btnOutline:  { width: '100%', marginTop: 8, padding: '8px 0', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  empty:       { padding: '1.5rem', color: '#9ca3af', fontSize: 13, textAlign: 'center' as const },
  centered:    { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 8 },
  syncBadge:   { fontSize: 11, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 } as React.CSSProperties,
  syncSpinner: { width: 10, height: 10, border: '2px solid #e2e8f0', borderTopColor: '#64748b', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' } as React.CSSProperties,
  refreshBtn:  { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 6px', borderRadius: 6, opacity: 0.6 } as React.CSSProperties,
  retryBtn:    { padding: '9px 20px', background: '#1B2A4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
};
