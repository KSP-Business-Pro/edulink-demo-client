// src/modules/annees/index.tsx
// Années Académiques — gestion CRUD + définition année courante

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'

interface AnneeAcademique {
  id: string
  ecole_id: string
  libelle: string
  est_courante: boolean
  created_at?: string
}

const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 900, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  statsBar:    { display: 'flex', gap: 12, marginBottom: '1.25rem' } as React.CSSProperties,
  statCard:    { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '12px 18px', flex: 1, boxShadow: '0 1px 3px rgba(0,0,0,.04)' } as React.CSSProperties,
  statNum:     { fontSize: 22, fontWeight: 700, color: '#1e3a5f' } as React.CSSProperties,
  statLabel:   { fontSize: 11, color: '#64748b', marginTop: 2 } as React.CSSProperties,
  tableWrap:   { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:       { width: '100%', borderCollapse: 'collapse' as const },
  thead:       { background: '#f8fafc' },
  th:          { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  td:          { padding: '12px 14px', fontSize: 13, verticalAlign: 'middle' as const, borderBottom: '1px solid #f9fafb' } as React.CSSProperties,
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:       { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  btnPrimary:  { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnGhost:    { padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger:   { padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  successBanner: { display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  errorBanner:   { display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  infoBox:       { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1d4ed8', marginBottom: '1rem' } as React.CSSProperties,
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  modalTitle:  { fontSize: 17, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  modalBody:   { padding: '1.25rem 1.5rem' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 12 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' } as React.CSSProperties,
  filterSel:   { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  couranteBadge: { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#d1fae5', color: '#065f46', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 } as React.CSSProperties,
}

export default function AnneesAcademiquesPage() {
  const { user, isSuperAdmin } = useAuth()
  const [ecoleId,  setEcoleId]  = useState(user?.ecole_id ?? '')
  const [ecoles,   setEcoles]   = useState<{ id: string; nom: string }[]>([])
  const [annees,   setAnnees]   = useState<AnneeAcademique[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [success,  setSuccess]  = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editItem,  setEditItem]  = useState<AnneeAcademique | null>(null)
  const [formLibelle, setFormLibelle] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  // Charger écoles si superadmin
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
    const { data, error: e } = await supabase
      .from('annees_academiques')
      .select('*')
      .eq('ecole_id', ecoleId)
      .order('libelle', { ascending: false })
    if (e) setError(e.message)
    else setAnnees(data ?? [])
    setLoading(false)
  }, [ecoleId])

  useEffect(() => { load() }, [load])

  function showOk(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  function openCreate() {
    setEditItem(null)
    setFormLibelle('')
    setShowModal(true)
  }

  function openEdit(a: AnneeAcademique) {
    setEditItem(a)
    setFormLibelle(a.libelle)
    setShowModal(true)
  }

  async function handleSave() {
    if (!formLibelle.trim()) { setError('Le libellé est requis'); return }
    setSaving(true); setError(null)
    try {
      if (editItem) {
        const { error: e } = await supabase
          .from('annees_academiques')
          .update({ libelle: formLibelle.trim() })
          .eq('id', editItem.id)
        if (e) throw e
        showOk('Année modifiée')
      } else {
        const { error: e } = await supabase
          .from('annees_academiques')
          .insert({ ecole_id: ecoleId, libelle: formLibelle.trim(), est_courante: false })
        if (e) throw e
        showOk('Année créée')
      }
      setShowModal(false)
      load()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function setCourante(annee: AnneeAcademique) {
    setSaving(true)
    try {
      // Désactiver toutes les années courantes
      await supabase.from('annees_academiques')
        .update({ est_courante: false })
        .eq('ecole_id', ecoleId)
      // Activer la sélectionnée
      await supabase.from('annees_academiques')
        .update({ est_courante: true })
        .eq('id', annee.id)
      showOk(`${annee.libelle} définie comme année courante`)
      load()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function handleDelete(annee: AnneeAcademique) {
    if (annee.est_courante) {
      setError('Impossible de supprimer l\'année courante. Définissez d\'abord une autre année.')
      return
    }
    if (!confirm(`Supprimer l'année "${annee.libelle}" ? Cette action est irréversible.`)) return
    setDeleting(annee.id)
    const { error: e } = await supabase.from('annees_academiques').delete().eq('id', annee.id)
    if (e) setError(e.message)
    else { showOk('Année supprimée'); load() }
    setDeleting(null)
  }

  const courante = annees.find(a => a.est_courante)

  return (
    <div style={S.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* En-tête */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>📆 Années Académiques</h1>
          <p style={S.sub}>Gestion des années académiques · Définir l'année courante</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={e => setEcoleId(e.target.value)} style={S.filterSel}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <button onClick={openCreate} style={S.btnPrimary}>+ Nouvelle année</button>
        </div>
      </div>

      {/* Alertes */}
      {success && <div style={S.successBanner}>✅ {success}</div>}
      {error   && <div style={{ ...S.errorBanner, cursor: 'pointer' }} onClick={() => setError(null)}>⚠️ {error} <span style={{ marginLeft: 'auto' }}>✕</span></div>}

      {/* Info année courante */}
      {courante && (
        <div style={S.infoBox}>
          📅 Année courante : <strong>{courante.libelle}</strong> — Cette année est utilisée par défaut dans tous les modules (semestres, promotions, résultats).
        </div>
      )}

      {/* Stats */}
      <div style={S.statsBar}>
        <div style={S.statCard}>
          <div style={S.statNum}>{annees.length}</div>
          <div style={S.statLabel}>Années créées</div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statNum, color: courante ? '#16a34a' : '#dc2626' }}>
            {courante ? courante.libelle : 'Aucune'}
          </div>
          <div style={S.statLabel}>Année courante</div>
        </div>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={S.centered}><div style={S.spinner} /></div>
      ) : annees.length === 0 ? (
        <div style={S.empty}>
          📆<br/>Aucune année académique créée<br/>
          <button onClick={openCreate} style={{ ...S.btnPrimary, marginTop: 12 }}>
            Créer la première année
          </button>
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>
                <th style={S.th}>Libellé</th>
                <th style={S.th}>Statut</th>
                <th style={{ ...S.th, textAlign: 'right' as const }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {annees.map(a => (
                <tr key={a.id} style={{ background: a.est_courante ? '#f0fdf4' : 'transparent' }}>
                  <td style={S.td}>
                    <span style={{ fontWeight: a.est_courante ? 700 : 500, fontSize: 15, color: '#1e293b' }}>
                      {a.libelle}
                    </span>
                  </td>
                  <td style={S.td}>
                    {a.est_courante
                      ? <span style={S.couranteBadge}>⭐ Année courante</span>
                      : <span style={{ fontSize: 12, color: '#94a3b8' }}>Archivée</span>}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' as const }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {!a.est_courante && (
                        <button
                          onClick={() => setCourante(a)}
                          disabled={saving}
                          style={{ ...S.btnGhost, fontSize: 11, color: '#16a34a', borderColor: '#86efac' }}
                        >
                          ⭐ Définir courante
                        </button>
                      )}
                      <button onClick={() => openEdit(a)} style={S.btnGhost}>✏️</button>
                      {!a.est_courante && (
                        <button
                          onClick={() => handleDelete(a)}
                          disabled={deleting === a.id}
                          style={S.btnDanger}
                        >
                          {deleting === a.id ? '⏳' : '🗑️'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création/édition */}
      {showModal && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={S.modal}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>
                {editItem ? '✏️ Modifier l\'année' : '➕ Nouvelle année académique'}
              </div>
              <button onClick={() => setShowModal(false)} style={S.closeBtn}>✕</button>
            </div>
            <div style={S.modalBody}>
              <div style={S.field}>
                <label style={S.label}>Libellé *</label>
                <input
                  value={formLibelle}
                  onChange={e => setFormLibelle(e.target.value)}
                  style={S.input}
                  placeholder="ex : 2025-2026"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Format recommandé : AAAA-AAAA (ex : 2025-2026)
                </span>
              </div>
            </div>
            <div style={S.modalFooter}>
              <button onClick={() => setShowModal(false)} style={S.btnSecondary}>Annuler</button>
              <button onClick={handleSave} disabled={saving} style={S.btnPrimary}>
                {saving ? '⏳...' : editItem ? '💾 Enregistrer' : '➕ Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
