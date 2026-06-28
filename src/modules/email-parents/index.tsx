// src/modules/email-parents/index.tsx
// B5.5 — Communication Parents — inline styles

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Etudiant {
  id: string
  nom: string
  prenom: string | null
  email_parent: string | null
  telephone_parent: string | null
  numero_etudiant: string | null
  statut: string
  promotions?: { nom: string } | null
}

interface Communication {
  id: string
  objet: string
  corps: string
  categorie: string
  nb_envoyes: number
  nb_erreurs: number
  statut: 'brouillon' | 'envoye' | 'partiel'
  envoye_le: string | null
  created_at: string
}

interface Modele {
  id: string
  nom: string
  categorie: string
  objet: string
  corps: string
}

const CATEGORIES = [
  { id: 'general',  label: 'Général',   ico: '📢' },
  { id: 'releve',   label: 'Relevés',   ico: '📄' },
  { id: 'absence',  label: 'Absences',  ico: '📋' },
  { id: 'paiement', label: 'Paiement',  ico: '💰' },
  { id: 'urgence',  label: 'Urgence',   ico: '🚨' },
]

const STATUT_COLORS: Record<string, React.CSSProperties> = {
  brouillon: { background: '#f1f5f9', color: '#475569' },
  envoye:    { background: '#d1fae5', color: '#065f46' },
  partiel:   { background: '#fef9c3', color: '#713f12' },
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  tabs:        { display: 'flex', gap: 4, marginBottom: '1.25rem', borderBottom: '2px solid #f1f5f9' } as React.CSSProperties,
  tab:         (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#1e3a5f' : '#64748b', background: 'none', border: 'none',
    cursor: 'pointer', borderBottom: active ? '2px solid #1e3a5f' : '2px solid transparent',
    marginBottom: -2, fontFamily: "'Segoe UI', sans-serif",
  }),
  layout:      { display: 'flex', gap: '1.5rem', width: '100%', alignItems: 'flex-start' } as React.CSSProperties,
  leftPane:    { width: 320, flexShrink: 0 } as React.CSSProperties,
  rightPane:   { flex: 1, minWidth: 0, width: 0 } as React.CSSProperties,
  card:        { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  cardTitle:   { fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 8 } as React.CSSProperties,
  tableWrap:   { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:       { width: '100%', borderCollapse: 'collapse' as const },
  thead:       { background: '#f8fafc' },
  th:          { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  td:          { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const, borderBottom: '1px solid #f9fafb' } as React.CSSProperties,
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:       { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  btnPrimary:  { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSmall:    { padding: '4px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger:   { padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 10 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  select:      { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  textarea:    { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const, minHeight: 200 } as React.CSSProperties,
  filterSel:   { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  successBanner: { background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  errorBanner:   { background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  infoBox:       { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1d4ed8', marginBottom: 10 } as React.CSSProperties,
  badge:       (style: React.CSSProperties) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, ...style }) as React.CSSProperties,
  checkRow:    { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer' } as React.CSSProperties,
  statsRow:    { display: 'flex', gap: 12, marginBottom: '1rem' } as React.CSSProperties,
  statCard:    { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 16px', flex: 1, boxShadow: '0 1px 3px rgba(0,0,0,.04)' } as React.CSSProperties,
  statNum:     { fontSize: 20, fontWeight: 700, color: '#1e3a5f' } as React.CSSProperties,
  statLabel:   { fontSize: 11, color: '#64748b' } as React.CSSProperties,
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Onglet Nouveau Message ───────────────────────────────────────────────────

function TabNouveauMessage({ ecoleId }: { ecoleId: string }) {
  const { user } = useAuth()
  const [etudiants,  setEtudiants]  = useState<Etudiant[]>([])
  const [modeles,    setModeles]    = useState<Modele[]>([])
  const [loading,    setLoading]    = useState(true)
  const [sending,    setSending]    = useState(false)
  const [success,    setSuccess]    = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  // Formulaire
  const [objet,      setObjet]      = useState('')
  const [corps,      setCorps]      = useState('')
  const [categorie,  setCategorie]  = useState('general')
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [filterProm, setFilterProm] = useState('')
  const [filterStat, setFilterStat] = useState('actif')
  const [promotions, setPromotions] = useState<{ id: string; nom: string }[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('etudiants')
        .select('id, nom, prenom, email_parent, telephone_parent, numero_etudiant, statut, promotions(nom)')
        .eq('ecole_id', ecoleId).order('nom'),
      supabase.from('modeles_communication')
        .select('*').or(`ecole_id.eq.${ecoleId},ecole_id.is.null`).order('categorie'),
      supabase.from('promotions').select('id, nom').eq('ecole_id', ecoleId).order('nom'),
    ]).then(([eRes, mRes, pRes]) => {
      setEtudiants((eRes.data ?? []) as unknown as Etudiant[])
      setModeles(mRes.data ?? [])
      setPromotions(pRes.data ?? [])
      setLoading(false)
    })
  }, [ecoleId])

  function applyModele(modeleId: string) {
    const m = modeles.find(m => m.id === modeleId)
    if (!m) return
    setObjet(m.objet)
    setCorps(m.corps)
    setCategorie(m.categorie)
  }

  const filtered = etudiants.filter(e => {
    if (filterStat && e.statut !== filterStat) return false
    if (filterProm && (e.promotions as { nom: string } | null)?.nom !== filterProm) return false
    return !!e.email_parent
  })

  const withEmail    = etudiants.filter(e => !!e.email_parent).length
  const withoutEmail = etudiants.filter(e => !e.email_parent).length

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(e => e.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSend() {
    if (!objet.trim() || !corps.trim()) { setError('Objet et corps du message requis'); return }
    if (selected.size === 0) { setError('Sélectionnez au moins un destinataire'); return }
    setSending(true); setError(null)

    const destinataires = filtered
      .filter(e => selected.has(e.id))
      .map(e => ({
        etudiant_id: e.id,
        nom:         `${e.prenom ?? ''} ${e.nom}`.trim(),
        email_parent: e.email_parent,
      }))

    try {
      // Enregistrer la communication
      const { data: comm, error: ce } = await supabase
        .from('communications_parents')
        .insert({
          ecole_id: ecoleId, objet, corps, categorie,
          destinataires, nb_envoyes: destinataires.length,
          statut: 'envoye', envoye_par: user?.id,
          envoye_le: new Date().toISOString(),
        })
        .select().single()
      if (ce) throw ce

      // Log audit
      await supabase.rpc('fn_audit_log', {
        p_ecole_id: ecoleId, p_action: 'CREATE', p_module: 'email_parents',
        p_ressource_ref: `Email "${objet}" → ${destinataires.length} parents`,
      })

      setSuccess(`✅ Message enregistré pour ${destinataires.length} destinataire(s). Intégrez un service SMTP pour l'envoi réel.`)
      setObjet(''); setCorps(''); setSelected(new Set())
      setTimeout(() => setSuccess(null), 6000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div style={S.layout}>
      {/* Panneau gauche — destinataires */}
      <div style={S.leftPane}>
        <div style={S.card}>
          <div style={S.cardTitle}>Destinataires</div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 12, background: '#d1fae5', color: '#065f46', padding: '3px 8px', borderRadius: 5 }}>
              ✉️ {withEmail} avec email
            </div>
            <div style={{ fontSize: 12, background: '#fef2f2', color: '#991b1b', padding: '3px 8px', borderRadius: 5 }}>
              ⚠️ {withoutEmail} sans email
            </div>
          </div>

          {/* Filtres */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <select value={filterStat} onChange={e => setFilterStat(e.target.value)} style={{ ...S.filterSel, flex: 1 }}>
              <option value="">Tous statuts</option>
              <option value="actif">Actifs</option>
              <option value="inactif">Inactifs</option>
            </select>
            <select value={filterProm} onChange={e => setFilterProm(e.target.value)} style={{ ...S.filterSel, flex: 1 }}>
              <option value="">Toutes promotions</option>
              {promotions.map(p => <option key={p.id} value={p.nom}>{p.nom}</option>)}
            </select>
          </div>

          {/* Sélection tout */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
            <label style={{ ...S.checkRow, borderBottom: 'none', margin: 0 }}>
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleAll} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Tout sélectionner ({filtered.length})</span>
            </label>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{selected.size} sélectionné(s)</span>
          </div>

          {/* Liste étudiants */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>
                Aucun étudiant avec email parent
              </div>
            ) : filtered.map(e => (
              <label key={e.id} style={S.checkRow}>
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{e.prenom} {e.nom}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.email_parent}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Panneau droit — composition */}
      <div style={S.rightPane}>
        {success && <div style={S.successBanner}>{success}</div>}
        {error   && <div style={S.errorBanner}>⚠️ {error}</div>}

        <div style={S.infoBox}>
          ℹ️ Les messages sont enregistrés dans le journal. Pour l'envoi email réel, configurez un service SMTP dans les Paramètres de l'école.
        </div>

        {/* Modèle */}
        <div style={S.field}>
          <label style={S.label}>Utiliser un modèle</label>
          <select onChange={e => e.target.value && applyModele(e.target.value)} style={S.select} defaultValue="">
            <option value="">— Choisir un modèle —</option>
            {CATEGORIES.map(cat => {
              const catModeles = modeles.filter(m => m.categorie === cat.id)
              if (catModeles.length === 0) return null
              return (
                <optgroup key={cat.id} label={`${cat.ico} ${cat.label}`}>
                  {catModeles.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </optgroup>
              )
            })}
          </select>
        </div>

        {/* Catégorie */}
        <div style={S.field}>
          <label style={S.label}>Catégorie</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCategorie(c.id)}
                style={{ ...S.btnSmall, ...(categorie === c.id ? { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' } : {}) }}>
                {c.ico} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Objet */}
        <div style={S.field}>
          <label style={S.label}>Objet *</label>
          <input value={objet} onChange={e => setObjet(e.target.value)}
            style={S.input} placeholder="Objet du message..." />
        </div>

        {/* Corps */}
        <div style={S.field}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={S.label}>Message *</label>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{corps.length} caractères</span>
          </div>
          <textarea value={corps} onChange={e => setCorps(e.target.value)}
            style={S.textarea} placeholder="Rédigez votre message ici...&#10;&#10;Variables disponibles : {nom}, {prenom}, {ecole_nom}" />
        </div>

        {/* Résumé + envoi */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {selected.size > 0
              ? `📧 Envoi à ${selected.size} parent(s)`
              : <span style={{ color: '#dc2626' }}>Aucun destinataire sélectionné</span>}
          </div>
          <button onClick={handleSend} disabled={sending || selected.size === 0}
            style={{ ...S.btnPrimary, opacity: selected.size === 0 ? 0.5 : 1 }}>
            {sending ? '⏳ Envoi...' : `📧 Envoyer à ${selected.size} parent(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Onglet Historique ────────────────────────────────────────────────────────

function TabHistorique({ ecoleId }: { ecoleId: string }) {
  const [comms,   setComms]   = useState<Communication[]>([])
  const [loading, setLoading] = useState(true)
  const [detail,  setDetail]  = useState<Communication | null>(null)

  useEffect(() => {
    supabase.from('communications_parents')
      .select('*').eq('ecole_id', ecoleId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setComms(data ?? []); setLoading(false) })
  }, [ecoleId])

  const stats = {
    total:   comms.length,
    envoyes: comms.filter(c => c.statut === 'envoye').length,
    parents: comms.reduce((s, c) => s + c.nb_envoyes, 0),
  }

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div>
      <div style={S.statsRow}>
        {[
          { n: stats.total,   l: 'Messages envoyés' },
          { n: stats.envoyes, l: 'Réussis' },
          { n: stats.parents, l: 'Parents contactés' },
        ].map(({ n, l }) => (
          <div key={l} style={S.statCard}><div style={S.statNum}>{n}</div><div style={S.statLabel}>{l}</div></div>
        ))}
      </div>

      {comms.length === 0 ? (
        <div style={S.empty}>📧<br/>Aucun message envoyé pour le moment</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>
                <th style={S.th}>Objet</th>
                <th style={S.th}>Catégorie</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Destinataires</th>
                <th style={S.th}>Statut</th>
                <th style={S.th}>Date</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {comms.map(c => {
                const cat = CATEGORIES.find(x => x.id === c.categorie)
                return (
                  <tr key={c.id}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 500, color: '#1e293b' }}>{c.objet}</div>
                    </td>
                    <td style={S.td}>
                      <span style={{ fontSize: 12 }}>{cat?.ico} {cat?.label ?? c.categorie}</span>
                    </td>
                    <td style={{ ...S.td, textAlign: 'center' as const, fontWeight: 600 }}>
                      {c.nb_envoyes}
                      {c.nb_erreurs > 0 && <span style={{ color: '#dc2626', fontSize: 11 }}> ({c.nb_erreurs} err.)</span>}
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(STATUT_COLORS[c.statut] ?? {})}>{c.statut}</span>
                    </td>
                    <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>{fmtDate(c.envoye_le ?? c.created_at)}</td>
                    <td style={S.td}>
                      <button onClick={() => setDetail(c)} style={S.btnSmall}>👁 Voir</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal détail */}
      {detail && (
        <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>📧 {detail.objet}</div>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const }}>
                <span style={S.badge(STATUT_COLORS[detail.statut] ?? {})}>{detail.statut}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>📅 {fmtDate(detail.envoye_le ?? detail.created_at)}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>👥 {detail.nb_envoyes} destinataire(s)</span>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '1rem', fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: "'Segoe UI', sans-serif", lineHeight: 1.6 }}>
                {detail.corps}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Onglet Modèles ───────────────────────────────────────────────────────────

function TabModeles({ ecoleId }: { ecoleId: string }) {
  const [modeles,   setModeles]   = useState<Modele[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [success,   setSuccess]   = useState<string | null>(null)
  const [form, setForm] = useState({ nom: '', categorie: 'general', objet: '', corps: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('modeles_communication')
      .select('*').or(`ecole_id.eq.${ecoleId},ecole_id.is.null`).order('categorie')
      .then(({ data }) => { setModeles(data ?? []); setLoading(false) })
  }, [ecoleId])

  async function saveModele() {
    if (!form.nom || !form.objet || !form.corps) return
    setSaving(true)
    try {
      await supabase.from('modeles_communication').insert({
        ecole_id: ecoleId, ...form,
      })
      setSuccess('Modèle créé')
      setTimeout(() => setSuccess(null), 3000)
      setShowForm(false)
      setForm({ nom: '', categorie: 'general', objet: '', corps: '' })
      const { data } = await supabase.from('modeles_communication')
        .select('*').or(`ecole_id.eq.${ecoleId},ecole_id.is.null`).order('categorie')
      setModeles(data ?? [])
    } finally { setSaving(false) }
  }

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div>
      {success && <div style={S.successBanner}>✅ {success}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>
          {showForm ? '✕ Annuler' : '+ Nouveau modèle'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...S.card, marginBottom: '1.5rem' }}>
          <div style={S.cardTitle}>Nouveau modèle</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 8 }}>
            <div style={S.field}>
              <label style={S.label}>Nom du modèle</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={S.input} placeholder="Nom du modèle..." />
            </div>
            <div style={S.field}>
              <label style={S.label}>Catégorie</label>
              <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))} style={S.select}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.ico} {c.label}</option>)}
              </select>
            </div>
          </div>
          <div style={S.field}>
            <label style={S.label}>Objet</label>
            <input value={form.objet} onChange={e => setForm(f => ({ ...f, objet: e.target.value }))} style={S.input} />
          </div>
          <div style={S.field}>
            <label style={S.label}>Corps du message</label>
            <textarea value={form.corps} onChange={e => setForm(f => ({ ...f, corps: e.target.value }))}
              style={{ ...S.textarea, minHeight: 120 }} placeholder="Variables : {nom}, {prenom}, {ecole_nom}..." />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={saveModele} disabled={saving} style={S.btnPrimary}>{saving ? '⏳...' : '💾 Enregistrer'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {modeles.map(m => {
          const cat = CATEGORIES.find(c => c.id === m.categorie)
          return (
            <div key={m.id} style={{ ...S.card, margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 5 }}>
                  {cat?.ico} {cat?.label ?? m.categorie}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>{m.nom}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{m.objet}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                {m.corps}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'nouveau',    label: 'Nouveau message',  ico: '✉️' },
  { id: 'historique', label: 'Historique',        ico: '📬' },
  { id: 'modeles',    label: 'Modèles',           ico: '📝' },
] as const
type TabId = typeof TABS[number]['id']

export default function EmailParentsPage() {
  const { user, isSuperAdmin } = useAuth()
  const [ecoleId,   setEcoleId]   = useState(user?.ecole_id ?? '')
  const [ecoles,    setEcoles]    = useState<{ id: string; nom: string }[]>([])
  const [activeTab, setActiveTab] = useState<TabId>('nouveau')

  useEffect(() => {
    if (!isSuperAdmin) return
    supabase.from('ecoles').select('id,nom').order('nom').then(({ data }) => {
      setEcoles(data ?? [])
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id)
    })
  }, [isSuperAdmin])

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>📧 Communication Parents</h1>
          <p style={S.sub}>Messagerie vers les parents et tuteurs · Modèles · Historique</p>
        </div>
        {isSuperAdmin && ecoles.length > 0 && (
          <select value={ecoleId} onChange={e => setEcoleId(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
            {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        )}
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
          {activeTab === 'nouveau'    && <TabNouveauMessage ecoleId={ecoleId} />}
          {activeTab === 'historique' && <TabHistorique     ecoleId={ecoleId} />}
          {activeTab === 'modeles'    && <TabModeles        ecoleId={ecoleId} />}
        </>
      )}
    </div>
  )
}
