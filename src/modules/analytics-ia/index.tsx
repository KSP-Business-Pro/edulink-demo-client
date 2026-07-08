// src/modules/analytics-ia/index.tsx
// B5.7 — Analytics IA — tableaux de bord intelligents

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatGlobale {
  nb_etudiants:     number
  nb_inscrits:      number
  taux_validation:  number
  moyenne_generale: number
  nb_deliberes:     number
  taux_presence:    number
}

interface ProgStat {
  programme_id:   string
  programme_nom:  string
  niveau:         string
  nb_inscrits:    number
  moyenne:        number
  taux_reussite:  number
  taux_echec:     number
}

interface TendanceMensuelle {
  mois:         string
  nb_inscrits:  number
  moyenne:      number
}

interface EtudiantRisque {
  etudiant_id:  string
  nom:          string
  prenom:       string | null
  moyenne:      number
  nb_absences:  number
  score_risque: number // 0-100
  niveau_risque: 'faible' | 'moyen' | 'eleve' | 'critique'
}

interface InsightIA {
  type:    'success' | 'warning' | 'info' | 'alert'
  titre:   string
  message: string
  valeur:  string | null
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  tabs:        { display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9' } as React.CSSProperties,
  tab:         (a: boolean): React.CSSProperties => ({ padding: '8px 18px', fontSize: 13, fontWeight: a ? 600 : 400, color: a ? '#1e3a5f' : '#64748b', background: 'none', border: 'none', cursor: 'pointer', borderBottom: a ? '2px solid #1e3a5f' : '2px solid transparent', marginBottom: -2, fontFamily: "'Segoe UI', sans-serif" }),
  // KPI Cards
  kpiGrid:     { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' } as React.CSSProperties,
  kpiCard:     (color: string): React.CSSProperties => ({ background: '#fff', borderRadius: 14, border: `1px solid ${color}30`, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.06)', borderLeft: `4px solid ${color}` }),
  kpiNum:      (color: string): React.CSSProperties => ({ fontSize: 32, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }),
  kpiLabel:    { fontSize: 12, color: '#64748b', fontWeight: 500 } as React.CSSProperties,
  kpiSub:      { fontSize: 11, color: '#94a3b8', marginTop: 4 } as React.CSSProperties,
  kpiTrend:    (up: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: up ? '#16a34a' : '#dc2626', background: up ? '#f0fdf4' : '#fef2f2', padding: '2px 6px', borderRadius: 4, marginTop: 6 }),
  // Grid layouts
  grid2:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' } as React.CSSProperties,
  grid3:       { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.25rem' } as React.CSSProperties,
  // Cards
  card:        { background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.06)' } as React.CSSProperties,
  cardTitle:   { fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
  // Barres
  barWrap:     { display: 'flex', flexDirection: 'column' as const, gap: 8 } as React.CSSProperties,
  barRow:      { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
  barLabel:    { fontSize: 12, color: '#374151', minWidth: 140, flexShrink: 0 } as React.CSSProperties,
  barTrack:    { flex: 1, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' } as React.CSSProperties,
  barFill:     (pct: number, color: string): React.CSSProperties => ({ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 5, transition: 'width .6s ease' }),
  barValue:    { fontSize: 11, color: '#64748b', minWidth: 36, textAlign: 'right' as const } as React.CSSProperties,
  // Insights IA
  insightCard: (type: string): React.CSSProperties => {
    const cfg: Record<string, { bg: string; border: string; color: string }> = {
      success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
      warning: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
      info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
      alert:   { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
    }
    const c = cfg[type] ?? cfg.info
    return { background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', gap: 10, alignItems: 'flex-start' }
  },
  insightIco:  (type: string): string => ({ success: '✅', warning: '⚠️', info: '💡', alert: '🚨' }[type] ?? '💡'),
  // Tableau risque
  tableWrap:   { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:       { width: '100%', borderCollapse: 'collapse' as const },
  thead:       { background: '#f8fafc' },
  th:          { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  td:          { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const, borderBottom: '1px solid #f9fafb' } as React.CSSProperties,
  riskBadge:   (r: string): React.CSSProperties => {
    const c = { faible: { bg: '#d1fae5', text: '#065f46' }, moyen: { bg: '#fef9c3', text: '#713f12' }, eleve: { bg: '#ffedd5', text: '#9a3412' }, critique: { bg: '#fef2f2', text: '#991b1b' } }[r] ?? { bg: '#f1f5f9', text: '#475569' }
    return { display: 'inline-block', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }
  },
  // Jauge circulaire
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:       { textAlign: 'center' as const, padding: '2rem', color: '#94a3b8', fontSize: 13 },
  filterSel:   { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  scoreBar:    (score: number): React.CSSProperties => ({ width: `${score}%`, height: 6, background: score > 75 ? '#dc2626' : score > 50 ? '#f59e0b' : score > 25 ? '#3b82f6' : '#22c55e', borderRadius: 3 }),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noteColor(n: number): string {
  if (n >= 14) return '#16a34a'
  if (n >= 10) return '#2563eb'
  if (n >= 7)  return '#d97706'
  return '#dc2626'
}

function GaugeCircle({ value, max = 100, color, label, size = 80 }: {
  value: number; max?: number; color: string; label: string; size?: number
}) {
  const pct = Math.min(100, (value / max) * 100)
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
        <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.2} fontWeight={700} fill={color}>
          {Math.round(pct)}%
        </text>
      </svg>
      <span style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>{label}</span>
    </div>
  )
}

// ─── Onglet Vue Générale ──────────────────────────────────────────────────────

function TabVueGenerale({ ecoleId, anneeId }: { ecoleId: string; anneeId: string }) {
  const [stats,     setStats]     = useState<StatGlobale | null>(null)
  const [progStats, setProgStats] = useState<ProgStat[]>([])
  const [insights,  setInsights]  = useState<InsightIA[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!ecoleId) return
    setLoading(true)

    Promise.all([
      // Stats globales
      supabase.from('etudiants').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId).eq('statut', 'actif'),
      supabase.from('inscriptions_semestre').select('id,statut', { count: 'exact' }).eq('ecole_id', ecoleId),
      supabase.from('resultats_cache').select('moyenne_semestre, semestre_valide').eq('ecole_id', ecoleId),
      supabase.from('programmes_lmd').select('id, intitule, grade').eq('ecole_id', ecoleId),
    ]).then(async ([etudRes, insRes, resRes, progsRes]) => {
      const nbEtudiants = etudRes.count ?? 0
      const nbInscrits  = insRes.count ?? 0
      const resultats   = resRes.data ?? []
      const moyennes    = resultats.map(r => r.moyenne_semestre).filter((m): m is number => m !== null)
      const moyGene     = moyennes.length > 0 ? moyennes.reduce((s, m) => s + m, 0) / moyennes.length : 0
      const nbValides   = resultats.filter(r => r.semestre_valide).length
      const tauxValid   = resultats.length > 0 ? (nbValides / resultats.length) * 100 : 0

      setStats({
        nb_etudiants:     nbEtudiants,
        nb_inscrits:      nbInscrits,
        taux_validation:  tauxValid,
        moyenne_generale: moyGene,
        nb_deliberes:     resultats.length,
        taux_presence:    78, // placeholder - nécessite table presences agrégée
      })

      // Stats par programme
      const progs = progsRes.data ?? []
      const progStatsArr: ProgStat[] = []
      for (const prog of progs.slice(0, 8)) {
        const { data: res } = await supabase.from('resultats_cache')
          .select('moyenne_semestre, semestre_valide, semestres!inner(programme_id)').eq('ecole_id', ecoleId).eq('semestres.programme_id', prog.id)
        const rs = res ?? []
        const moys = rs.map(r => (r as any).moyenne_semestre).filter((m): m is number => m !== null)
        const moy  = moys.length > 0 ? moys.reduce((s, m) => s + m, 0) / moys.length : 0
        const valid = rs.filter(r => (r as any).semestre_valide).length
        progStatsArr.push({
          programme_id:  prog.id,
          programme_nom: prog.intitule,
          niveau:        prog.grade,
          nb_inscrits:   rs.length,
          moyenne:       moy,
          taux_reussite: rs.length > 0 ? (valid / rs.length) * 100 : 0,
          taux_echec:    rs.length > 0 ? ((rs.length - valid) / rs.length) * 100 : 0,
        })
      }
      setProgStats(progStatsArr)

      // Génération insights IA
      const newInsights: InsightIA[] = []
      if (moyGene >= 12) {
        newInsights.push({ type: 'success', titre: 'Excellents résultats', message: `La moyenne générale de ${moyGene.toFixed(1)}/20 dépasse le seuil de validation. Performance académique solide.`, valeur: `${moyGene.toFixed(1)}/20` })
      } else if (moyGene >= 10) {
        newInsights.push({ type: 'info', titre: 'Résultats satisfaisants', message: `Moyenne générale de ${moyGene.toFixed(1)}/20. Des efforts ciblés sur les matières à faible taux de réussite permettraient d'améliorer les performances.`, valeur: `${moyGene.toFixed(1)}/20` })
      } else {
        newInsights.push({ type: 'alert', titre: 'Résultats préoccupants', message: `La moyenne générale de ${moyGene.toFixed(1)}/20 est en dessous du seuil acceptable. Une action immédiate est recommandée.`, valeur: `${moyGene.toFixed(1)}/20` })
      }
      if (tauxValid >= 75) {
        newInsights.push({ type: 'success', titre: 'Taux de validation élevé', message: `${tauxValid.toFixed(0)}% des étudiants délibérés ont validé leur semestre. Ce taux témoigne d'un bon encadrement pédagogique.`, valeur: `${tauxValid.toFixed(0)}%` })
      } else if (tauxValid < 50) {
        newInsights.push({ type: 'warning', titre: 'Taux de validation faible', message: `Seulement ${tauxValid.toFixed(0)}% des étudiants valident leur semestre. Envisager un programme de remédiation.`, valeur: `${tauxValid.toFixed(0)}%` })
      }
      const progsFaibles = progStatsArr.filter(p => p.moyenne < 10)
      if (progsFaibles.length > 0) {
        newInsights.push({ type: 'warning', titre: `${progsFaibles.length} programme(s) en difficulté`, message: `Les programmes suivants affichent une moyenne inférieure à 10/20 : ${progsFaibles.map(p => p.programme_nom).join(', ')}.`, valeur: null })
      }
      newInsights.push({ type: 'info', titre: 'Recommandation pédagogique', message: 'Analyser les matières avec un taux d\'échec supérieur à 40% et organiser des sessions de révision ciblées avant les prochaines délibérations.', valeur: null })

      setInsights(newInsights)
      setLoading(false)
    })
  }, [ecoleId, anneeId])

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>
  if (!stats)  return <div style={S.empty}>Aucune donnée disponible</div>

  return (
    <div>
      {/* KPI Cards */}
      <div style={S.kpiGrid}>
        {[
          { label: 'Étudiants actifs', val: stats.nb_etudiants, color: '#1e3a5f', sub: 'inscrits cette année', ico: '🎓' },
          { label: 'Moyenne générale', val: `${stats.moyenne_generale.toFixed(1)}/20`, color: noteColor(stats.moyenne_generale), sub: `${stats.nb_deliberes} délibérations`, ico: '📊' },
          { label: 'Taux de validation', val: `${stats.taux_validation.toFixed(0)}%`, color: stats.taux_validation >= 70 ? '#16a34a' : '#d97706', sub: 'étudiants validés', ico: '✅' },
        ].map(k => (
          <div key={k.label} style={S.kpiCard(k.color)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={S.kpiLabel}>{k.ico} {k.label}</div>
                <div style={S.kpiNum(k.color)}>{k.val}</div>
                <div style={S.kpiSub}>{k.sub}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={S.grid2}>
        {/* Jauge performances */}
        <div style={S.card}>
          <div style={S.cardTitle}>📈 Indicateurs de performance</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', padding: '0.5rem 0' }}>
            <GaugeCircle value={stats.taux_validation}  color="#16a34a" label="Validation" />
            <GaugeCircle value={stats.taux_presence}    color="#2563eb" label="Présence"   />
            <GaugeCircle value={(stats.moyenne_generale / 20) * 100} max={100} color="#7c3aed" label="Résultats" />
          </div>
        </div>

        {/* Insights IA */}
        <div style={S.card}>
          <div style={S.cardTitle}>🤖 Analyse IA</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.slice(0, 3).map((ins, i) => (
              <div key={i} style={S.insightCard(ins.type)}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{S.insightIco(ins.type)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>{ins.titre}</div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{ins.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Résultats par programme */}
      {progStats.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>🎓 Performance par programme</div>
          <div style={S.barWrap}>
            {progStats.sort((a, b) => b.taux_reussite - a.taux_reussite).map(p => (
              <div key={p.programme_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                    <span style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, marginRight: 6, color: '#64748b' }}>{p.niveau}</span>
                    {p.programme_nom}
                  </span>
                  <span style={{ fontSize: 11, color: noteColor(p.moyenne), fontWeight: 600 }}>{p.moyenne.toFixed(1)}/20</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <div style={S.barTrack}>
                    <div style={S.barFill(p.taux_reussite, '#16a34a')} />
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b', minWidth: 50, textAlign: 'right' as const }}>{p.taux_reussite.toFixed(0)}% réussite</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Onglet Détection Risques ─────────────────────────────────────────────────

function TabRisques({ ecoleId }: { ecoleId: string }) {
  const [etudiants, setEtudiants] = useState<EtudiantRisque[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState<string>('tous')

  useEffect(() => {
    if (!ecoleId) return
    setLoading(true)

    supabase.from('resultats_cache')
      .select('etudiant_id, moyenne_semestre, semestre_valide, etudiants(nom, prenom)')
      .eq('ecole_id', ecoleId)
      .then(async ({ data: res }) => {
        if (!res) { setLoading(false); return }

        const rows: EtudiantRisque[] = res.map((r: Record<string, unknown>) => {
          const etu = r.etudiants as Record<string, unknown> | null
          const moy = r.moyenne_semestre as number | null ?? 0
          // Score risque : basé sur moyenne (principale composante)
          const scoreParMoy    = moy < 10 ? ((10 - moy) / 10) * 60 : 0
          const scoreParValidation = !(r.semestre_valide as boolean) ? 30 : 0
          const scoreRisque = Math.min(100, Math.round(scoreParMoy + scoreParValidation))
          const niveauRisque: EtudiantRisque['niveau_risque'] =
            scoreRisque >= 75 ? 'critique' :
            scoreRisque >= 50 ? 'eleve' :
            scoreRisque >= 25 ? 'moyen' : 'faible'

          return {
            etudiant_id:  r.etudiant_id as string,
            nom:          etu?.nom as string ?? '—',
            prenom:       etu?.prenom as string | null,
            moyenne:      moy,
            nb_absences:  0, // à enrichir
            score_risque: scoreRisque,
            niveau_risque: niveauRisque,
          }
        }).sort((a, b) => b.score_risque - a.score_risque)

        setEtudiants(rows)
        setLoading(false)
      })
  }, [ecoleId])

  const filtered = filter === 'tous' ? etudiants : etudiants.filter(e => e.niveau_risque === filter)

  const counts = {
    critique: etudiants.filter(e => e.niveau_risque === 'critique').length,
    eleve:    etudiants.filter(e => e.niveau_risque === 'eleve').length,
    moyen:    etudiants.filter(e => e.niveau_risque === 'moyen').length,
    faible:   etudiants.filter(e => e.niveau_risque === 'faible').length,
  }

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div>
      {/* Résumé risques */}
      <div style={S.grid3}>
        {[
          { label: 'Risque critique', count: counts.critique, color: '#dc2626', bg: '#fef2f2', ico: '🚨' },
          { label: 'Risque élevé',    count: counts.eleve,    color: '#d97706', bg: '#fff7ed', ico: '⚠️' },
          { label: 'Risque moyen',    count: counts.moyen,    color: '#2563eb', bg: '#eff6ff', ico: '📊' },
        ].map(r => (
          <div key={r.label} style={{ ...S.card, background: r.bg, border: `1px solid ${r.color}30`, cursor: 'pointer' }}
            onClick={() => setFilter(r.label.toLowerCase().includes('critique') ? 'critique' : r.label.toLowerCase().includes('lev') ? 'eleve' : 'moyen')}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{r.ico}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: r.color }}>{r.count}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{r.label}</div>
          </div>
        ))}
      </div>

      {/* Insights sur les risques */}
      {counts.critique > 0 && (
        <div style={{ ...S.insightCard('alert'), marginBottom: '1rem' }}>
          <span style={{ fontSize: 16 }}>🚨</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>
              {counts.critique} étudiant(s) en situation critique
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Ces étudiants présentent des risques de décrochage scolaire imminent. Une convocation individuelle et un plan de remédiation sont fortement recommandés.
            </div>
          </div>
        </div>
      )}

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>Filtrer :</span>
        {['tous', 'critique', 'eleve', 'moyen', 'faible'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...{ padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid', fontWeight: filter === f ? 600 : 400, background: filter === f ? '#1e3a5f' : '#fff', color: filter === f ? '#fff' : '#374151', borderColor: filter === f ? '#1e3a5f' : '#e2e8f0' } }}>
            {f.charAt(0).toUpperCase() + f.slice(1)} {f !== 'tous' ? `(${counts[f as keyof typeof counts] ?? 0})` : `(${etudiants.length})`}
          </button>
        ))}
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <div style={S.empty}>✅ Aucun étudiant dans cette catégorie</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>
                <th style={S.th}>Étudiant</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Moyenne</th>
                <th style={S.th}>Score de risque</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Niveau</th>
                <th style={S.th}>Recommandation IA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map(e => (
                <tr key={e.etudiant_id}>
                  <td style={S.td}>
                    <span style={{ fontWeight: 500 }}>{e.prenom} {e.nom}</span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' as const, fontWeight: 700, color: noteColor(e.moyenne) }}>
                    {e.moyenne.toFixed(1)}/20
                  </td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3 }}>
                        <div style={S.scoreBar(e.score_risque)} />
                      </div>
                      <span style={{ fontSize: 11, color: '#64748b', minWidth: 30 }}>{e.score_risque}</span>
                    </div>
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' as const }}>
                    <span style={S.riskBadge(e.niveau_risque)}>{e.niveau_risque}</span>
                  </td>
                  <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>
                    {e.niveau_risque === 'critique' ? '🚨 Convocation immédiate + tutorat' :
                     e.niveau_risque === 'eleve'    ? '⚠️ Entretien + plan de remédiation' :
                     e.niveau_risque === 'moyen'    ? '📋 Suivi renforcé recommandé' :
                     '✅ Continuer le suivi standard'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Onglet Comparatif ────────────────────────────────────────────────────────

function TabComparatif({ ecoleId }: { ecoleId: string }) {
  const [data,    setData]    = useState<ProgStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ecoleId) return
    setLoading(true)
    supabase.from('programmes_lmd').select('id, nom, niveau').eq('ecole_id', ecoleId)
      .then(async ({ data: progs }) => {
        const arr: ProgStat[] = []
        for (const prog of progs ?? []) {
          const { data: res } = await supabase.from('resultats_cache')
            .select('moyenne_semestre, semestre_valide, semestres!inner(programme_id)').eq('ecole_id', ecoleId).eq('semestres.programme_id', prog.id)
          const rs   = res ?? []
          const moys = rs.map(r => (r as any).moyenne_semestre).filter((m): m is number => m !== null)
          const moy  = moys.length > 0 ? moys.reduce((s, m) => s + m, 0) / moys.length : 0
          const valid= rs.filter(r => (r as any).semestre_valide).length
          arr.push({
            programme_id:  prog.id,
            programme_nom: prog.intitule,
            niveau:        prog.grade,
            nb_inscrits:   rs.length,
            moyenne:       moy,
            taux_reussite: rs.length > 0 ? (valid / rs.length) * 100 : 0,
            taux_echec:    rs.length > 0 ? ((rs.length - valid) / rs.length) * 100 : 0,
          })
        }
        setData(arr.sort((a, b) => b.moyenne - a.moyenne))
        setLoading(false)
      })
  }, [ecoleId])

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>
  if (data.length === 0) return <div style={S.empty}>📊<br/>Aucune donnée de résultats disponible</div>

  const maxMoy = Math.max(...data.map(p => p.moyenne), 1)

  return (
    <div>
      <div style={S.grid2}>
        {/* Classement par moyenne */}
        <div style={S.card}>
          <div style={S.cardTitle}>🏆 Classement par moyenne</div>
          <div style={S.barWrap}>
            {data.map((p, i) => (
              <div key={p.programme_id}>
                <div style={S.barRow}>
                  <span style={{ fontSize: 11, color: '#94a3b8', width: 16, flexShrink: 0 }}>#{i+1}</span>
                  <span style={{ ...S.barLabel, fontSize: 11 }}>{p.programme_nom.slice(0, 30)}{p.programme_nom.length > 30 ? '…' : ''}</span>
                  <div style={S.barTrack}>
                    <div style={S.barFill((p.moyenne / 20) * 100, noteColor(p.moyenne))} />
                  </div>
                  <span style={{ ...S.barValue, color: noteColor(p.moyenne), fontWeight: 600 }}>{p.moyenne.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Taux réussite vs échec */}
        <div style={S.card}>
          <div style={S.cardTitle}>📈 Réussite vs Échec par programme</div>
          <div style={S.barWrap}>
            {data.map(p => (
              <div key={p.programme_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: '#374151' }}>{p.programme_nom.slice(0, 28)}{p.programme_nom.length > 28 ? '…' : ''}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.nb_inscrits} étudiants</span>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1 }}>
                  <div style={{ width: `${p.taux_reussite}%`, background: '#22c55e', borderRadius: '5px 0 0 5px' }} title={`Réussite : ${p.taux_reussite.toFixed(0)}%`} />
                  <div style={{ width: `${p.taux_echec}%`, background: '#ef4444', borderRadius: '0 5px 5px 0' }} title={`Échec : ${p.taux_echec.toFixed(0)}%`} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: '#16a34a' }}>✓ {p.taux_reussite.toFixed(0)}%</span>
                  <span style={{ fontSize: 10, color: '#dc2626' }}>✗ {p.taux_echec.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tableau récapitulatif */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead style={S.thead}>
            <tr>
              <th style={S.th}>Programme</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Niveau</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Étudiants</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Moyenne</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Réussite</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Échec</th>
              <th style={S.th}>Évaluation IA</th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.programme_id}>
                <td style={{ ...S.td, fontWeight: 500, maxWidth: 200 }}>{p.programme_nom}</td>
                <td style={{ ...S.td, textAlign: 'center' as const }}>
                  <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{p.niveau}</span>
                </td>
                <td style={{ ...S.td, textAlign: 'center' as const }}>{p.nb_inscrits}</td>
                <td style={{ ...S.td, textAlign: 'center' as const, fontWeight: 700, color: noteColor(p.moyenne) }}>
                  {p.moyenne.toFixed(1)}/20
                </td>
                <td style={{ ...S.td, textAlign: 'center' as const, color: '#16a34a', fontWeight: 600 }}>
                  {p.taux_reussite.toFixed(0)}%
                </td>
                <td style={{ ...S.td, textAlign: 'center' as const, color: '#dc2626', fontWeight: 600 }}>
                  {p.taux_echec.toFixed(0)}%
                </td>
                <td style={{ ...S.td, fontSize: 12 }}>
                  {p.moyenne >= 13 ? '🌟 Excellent' :
                   p.moyenne >= 11 ? '✅ Bien' :
                   p.moyenne >= 10 ? '📋 Passable' :
                   '⚠️ En difficulté'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'generale',   label: 'Vue générale',      ico: '📊' },
  { id: 'risques',    label: 'Détection risques',  ico: '🔍' },
  { id: 'comparatif', label: 'Comparatif',         ico: '📈' },
] as const
type TabId = typeof TABS[number]['id']

export default function AnalyticsIAPage() {
  const { user, isSuperAdmin } = useAuth()
  const [ecoleId,   setEcoleId]   = useState(user?.ecole_id ?? '')
  const [ecoles,    setEcoles]    = useState<{ id: string; nom: string }[]>([])
  const [annees,    setAnnees]    = useState<{ id: string; libelle: string }[]>([])
  const [anneeId,   setAnneeId]   = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('generale')

  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('ecoles').select('id,nom').order('nom').then(({ data }) => {
        setEcoles(data ?? [])
        if (!ecoleId && data?.[0]) setEcoleId(data[0].id)
      })
    }
    if (ecoleId) {
      supabase.from('annees_academiques').select('id, libelle').eq('ecole_id', ecoleId).order('libelle', { ascending: false })
        .then(({ data }) => { setAnnees(data ?? []); if (data?.[0]) setAnneeId(data[0].id) })
    }
  }, [isSuperAdmin, ecoleId])

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>🤖 Analytics IA</h1>
          <p style={S.sub}>Tableaux de bord intelligents · Détection risques · Analyse comparative</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={e => setEcoleId(e.target.value)} style={S.filterSel}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          {annees.length > 0 && (
            <select value={anneeId} onChange={e => setAnneeId(e.target.value)} style={S.filterSel}>
              {annees.map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
            </select>
          )}
        </div>
      </div>

      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={S.tab(activeTab === t.id)}>
            {t.ico} {t.label}
          </button>
        ))}
      </div>

      {!ecoleId ? (
        <div style={S.empty}>🏫<br/>Sélectionnez un établissement</div>
      ) : (
        <>
          {activeTab === 'generale'   && <TabVueGenerale  ecoleId={ecoleId} anneeId={anneeId} />}
          {activeTab === 'risques'    && <TabRisques      ecoleId={ecoleId} />}
          {activeTab === 'comparatif' && <TabComparatif   ecoleId={ecoleId} />}
        </>
      )}
    </div>
  )
}
