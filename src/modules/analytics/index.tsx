// src/modules/analytics/index.tsx
// B3.3 — Tableau de bord analytique avancé EduLink Sup

import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchAnalytics, type AnalyticsData } from './analytics.service';

// ── Composant jauge circulaire SVG ─────────────────────────────────────────
function Jauge({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r  = (size - 12) / 2;
  const c  = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  );
}

// ── Barre horizontale ──────────────────────────────────────────────────────
function BarreHorizontale({ label, val, max, color, suffix = '' }: {
  label: string; val: number; max: number; color: string; suffix?: string;
}) {
  const pct = max > 0 ? Math.round((val / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
          {val.toLocaleString('fr-FR')}{suffix} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 4, transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  );
}

// ── Couleurs par statut ────────────────────────────────────────────────────
const FACTURE_COLORS: Record<string, string> = {
  paye:      '#059669',
  partiel:   '#d97706',
  en_attente:'#94a3b8',
  impayee:   '#dc2626',
};

const PRESENCE_COLORS: Record<string, { color: string; label: string }> = {
  present: { color: '#059669', label: 'Présents'  },
  absent:  { color: '#dc2626', label: 'Absents'   },
  retard:  { color: '#d97706', label: 'En retard' },
  excused: { color: '#7c3aed', label: 'Excusés'   },
};

const SEANCE_COLORS: Record<string, string> = {
  CM: '#1d4ed8', TD: '#15803d', TP: '#c2410c',
  devoir_surveille: '#b45309', partiel: '#be185d',
  examen_final: '#b91c1c', examen: '#b91c1c',
  rattrapage: '#7e22ce', expose: '#0369a1',
  projet: '#166534', autre: '#374151',
};

const NIVEAU_COLORS = ['#1d4ed8', '#059669', '#d97706', '#7e22ce', '#dc2626'];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const ecoleId = user?.ecole_id ?? '';

  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!ecoleId) return;
    setLoading(true);
    fetchAnalytics(ecoleId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ecoleId]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: '2rem', color: '#dc2626', fontSize: 13 }}>
      Erreur de chargement : {error}
    </div>
  );

  if (!data) return null;

  const { kpi, repartitionNiveau, facturesStatut, inscriptions, presences, seancesParType } = data;
  const totalPresences = presences.reduce((s, p) => s + p.total, 0);
  const maxInscr = Math.max(...inscriptions.map(i => i.inscrits), 1);
  const maxSeance = Math.max(...seancesParType.map(s => s.nb), 1);

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>📊 Analytique</h1>
          <p style={S.sub}>Tableau de bord avancé — {user?.ecole_nom ?? 'HEMEC'}</p>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' as const }}>
          Données en temps réel<br />
          {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={S.kpiGrid}>
        {[
          { ico: '🧑‍🎓', val: kpi.etudiants_actifs, total: kpi.total_etudiants, label: 'Étudiants actifs', color: '#1d4ed8', sub: `sur ${kpi.total_etudiants} inscrits` },
          { ico: '📋', val: kpi.total_inscriptions, label: 'Inscriptions', color: '#059669', sub: '3 semestres actifs' },
          { ico: '📅', val: kpi.total_seances, label: 'Séances planifiées', color: '#7e22ce', sub: 'emploi du temps' },
        ].map(({ ico, val, label, color, sub }) => (
          <div key={label} style={S.kpiCard}>
            <div style={{ fontSize: 28 }}>{ico}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
          </div>
        ))}

        {/* Jauge présence */}
        <div style={{ ...S.kpiCard, position: 'relative' as const }}>
          <div style={{ position: 'relative' as const, width: 80, height: 80 }}>
            <Jauge pct={kpi.taux_presence} color={kpi.taux_presence >= 75 ? '#059669' : kpi.taux_presence >= 50 ? '#d97706' : '#dc2626'} />
            <div style={{ position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
              {kpi.taux_presence}%
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Taux de présence</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{totalPresences} pointages</div>
        </div>

        {/* Jauge recouvrement */}
        <div style={{ ...S.kpiCard, position: 'relative' as const }}>
          <div style={{ position: 'relative' as const, width: 80, height: 80 }}>
            <Jauge pct={kpi.taux_recouvrement} color={kpi.taux_recouvrement >= 80 ? '#059669' : kpi.taux_recouvrement >= 60 ? '#d97706' : '#dc2626'} />
            <div style={{ position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
              {kpi.taux_recouvrement}%
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Recouvrement</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {(kpi.montant_recouvre / 1000).toFixed(0)}k / {(kpi.montant_attendu / 1000).toFixed(0)}k FCFA
          </div>
        </div>
      </div>

      {/* ── Ligne 2 : Répartition + Présences ── */}
      <div style={S.row2}>

        {/* Répartition par niveau */}
        <div style={S.card}>
          <div style={S.cardTitle}>🎓 Répartition par niveau</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 16 }}>
            {repartitionNiveau.map((r, i) => (
              <BarreHorizontale
                key={`${r.niveau}-${r.filiere}`}
                label={`${r.niveau} — ${r.filiere}`}
                val={r.total}
                max={kpi.etudiants_actifs}
                color={NIVEAU_COLORS[i % NIVEAU_COLORS.length]}
                suffix=" étudiants"
              />
            ))}
          </div>
          {/* Légende visuelle */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {repartitionNiveau.map((r, i) => (
              <div key={`${r.niveau}-${r.filiere}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: NIVEAU_COLORS[i % NIVEAU_COLORS.length] }} />
                <span style={{ fontSize: 10, color: '#64748b' }}>{r.niveau}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Présences */}
        <div style={S.card}>
          <div style={S.cardTitle}>📋 Répartition des présences</div>

          {/* Camembert SVG simplifié */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{ position: 'relative' as const, width: 120, height: 120, flexShrink: 0 }}>
              <svg viewBox="0 0 120 120" width={120} height={120}>
                {(() => {
                  let offset = 0;
                  const total = presences.reduce((s, p) => s + p.total, 0);
                  const c = 2 * Math.PI * 40;
                  return presences.map(p => {
                    const pct = total > 0 ? p.total / total : 0;
                    const dash = pct * c;
                    const gap  = c - dash;
                    const col  = PRESENCE_COLORS[p.statut]?.color ?? '#94a3b8';
                    const el = (
                      <circle key={p.statut}
                        cx={60} cy={60} r={40}
                        fill="none" stroke={col} strokeWidth={28}
                        strokeDasharray={`${dash} ${gap}`}
                        strokeDashoffset={-offset * c}
                        style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
                      />
                    );
                    offset += pct;
                    return el;
                  });
                })()}
                <circle cx={60} cy={60} r={26} fill="#fff" />
                <text x={60} y={56} textAnchor="middle" fontSize={13} fontWeight={700} fill="#1e293b">{totalPresences}</text>
                <text x={60} y={70} textAnchor="middle" fontSize={9} fill="#94a3b8">total</text>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              {presences.map(p => {
                const cfg = PRESENCE_COLORS[p.statut] ?? { color: '#94a3b8', label: p.statut };
                const pct = totalPresences > 0 ? Math.round((p.total / totalPresences) * 100) : 0;
                return (
                  <div key={p.statut} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1, color: '#374151' }}>{cfg.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{p.total}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 32, textAlign: 'right' as const }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alerte absences */}
          {kpi.taux_presence < 75 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
              ⚠️ Taux de présence inférieur à 75% — action recommandée
            </div>
          )}
        </div>
      </div>

      {/* ── Ligne 3 : Factures + Inscriptions + Séances ── */}
      <div style={S.row3}>

        {/* Factures */}
        <div style={S.card}>
          <div style={S.cardTitle}>💰 État des paiements</div>
          <div style={{ marginBottom: 12 }}>
            {facturesStatut.map(f => (
              <BarreHorizontale
                key={f.statut}
                label={f.statut.replace('_', ' ')}
                val={f.nb}
                max={facturesStatut.reduce((s, x) => s + x.nb, 0)}
                color={FACTURE_COLORS[f.statut] ?? '#94a3b8'}
              />
            ))}
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Montant recouvré</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                {kpi.montant_recouvre.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Montant attendu</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                {kpi.montant_attendu.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
          </div>
        </div>

        {/* Inscriptions par semestre */}
        <div style={S.card}>
          <div style={S.cardTitle}>📚 Inscriptions par semestre</div>
          {inscriptions.map((ins, i) => (
            <div key={`${ins.libelle}-${ins.statut}`} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {ins.libelle}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round((ins.inscrits / maxInscr) * 100)}%`,
                    background: NIVEAU_COLORS[i % NIVEAU_COLORS.length],
                    borderRadius: 5,
                    transition: 'width 0.8s ease',
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', minWidth: 24 }}>{ins.inscrits}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999,
                  background: ins.statut === 'active' ? '#d1fae5' : '#f3f4f6',
                  color:      ins.statut === 'active' ? '#065f46' : '#374151',
                }}>
                  {ins.statut}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Séances par type */}
        <div style={S.card}>
          <div style={S.cardTitle}>📆 Séances par type</div>
          {seancesParType.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>Aucune séance planifiée</div>
          ) : (
            seancesParType.map(s => (
              <BarreHorizontale
                key={s.type_seance}
                label={s.type_seance}
                val={s.nb}
                max={maxSeance}
                color={SEANCE_COLORS[s.type_seance] ?? '#94a3b8'}
                suffix=" séance(s)"
              />
            ))
          )}
        </div>
      </div>

      {/* ── Alerte résumé ── */}
      <div style={S.alerteWrap}>
        <div style={S.cardTitle}>🔔 Points d'attention</div>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginTop: 8 }}>
          {kpi.taux_presence < 75 && (
            <div style={S.alerte('warning')}>
              ⚠️ Taux de présence faible ({kpi.taux_presence}%) — Vérifier les absences répétées
            </div>
          )}
          {kpi.taux_recouvrement < 80 && (
            <div style={S.alerte('danger')}>
              💸 Recouvrement insuffisant ({kpi.taux_recouvrement}%) — {(kpi.montant_attendu - kpi.montant_recouvre).toLocaleString('fr-FR')} FCFA en attente
            </div>
          )}
          {facturesStatut.find(f => f.statut === 'en_attente') && (
            <div style={S.alerte('info')}>
              📬 {facturesStatut.find(f => f.statut === 'en_attente')?.nb} facture(s) en attente de traitement
            </div>
          )}
          {kpi.taux_presence >= 75 && kpi.taux_recouvrement >= 80 && (
            <div style={S.alerte('success')}>
              ✅ Indicateurs globaux satisfaisants — Bonne gestion de la cohorte
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const alerte = (type: 'warning' | 'danger' | 'info' | 'success') => {
  const cfg = {
    warning: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
    danger:  { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    info:    { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
    success: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  }[type];
  return {
    background: cfg.bg, color: cfg.color,
    border: `1px solid ${cfg.border}`,
    borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 500,
  } as React.CSSProperties;
};

const S = {
  page:      { padding: '1.5rem 2rem', maxWidth: 1300, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:        { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:       { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  kpiGrid:   { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: '1.25rem' } as React.CSSProperties,
  kpiCard:   { background: '#fff', borderRadius: 14, padding: '1.25rem 1rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6, textAlign: 'center' as const },
  row2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } as React.CSSProperties,
  row3:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 } as React.CSSProperties,
  card:      { background: '#fff', borderRadius: 14, padding: '1.25rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: '0.875rem' } as React.CSSProperties,
  alerteWrap:{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  alerte,
};
