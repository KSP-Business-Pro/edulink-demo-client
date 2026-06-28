// src/modules/portail-enseignant/index.tsx
// B5.3 — Portail Enseignant — vue personnalisée par enseignant connecté

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnseignantProfil {
  id: string
  nom: string
  prenom: string | null
  grade: string | null
  specialite: string | null
  email: string | null
  telephone: string | null
  ecole_id: string
  ecole_nom: string
}

interface MatiereCours {
  id: string
  nom: string
  code: string
  coefficient: number
  ue_nom: string
  ue_code: string
  semestre_nom: string
  programme_nom: string
  nb_etudiants: number
  notes_saisies: number
  presences_saisies: number
}

interface EtudiantNote {
  etudiant_id: string
  nom: string
  prenom: string | null
  numero_etudiant: string | null
  note_cc: number | null
  note_examen: number | null
  note_finale: number | null
  mention: string | null
}

interface SeancePresence {
  id: string
  date_seance: string
  type_seance: 'CM' | 'TD' | 'TP'
  nb_presents: number
  nb_absents: number
  nb_justifies: number
}

interface EtudiantPresence {
  etudiant_id: string
  nom: string
  prenom: string | null
  numero_etudiant: string | null
  statut: 'present' | 'absent' | 'justifie'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  profilCard:  { background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', borderRadius: 16, padding: '1.5rem 2rem', marginBottom: '1.5rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '1.5rem' } as React.CSSProperties,
  avatar:      { width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, flexShrink: 0 } as React.CSSProperties,
  tabs:        { display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: 0 } as React.CSSProperties,
  tab:         (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#1e3a5f' : '#64748b', background: 'none', border: 'none',
    cursor: 'pointer', borderBottom: active ? '2px solid #1e3a5f' : '2px solid transparent',
    marginBottom: -2, fontFamily: "'Segoe UI', sans-serif", transition: 'color .15s',
  }),
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1.5rem' } as React.CSSProperties,
  matiereCard: (selected: boolean): React.CSSProperties => ({
    background: '#fff', borderRadius: 12, border: selected ? '2px solid #1e3a5f' : '1px solid #f1f5f9',
    padding: '1rem 1.25rem', cursor: 'pointer', boxShadow: selected ? '0 4px 12px rgba(30,58,95,.15)' : '0 1px 3px rgba(0,0,0,.06)',
    transition: 'all .15s',
  }),
  statRow:     { display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' as const } as React.CSSProperties,
  statCard:    { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '12px 18px', minWidth: 120, boxShadow: '0 1px 3px rgba(0,0,0,.04)', flex: 1 } as React.CSSProperties,
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
  btnSmall:    { padding: '5px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  input:       { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafafa', width: '80px', textAlign: 'center' as const } as React.CSSProperties,
  mention:     (m: string | null): React.CSSProperties => {
    const colors: Record<string, React.CSSProperties> = {
      'TB': { background: '#d1fae5', color: '#065f46' },
      'B':  { background: '#dbeafe', color: '#1e40af' },
      'AB': { background: '#fef9c3', color: '#713f12' },
      'P':  { background: '#fff7ed', color: '#9a3412' },
      'F':  { background: '#fef2f2', color: '#991b1b' },
    }
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, ...(colors[m ?? ''] ?? { background: '#f1f5f9', color: '#94a3b8' }) }
  },
  presenceBadge: (s: string): React.CSSProperties => ({
    display: 'inline-block', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
    ...(s === 'present' ? { background: '#d1fae5', color: '#065f46' }
      : s === 'absent'  ? { background: '#fef2f2', color: '#991b1b' }
      : { background: '#fef9c3', color: '#713f12' }),
  }),
  successBanner: { display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  errorBanner:   { display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  infoBox:       { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1d4ed8', marginBottom: '1rem' } as React.CSSProperties,
  overlay:       { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:         { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  modalHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  modalBody:     { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  modalFooter:   { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  closeBtn:      { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' } as React.CSSProperties,
  select:        { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' } as React.CSSProperties,
}

function initiales(nom: string, prenom?: string | null) {
  return ((prenom?.[0] ?? '') + (nom[0] ?? '')).toUpperCase() || '?'
}

function getMention(note: number | null): string | null {
  if (note === null) return null
  if (note >= 16) return 'TB'
  if (note >= 14) return 'B'
  if (note >= 12) return 'AB'
  if (note >= 10) return 'P'
  return 'F'
}

// ─── Onglet Mes Cours ─────────────────────────────────────────────────────────

function TabMesCours({
  matieres, selected, onSelect,
}: {
  matieres: MatiereCours[]
  selected: MatiereCours | null
  onSelect: (m: MatiereCours) => void
}) {
  if (matieres.length === 0) return (
    <div style={S.empty}>📚<br/>Aucune matière assignée pour le moment</div>
  )
  return (
    <div>
      <div style={S.infoBox}>
        ℹ️ Cliquez sur une matière pour accéder à la saisie des notes et des présences.
      </div>
      <div style={S.grid}>
        {matieres.map(m => (
          <div key={m.id} style={S.matiereCard(selected?.id === m.id)} onClick={() => onSelect(m)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 4 }}>{m.code}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Coef. {m.coefficient}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{m.nom}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{m.ue_code} · {m.semestre_nom}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>{m.programme_nom}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: 5 }}>
                👥 {m.nb_etudiants} étudiants
              </span>
              <span style={{ fontSize: 11, background: m.notes_saisies > 0 ? '#d1fae5' : '#f1f5f9', color: m.notes_saisies > 0 ? '#065f46' : '#94a3b8', padding: '3px 8px', borderRadius: 5 }}>
                ✏️ {m.notes_saisies}/{m.nb_etudiants} notes
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Onglet Saisie Notes ──────────────────────────────────────────────────────

function TabNotes({
  matiere, ecoleId,
}: {
  matiere: MatiereCours | null
  ecoleId: string
}) {
  const [etudiants, setEtudiants] = useState<EtudiantNote[]>([])
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [success,   setSuccess]   = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [edits,     setEdits]     = useState<Record<string, { cc?: number|null; examen?: number|null }>>({})

  useEffect(() => {
    if (!matiere) return
    setLoading(true)
    setEdits({})

    // Charger étudiants inscrits + notes existantes
    Promise.all([
      supabase.from('inscriptions')
        .select('etudiants(id, nom, prenom, numero_etudiant)')
        .eq('ecole_id', ecoleId)
        .eq('statut', 'actif'),
      supabase.from('notes')
        .select('etudiant_id, note_cc, note_examen, note_finale, mention')
        .eq('matiere_id', matiere.id),
    ]).then(([insRes, notesRes]) => {
      const notesMap: Record<string, Partial<EtudiantNote>> = {}
      ;(notesRes.data ?? []).forEach((n: Record<string, unknown>) => {
        notesMap[n.etudiant_id as string] = {
          note_cc:      n.note_cc as number | null,
          note_examen:  n.note_examen as number | null,
          note_finale:  n.note_finale as number | null,
          mention:      n.mention as string | null,
        }
      })
      const rows: EtudiantNote[] = []
      ;(insRes.data ?? []).forEach((ins: Record<string, unknown>) => {
        const etu = ins.etudiants as Record<string, unknown> | null
        if (!etu) return
        const id = etu.id as string
        rows.push({
          etudiant_id:     id,
          nom:             etu.nom as string,
          prenom:          etu.prenom as string | null,
          numero_etudiant: etu.numero_etudiant as string | null,
          ...notesMap[id],
          note_cc:      notesMap[id]?.note_cc      ?? null,
          note_examen:  notesMap[id]?.note_examen  ?? null,
          note_finale:  notesMap[id]?.note_finale  ?? null,
          mention:      notesMap[id]?.mention      ?? null,
        })
      })
      rows.sort((a, b) => a.nom.localeCompare(b.nom))
      setEtudiants(rows)
      setLoading(false)
    })
  }, [matiere, ecoleId])

  function setNote(etudiantId: string, field: 'cc' | 'examen', val: string) {
    const num = val === '' ? null : Math.min(20, Math.max(0, parseFloat(val)))
    setEdits(e => ({ ...e, [etudiantId]: { ...e[etudiantId], [field]: isNaN(num as number) ? null : num } }))
  }

  function getVal(etudiant: EtudiantNote, field: 'cc' | 'examen'): string {
    const edit = edits[etudiant.etudiant_id]
    if (edit && field in edit) return edit[field] !== null ? String(edit[field]) : ''
    const v = field === 'cc' ? etudiant.note_cc : etudiant.note_examen
    return v !== null ? String(v) : ''
  }

  function calcFinale(etudiant: EtudiantNote): number | null {
    const edit = edits[etudiant.etudiant_id]
    const cc    = edit?.cc      !== undefined ? edit.cc      : etudiant.note_cc
    const examen= edit?.examen  !== undefined ? edit.examen  : etudiant.note_examen
    if (cc === null && examen === null) return null
    if (cc === null) return examen
    if (examen === null) return cc
    return Math.round((cc * 0.4 + examen * 0.6) * 100) / 100
  }

  async function handleSave() {
    if (!matiere || Object.keys(edits).length === 0) return
    setSaving(true); setError(null)
    try {
      for (const [etudiantId, vals] of Object.entries(edits)) {
        const etudiant = etudiants.find(e => e.etudiant_id === etudiantId)
        if (!etudiant) continue
        const note_cc     = vals.cc      !== undefined ? vals.cc      : etudiant.note_cc
        const note_examen = vals.examen  !== undefined ? vals.examen  : etudiant.note_examen
        const note_finale = calcFinale({ ...etudiant, note_cc, note_examen, note_finale: null, mention: null })
        const mention     = getMention(note_finale)

        const { error: e } = await supabase.from('notes').upsert({
          etudiant_id: etudiantId,
          matiere_id:  matiere.id,
          ecole_id:    ecoleId,
          note_cc, note_examen, note_finale, mention,
        }, { onConflict: 'etudiant_id,matiere_id' })
        if (e) throw e
      }

      // Rafraîchir
      setEtudiants(prev => prev.map(e => {
        const edit = edits[e.etudiant_id]
        if (!edit) return e
        const note_cc    = edit.cc     !== undefined ? edit.cc     : e.note_cc
        const note_examen= edit.examen !== undefined ? edit.examen : e.note_examen
        const note_finale= calcFinale({ ...e, note_cc, note_examen, note_finale: null, mention: null })
        return { ...e, note_cc, note_examen, note_finale, mention: getMention(note_finale) }
      }))
      setEdits({})
      setSuccess(`${Object.keys(edits).length} note(s) enregistrée(s)`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!matiere) return <div style={S.empty}>📚<br/>Sélectionnez une matière dans "Mes cours"</div>
  if (loading)  return <div style={S.centered}><div style={S.spinner} /></div>

  const nbSaisies = etudiants.filter(e => e.note_finale !== null).length
  const moyenne   = etudiants.filter(e => e.note_finale !== null).reduce((s, e) => s + (e.note_finale ?? 0), 0) / (nbSaisies || 1)

  return (
    <div>
      {success && <div style={S.successBanner}>✅ {success}</div>}
      {error   && <div style={S.errorBanner}>⚠️ {error}</div>}

      {/* Stats */}
      <div style={S.statRow}>
        <div style={S.statCard}><div style={S.statNum}>{etudiants.length}</div><div style={S.statLabel}>Étudiants</div></div>
        <div style={S.statCard}><div style={S.statNum}>{nbSaisies}</div><div style={S.statLabel}>Notes saisies</div></div>
        <div style={S.statCard}><div style={{ ...S.statNum, color: moyenne >= 10 ? '#16a34a' : '#dc2626' }}>{nbSaisies > 0 ? moyenne.toFixed(2) : '—'}</div><div style={S.statLabel}>Moyenne classe</div></div>
        <div style={S.statCard}><div style={S.statNum}>{etudiants.filter(e => (e.note_finale ?? 0) >= 10).length}</div><div style={S.statLabel}>Admis</div></div>
      </div>

      {/* Barre d'actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          📝 <strong>{matiere.nom}</strong> · Formule : CC×40% + Examen×60%
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.keys(edits).length > 0 && (
            <span style={{ fontSize: 12, color: '#d97706', background: '#fef3c7', padding: '4px 10px', borderRadius: 6 }}>
              {Object.keys(edits).length} modification(s) non sauvegardée(s)
            </span>
          )}
          <button onClick={handleSave} disabled={saving || Object.keys(edits).length === 0} style={S.btnPrimary}>
            {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer les notes'}
          </button>
        </div>
      </div>

      {/* Grille notes */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead style={S.thead}>
            <tr>
              <th style={S.th}>#</th>
              <th style={S.th}>Étudiant</th>
              <th style={S.th}>Matricule</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>CC /20</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Examen /20</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Finale</th>
              <th style={{ ...S.th, textAlign: 'center' as const }}>Mention</th>
            </tr>
          </thead>
          <tbody>
            {etudiants.map((e, i) => {
              const finale = calcFinale(e)
              const mention = getMention(finale)
              const hasEdit = !!edits[e.etudiant_id]
              return (
                <tr key={e.etudiant_id} style={{ borderBottom: '1px solid #f9fafb', background: hasEdit ? '#fffbeb' : 'transparent' }}>
                  <td style={{ ...S.td, color: '#94a3b8', fontSize: 11 }}>{i + 1}</td>
                  <td style={S.td}>
                    <span style={{ fontWeight: 500 }}>{e.prenom} {e.nom}</span>
                  </td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>
                    {e.numero_etudiant ?? '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' as const }}>
                    <input
                      type="number" min={0} max={20} step={0.25}
                      value={getVal(e, 'cc')}
                      onChange={ev => setNote(e.etudiant_id, 'cc', ev.target.value)}
                      style={S.input}
                      placeholder="—"
                    />
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' as const }}>
                    <input
                      type="number" min={0} max={20} step={0.25}
                      value={getVal(e, 'examen')}
                      onChange={ev => setNote(e.etudiant_id, 'examen', ev.target.value)}
                      style={S.input}
                      placeholder="—"
                    />
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' as const, fontWeight: 600, color: (finale ?? 0) >= 10 ? '#16a34a' : finale !== null ? '#dc2626' : '#94a3b8' }}>
                    {finale !== null ? finale.toFixed(2) : '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' as const }}>
                    <span style={S.mention(mention)}>{mention ?? '—'}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Onglet Présences ─────────────────────────────────────────────────────────

function TabPresences({
  matiere, ecoleId,
}: {
  matiere: MatiereCours | null
  ecoleId: string
}) {
  const [seances,   setSeances]   = useState<SeancePresence[]>([])
  const [loading,   setLoading]   = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [success,   setSuccess]   = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  // Nouvelle séance
  const [newSeance, setNewSeance] = useState({
    date_seance: new Date().toISOString().slice(0, 10),
    type_seance: 'CM' as 'CM' | 'TD' | 'TP',
  })
  const [etudiants, setEtudiants] = useState<EtudiantPresence[]>([])
  const [savingSeance, setSavingSeance] = useState(false)

  const loadSeances = useCallback(async () => {
    if (!matiere) return
    setLoading(true)
    const { data } = await supabase
      .from('seances_presences')
      .select('id, date_seance, type_seance, nb_presents, nb_absents, nb_justifies')
      .eq('matiere_id', matiere.id)
      .order('date_seance', { ascending: false })
    setSeances(data ?? [])
    setLoading(false)
  }, [matiere])

  useEffect(() => { loadSeances() }, [loadSeances])

  async function openNewSeance() {
    if (!matiere) return
    // Charger étudiants
    const { data } = await supabase
      .from('inscriptions')
      .select('etudiants(id, nom, prenom, numero_etudiant)')
      .eq('ecole_id', ecoleId)
      .eq('statut', 'actif')
    const rows: EtudiantPresence[] = (data ?? []).map((ins: Record<string, unknown>) => {
      const e = ins.etudiants as Record<string, unknown>
      return {
        etudiant_id: e.id as string, nom: e.nom as string,
        prenom: e.prenom as string | null,
        numero_etudiant: e.numero_etudiant as string | null,
        statut: 'present' as const,
      }
    }).sort((a: EtudiantPresence, b: EtudiantPresence) => a.nom.localeCompare(b.nom))
    setEtudiants(rows)
    setShowModal(true)
  }

  async function saveSeance() {
    if (!matiere) return
    setSavingSeance(true)
    try {
      const nb_presents  = etudiants.filter(e => e.statut === 'present').length
      const nb_absents   = etudiants.filter(e => e.statut === 'absent').length
      const nb_justifies = etudiants.filter(e => e.statut === 'justifie').length

      // Créer séance
      const { data: seance, error: se } = await supabase
        .from('seances_presences')
        .insert({
          matiere_id:   matiere.id,
          ecole_id:     ecoleId,
          date_seance:  newSeance.date_seance,
          type_seance:  newSeance.type_seance,
          nb_presents, nb_absents, nb_justifies,
        })
        .select().single()
      if (se) throw se

      // Enregistrer présences individuelles
      const presences = etudiants.map(e => ({
        seance_id:   seance.id,
        etudiant_id: e.etudiant_id,
        statut:      e.statut,
        matiere_id:  matiere.id,
        ecole_id:    ecoleId,
      }))
      const { error: pe } = await supabase.from('presences').insert(presences)
      if (pe) throw pe

      setShowModal(false)
      setSuccess('Séance enregistrée avec succès')
      setTimeout(() => setSuccess(null), 3000)
      loadSeances()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingSeance(false)
    }
  }

  if (!matiere) return <div style={S.empty}>📚<br/>Sélectionnez une matière dans "Mes cours"</div>
  if (loading)  return <div style={S.centered}><div style={S.spinner} /></div>

  const totalPresents  = seances.reduce((s, r) => s + r.nb_presents, 0)
  const totalAbsents   = seances.reduce((s, r) => s + r.nb_absents, 0)

  return (
    <div>
      {success && <div style={S.successBanner}>✅ {success}</div>}
      {error   && <div style={S.errorBanner}>⚠️ {error}<button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>✕</button></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={S.statRow}>
          <div style={S.statCard}><div style={S.statNum}>{seances.length}</div><div style={S.statLabel}>Séances tenues</div></div>
          <div style={S.statCard}><div style={{ ...S.statNum, color: '#16a34a' }}>{totalPresents}</div><div style={S.statLabel}>Présences cumulées</div></div>
          <div style={S.statCard}><div style={{ ...S.statNum, color: '#dc2626' }}>{totalAbsents}</div><div style={S.statLabel}>Absences cumulées</div></div>
        </div>
        <button onClick={openNewSeance} style={S.btnPrimary}>+ Nouvelle séance</button>
      </div>

      {seances.length === 0 ? (
        <div style={S.empty}>📋<br/>Aucune séance enregistrée pour cette matière</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>
                <th style={S.th}>Date</th>
                <th style={S.th}>Type</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Présents</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Absents</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Justifiés</th>
                <th style={{ ...S.th, textAlign: 'center' as const }}>Taux présence</th>
              </tr>
            </thead>
            <tbody>
              {seances.map(s => {
                const total = s.nb_presents + s.nb_absents + s.nb_justifies
                const taux  = total > 0 ? Math.round((s.nb_presents / total) * 100) : 0
                return (
                  <tr key={s.id}>
                    <td style={S.td}>{new Date(s.date_seance).toLocaleDateString('fr-FR')}</td>
                    <td style={S.td}>
                      <span style={{ background: s.type_seance === 'CM' ? '#eff6ff' : s.type_seance === 'TD' ? '#f0fdf4' : '#fdf4ff', color: s.type_seance === 'CM' ? '#1d4ed8' : s.type_seance === 'TD' ? '#15803d' : '#7e22ce', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>
                        {s.type_seance}
                      </span>
                    </td>
                    <td style={{ ...S.td, textAlign: 'center' as const, color: '#16a34a', fontWeight: 600 }}>{s.nb_presents}</td>
                    <td style={{ ...S.td, textAlign: 'center' as const, color: '#dc2626', fontWeight: 600 }}>{s.nb_absents}</td>
                    <td style={{ ...S.td, textAlign: 'center' as const, color: '#d97706', fontWeight: 600 }}>{s.nb_justifies}</td>
                    <td style={{ ...S.td, textAlign: 'center' as const }}>
                      <span style={{ fontWeight: 600, color: taux >= 75 ? '#16a34a' : taux >= 50 ? '#d97706' : '#dc2626' }}>{taux}%</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nouvelle séance */}
      {showModal && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={S.modal}>
            <div style={S.modalHeader}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>📋 Nouvelle séance de présence</div>
              <button onClick={() => setShowModal(false)} style={S.closeBtn}>✕</button>
            </div>
            <div style={S.modalBody}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Date</label>
                  <input type="date" value={newSeance.date_seance}
                    onChange={e => setNewSeance(s => ({ ...s, date_seance: e.target.value }))}
                    style={{ ...S.input, width: '100%', textAlign: 'left' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Type</label>
                  <select value={newSeance.type_seance}
                    onChange={e => setNewSeance(s => ({ ...s, type_seance: e.target.value as 'CM'|'TD'|'TP' }))}
                    style={S.select}>
                    <option value="CM">CM — Cours Magistral</option>
                    <option value="TD">TD — Travaux Dirigés</option>
                    <option value="TP">TP — Travaux Pratiques</option>
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                  <span>{etudiants.length} étudiants</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEtudiants(e => e.map(x => ({ ...x, statut: 'present' })))} style={S.btnSmall}>Tous présents</button>
                    <button onClick={() => setEtudiants(e => e.map(x => ({ ...x, statut: 'absent' })))} style={S.btnSmall}>Tous absents</button>
                  </div>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {etudiants.map(e => (
                    <div key={e.etudiant_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f9fafb' }}>
                      <span style={{ fontSize: 13 }}>{e.prenom} {e.nom}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['present', 'absent', 'justifie'] as const).map(s => (
                          <button key={s} onClick={() => setEtudiants(prev => prev.map(x => x.etudiant_id === e.etudiant_id ? { ...x, statut: s } : x))}
                            style={{ ...S.btnSmall, ...(e.statut === s ? (s === 'present' ? { background: '#d1fae5', borderColor: '#86efac', color: '#065f46' } : s === 'absent' ? { background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' } : { background: '#fef9c3', borderColor: '#fde047', color: '#713f12' }) : {}) }}>
                            {s === 'present' ? '✓' : s === 'absent' ? '✗' : 'J'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={S.modalFooter}>
              <button onClick={() => setShowModal(false)} style={S.btnSecondary}>Annuler</button>
              <button onClick={saveSeance} disabled={savingSeance} style={S.btnPrimary}>
                {savingSeance ? '⏳...' : '💾 Enregistrer la séance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Onglet Emploi du temps ───────────────────────────────────────────────────

function TabEmploiDuTemps({ enseignantId, ecoleId }: { enseignantId: string; ecoleId: string }) {
  const [slots, setSlots] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  const COLORS = ['#dbeafe', '#d1fae5', '#fef9c3', '#fce7f3', '#ede9fe', '#fff7ed', '#e0f2fe']

  useEffect(() => {
    supabase.from('emploi_du_temps')
      .select('*, matieres(nom, code), salles(nom)')
      .eq('enseignant_id', enseignantId)
      .eq('ecole_id', ecoleId)
      .then(({ data }) => {
        setSlots(data ?? [])
        setLoading(false)
      })
  }, [enseignantId, ecoleId])

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>
  if (slots.length === 0) return <div style={S.empty}>📅<br/>Aucun créneau dans votre emploi du temps</div>

  const slotsByJour: Record<string, Record<string, unknown>[]> = {}
  JOURS.forEach(j => { slotsByJour[j] = [] })
  slots.forEach(s => {
    const jour = s.jour_semaine as string
    if (slotsByJour[jour]) slotsByJour[jour].push(s)
  })

  return (
    <div>
      <div style={S.infoBox}>📅 Votre emploi du temps — semaine en cours</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {JOURS.filter(j => slotsByJour[j].length > 0).map((jour, ji) => (
          <div key={jour} style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: '#fff', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>{jour}</div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {slotsByJour[jour].sort((a, b) => (a.heure_debut as string).localeCompare(b.heure_debut as string)).map((s, i) => {
                const mat = s.matieres as Record<string, unknown> | null
                const salle = s.salles as Record<string, unknown> | null
                return (
                  <div key={i} style={{ background: COLORS[(ji + i) % COLORS.length], borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{mat?.nom as string ?? 'Matière'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {s.heure_debut as string} – {s.heure_fin as string}
                      {salle ? ` · ${salle.nom as string}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'cours',     label: 'Mes cours',        ico: '📚' },
  { id: 'notes',     label: 'Saisie des notes',  ico: '✏️' },
  { id: 'presences', label: 'Présences',         ico: '📋' },
  { id: 'edt',       label: "Emploi du temps",   ico: '📅' },
] as const
type TabId = typeof TABS[number]['id']

export default function PortailEnseignantPage() {
  const { user } = useAuth()
  const [profil,    setProfil]    = useState<EnseignantProfil | null>(null)
  const [matieres,  setMatieres]  = useState<MatiereCours[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('cours')
  const [selectedMatiere, setSelectedMatiere] = useState<MatiereCours | null>(null)

  useEffect(() => {
    if (!user?.email) return

    // Charger profil enseignant lié au compte auth
    supabase.from('enseignants')
      .select('id, nom, prenom, grade, specialite, email, telephone, ecole_id, ecoles(nom)')
      .eq('email', user.email)
      .maybeSingle()
      .then(async ({ data: ens }) => {
        if (!ens) { setLoading(false); return }
        const ecoles = ens.ecoles as unknown as { nom: string } | null
        setProfil({
          ...ens,
          ecole_nom: ecoles?.nom ?? '',
        } as EnseignantProfil)

        // Charger matières assignées
        const { data: matiereLinks } = await supabase
          .from('matiere_enseignants')
          .select(`
            matieres(
              id, nom, code, coefficient,
              unites_enseignement(code, intitule,
                semestres(libelle,
                  programmes(nom)
                )
              )
            )
          `)
          .eq('enseignant_id', ens.id)

        const rows: MatiereCours[] = (matiereLinks ?? []).map((ml: Record<string, unknown>) => {
          const m  = ml.matieres  as Record<string, unknown>
          const ue = m?.unites_enseignement as Record<string, unknown> | null
          const sem= ue?.semestres as Record<string, unknown> | null
          const prog = sem?.programmes as Record<string, unknown> | null
          return {
            id:              m.id as string,
            nom:             m.nom as string,
            code:            m.code as string,
            coefficient:     m.coefficient as number,
            ue_nom:          ue?.intitule as string ?? '',
            ue_code:         ue?.code as string ?? '',
            semestre_nom:    sem?.libelle as string ?? '',
            programme_nom:   prog?.nom as string ?? '',
            nb_etudiants:    0,
            notes_saisies:   0,
            presences_saisies: 0,
          }
        })

        // Enrichir avec stats
        for (const r of rows) {
          const [insRes, notesRes] = await Promise.all([
            supabase.from('inscriptions').select('id', { count: 'exact' }).eq('ecole_id', ens.ecole_id).eq('statut', 'actif'),
            supabase.from('notes').select('id', { count: 'exact' }).eq('matiere_id', r.id),
          ])
          r.nb_etudiants  = insRes.count ?? 0
          r.notes_saisies = notesRes.count ?? 0
        }

        setMatieres(rows)
        setLoading(false)
      })
  }, [user?.email])

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  if (!profil) return (
    <div style={S.page}>
      <div style={{ ...S.errorBanner, marginTop: '2rem' }}>
        ⚠️ Aucun profil enseignant trouvé pour ce compte ({user?.email}).
        Vérifiez que votre email est enregistré dans la table enseignants.
      </div>
    </div>
  )

  function handleSelectMatiere(m: MatiereCours) {
    setSelectedMatiere(m)
    setActiveTab('notes')
  }

  return (
    <div style={S.page}>
      {/* Carte profil */}
      <div style={S.profilCard}>
        <div style={S.avatar}>{initiales(profil.nom, profil.prenom)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{profil.prenom} {profil.nom}</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{profil.grade ?? 'Enseignant'} · {profil.specialite ?? ''}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>🏫 {profil.ecole_nom} · ✉️ {profil.email}</div>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{matieres.length}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>matière{matieres.length > 1 ? 's' : ''} assignée{matieres.length > 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Matière sélectionnée */}
      {selectedMatiere && activeTab !== 'cours' && activeTab !== 'edt' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', padding: '8px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: 13, color: '#1d4ed8' }}>📘 <strong>{selectedMatiere.nom}</strong> — {selectedMatiere.code}</span>
          <button onClick={() => { setSelectedMatiere(null); setActiveTab('cours') }} style={{ ...S.btnSmall, marginLeft: 'auto', fontSize: 11 }}>
            Changer de matière
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={S.tab(activeTab === t.id)}>
            {t.ico} {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {activeTab === 'cours'     && <TabMesCours matieres={matieres} selected={selectedMatiere} onSelect={handleSelectMatiere} />}
      {activeTab === 'notes'     && <TabNotes     matiere={selectedMatiere} ecoleId={profil.ecole_id} />}
      {activeTab === 'presences' && <TabPresences matiere={selectedMatiere} ecoleId={profil.ecole_id} />}
      {activeTab === 'edt'       && <TabEmploiDuTemps enseignantId={profil.id} ecoleId={profil.ecole_id} />}
    </div>
  )
}
