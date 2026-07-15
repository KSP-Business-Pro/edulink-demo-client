// src/modules/parametres-ecole/index.tsx
// Paramètres École — règles pédagogiques, seuils, notifications

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'

interface ReglesEcole {
  id?: string
  ecole_id: string
  seuil_validation_ue: number
  note_plancher_active: boolean
  seuil_note_plancher: number
  compensation_active: boolean
  regle_rattrapage: 'max' | 'ecrase'
  seuil_validation_semestre?: number
  credits_requis_semestre?: number
  blocage_releve_impaye?: boolean
  tolerance_impaye?: number
  controle_credits_actif?: boolean
  seuil_credits_avancement?: number
}

interface NotifConfig {
  publication_releve_active: boolean
  publication_releve_objet: string
  confirmation_paiement_active: boolean
  confirmation_paiement_objet: string
  alerte_absence_active: boolean
  alerte_absence_objet: string
}

const NOTIF_DEFAULTS: NotifConfig = {
  publication_releve_active: true,
  publication_releve_objet: 'Relevé de notes — {semestre}',
  confirmation_paiement_active: true,
  confirmation_paiement_objet: 'Confirmation de paiement — {etablissement}',
  alerte_absence_active: true,
  alerte_absence_objet: 'Alerte absences — {ue}',
}

