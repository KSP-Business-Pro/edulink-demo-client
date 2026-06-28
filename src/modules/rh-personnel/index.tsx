// src/modules/rh-personnel/index.tsx
// B5.4 — RH & Personnel — inline styles

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Personnel {
  id: string
  ecole_id: string
  nom: string
  prenom: string | null
  poste: string
  departement: string | null
  email: string | null
  telephone: string | null
  date_embauche: string | null
  type_contrat: 'CDI' | 'CDD' | 'Stage' | 'Vacataire' | 'Consultant'
  salaire_brut: number | null
  statut: 'actif' | 'inactif' | 'conge' | 'suspendu'
  notes: string | null
}

interface Conge {
  id: string
  personnel_id: string
  type_conge: string
  date_debut: string
  date_fin: string
  nb_jours: number
  statut: 'en_attente' | 'approuve' | 'refuse'
  motif: string | null
  personnel?: { nom: string; prenom: string | null; poste: string }
}

interface EvaluationRH {
  id: string
  personnel_id: string
  annee: number
  note_globale: number | null
  ponctualite: number | null
  competence: number | null
  initiative: number | null
  travail_equipe: number | null
  commentaire: string | null
}

const POSTES = ['Directeur Général','Directeur Académique','Directeur Financier','Responsable Scolarité','Comptable','Secrétaire','Agent de sécurité','Agent d\'entretien','Informaticien','Conseiller','Autre']
const DEPARTEMENTS = ['Direction','Administration','Finance','Pédagogie','IT','Logistique','Communication','Autre']
const CONTRATS: Personnel['type_contrat'][] = ['CDI','CDD','Stage','Vacataire','Consultant']
const STATUTS: Personnel['statut'][] = ['actif','inactif','conge','suspendu']
const TYPES_CONGE = ['annuel','maladie','maternite','sans_solde','formation','autre']

const STATUT_COLORS: Record<string, React.CSSProperties> = {
  actif:    { background: '#d1fae5', color: '#065f46' },
  inactif:  { background: '#f1f5f9', color: '#475569' },
  conge:    { background: '#fef9c3', color: '#713f12' },
  suspendu: { background: '#fef2f2', color: '#991b1b' },
}
const CONTRAT_COLORS: Record<string, React.CSSProperties> = {
  CDI:        { background: '#dbeafe', color: '#1e40af' },
  CDD:        { background: '#ede9fe', color: '#4c1d95' },
  Stage:      { background: '#d1fae5', color: '#065f46' },
  Vacataire:  { background: '#fff7ed', color: '#9a3412' },
  Consultant: { background: '#fce7f3', color: '#831843' },
}
const CONGE_STATUT_COLORS: Record<string, React.CSSProperties> = {
  en_attente: { background: '#fef9c3', color: '#713f12' },
  approuve:   { background: '#d1fae5', color: '#065f46' },
  refuse:     { background: '#fef2f2', color: '#991b1b' },
}

