// src/modules/portail-public/index.tsx
// B5.6 — Gestion Portail Public (back-office) — inline styles

import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'

interface Actualite {
  id: string
  titre: string
  contenu: string
  image_url: string | null
  categorie: string
  statut: string
  publie_le: string | null
}

interface EcoleConfig {
  id: string
  nom: string
  slug: string | null
  description: string | null
  adresse: string | null
  telephone: string | null
  email_contact: string | null
  site_web: string | null
  annee_creation: number | null
  portail_actif: boolean
}

const CATEGORIES = ['general', 'evenement', 'resultat', 'inscription']

const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  tabs:        { display: 'flex', gap: 4, marginBottom: '1.25rem', borderBottom: '2px solid #f1f5f9' } as React.CSSProperties,
  tab:         (a: boolean): React.CSSProperties => ({ padding: '8px 18px', fontSize: 13, fontWeight: a ? 600 : 400, color: a ? '#1e3a5f' : '#64748b', background: 'none', border: 'none', cursor: 'pointer', borderBottom: a ? '2px solid #1e3a5f' : '2px solid transparent', marginBottom: -2, fontFamily: "'Segoe UI', sans-serif" }),
  card:        { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '1.5rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  grid2:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 8 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  textarea:    { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const } as React.CSSProperties,
  select:      { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  btnPrimary:  { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSmall:    { padding: '4px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger:   { padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  tableWrap:   { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:       { width: '100%', borderCollapse: 'collapse' as const },
  thead:       { background: '#f8fafc' },
  th:          { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  td:          { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const, borderBottom: '1px solid #f9fafb' } as React.CSSProperties,
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:       { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  success:     { background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  error:       { background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  toggle:      (on: boolean): React.CSSProperties => ({ width: 44, height: 24, borderRadius: 12, background: on ? '#1e3a5f' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s' }),
  toggleDot:   (on: boolean): React.CSSProperties => ({ position: 'absolute', top: 3, left: on ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }),
  urlBox:      { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1d4ed8', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
  filterSel:   { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
}

export default function GestionPortailPage() {
  const { user, isSuperAdmin } = useAuth()
  const [ecoleId,   setEcoleId]   = useState(user?.ecole_id ?? '')
  const [ecoles,    setEcoles]    = useState<{ id: string; nom: string }[]>([])
  const [activeTab, setActiveTab] = useState<'infos'|'actualites'>('infos')
  const [ecoleConf, setEcoleConf] = useState<EcoleConfig | null>(null)
  const [actualites, setActualites] = useState<Actualite[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [success,    setSuccess]    = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [editActu,   setEditActu]   = useState<Partial<Actualite> | null>(null)

  useEffect(() => {
    if (!isSuperAdmin) return
    supabase.from('ecoles').select('id,nom').order('nom').then(({ data }) => {
      setEcoles(data ?? [])
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id)
    })
  }, [isSuperAdmin])

  useEffect(() => {
    if (!ecoleId) return
    setLoading(true)
    Promise.all([
      supabase.from('ecoles').select('id, nom, slug, description, adresse, telephone, email_contact, site_web, annee_creation, portail_actif').eq('id', ecoleId).single(),
      supabase.from('actualites').select('*').eq('ecole_id', ecoleId).order('publie_le', { ascending: false }),
    ]).then(([eRes, aRes]) => {
      setEcoleConf(eRes.data as EcoleConfig)
      setActualites(aRes.data ?? [])
      setLoading(false)
    })
  }, [ecoleId])

  function showOk(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }

  async function saveInfos() {
    if (!ecoleConf) return
    setSaving(true)
    const { error: e } = await supabase.from('ecoles').update({
      slug: ecoleConf.slug, description: ecoleConf.description,
      adresse: ecoleConf.adresse, telephone: ecoleConf.telephone,
      email_contact: ecoleConf.email_contact, site_web: ecoleConf.site_web,
      annee_creation: ecoleConf.annee_creation, portail_actif: ecoleConf.portail_actif,
    }).eq('id', ecoleId)
    setSaving(false)
    if (e) setError(e.message)
    else showOk('Informations sauvegardées')
  }

  async function saveActu(form: Partial<Actualite>) {
    setSaving(true)
    if (form.id) {
      await supabase.from('actualites').update({ titre: form.titre, contenu: form.contenu, categorie: form.categorie, statut: form.statut ?? 'brouillon' }).eq('id', form.id)
    } else {
      await supabase.from('actualites').insert({ ecole_id: ecoleId, titre: form.titre, contenu: form.contenu, categorie: form.categorie ?? 'general', statut: form.statut ?? 'brouillon' })
    }
    setSaving(false)
    setShowForm(false); setEditActu(null)
    showOk('Actualité enregistrée')
    const { data } = await supabase.from('actualites').select('*').eq('ecole_id', ecoleId).order('publie_le', { ascending: false })
    setActualites(data ?? [])
  }

  async function deleteActu(id: string) {
    if (!confirm('Supprimer cette actualité ?')) return
    await supabase.from('actualites').delete().eq('id', id)
    setActualites(prev => prev.filter(a => a.id !== id))
  }

  async function togglePublie(id: string, publie: string) {
    await supabase.from('actualites').update({ statut: publie === 'publie' ? 'brouillon' : 'publie' }).eq('id', id)
    setActualites(prev => prev.map(a => a.id === id ? { ...a, statut: a.statut === 'publie' ? 'brouillon' : 'publie' } : a))
  }

  const portailUrl = ecoleConf?.slug ? `${window.location.origin}/ecole/${ecoleConf.slug}` : null
  const TABS = [{ id: 'infos', label: 'Informations', ico: '🏫' }, { id: 'actualites', label: 'Actualités', ico: '📢' }] as const

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>🌐 Portail Public</h1>
          <p style={S.sub}>Page publique de présentation · Actualités · Gestion</p>
        </div>
        {isSuperAdmin && ecoles.length > 0 && (
          <select value={ecoleId} onChange={e => setEcoleId(e.target.value)} style={S.filterSel}>
            {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        )}
      </div>

      {/* URL du portail */}
      {portailUrl && ecoleConf?.portail_actif && (
        <div style={S.urlBox}>
          🔗 Portail actif :
          <a href={portailUrl} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', fontWeight: 600 }}>{portailUrl}</a>
          <button onClick={() => navigator.clipboard.writeText(portailUrl)} style={{ ...S.btnSmall, marginLeft: 'auto' }}>📋 Copier</button>
        </div>
      )}

      {success && <div style={S.success}>✅ {success}</div>}
      {error   && <div style={S.error}>⚠️ {error}</div>}

      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as typeof activeTab)} style={S.tab(activeTab === t.id)}>
            {t.ico} {t.label}
          </button>
        ))}
      </div>

      {/* Onglet Informations */}
      {activeTab === 'infos' && ecoleConf && (
        <div style={S.card}>
          {/* Toggle portail actif */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem', padding: '1rem', background: ecoleConf.portail_actif ? '#f0fdf4' : '#f8fafc', borderRadius: 10, border: `1px solid ${ecoleConf.portail_actif ? '#bbf7d0' : '#e2e8f0'}` }}>
            <div style={S.toggle(ecoleConf.portail_actif)} onClick={() => setEcoleConf(c => c ? { ...c, portail_actif: !c.portail_actif } : c)}>
              <div style={S.toggleDot(ecoleConf.portail_actif)} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Portail public {ecoleConf.portail_actif ? 'activé' : 'désactivé'}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{ecoleConf.portail_actif ? 'Votre page est accessible publiquement' : 'Votre page n\'est pas encore visible'}</div>
            </div>
          </div>

          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Slug URL *</label>
              <input value={ecoleConf.slug ?? ''} onChange={e => setEcoleConf(c => c ? { ...c, slug: e.target.value.toLowerCase().replace(/\s+/g,'-') } : c)} style={S.input} placeholder="ecole-superieure-management" />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>/ecole/{ecoleConf.slug ?? 'votre-slug'}</span>
            </div>
            <div style={S.field}>
              <label style={S.label}>Année de création</label>
              <input type="number" value={ecoleConf.annee_creation ?? ''} onChange={e => setEcoleConf(c => c ? { ...c, annee_creation: Number(e.target.value) || null } : c)} style={S.input} placeholder="2005" />
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>Description</label>
            <textarea value={ecoleConf.description ?? ''} onChange={e => setEcoleConf(c => c ? { ...c, description: e.target.value } : c)} style={S.textarea} rows={3} placeholder="Présentation de l'établissement..." />
          </div>

          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Adresse</label>
              <input value={ecoleConf.adresse ?? ''} onChange={e => setEcoleConf(c => c ? { ...c, adresse: e.target.value } : c)} style={S.input} placeholder="Cotonou, Bénin" />
            </div>
            <div style={S.field}>
              <label style={S.label}>Téléphone</label>
              <input value={ecoleConf.telephone ?? ''} onChange={e => setEcoleConf(c => c ? { ...c, telephone: e.target.value } : c)} style={S.input} placeholder="+229 97..." />
            </div>
          </div>

          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Email de contact</label>
              <input type="email" value={ecoleConf.email_contact ?? ''} onChange={e => setEcoleConf(c => c ? { ...c, email_contact: e.target.value } : c)} style={S.input} placeholder="contact@ecole.bj" />
            </div>
            <div style={S.field}>
              <label style={S.label}>Site web</label>
              <input value={ecoleConf.site_web ?? ''} onChange={e => setEcoleConf(c => c ? { ...c, site_web: e.target.value } : c)} style={S.input} placeholder="https://www.ecole.bj" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            {portailUrl && (
              <a href={portailUrl} target="_blank" rel="noreferrer" style={{ ...S.btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                👁 Aperçu
              </a>
            )}
            <button onClick={saveInfos} disabled={saving} style={S.btnPrimary}>
              {saving ? '⏳...' : '💾 Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* Onglet Actualités */}
      {activeTab === 'actualites' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => { setEditActu({ categorie: 'general', statut: 'brouillon' }); setShowForm(true) }} style={S.btnPrimary}>
              + Nouvelle actualité
            </button>
          </div>

          {showForm && editActu !== null && (
            <div style={{ ...S.card, border: '1px solid #bfdbfe', background: '#f8fbff' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{editActu.id ? 'Modifier' : 'Nouvelle'} actualité</div>
              <div style={S.field}>
                <label style={S.label}>Titre</label>
                <input value={editActu.titre ?? ''} onChange={e => setEditActu(f => ({ ...f, titre: e.target.value }))} style={S.input} />
              </div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Catégorie</label>
                  <select value={editActu.categorie ?? 'general'} onChange={e => setEditActu(f => ({ ...f, categorie: e.target.value }))} style={S.select}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Date de publication</label>
                  <input type="date" value={editActu.publie_le ?? ''} onChange={e => setEditActu(f => ({ ...f, publie_le: e.target.value }))} style={S.input} />
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>Contenu</label>
                <textarea value={editActu.contenu ?? ''} onChange={e => setEditActu(f => ({ ...f, contenu: e.target.value }))} style={S.textarea} rows={4} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={S.toggle(editActu.statut === 'publie')} onClick={() => setEditActu(f => ({ ...f, statut: f?.statut === 'publie' ? 'brouillon' : 'publie' }))}>
                  <div style={S.toggleDot(editActu.statut === 'publie')} />
                </div>
                <span style={{ fontSize: 13 }}>{editActu.statut === 'publie' ? 'Publié' : 'Brouillon'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowForm(false); setEditActu(null) }} style={S.btnSecondary}>Annuler</button>
                <button onClick={() => saveActu(editActu)} disabled={saving} style={S.btnPrimary}>{saving ? '⏳...' : '💾 Enregistrer'}</button>
              </div>
            </div>
          )}

          {actualites.length === 0 ? (
            <div style={S.empty}>📢<br/>Aucune actualité — créez votre première</div>
          ) : (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead style={S.thead}>
                  <tr>
                    <th style={S.th}>Titre</th>
                    <th style={S.th}>Catégorie</th>
                    <th style={S.th}>Date</th>
                    <th style={S.th}>Statut</th>
                    <th style={{ ...S.th, textAlign: 'right' as const }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {actualites.map(a => (
                    <tr key={a.id}>
                      <td style={{ ...S.td, fontWeight: 500 }}>{a.titre}</td>
                      <td style={S.td}><span style={{ fontSize: 12, color: '#64748b' }}>{a.categorie}</span></td>
                      <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>{new Date(a.publie_le ?? '').toLocaleDateString('fr-FR')}</td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={S.toggle(a.statut === 'publie')} onClick={() => togglePublie(a.id, a.statut)}>
                            <div style={S.toggleDot(a.statut === 'publie')} />
                          </div>
                          <span style={{ fontSize: 12, color: a.statut === 'publie' ? '#166534' : '#64748b' }}>{a.statut === 'publie' ? 'Publié' : 'Brouillon'}</span>
                        </div>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right' as const }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditActu(a); setShowForm(true) }} style={S.btnSmall}>✏️</button>
                          <button onClick={() => deleteActu(a.id)} style={S.btnDanger}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