const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 900, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  tabs:        { display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9' } as React.CSSProperties,
  tab:         (a: boolean): React.CSSProperties => ({ padding: '8px 18px', fontSize: 13, fontWeight: a ? 600 : 400, color: a ? '#1e3a5f' : '#64748b', background: 'none', border: 'none', cursor: 'pointer', borderBottom: a ? '2px solid #1e3a5f' : '2px solid transparent', marginBottom: -2, fontFamily: "'Segoe UI', sans-serif" }),
  card:        { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '1.5rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  cardTitle:   { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: '1rem', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' } as React.CSSProperties,
  grid2:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' } as React.CSSProperties,
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 10 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  hint:        { fontSize: 11, color: '#94a3b8', marginTop: 2 } as React.CSSProperties,
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  select:      { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  btnPrimary:  { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  footer:      { display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', marginTop: '1rem' } as React.CSSProperties,
  success:     { background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  error:       { background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  filterSel:   { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  toggle:      (on: boolean): React.CSSProperties => ({ width: 44, height: 24, borderRadius: 12, background: on ? '#1e3a5f' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s' }),
  toggleDot:   (on: boolean): React.CSSProperties => ({ position: 'absolute', top: 3, left: on ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }),
  toggleRow:   { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f9fafb' } as React.CSSProperties,
  badgeOn:     { background: '#d1fae5', color: '#065f46', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 } as React.CSSProperties,
  badgeOff:    { background: '#f1f5f9', color: '#64748b', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 } as React.CSSProperties,
  notifCard:   { border: '1px solid #f1f5f9', borderRadius: 10, padding: '1rem', marginBottom: 10, background: '#fafafa' } as React.CSSProperties,
}

export default function ParametresEcolePage() {
  const { user, isSuperAdmin } = useAuth()
  const [ecoleId,   setEcoleId]   = useState(user?.ecole_id ?? '')
  const [ecoles,    setEcoles]    = useState<{ id: string; nom: string }[]>([])
  const [regles,    setRegles]    = useState<ReglesEcole | null>(null)
  const [notifs,    setNotifs]    = useState<NotifConfig>(NOTIF_DEFAULTS)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [success,   setSuccess]   = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'regles'|'finances'|'notifications'>('regles')

  useEffect(() => {
    if (!isSuperAdmin) return
    supabase.from('ecoles').select('id,nom').order('nom').then(({ data }) => {
      setEcoles(data ?? [])
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id)
    })
  }, [isSuperAdmin])

  const load = useCallback(async () => {
    if (!ecoleId) return
    setLoading(true)
    const { data } = await supabase.from('regles_ecole').select('*').eq('ecole_id', ecoleId).maybeSingle()
    if (data) {
      setRegles(data as ReglesEcole)
    } else {
      // Valeurs par défaut si pas encore de règles
      setRegles({
        ecole_id: ecoleId,
        seuil_validation_ue: 10,
        note_plancher_active: false,
        seuil_note_plancher: 5,
        compensation_active: true,
        regle_rattrapage: 'max',
        seuil_validation_semestre: 10,
        credits_requis_semestre: 24,
        blocage_releve_impaye: true,
        tolerance_impaye: 100000,
        controle_credits_actif: true,
        seuil_credits_avancement: 24,
      })
    }
    setLoading(false)
  }, [ecoleId])

  useEffect(() => { load() }, [load])

  function showOk(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }

  async function saveRegles() {
    if (!regles || !ecoleId) return
    setSaving(true); setError(null)
    try {
      const payload = { ...regles, ecole_id: ecoleId }
      if (regles.id) {
        const { error: e } = await supabase.from('regles_ecole').update(payload).eq('id', regles.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('regles_ecole').insert(payload)
        if (e) throw e
      }
      await supabase.rpc('fn_audit_log', {
        p_ecole_id: ecoleId, p_action: 'UPDATE', p_module: 'parametres',
        p_ressource_ref: 'Règles pédagogiques école',
      })
      showOk('Règles enregistrées avec succès')
      load()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  const set = (k: keyof ReglesEcole, v: unknown) => setRegles(r => r ? { ...r, [k]: v } : r)
  const setN = (k: keyof NotifConfig, v: unknown) => setNotifs(n => ({ ...n, [k]: v }))

  const numInput = (label: string, key: keyof ReglesEcole, hint?: string, min = 0, max = 20) => (
    <div style={S.field}>
      <label style={S.label}>{label}</label>
      <input type="number" min={min} max={max} step={0.5}
        value={(regles?.[key] as number) ?? 0}
        onChange={e => set(key, parseFloat(e.target.value) || 0)}
        style={S.input} />
      {hint && <span style={S.hint}>{hint}</span>}
    </div>
  )

  const toggleRow = (label: string, sub: string, key: keyof ReglesEcole) => {
    const on = !!(regles?.[key] as boolean)
    return (
      <div style={S.toggleRow}>
        <div style={S.toggle(on)} onClick={() => set(key, !on)}>
          <div style={S.toggleDot(on)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{label}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{sub}</div>
        </div>
        <span style={on ? S.badgeOn : S.badgeOff}>{on ? 'Activé' : 'Désactivé'}</span>
      </div>
    )
  }

  const TABS = [
    { id: 'regles',        label: 'Règles pédagogiques', ico: '🎓' },
    { id: 'finances',      label: 'Finances & Accès',    ico: '💰' },
  ] as const

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div style={S.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={S.header}>
        <div>
          <h1 style={S.h1}>⚙️ Paramètres École</h1>
          <p style={S.sub}>Règles pédagogiques · Finances · Notifications</p>
        </div>
        {isSuperAdmin && ecoles.length > 0 && (
          <select value={ecoleId} onChange={e => setEcoleId(e.target.value)} style={S.filterSel}>
            {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        )}
      </div>

      {success && <div style={S.success}>✅ {success}</div>}
      {error   && <div style={S.error}>⚠️ {error}</div>}

      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={S.tab(activeTab === t.id)}>
            {t.ico} {t.label}
          </button>
        ))}
      </div>

      {/* ── Règles pédagogiques ── */}
      {activeTab === 'regles' && regles && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>📊 Validation et moyennes</div>
            <div style={S.grid2}>
              {numInput('Seuil de validation UE (/20)', 'seuil_validation_ue', 'Moyenne minimale par UE pour validation', 0, 20)}
              {numInput('Seuil de validation semestre (/20)', 'seuil_validation_semestre', 'Moyenne minimale pour valider le semestre', 0, 20)}
            </div>
            <div style={S.grid2}>
              {numInput('Crédits requis par semestre', 'credits_requis_semestre', 'Nombre de crédits CECT minimum', 0, 60)}
              <div style={S.field}>
                <label style={S.label}>Règle de rattrapage</label>
                <select value={regles.regle_rattrapage}
                  onChange={e => set('regle_rattrapage', e.target.value as 'max' | 'ecrase')}
                  style={S.select}>
                  <option value="max">Maximum (garde la meilleure note)</option>
                  <option value="ecrase">Écrase (la note de rattrapage remplace)</option>
                </select>
                <span style={S.hint}>Comment la note de rattrapage est prise en compte</span>
              </div>
            </div>
            <div>
              {toggleRow('Compensation entre UE', 'Une UE défaillante peut être compensée par les autres UE du semestre', 'compensation_active')}
              {toggleRow('Note plancher active', 'Empêche la validation si une note est inférieure au seuil plancher', 'note_plancher_active')}
              {regles.note_plancher_active && (
                <div style={{ paddingLeft: 56, paddingTop: 8 }}>
                  {numInput('Seuil note plancher (/20)', 'seuil_note_plancher', 'Note minimale en dessous de laquelle la compensation est impossible', 0, 10)}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...S.footer }}>
            <button onClick={saveRegles} disabled={saving} style={S.btnPrimary}>
              {saving ? '⏳ Enregistrement...' : '💾 Enregistrer les règles'}
            </button>
          </div>
        </div>
      )}

      {/* ── Finances & Accès ── */}
      {activeTab === 'finances' && regles && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>💰 Contrôle des paiements</div>
            <div>
              {toggleRow('Blocage relevé si impayés', 'Publication conditionnée au paiement des frais', 'blocage_releve_impaye')}
            </div>
            {regles.blocage_releve_impaye && (
              <div style={{ marginTop: 12 }}>
                {numInput('Tolérance impayé (FCFA)', 'tolerance_impaye_releve', 'Montant en dessous duquel le blocage ne s\'applique pas', 0, 1000000)}
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>📋 Contrôle des inscriptions</div>
            <div>
              {toggleRow('Contrôle crédits inscription', 'Limite les inscriptions selon les crédits validés', 'controle_credits_actif')}
            </div>
            {regles.controle_credits_actif && (
              <div style={{ marginTop: 12 }}>
                {numInput('Seuil crédits inscription', 'seuil_credits_avancement', 'Crédits minimum requis pour s\'inscrire au semestre suivant', 0, 60)}
              </div>
            )}
          </div>

          <div style={S.footer}>
            <button onClick={saveRegles} disabled={saving} style={S.btnPrimary}>
              {saving ? '⏳...' : '💾 Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* Notifications email — configuration reelle disponible dans Parametres avances */}
      {activeTab === "notifications" && (
        <div style={S.card}>
          <p style={{ fontSize: 13, color: "#64748b" }}>
            La configuration des notifications email se fait desormais depuis <strong>Parametres avances</strong>.
          </p>
          <a href="/parametres" style={{ ...S.btnPrimary, textDecoration: "none", display: "inline-block" }}>Ouvrir Parametres avances →</a>
        </div>
      )}
    </div>
  )
}