const PAGE_SIZE = 20

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
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
  filters:     { display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' as const },
  filterInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', flex: 1, minWidth: 180, fontFamily: 'inherit', background: '#fafafa' } as React.CSSProperties,
  filterSel:   { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  statsBar:    { display: 'flex', gap: 12, marginBottom: '1.25rem', flexWrap: 'wrap' as const },
  statCard:    { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 100, boxShadow: '0 1px 3px rgba(0,0,0,.04)' } as React.CSSProperties,
  statNum:     { fontSize: 22, fontWeight: 700, color: '#1e3a5f' } as React.CSSProperties,
  statLabel:   { fontSize: 11, color: '#64748b', marginTop: 2 } as React.CSSProperties,
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
  btnDanger:   { padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnGhost:    { padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
  btnSmall:    { padding: '4px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  pagination:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 } as React.CSSProperties,
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  modalTitle:  { fontSize: 17, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  modalBody:   { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  grid2:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa' } as React.CSSProperties,
  select:      { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fff' } as React.CSSProperties,
  textarea:    { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', resize: 'vertical' as const } as React.CSSProperties,
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' } as React.CSSProperties,
  successBanner: { display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  errorBanner:   { display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  avatarCircle:  { width: 36, height: 36, borderRadius: '50%', background: '#e0f2fe', color: '#0c4a6e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 } as React.CSSProperties,
  badge:       (style: React.CSSProperties): React.CSSProperties => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, ...style }),
  starRow:     { display: 'flex', gap: 4, alignItems: 'center' } as React.CSSProperties,
}

function initiales(nom: string, prenom?: string | null) {
  return ((prenom?.[0] ?? '') + (nom[0] ?? '')).toUpperCase() || '?'
}
function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}
function noteColor(n: number | null): string {
  if (!n) return '#94a3b8'
  if (n >= 8) return '#16a34a'
  if (n >= 5) return '#d97706'
  return '#dc2626'
}

// ─── Modal Personnel ──────────────────────────────────────────────────────────

function ModalPersonnel({
  item, ecoleId, onClose, onSaved,
}: {
  item: Personnel | null; ecoleId: string
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!item
  const blank: Omit<Personnel, 'id'|'ecole_id'> = {
    nom: '', prenom: '', poste: '', departement: '', email: '', telephone: '',
    date_embauche: '', type_contrat: 'CDI', salaire_brut: null, statut: 'actif', notes: '',
  }
  const [form, setForm] = useState(isEdit ? { ...item } : { ...blank, ecole_id: ecoleId } as Personnel)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const set = (k: keyof Personnel, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.nom.trim() || !form.poste.trim()) { setError('Nom et poste requis'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        ecole_id: ecoleId, nom: form.nom, prenom: form.prenom || null,
        poste: form.poste, departement: form.departement || null,
        email: form.email || null, telephone: form.telephone || null,
        date_embauche: form.date_embauche || null,
        type_contrat: form.type_contrat, salaire_brut: form.salaire_brut,
        statut: form.statut, notes: form.notes || null,
      }
      if (isEdit) {
        const { error: e } = await supabase.from('personnel').update(payload).eq('id', item.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('personnel').insert(payload)
        if (e) throw e
      }
      await supabase.rpc('fn_audit_log', {
        p_ecole_id: ecoleId, p_action: isEdit ? 'UPDATE' : 'CREATE', p_module: 'rh',
        p_ressource_ref: `${form.prenom} ${form.nom} — ${form.poste}`,
      })
      onSaved()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  const f = (label: string, child: React.ReactNode) => (
    <div style={S.field}><label style={S.label}>{label}</label>{child}</div>
  )

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <div style={S.modalTitle}>{isEdit ? '✏️ Modifier' : '➕ Nouveau membre du personnel'}</div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.modalBody}>
          {error && <div style={S.errorBanner}>⚠️ {error}</div>}
          <div style={S.grid2}>
            {f('Nom *', <input value={form.nom} onChange={e => set('nom', e.target.value)} style={S.input} placeholder="DOSSOU" />)}
            {f('Prénom', <input value={form.prenom ?? ''} onChange={e => set('prenom', e.target.value)} style={S.input} placeholder="Ariel" />)}
          </div>
          <div style={S.grid2}>
            {f('Poste *', (
              <select value={form.poste} onChange={e => set('poste', e.target.value)} style={S.select}>
                <option value="">— Sélectionner —</option>
                {POSTES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ))}
            {f('Département', (
              <select value={form.departement ?? ''} onChange={e => set('departement', e.target.value)} style={S.select}>
                <option value="">— Sélectionner —</option>
                {DEPARTEMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            ))}
          </div>
          <div style={S.grid2}>
            {f('Email', <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} style={S.input} placeholder="email@ecole.bj" />)}
            {f('Téléphone', <input value={form.telephone ?? ''} onChange={e => set('telephone', e.target.value)} style={S.input} placeholder="+229 97..." />)}
          </div>
          <div style={S.grid2}>
            {f("Date d'embauche", <input type="date" value={form.date_embauche ?? ''} onChange={e => set('date_embauche', e.target.value)} style={S.input} />)}
            {f('Type de contrat', (
              <select value={form.type_contrat} onChange={e => set('type_contrat', e.target.value as Personnel['type_contrat'])} style={S.select}>
                {CONTRATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
          </div>
          <div style={S.grid2}>
            {f('Salaire brut (FCFA)', <input type="number" value={form.salaire_brut ?? ''} onChange={e => set('salaire_brut', e.target.value ? Number(e.target.value) : null)} style={S.input} placeholder="150000" />)}
            {f('Statut', (
              <select value={form.statut} onChange={e => set('statut', e.target.value as Personnel['statut'])} style={S.select}>
                {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ))}
          </div>
          {f('Notes', <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} style={S.textarea} rows={2} placeholder="Informations complémentaires..." />)}
        </div>
        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={save} disabled={saving} style={S.btnPrimary}>{saving ? '⏳...' : isEdit ? '💾 Enregistrer' : '➕ Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Congé ──────────────────────────────────────────────────────────────

function ModalConge({
  personnel, ecoleId, onClose, onSaved,
}: {
  personnel: Personnel[]; ecoleId: string; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    personnel_id: '', type_conge: 'annuel', date_debut: '', date_fin: '', motif: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function save() {
    if (!form.personnel_id || !form.date_debut || !form.date_fin) { setError('Champs requis manquants'); return }
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('conges').insert({
        personnel_id: form.personnel_id, ecole_id: ecoleId,
        type_conge: form.type_conge, date_debut: form.date_debut,
        date_fin: form.date_fin, motif: form.motif || null, statut: 'en_attente',
      })
      if (e) throw e
      onSaved()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  const f = (label: string, child: React.ReactNode) => (
    <div style={S.field}><label style={S.label}>{label}</label>{child}</div>
  )

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth: 460 }}>
        <div style={S.modalHeader}>
          <div style={S.modalTitle}>🏖️ Nouvelle demande de congé</div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.modalBody}>
          {error && <div style={S.errorBanner}>⚠️ {error}</div>}
          {f('Agent *', (
            <select value={form.personnel_id} onChange={e => setForm(f => ({ ...f, personnel_id: e.target.value }))} style={S.select}>
              <option value="">— Sélectionner —</option>
              {personnel.filter(p => p.statut === 'actif').map(p => (
                <option key={p.id} value={p.id}>{p.prenom} {p.nom} — {p.poste}</option>
              ))}
            </select>
          ))}
          {f('Type de congé', (
            <select value={form.type_conge} onChange={e => setForm(f => ({ ...f, type_conge: e.target.value }))} style={S.select}>
              {TYPES_CONGE.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          ))}
          <div style={S.grid2}>
            {f('Date début *', <input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} style={S.input} />)}
            {f('Date fin *', <input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} style={S.input} />)}
          </div>
          {f('Motif', <textarea value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} style={S.textarea} rows={2} placeholder="Motif de la demande..." />)}
        </div>
        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={save} disabled={saving} style={S.btnPrimary}>{saving ? '⏳...' : '📋 Soumettre'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Onglet Personnel ─────────────────────────────────────────────────────────

function TabPersonnel({ ecoleId }: { ecoleId: string }) {
  const [data,    setData]    = useState<Personnel[]>([])
  const [loading, setLoading] = useState(true)
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [search,  setSearch]  = useState('')
  const [fStatut, setFStatut] = useState('')
  const [fDept,   setFDept]   = useState('')
  const [modal,   setModal]   = useState<Personnel | null | 'new'>('new' as unknown as null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Init modal state properly
  const [showModal, setShowModal] = useState(false)
  const [editItem,  setEditItem]  = useState<Personnel | null>(null)

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      let q = supabase.from('personnel').select('*', { count: 'exact' })
        .eq('ecole_id', ecoleId).order('nom').range(p * PAGE_SIZE, (p+1)*PAGE_SIZE-1)
      if (fStatut) q = q.eq('statut', fStatut)
      if (fDept)   q = q.eq('departement', fDept)
      if (search)  q = q.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,poste.ilike.%${search}%`)
      const { data: rows, count, error: e } = await q
      if (e) throw e
      setData(rows ?? [])
      setTotal(count ?? 0)
      setPage(p)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [ecoleId, fStatut, fDept, search])

  useEffect(() => { load(0) }, [ecoleId])

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer ${nom} ?`)) return
    setDeleting(id)
    await supabase.from('personnel').delete().eq('id', id)
    setDeleting(null)
    showOk(`${nom} supprimé`)
    load(page)
  }

  function showOk(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }

  const stats = {
    total: total,
    actifs: data.filter(p => p.statut === 'actif').length,
    cdi: data.filter(p => p.type_contrat === 'CDI').length,
    masse: data.reduce((s, p) => s + (p.salaire_brut ?? 0), 0),
  }

  return (
    <div>
      {success && <div style={S.successBanner}>✅ {success}</div>}
      {error   && <div style={S.errorBanner}>⚠️ {error}</div>}

      {/* Stats */}
      <div style={S.statsBar}>
        {[
          { n: stats.total,  l: 'Effectif total' },
          { n: stats.actifs, l: 'Actifs' },
          { n: stats.cdi,    l: 'CDI' },
          { n: `${(stats.masse/1000).toFixed(0)}K`, l: 'Masse salariale FCFA' },
        ].map(({ n, l }) => (
          <div key={l} style={S.statCard}><div style={S.statNum}>{n}</div><div style={S.statLabel}>{l}</div></div>
        ))}
      </div>

      {/* Filtres */}
      <div style={S.filters}>
        <input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(0)} style={S.filterInput} />
        <select value={fStatut} onChange={e => { setFStatut(e.target.value); load(0) }} style={S.filterSel}>
          <option value="">Tous statuts</option>
          {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fDept} onChange={e => { setFDept(e.target.value); load(0) }} style={S.filterSel}>
          <option value="">Tous départements</option>
          {DEPARTEMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={() => load(0)} style={S.btnPrimary}>Filtrer</button>
        <button onClick={() => { setShowModal(true); setEditItem(null) }} style={S.btnPrimary}>+ Ajouter</button>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={S.centered}><div style={S.spinner} /></div>
      ) : data.length === 0 ? (
        <div style={S.empty}>👤<br/>Aucun membre du personnel</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>
                <th style={S.th}>Agent</th>
                <th style={S.th}>Poste / Département</th>
                <th style={S.th}>Contrat</th>
                <th style={S.th}>Embauche</th>
                <th style={S.th}>Salaire brut</th>
                <th style={S.th}>Statut</th>
                <th style={{ ...S.th, textAlign: 'right' as const }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id}>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={S.avatarCircle}>{initiales(p.nom, p.prenom)}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.prenom} {p.nom}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.email ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={S.td}>
                    <div style={{ fontWeight: 500 }}>{p.poste}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{p.departement ?? '—'}</div>
                  </td>
                  <td style={S.td}><span style={S.badge(CONTRAT_COLORS[p.type_contrat] ?? {})}>{p.type_contrat}</span></td>
                  <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>{fmtDate(p.date_embauche)}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>
                    {p.salaire_brut ? `${p.salaire_brut.toLocaleString('fr-FR')} F` : '—'}
                  </td>
                  <td style={S.td}><span style={S.badge(STATUT_COLORS[p.statut] ?? {})}>{p.statut}</span></td>
                  <td style={{ ...S.td, textAlign: 'right' as const }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setEditItem(p); setShowModal(true) }} style={S.btnGhost}>✏️</button>
                      <button onClick={() => handleDelete(p.id, `${p.prenom} ${p.nom}`)} disabled={deleting === p.id} style={S.btnDanger}>{deleting === p.id ? '⏳' : '🗑️'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={S.pagination}>
        <span style={{ fontSize: 13, color: '#64748b' }}>{total} agent{total > 1 ? 's' : ''} · Page {page+1}/{Math.ceil(total/PAGE_SIZE)||1}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => load(page-1)} disabled={page === 0} style={S.btnSecondary}>← Précédent</button>
          <button onClick={() => load(page+1)} disabled={(page+1)*PAGE_SIZE >= total} style={S.btnSecondary}>Suivant →</button>
        </div>
      </div>

      {showModal && (
        <ModalPersonnel
          item={editItem} ecoleId={ecoleId}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={() => { setShowModal(false); setEditItem(null); showOk('Enregistré'); load(page) }}
        />
      )}
    </div>
  )
}

// ─── Onglet Congés ────────────────────────────────────────────────────────────

function TabConges({ ecoleId }: { ecoleId: string }) {
  const [conges,    setConges]    = useState<Conge[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [success,   setSuccess]   = useState<string | null>(null)
  const [fStatut,   setFStatut]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, pRes] = await Promise.all([
      supabase.from('conges').select('*, personnel(nom, prenom, poste)')
        .eq('ecole_id', ecoleId).order('date_debut', { ascending: false }),
      supabase.from('personnel').select('*').eq('ecole_id', ecoleId).order('nom'),
    ])
    setConges((cRes.data ?? []) as Conge[])
    setPersonnel(pRes.data ?? [])
    setLoading(false)
  }, [ecoleId])

  useEffect(() => { load() }, [load])

  async function updateStatut(id: string, statut: 'approuve' | 'refuse') {
    await supabase.from('conges').update({ statut }).eq('id', id)
    setSuccess(statut === 'approuve' ? 'Congé approuvé' : 'Congé refusé')
    setTimeout(() => setSuccess(null), 3000)
    load()
  }

  const filtered = fStatut ? conges.filter(c => c.statut === fStatut) : conges

  return (
    <div>
      {success && <div style={S.successBanner}>✅ {success}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={S.statsBar}>
          {[
            { n: conges.filter(c => c.statut === 'en_attente').length, l: 'En attente', c: '#d97706' },
            { n: conges.filter(c => c.statut === 'approuve').length,   l: 'Approuvés',  c: '#16a34a' },
            { n: conges.filter(c => c.statut === 'refuse').length,     l: 'Refusés',    c: '#dc2626' },
          ].map(({ n, l, c }) => (
            <div key={l} style={S.statCard}>
              <div style={{ ...S.statNum, color: c }}>{n}</div>
              <div style={S.statLabel}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={fStatut} onChange={e => setFStatut(e.target.value)} style={S.filterSel}>
            <option value="">Tous statuts</option>
            <option value="en_attente">En attente</option>
            <option value="approuve">Approuvés</option>
            <option value="refuse">Refusés</option>
          </select>
          <button onClick={() => setShowModal(true)} style={S.btnPrimary}>+ Nouvelle demande</button>
        </div>
      </div>

      {loading ? (
        <div style={S.centered}><div style={S.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>🏖️<br/>Aucune demande de congé</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>
                <th style={S.th}>Agent</th>
                <th style={S.th}>Type</th>
                <th style={S.th}>Période</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Jours</th>
                <th style={S.th}>Statut</th>
                <th style={{ ...S.th, textAlign: 'right' as const }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={S.td}>
                    <div style={{ fontWeight: 500 }}>{c.personnel?.prenom} {c.personnel?.nom}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.personnel?.poste}</div>
                  </td>
                  <td style={S.td}><span style={{ fontSize: 12, color: '#64748b' }}>{c.type_conge.replace('_',' ')}</span></td>
                  <td style={{ ...S.td, fontSize: 12 }}>{fmtDate(c.date_debut)} → {fmtDate(c.date_fin)}</td>
                  <td style={{ ...S.td, textAlign: 'center' as const, fontWeight: 600 }}>{c.nb_jours}j</td>
                  <td style={S.td}><span style={S.badge(CONGE_STATUT_COLORS[c.statut] ?? {})}>{c.statut.replace('_',' ')}</span></td>
                  <td style={{ ...S.td, textAlign: 'right' as const }}>
                    {c.statut === 'en_attente' && (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button onClick={() => updateStatut(c.id, 'approuve')} style={{ ...S.btnSmall, background: '#d1fae5', color: '#065f46', borderColor: '#86efac' }}>✓ Approuver</button>
                        <button onClick={() => updateStatut(c.id, 'refuse')}   style={{ ...S.btnSmall, background: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5' }}>✗ Refuser</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ModalConge
          personnel={personnel} ecoleId={ecoleId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Onglet Évaluations ───────────────────────────────────────────────────────

function TabEvaluations({ ecoleId }: { ecoleId: string }) {
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [evals,     setEvals]     = useState<EvaluationRH[]>([])
  const [selected,  setSelected]  = useState<string>('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [success,   setSuccess]   = useState<string | null>(null)
  const annee = new Date().getFullYear()

  const [form, setForm] = useState({
    ponctualite: '', competence: '', initiative: '', travail_equipe: '', commentaire: '',
  })

  useEffect(() => {
    supabase.from('personnel').select('*').eq('ecole_id', ecoleId).eq('statut', 'actif').order('nom')
      .then(({ data }) => { setPersonnel(data ?? []); setLoading(false) })
  }, [ecoleId])

  useEffect(() => {
    if (!selected) return
    supabase.from('evaluations_rh').select('*').eq('personnel_id', selected).order('annee', { ascending: false })
      .then(({ data }) => setEvals(data ?? []))
  }, [selected])

  function calcGlobale(): number | null {
    const vals = [form.ponctualite, form.competence, form.initiative, form.travail_equipe].map(Number).filter(n => !isNaN(n) && n > 0)
    if (vals.length === 0) return null
    return Math.round(vals.reduce((s, n) => s + n, 0) / vals.length * 10) / 10
  }

  async function saveEval() {
    if (!selected) return
    setSaving(true)
    try {
      const note_globale = calcGlobale()
      const { error: e } = await supabase.from('evaluations_rh').upsert({
        personnel_id: selected, ecole_id: ecoleId, annee,
        ponctualite:   Number(form.ponctualite)   || null,
        competence:    Number(form.competence)    || null,
        initiative:    Number(form.initiative)    || null,
        travail_equipe:Number(form.travail_equipe)|| null,
        note_globale,
        commentaire: form.commentaire || null,
      }, { onConflict: 'personnel_id,annee' })
      if (e) throw e
      setSuccess('Évaluation enregistrée')
      setTimeout(() => setSuccess(null), 3000)
      const { data } = await supabase.from('evaluations_rh').select('*').eq('personnel_id', selected).order('annee', { ascending: false })
      setEvals(data ?? [])
    } finally { setSaving(false) }
  }

  const noteInput = (label: string, key: keyof typeof form) => (
    <div style={S.field}>
      <label style={S.label}>{label} /10</label>
      <input type="number" min={0} max={10} step={0.5} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ ...S.input, width: 80 }} placeholder="—" />
    </div>
  )

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      {/* Sélecteur agent + formulaire */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <div style={S.field}>
          <label style={S.label}>Agent à évaluer</label>
          <select value={selected} onChange={e => setSelected(e.target.value)} style={S.select}>
            <option value="">— Sélectionner —</option>
            {personnel.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
          </select>
        </div>

        {selected && (
          <div style={{ marginTop: '1rem', background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 10 }}>ÉVALUATION {annee}</div>
            {success && <div style={{ ...S.successBanner, marginBottom: 8 }}>✅ {success}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {noteInput('Ponctualité',    'ponctualite')}
              {noteInput('Compétence',     'competence')}
              {noteInput('Initiative',     'initiative')}
              {noteInput('Travail équipe', 'travail_equipe')}
            </div>
            {calcGlobale() !== null && (
              <div style={{ textAlign: 'center', marginBottom: 10, fontSize: 14, fontWeight: 700, color: noteColor(calcGlobale()) }}>
                Moyenne : {calcGlobale()}/10
              </div>
            )}
            <div style={S.field}>
              <label style={S.label}>Commentaire</label>
              <textarea value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))}
                style={S.textarea} rows={2} placeholder="Observations..." />
            </div>
            <button onClick={saveEval} disabled={saving} style={{ ...S.btnPrimary, width: '100%', marginTop: 8, justifyContent: 'center' }}>
              {saving ? '⏳...' : '💾 Enregistrer'}
            </button>
          </div>
        )}
      </div>

      {/* Historique évaluations */}
      <div style={{ flex: 1 }}>
        {!selected ? (
          <div style={S.empty}>📊<br/>Sélectionnez un agent pour voir ses évaluations</div>
        ) : evals.length === 0 ? (
          <div style={S.empty}>📊<br/>Aucune évaluation enregistrée</div>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead style={S.thead}>
                <tr>
                  <th style={S.th}>Année</th>
                  <th style={{ ...S.th, textAlign: 'center' as const }}>Globale</th>
                  <th style={{ ...S.th, textAlign: 'center' as const }}>Ponctualité</th>
                  <th style={{ ...S.th, textAlign: 'center' as const }}>Compétence</th>
                  <th style={{ ...S.th, textAlign: 'center' as const }}>Initiative</th>
                  <th style={{ ...S.th, textAlign: 'center' as const }}>Équipe</th>
                </tr>
              </thead>
              <tbody>
                {evals.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{ev.annee}</td>
                    <td style={{ ...S.td, textAlign: 'center' as const }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: noteColor(ev.note_globale) }}>{ev.note_globale ?? '—'}</span>
                    </td>
                    {[ev.ponctualite, ev.competence, ev.initiative, ev.travail_equipe].map((n, i) => (
                      <td key={i} style={{ ...S.td, textAlign: 'center' as const, color: noteColor(n), fontWeight: 500 }}>{n ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'personnel',   label: 'Personnel',    ico: '👥' },
  { id: 'conges',      label: 'Congés',       ico: '🏖️' },
  { id: 'evaluations', label: 'Évaluations',  ico: '📊' },
] as const
type TabId = typeof TABS[number]['id']

export default function RHPersonnelPage() {
  const { user, isSuperAdmin } = useAuth()
  const [ecoleId, setEcoleId] = useState(user?.ecole_id ?? '')
  const [ecoles,  setEcoles]  = useState<{ id: string; nom: string }[]>([])
  const [activeTab, setActiveTab] = useState<TabId>('personnel')

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
          <h1 style={S.h1}>🏢 RH & Personnel</h1>
          <p style={S.sub}>Gestion du personnel administratif · Congés · Évaluations</p>
        </div>
        {isSuperAdmin && ecoles.length > 0 && (
          <select value={ecoleId} onChange={e => setEcoleId(e.target.value)} style={S.filterSel}>
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
          {activeTab === 'personnel'   && <TabPersonnel   ecoleId={ecoleId} />}
          {activeTab === 'conges'      && <TabConges      ecoleId={ecoleId} />}
          {activeTab === 'evaluations' && <TabEvaluations ecoleId={ecoleId} />}
        </>
      )}
    </div>
  )
}
