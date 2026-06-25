// src/modules/parametres/index.tsx
// B5.1 — Paramètres Avancés — inline styles (pattern projet)

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'
import {
  useParametres, useRoles, useAuditLogs,
  DEFAULT_CONFIG, type EcoleConfig, type ThemeConfig,
} from '../../hooks/useParametres'

// ─── Style système (cohérent avec les autres modules) ─────────────────────────
const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  layout:      { display: 'flex', gap: '1.5rem', alignItems: 'flex-start' } as React.CSSProperties,
  // Sidebar tabs
  sidebar:     { width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, gap: 4 } as React.CSSProperties,
  tabBtn:      (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
    borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
    fontFamily: "'Segoe UI', sans-serif", textAlign: 'left' as const, width: '100%',
    background: active ? '#1e3a5f' : 'transparent',
    color: active ? '#fff' : '#374151',
    fontWeight: active ? 600 : 400,
  }),
  // Contenu principal
  card:        { flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  // Formulaires
  section:     { display: 'flex', flexDirection: 'column' as const, gap: '1rem', marginBottom: '1.5rem' } as React.CSSProperties,
  sectionTitle:{ fontSize: 13, fontWeight: 600, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #f1f5f9', marginBottom: 4 } as React.CSSProperties,
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4 } as React.CSSProperties,
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  select:      { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
  textarea:    { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none', color: '#1e293b', background: '#fafafa', width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const } as React.CSSProperties,
  grid2:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' } as React.CSSProperties,
  // Boutons
  btnPrimary:  { padding: '8px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
  btnSecondary:{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
  btnDanger:   { padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSmall:    { padding: '5px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  footer:      { display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', marginTop: '1rem' } as React.CSSProperties,
  // Alertes
  success:     { display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  error:       { display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  info:        { display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', color: '#1d4ed8', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bfdbfe' } as React.CSSProperties,
  // Spinner
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:       { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  // Table
  tableWrap:   { background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9', overflow: 'hidden', marginTop: 8 } as React.CSSProperties,
  table:       { width: '100%', borderCollapse: 'collapse' as const },
  thead:       { background: '#f8fafc' },
  th:          { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  td:          { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const, borderBottom: '1px solid #f9fafb' } as React.CSSProperties,
  // Upload zone
  uploadZone:  { border: '2px dashed #e2e8f0', borderRadius: 10, padding: '1.5rem', textAlign: 'center' as const, cursor: 'pointer', transition: 'border-color .2s' } as React.CSSProperties,
  // Permissions
  permChip:    (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
    borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid',
    background: active ? '#f0fdf4' : '#fafafa',
    borderColor: active ? '#86efac' : '#e2e8f0',
    color: active ? '#166534' : '#6b7280',
  }),
  roleBtn:     (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '9px 12px', borderRadius: 8, border: '1px solid', cursor: 'pointer',
    background: active ? '#1e3a5f' : '#fff',
    borderColor: active ? '#1e3a5f' : '#e2e8f0',
    color: active ? '#fff' : '#374151',
    fontSize: 13, fontFamily: "'Segoe UI', sans-serif", textAlign: 'left' as const, width: '100%',
  }),
}

const MODULE_LABELS: Record<string, string> = {
  inscriptions: 'Inscriptions', notes: 'Notes', presences: 'Présences',
  deliberations: 'Délibérations', emploi_du_temps: 'Emploi du temps',
  rh: 'RH & Personnel', finances: 'Finances', parametres: 'Paramètres',
  analytics: 'Analytics', users: 'Utilisateurs',
}
const ACTION_LABELS: Record<string, string> = {
  read: 'Lecture', write: 'Écriture', delete: 'Suppression', export: 'Export', validate: 'Validation',
}
const ACTION_LOG: Record<string, { label: string; color: React.CSSProperties }> = {
  CREATE: { label: 'Création',     color: { background: '#f0fdf4', color: '#166534' } },
  UPDATE: { label: 'Modification', color: { background: '#eff6ff', color: '#1d4ed8' } },
  DELETE: { label: 'Suppression',  color: { background: '#fef2f2', color: '#991b1b' } },
  LOGIN:  { label: 'Connexion',    color: { background: '#f9fafb', color: '#374151' } },
  EXPORT: { label: 'Export',       color: { background: '#fff7ed', color: '#c2410c' } },
  IMPORT: { label: 'Import',       color: { background: '#faf5ff', color: '#7e22ce' } },
}

const TABS = [
  { id: 'theme',    label: 'Thème & Logo',       ico: '🎨' },
  { id: 'region',   label: 'Langue & Région',     ico: '🌍' },
  { id: 'roles',    label: 'Rôles & Permissions', ico: '👥' },
  { id: 'security', label: 'Sécurité',            ico: '🔐' },
  { id: 'import',   label: 'Import / Export',     ico: '📦' },
  { id: 'audit',    label: "Journal d'audit",      ico: '📋' },
] as const
type TabId = typeof TABS[number]['id']

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Onglet Thème & Logo ──────────────────────────────────────────────────────
function TabTheme({ config, saving, onSave, onUpload }: {
  config: EcoleConfig; saving: boolean
  onSave: (p: Partial<EcoleConfig>) => Promise<void>
  onUpload: (f: File, t: 'logo' | 'favicon') => Promise<string>
}) {
  const [theme, setTheme]     = useState<ThemeConfig>({ ...config.theme })
  const [logoUrl, setLogoUrl] = useState(config.logo_url)
  const [favUrl, setFavUrl]   = useState(config.favicon_url)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const favRef  = useRef<HTMLInputElement>(null)

  async function upload(file: File, type: 'logo' | 'favicon') {
    setUploading(true)
    try { const url = await onUpload(file, type); type === 'logo' ? setLogoUrl(url) : setFavUrl(url) }
    finally { setUploading(false) }
  }

  async function save() {
    await onSave({ theme, logo_url: logoUrl, favicon_url: favUrl })
    setMsg('Thème sauvegardé ✓')
    setTimeout(() => setMsg(null), 3000)
  }

  const colorRow = (label: string, key: keyof ThemeConfig) => (
    <div style={S.field}>
      <label style={S.label}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={theme[key]} onChange={e => setTheme(t => ({ ...t, [key]: e.target.value }))}
          style={{ width: 40, height: 34, borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer', padding: 2 }} />
        <input type="text" value={theme[key]} onChange={e => setTheme(t => ({ ...t, [key]: e.target.value }))}
          style={{ ...S.input, width: 120, fontFamily: 'monospace' }} />
      </div>
    </div>
  )

  return (
    <div>
      {msg && <div style={S.success}>✅ {msg}</div>}

      {/* Aperçu */}
      <div style={{ ...S.section }}>
        <div style={S.sectionTitle}>Aperçu</div>
        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <div style={{ height: 64, background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, display: 'flex', alignItems: 'center', padding: '0 1.5rem', gap: 12 }}>
            {logoUrl
              ? <img src={logoUrl} alt="logo" style={{ height: 36, objectFit: 'contain' }} />
              : <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>🏫 EduLink Sup</span>}
          </div>
          <div style={{ background: theme.background, padding: '8px 16px', display: 'flex', gap: 8 }}>
            {[theme.primary, theme.secondary, theme.accent, theme.background].map((c, i) => (
              <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: '1px solid #e2e8f0' }} title={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Couleurs */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Palette de couleurs</div>
        <div style={S.grid2}>
          {colorRow('Couleur primaire',       'primary')}
          {colorRow('Couleur secondaire',     'secondary')}
          {colorRow("Couleur d'accentuation", 'accent')}
          {colorRow('Arrière-plan',           'background')}
        </div>
        <button onClick={() => setTheme(DEFAULT_CONFIG.theme)} style={{ ...S.btnSmall, width: 'fit-content' }}>
          🔄 Réinitialiser les couleurs par défaut
        </button>
      </div>

      {/* Logo & Favicon */}
      <div style={{ ...S.grid2, marginBottom: '1.5rem' }}>
        <div style={S.field}>
          <div style={S.sectionTitle}>Logo de l'école</div>
          <div style={S.uploadZone} onClick={() => logoRef.current?.click()}>
            {logoUrl
              ? <img src={logoUrl} alt="logo" style={{ height: 64, objectFit: 'contain', margin: '0 auto' }} />
              : <div><div style={{ fontSize: 28, marginBottom: 4 }}>📤</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Cliquer pour uploader</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>PNG, JPG, SVG • max 5 Mo</div></div>}
          </div>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && upload(e.target.files[0], 'logo')} />
          {logoUrl && <button style={{ ...S.btnDanger, marginTop: 4 }} onClick={() => setLogoUrl('')}>Supprimer le logo</button>}
        </div>
        <div style={S.field}>
          <div style={S.sectionTitle}>Favicon</div>
          <div style={S.uploadZone} onClick={() => favRef.current?.click()}>
            {favUrl
              ? <img src={favUrl} alt="favicon" style={{ width: 48, height: 48, objectFit: 'contain', margin: '0 auto' }} />
              : <div><div style={{ fontSize: 28, marginBottom: 4 }}>📤</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Cliquer pour uploader</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>ICO, PNG 32×32 recommandé</div></div>}
          </div>
          <input ref={favRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && upload(e.target.files[0], 'favicon')} />
        </div>
      </div>

      <div style={S.footer}>
        <button onClick={save} disabled={saving || uploading} style={S.btnPrimary}>
          {saving ? '⏳' : '💾'} Enregistrer le thème
        </button>
      </div>
    </div>
  )
}

// ─── Onglet Langue & Région ───────────────────────────────────────────────────
function TabRegion({ config, saving, onSave }: {
  config: EcoleConfig; saving: boolean; onSave: (p: Partial<EcoleConfig>) => Promise<void>
}) {
  const [form, setForm] = useState({
    langue:              config.langue,
    timezone:            config.timezone,
    date_format:         config.date_format,
    session_timeout_min: config.session_timeout_min,
  })
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    await onSave(form)
    setMsg('Paramètres régionaux sauvegardés ✓')
    setTimeout(() => setMsg(null), 3000)
  }

  const f = (label: string, child: React.ReactNode) => (
    <div style={S.field}><label style={S.label}>{label}</label>{child}</div>
  )
  const sel = (val: string, opts: [string,string][], onChange: (v:string)=>void) => (
    <select value={val} onChange={e => onChange(e.target.value)} style={S.select}>
      {opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  return (
    <div style={{ maxWidth: 480 }}>
      {msg && <div style={S.success}>✅ {msg}</div>}
      <div style={S.section}>
        {f('Langue', sel(form.langue, [
          ['fr-FR','Français (France)'], ['fr-BJ','Français (Bénin)'], ['en-US','English (US)'],
        ], v => setForm(f => ({ ...f, langue: v as EcoleConfig['langue'] }))))}
        {f('Fuseau horaire', sel(form.timezone, [
          ['Africa/Porto-Novo','Afrique / Porto-Novo (UTC+1)'],
          ['Africa/Abidjan','Afrique / Abidjan (UTC+0)'],
          ['Africa/Lagos','Afrique / Lagos (UTC+1)'],
          ['Europe/Paris','Europe / Paris (UTC+1/+2)'],
          ['UTC','UTC'],
        ], v => setForm(f => ({ ...f, timezone: v }))))}
        {f('Format de date', sel(form.date_format, [
          ['DD/MM/YYYY','JJ/MM/AAAA — ex : 25/06/2025'],
          ['MM/DD/YYYY','MM/JJ/AAAA — ex : 06/25/2025'],
          ['YYYY-MM-DD','AAAA-MM-JJ — ex : 2025-06-25'],
        ], v => setForm(f => ({ ...f, date_format: v as EcoleConfig['date_format'] }))))}
        {f("Délai d'expiration de session (minutes)", (
          <input type="number" min={15} max={1440} value={form.session_timeout_min}
            onChange={e => setForm(f => ({ ...f, session_timeout_min: Number(e.target.value) }))}
            style={S.input} />
        ))}
      </div>
      <div style={S.footer}>
        <button onClick={save} disabled={saving} style={S.btnPrimary}>
          {saving ? '⏳' : '💾'} Enregistrer
        </button>
      </div>
    </div>
  )
}

// ─── Onglet Rôles & Permissions ───────────────────────────────────────────────
function TabRoles({ ecoleId }: { ecoleId: string | null }) {
  const { roles, permissions, loading, error, modulesList,
          getPermissionsForRole, togglePermission, createRole, deleteRole } = useRoles(ecoleId)
  const [selected, setSelected] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newRole, setNewRole] = useState({ nom: '', code: '', description: '' })
  const [saving, setSaving] = useState(false)

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>
  if (error)   return <div style={S.error}>⚠️ {error}</div>

  const active = roles.find(r => r.id === selected)
  const perms  = selected ? getPermissionsForRole(selected) : new Set<string>()

  async function handleCreate() {
    if (!newRole.nom || !newRole.code) return
    setSaving(true)
    try { await createRole(newRole); setShowCreate(false); setNewRole({ nom: '', code: '', description: '' }) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      {/* Liste rôles */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Rôles ({roles.length})</span>
          <button onClick={() => setShowCreate(true)} style={S.btnSmall}>+ Nouveau</button>
        </div>

        {showCreate && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input placeholder="Nom du rôle" value={newRole.nom}
              onChange={e => setNewRole(f => ({ ...f, nom: e.target.value }))} style={S.input} />
            <input placeholder="code_role" value={newRole.code}
              onChange={e => setNewRole(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g,'_') }))}
              style={{ ...S.input, fontFamily: 'monospace' }} />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={S.btnSmall}>Annuler</button>
              <button onClick={handleCreate} disabled={saving} style={S.btnPrimary}>{saving ? '...' : 'Créer'}</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {roles.map(r => (
            <button key={r.id} onClick={() => setSelected(r.id === selected ? null : r.id)} style={S.roleBtn(r.id === selected)}>
              <div>
                <div style={{ fontSize: 13 }}>{r.nom}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.7 }}>{r.code}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {r.est_systeme && <span style={{ fontSize: 10, background: 'rgba(255,255,255,.2)', padding: '2px 5px', borderRadius: 4 }}>sys</span>}
                {!r.est_systeme && r.id !== selected && (
                  <button onClick={e => { e.stopPropagation(); deleteRole(r.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>×</button>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Matrice permissions */}
      <div style={{ flex: 1 }}>
        {active ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Permissions — {active.nom}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{perms.size} / {permissions.length} permissions accordées</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {modulesList.map(module => {
                const modPerms = permissions.filter(p => p.module === module)
                const allGiven = modPerms.every(p => perms.has(p.id))
                return (
                  <div key={module} style={{ border: '1px solid #f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{MODULE_LABELS[module] ?? module}</span>
                      <button onClick={() => modPerms.forEach(p => { const has = perms.has(p.id); if (allGiven ? has : !has) togglePermission(active.id, p.id, has) })}
                        style={{ ...S.btnSmall, fontSize: 11 }}>{allGiven ? 'Tout retirer' : 'Tout accorder'}</button>
                    </div>
                    <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {modPerms.map(perm => {
                        const has = perms.has(perm.id)
                        return (
                          <button key={perm.id} onClick={() => togglePermission(active.id, perm.id, has)} style={S.permChip(has)}>
                            {has ? '✓' : '○'} {ACTION_LABELS[perm.action] ?? perm.action}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div style={S.empty}>👥<br/>Sélectionnez un rôle pour gérer ses permissions</div>
        )}
      </div>
    </div>
  )
}

// ─── Onglet Sécurité ──────────────────────────────────────────────────────────
function TabSecurity({ config, saving, onSave }: {
  config: EcoleConfig; saving: boolean; onSave: (p: Partial<EcoleConfig>) => Promise<void>
}) {
  const [tfa, setTfa] = useState(config.tfa_required)
  const [ips, setIps] = useState(config.ip_whitelist.join('\n'))
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    await onSave({ tfa_required: tfa, ip_whitelist: ips.split('\n').map(s => s.trim()).filter(Boolean) })
    setMsg('Paramètres de sécurité sauvegardés ✓')
    setTimeout(() => setMsg(null), 3000)
  }

  return (
    <div style={{ maxWidth: 480 }}>
      {msg && <div style={S.success}>✅ {msg}</div>}
      <div style={S.section}>
        <div style={S.sectionTitle}>Authentification</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
          <div onClick={() => setTfa(!tfa)} style={{ width: 44, height: 24, borderRadius: 12, background: tfa ? '#1e3a5f' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: 3, left: tfa ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Double authentification (2FA)</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Exiger un code TOTP à chaque connexion</div>
          </div>
        </div>
      </div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Liste blanche d'adresses IP</div>
        <textarea value={ips} onChange={e => setIps(e.target.value)}
          placeholder={'192.168.1.0/24\n41.217.x.x'} rows={5} style={S.textarea} />
        <div style={{ fontSize: 11, color: '#94a3b8' }}>Vide = aucune restriction. CIDR accepté (ex : 192.168.1.0/24)</div>
      </div>
      <div style={S.footer}>
        <button onClick={save} disabled={saving} style={S.btnPrimary}>{saving ? '⏳' : '💾'} Enregistrer</button>
      </div>
    </div>
  )
}

// ─── Onglet Import / Export ───────────────────────────────────────────────────
function TabImportExport({ ecoleId }: { ecoleId: string | null }) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success'|'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const TYPES = [
    { id: 'etudiants',    label: 'Étudiants',   ico: '🎓', desc: 'Exporter tous les étudiants en CSV' },
    { id: 'enseignants',  label: 'Enseignants',  ico: '👨‍🏫', desc: 'Exporter le corps enseignant'     },
    { id: 'notes',        label: 'Notes',        ico: '📝', desc: 'Exporter les notes par promotion'  },
    { id: 'inscriptions', label: 'Inscriptions', ico: '📋', desc: 'Exporter les inscriptions'        },
  ]

  async function handleExport(type: string) {
    if (!ecoleId) return
    setExporting(type)
    try {
      let rows: Record<string, unknown>[] = []
      if (type === 'etudiants') {
        const { data } = await supabase.from('etudiants')
          .select('nom,prenom,email,telephone,numero_etudiant,statut').eq('ecole_id', ecoleId)
        rows = data ?? []
      } else if (type === 'enseignants') {
        const { data } = await supabase.from('enseignants')
          .select('nom,prenom,email,telephone,specialite,statut').eq('ecole_id', ecoleId)
        rows = data ?? []
      } else if (type === 'inscriptions') {
        const { data } = await supabase.from('inscriptions')
          .select('etudiants(nom,prenom),promotions(nom),annee_academique,statut').eq('ecole_id', ecoleId)
        rows = data ?? []
      }
      if (rows.length === 0) { setMsg({ type: 'error', text: 'Aucune donnée à exporter' }); return }
      const csv = [
        Object.keys(rows[0]).join(','),
        ...rows.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))
      ].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `export_${type}_${new Date().toISOString().slice(0,10)}.csv`; a.click()
      URL.revokeObjectURL(url)
      setMsg({ type: 'success', text: `Export ${type} généré avec succès` })
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message })
    } finally {
      setExporting(null)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  return (
    <div>
      {msg && <div style={msg.type === 'success' ? S.success : S.error}>{msg.type === 'success' ? '✅' : '⚠️'} {msg.text}</div>}
      <div style={S.section}>
        <div style={S.sectionTitle}>Exporter des données</div>
        <div style={S.grid2}>
          {TYPES.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #f1f5f9', borderRadius: 10, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{t.ico}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{t.desc}</div>
                </div>
              </div>
              <button onClick={() => handleExport(t.id)} disabled={exporting === t.id} style={S.btnSecondary}>
                {exporting === t.id ? '⏳' : '⬇️'} CSV
              </button>
            </div>
          ))}
        </div>
      </div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Importer des données</div>
        <div style={{ ...S.info, marginBottom: 0 }}>ℹ️ Téléchargez le modèle CSV avant d'importer pour respecter le format attendu.</div>
        <div style={S.uploadZone} onClick={() => fileRef.current?.click()}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>📤</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Glisser-déposer ou cliquer pour sélectionner</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>CSV, XLSX · max 10 Mo</div>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {['etudiants', 'enseignants'].map(t => (
            <button key={t} style={S.btnSecondary}>⬇️ Modèle {t}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Onglet Journal d'audit ───────────────────────────────────────────────────
function TabAudit({ ecoleId }: { ecoleId: string | null }) {
  const [fModule, setFModule] = useState('')
  const [fAction, setFAction] = useState('')
  const [search,  setSearch]  = useState('')
  const { logs, loading, total, page, setPage, PAGE_SIZE, reload } = useAuditLogs(ecoleId)

  return (
    <div>
      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const }}>
        <select value={fModule} onChange={e => setFModule(e.target.value)} style={{ ...S.select, width: 160 }}>
          <option value="">Tous les modules</option>
          {Object.entries(MODULE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fAction} onChange={e => setFAction(e.target.value)} style={{ ...S.select, width: 160 }}>
          <option value="">Toutes les actions</option>
          {Object.entries(ACTION_LOG).map(([v,{label}]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <input placeholder="Recherche ressource..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...S.input, flex: 1, minWidth: 180 }} />
        <button onClick={() => reload({ module: fModule||undefined, action: fAction||undefined, search: search||undefined })} style={S.btnPrimary}>
          🔍 Filtrer
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
        {total} entrée{total > 1 ? 's' : ''} · Page {page + 1} / {Math.ceil(total / PAGE_SIZE) || 1}
      </div>

      {loading ? (
        <div style={S.centered}><div style={S.spinner} /></div>
      ) : logs.length === 0 ? (
        <div style={S.empty}>📋<br/>Aucun événement enregistré</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>{['Date','Utilisateur','Action','Module','Ressource'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const al = ACTION_LOG[log.action]
                return (
                  <tr key={log.id}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(log.created_at)}</td>
                    <td style={{ ...S.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.user_email ?? '—'}</td>
                    <td style={S.td}>
                      <span style={{ ...al?.color, padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>
                        {al?.label ?? log.action}
                      </span>
                    </td>
                    <td style={S.td}>{MODULE_LABELS[log.module] ?? log.module}</td>
                    <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.ressource_ref ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={S.btnSecondary}>← Précédent</button>
          <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE_SIZE >= total} style={S.btnSecondary}>Suivant →</button>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ParametresPage() {
  const { user } = useAuth()
  const [ecoleId, setEcoleId] = useState<string | null>(user?.ecole_id ?? null)
  useEffect(() => {
    if (user?.ecole_id) { setEcoleId(user.ecole_id); return }
    supabase.from('ecoles').select('id').order('nom').limit(1).maybeSingle()
      .then(({ data }) => { if (data?.id) setEcoleId(data.id) })
  }, [user?.ecole_id])

  const [activeTab, setActiveTab] = useState<TabId>('theme')
  const { config, loading, saving, error, saveConfig, uploadAsset } = useParametres(ecoleId)

  if (loading) return <div style={S.centered}><div style={S.spinner} /></div>

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>⚙️ Paramètres Avancés</h1>
          <p style={S.sub}>Configuration de l'établissement · Rôles · Sécurité · Audit</p>
        </div>
      </div>

      {error && <div style={S.error}>⚠️ {error}</div>}

      <div style={S.layout}>
        {/* Sidebar */}
        <nav style={S.sidebar}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={S.tabBtn(activeTab === tab.id)}>
              <span>{tab.ico}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Contenu */}
        <div style={S.card}>
          {activeTab === 'theme'    && <TabTheme    config={config} saving={saving} onSave={saveConfig} onUpload={uploadAsset} />}
          {activeTab === 'region'   && <TabRegion   config={config} saving={saving} onSave={saveConfig} />}
          {activeTab === 'roles'    && <TabRoles    ecoleId={ecoleId} />}
          {activeTab === 'security' && <TabSecurity config={config} saving={saving} onSave={saveConfig} />}
          {activeTab === 'import'   && <TabImportExport ecoleId={ecoleId} />}
          {activeTab === 'audit'    && <TabAudit    ecoleId={ecoleId} />}
        </div>
      </div>
    </div>
  )
}
