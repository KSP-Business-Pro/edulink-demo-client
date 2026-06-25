# ============================================================
# B5.1 — Ecriture directe des fichiers source
# Exécuter depuis : C:\Dev\edulink-demo-client\
# ============================================================
Set-Location "C:\Dev\edulink-demo-client"

# ── useParametres.ts ─────────────────────────────────────────
Write-Host ">> Ecriture src\hooks\useParametres.ts..." -ForegroundColor Cyan

$hookContent = @'
// src/hooks/useParametres.ts
// B5.1 — Hook principal pour les paramètres avancés

import { useState, useEffect, useCallback } from ''react''
import { supabase } from ''../../services/supabase''
import { useAuth } from ''./useAuth''

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeConfig {
  primary: string
  secondary: string
  accent: string
  background: string
}

export interface SmtpConfig {
  host: string
  port: number
  user: string
  from_name: string
  from_email: string
  secure: boolean
}

export interface EcoleConfig {
  theme: ThemeConfig
  logo_url: string
  favicon_url: string
  langue: ''fr-FR'' | ''fr-BJ'' | ''en-US''
  timezone: string
  date_format: ''DD/MM/YYYY'' | ''MM/DD/YYYY'' | ''YYYY-MM-DD''
  session_timeout_min: number
  tfa_required: boolean
  ip_whitelist: string[]
  smtp: Partial<SmtpConfig>
}

export const DEFAULT_CONFIG: EcoleConfig = {
  theme: {
    primary:    ''#1a56db'',
    secondary:  ''#1e429f'',
    accent:     ''#fdba8c'',
    background: ''#f9fafb'',
  },
  logo_url:            '''',
  favicon_url:         '''',
  langue:              ''fr-FR'',
  timezone:            ''Africa/Porto-Novo'',
  date_format:         ''DD/MM/YYYY'',
  session_timeout_min: 60,
  tfa_required:        false,
  ip_whitelist:        [],
  smtp:                {},
}

export interface Role {
  id: string
  ecole_id: string | null
  nom: string
  code: string
  description: string | null
  est_systeme: boolean
}

export interface Permission {
  id: string
  module: string
  action: string
  description: string | null
}

export interface RolePermission {
  role_id: string
  permission_id: string
}

export interface AuditLog {
  id: string
  ecole_id: string | null
  user_email: string | null
  action: string
  module: string
  ressource_ref: string | null
  avant: Record<string, unknown> | null
  apres: Record<string, unknown> | null
  created_at: string
}

// ─── Hook useParametres ───────────────────────────────────────────────────────

export function useParametres(ecoleId: string | null) {
  const { user } = useAuth()
  const [config, setConfig] = useState<EcoleConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Charger la config de l''école
  const loadConfig = useCallback(async () => {
    if (!ecoleId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from(''ecoles'')
        .select(''config'')
        .eq(''id'', ecoleId)
        .single()
      if (err) throw err
      const merged = { ...DEFAULT_CONFIG, ...((data?.config as Partial<EcoleConfig>) ?? {}) }
      merged.theme = { ...DEFAULT_CONFIG.theme, ...(merged.theme ?? {}) }
      setConfig(merged)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [ecoleId])

  useEffect(() => { loadConfig() }, [loadConfig])

  // Sauvegarder la config
  const saveConfig = useCallback(async (patch: Partial<EcoleConfig>) => {
    if (!ecoleId) return
    setSaving(true)
    setError(null)
    const newConfig = { ...config, ...patch }
    try {
      const { error: err } = await supabase
        .from(''ecoles'')
        .update({ config: newConfig })
        .eq(''id'', ecoleId)
      if (err) throw err
      setConfig(newConfig)
      // Audit log
      await supabase.rpc(''fn_audit_log'', {
        p_ecole_id:      ecoleId,
        p_action:        ''UPDATE'',
        p_module:        ''parametres'',
        p_ressource_ref: ''Configuration école'',
        p_avant:         config as unknown as Record<string, unknown>,
        p_apres:         newConfig as unknown as Record<string, unknown>,
      })
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setSaving(false)
    }
  }, [ecoleId, config])

  // Upload logo/favicon
  const uploadAsset = useCallback(async (
    file: File,
    type: ''logo'' | ''favicon''
  ): Promise<string> => {
    if (!ecoleId) throw new Error(''Aucune école sélectionnée'')
    const ext = file.name.split(''.'').pop()
    const path = `${ecoleId}/${type}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(''ecole-assets'')
      .upload(path, file, { upsert: true })
    if (upErr) throw upErr
    const { data } = supabase.storage.from(''ecole-assets'').getPublicUrl(path)
    return data.publicUrl
  }, [ecoleId])

  return {
    config, loading, saving, error,
    saveConfig, uploadAsset, reload: loadConfig,
  }
}

// ─── Hook useRoles ────────────────────────────────────────────────────────────

export function useRoles(ecoleId: string | null) {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [rolesRes, permsRes, rpRes] = await Promise.all([
        supabase.from(''roles'').select(''*'').order(''est_systeme'', { ascending: false }),
        supabase.from(''permissions'').select(''*'').order(''module'').order(''action''),
        supabase.from(''role_permissions'').select(''*''),
      ])
      if (rolesRes.error) throw rolesRes.error
      if (permsRes.error) throw permsRes.error
      if (rpRes.error)    throw rpRes.error
      setRoles(rolesRes.data ?? [])
      setPermissions(permsRes.data ?? [])
      setRolePermissions(rpRes.data ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const togglePermission = useCallback(async (
    roleId: string, permissionId: string, hasIt: boolean
  ) => {
    if (hasIt) {
      await supabase.from(''role_permissions'').delete()
        .eq(''role_id'', roleId).eq(''permission_id'', permissionId)
      setRolePermissions(prev =>
        prev.filter(rp => !(rp.role_id === roleId && rp.permission_id === permissionId))
      )
    } else {
      await supabase.from(''role_permissions'').insert({ role_id: roleId, permission_id: permissionId })
      setRolePermissions(prev => [...prev, { role_id: roleId, permission_id: permissionId }])
    }
  }, [])

  const createRole = useCallback(async (data: {
    nom: string; code: string; description?: string
  }) => {
    if (!ecoleId) return
    const { data: created, error: err } = await supabase
      .from(''roles'')
      .insert({ ...data, ecole_id: ecoleId, est_systeme: false })
      .select()
      .single()
    if (err) throw err
    setRoles(prev => [...prev, created])
    return created
  }, [ecoleId])

  const deleteRole = useCallback(async (roleId: string) => {
    const { error: err } = await supabase.from(''roles'').delete().eq(''id'', roleId)
    if (err) throw err
    setRoles(prev => prev.filter(r => r.id !== roleId))
  }, [])

  const getPermissionsForRole = useCallback((roleId: string): Set<string> => {
    return new Set(
      rolePermissions.filter(rp => rp.role_id === roleId).map(rp => rp.permission_id)
    )
  }, [rolePermissions])

  const modulesList = [...new Set(permissions.map(p => p.module))].sort()

  return {
    roles, permissions, rolePermissions, loading, error,
    modulesList, getPermissionsForRole,
    togglePermission, createRole, deleteRole, reload: loadAll,
  }
}

// ─── Hook useAuditLogs ────────────────────────────────────────────────────────

export function useAuditLogs(ecoleId: string | null) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const loadLogs = useCallback(async (opts?: {
    module?: string; action?: string; search?: string; page?: number
  }) => {
    const p = opts?.page ?? page
    setLoading(true)
    try {
      let q = supabase
        .from(''audit_logs'')
        .select(''*'', { count: ''exact'' })
        .order(''created_at'', { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

      if (ecoleId) q = q.eq(''ecole_id'', ecoleId)
      if (opts?.module) q = q.eq(''module'', opts.module)
      if (opts?.action) q = q.eq(''action'', opts.action)
      if (opts?.search) q = q.ilike(''ressource_ref'', `%${opts.search}%`)

      const { data, count, error: err } = await q
      if (err) throw err
      setLogs(data ?? [])
      setTotal(count ?? 0)
    } finally {
      setLoading(false)
    }
  }, [ecoleId, page])

  useEffect(() => { loadLogs() }, [loadLogs])

  return { logs, loading, total, page, setPage, PAGE_SIZE, reload: loadLogs }
}

'@

[System.IO.File]::WriteAllText(
  "$PWD\src\hooks\useParametres.ts",
  $hookContent,
  [System.Text.Encoding]::UTF8
)
Write-Host "   OK" -ForegroundColor Green

# ── modules/parametres/index.tsx ─────────────────────────────
Write-Host ">> Ecriture src\modules\parametres\index.tsx..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "src\modules\parametres" -Force | Out-Null

$pageContent = @'
// src/pages/ParametresPage.tsx
// B5.1 — Page Paramètres Avancés

import { useState, useRef } from ''react''
import {
  Settings, Palette, Globe, Shield, Users, Download, Upload,
  ScrollText, Save, RefreshCw, Eye, EyeOff, Plus, Trash2,
  CheckSquare, Square, Building2, AlertCircle, Info
} from ''lucide-react''
import {
  useParametres, useRoles, useAuditLogs,
  DEFAULT_CONFIG, type EcoleConfig, type ThemeConfig,
} from ''../hooks/useParametres''
import { useEcole } from ''../hooks/useEcole''

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECTION_TABS = [
  { id: ''theme'',    label: ''Thème & Logo'',        icon: Palette    },
  { id: ''region'',   label: ''Langue & Région'',      icon: Globe      },
  { id: ''roles'',    label: ''Rôles & Permissions'',  icon: Users      },
  { id: ''security'', label: ''Sécurité'',             icon: Shield     },
  { id: ''import'',   label: ''Import / Export'',      icon: Download   },
  { id: ''audit'',    label: "Journal d''audit",       icon: ScrollText },
] as const

type TabId = typeof SECTION_TABS[number][''id'']

const MODULE_LABELS: Record<string, string> = {
  inscriptions:    ''Inscriptions'',
  notes:           ''Notes'',
  presences:       ''Présences'',
  deliberations:   ''Délibérations'',
  emploi_du_temps: ''Emploi du temps'',
  rh:              ''RH & Personnel'',
  finances:        ''Finances'',
  parametres:      ''Paramètres'',
  analytics:       ''Analytics'',
  users:           ''Utilisateurs'',
}

const ACTION_LABELS: Record<string, string> = {
  read: ''Lecture'', write: ''Écriture'', delete: ''Suppression'',
  export: ''Export'', validate: ''Validation'',
}

const ACTION_LOG_LABELS: Record<string, { label: string; color: string }> = {
  CREATE: { label: ''Création'',     color: ''text-green-700 bg-green-50'' },
  UPDATE: { label: ''Modification'', color: ''text-blue-700 bg-blue-50''   },
  DELETE: { label: ''Suppression'',  color: ''text-red-700 bg-red-50''     },
  LOGIN:  { label: ''Connexion'',    color: ''text-gray-700 bg-gray-100''  },
  EXPORT: { label: ''Export'',       color: ''text-orange-700 bg-orange-50''},
  IMPORT: { label: ''Import'',       color: ''text-purple-700 bg-purple-50''},
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(''fr-FR'', {
    day: ''2-digit'', month: ''2-digit'', year: ''numeric'',
    hour: ''2-digit'', minute: ''2-digit'',
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorInput({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="#1a56db"
        />
      </div>
    </div>
  )
}

function Alert({ type, msg }: { type: ''error'' | ''success'' | ''info''; msg: string }) {
  const styles = {
    error:   ''bg-red-50 border-red-200 text-red-800'',
    success: ''bg-green-50 border-green-200 text-green-800'',
    info:    ''bg-blue-50 border-blue-200 text-blue-800'',
  }
  const Icon = type === ''info'' ? Info : AlertCircle
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${styles[type]}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  )
}

// ─── Onglet Thème & Logo ──────────────────────────────────────────────────────

function TabTheme({
  config, saving, onSave, onUpload,
}: {
  config: EcoleConfig
  saving: boolean
  onSave: (p: Partial<EcoleConfig>) => Promise<void>
  onUpload: (f: File, t: ''logo'' | ''favicon'') => Promise<string>
}) {
  const [theme, setTheme] = useState<ThemeConfig>({ ...config.theme })
  const [logoUrl, setLogoUrl] = useState(config.logo_url)
  const [faviconUrl, setFaviconUrl] = useState(config.favicon_url)
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const favRef  = useRef<HTMLInputElement>(null)

  async function handleFileUpload(file: File, type: ''logo'' | ''favicon'') {
    setUploading(true)
    try {
      const url = await onUpload(file, type)
      if (type === ''logo'') setLogoUrl(url)
      else setFaviconUrl(url)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    await onSave({ theme, logo_url: logoUrl, favicon_url: faviconUrl })
    setFeedback(''Thème sauvegardé avec succès'')
    setTimeout(() => setFeedback(null), 3000)
  }

  return (
    <div className="space-y-6">
      {feedback && <Alert type="success" msg={feedback} />}

      {/* Aperçu thème */}
      <div className="rounded-xl overflow-hidden border border-gray-200">
        <div
          className="h-24 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 object-contain drop-shadow-md" />
          ) : (
            <div className="flex items-center gap-3">
              <Building2 className="w-10 h-10 text-white/80" />
              <span className="text-white font-bold text-xl tracking-wide">EduLink Sup</span>
            </div>
          )}
        </div>
        <div className="px-4 py-3 bg-white flex items-center gap-3 text-sm text-gray-500">
          <span>Aperçu de la barre de navigation</span>
          <div className="flex gap-1.5 ml-auto">
            {[theme.primary, theme.secondary, theme.accent, theme.background].map((c, i) => (
              <div key={i} className="w-5 h-5 rounded-full border border-gray-200" style={{ background: c }} title={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Couleurs */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Palette de couleurs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorInput label="Couleur primaire"    value={theme.primary}    onChange={v => setTheme(t => ({ ...t, primary: v }))}    />
          <ColorInput label="Couleur secondaire"  value={theme.secondary}  onChange={v => setTheme(t => ({ ...t, secondary: v }))}  />
          <ColorInput label="Couleur d''accentuation" value={theme.accent}  onChange={v => setTheme(t => ({ ...t, accent: v }))}     />
          <ColorInput label="Arrière-plan"         value={theme.background} onChange={v => setTheme(t => ({ ...t, background: v }))} />
        </div>
        <button
          onClick={() => setTheme(DEFAULT_CONFIG.theme)}
          className="mt-3 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Réinitialiser les couleurs par défaut
        </button>
      </div>

      {/* Logo & Favicon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Logo de l''école</h3>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
            onClick={() => logoRef.current?.click()}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-16 mx-auto object-contain" />
            ) : (
              <div className="py-4">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Cliquer pour uploader</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG • max 5 Mo</p>
              </div>
            )}
          </div>
          <input
            ref={logoRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], ''logo'')}
          />
          {logoUrl && (
            <button onClick={() => setLogoUrl('''')} className="mt-2 text-xs text-red-500 hover:text-red-700">
              Supprimer le logo
            </button>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Favicon</h3>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
            onClick={() => favRef.current?.click()}
          >
            {faviconUrl ? (
              <img src={faviconUrl} alt="Favicon" className="w-12 h-12 mx-auto object-contain" />
            ) : (
              <div className="py-4">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Cliquer pour uploader</p>
                <p className="text-xs text-gray-400 mt-1">ICO, PNG 32×32 recommandé</p>
              </div>
            )}
          </div>
          <input
            ref={favRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], ''favicon'')}
          />
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer le thème
        </button>
      </div>
    </div>
  )
}

// ─── Onglet Langue & Région ───────────────────────────────────────────────────

function TabRegion({
  config, saving, onSave,
}: {
  config: EcoleConfig
  saving: boolean
  onSave: (p: Partial<EcoleConfig>) => Promise<void>
}) {
  const [form, setForm] = useState({
    langue:              config.langue,
    timezone:            config.timezone,
    date_format:         config.date_format,
    session_timeout_min: config.session_timeout_min,
  })
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSave() {
    await onSave(form)
    setFeedback(''Paramètres régionaux sauvegardés'')
    setTimeout(() => setFeedback(null), 3000)
  }

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )

  const sel = (val: string, opts: [string, string][], onChange: (v: string) => void) => (
    <select
      value={val}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    >
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  return (
    <div className="space-y-6 max-w-lg">
      {feedback && <Alert type="success" msg={feedback} />}

      {field(''Langue'', sel(form.langue, [
        [''fr-FR'', ''Français (France)''],
        [''fr-BJ'', ''Français (Bénin)''],
        [''en-US'', ''English (US)''],
      ], v => setForm(f => ({ ...f, langue: v as EcoleConfig[''langue''] }))))}

      {field(''Fuseau horaire'', sel(form.timezone, [
        [''Africa/Porto-Novo'', ''Afrique / Porto-Novo (UTC+1)''],
        [''Africa/Abidjan'',    ''Afrique / Abidjan (UTC+0)''],
        [''Africa/Lagos'',      ''Afrique / Lagos (UTC+1)''],
        [''Europe/Paris'',      ''Europe / Paris (UTC+1/+2)''],
        [''UTC'',               ''UTC''],
      ], v => setForm(f => ({ ...f, timezone: v }))))}

      {field(''Format de date'', sel(form.date_format, [
        [''DD/MM/YYYY'', ''JJ/MM/AAAA — ex : 25/06/2025''],
        [''MM/DD/YYYY'', ''MM/JJ/AAAA — ex : 06/25/2025''],
        [''YYYY-MM-DD'', ''AAAA-MM-JJ — ex : 2025-06-25''],
      ], v => setForm(f => ({ ...f, date_format: v as EcoleConfig[''date_format''] }))))}

      {field(''Délai d\''expiration de session (minutes)'', (
        <input
          type="number" min={15} max={1440}
          value={form.session_timeout_min}
          onChange={e => setForm(f => ({ ...f, session_timeout_min: Number(e.target.value) }))}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ))}

      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <button
          onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </div>
    </div>
  )
}

// ─── Onglet Rôles & Permissions ───────────────────────────────────────────────

function TabRoles({ ecoleId }: { ecoleId: string | null }) {
  const { roles, permissions, loading, error, modulesList,
          getPermissionsForRole, togglePermission, createRole, deleteRole }
    = useRoles(ecoleId)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newRole, setNewRole] = useState({ nom: '''', code: '''', description: '''' })
  const [saving, setSaving] = useState(false)

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-blue-600" /></div>
  if (error)   return <Alert type="error" msg={error} />

  const activeRole = roles.find(r => r.id === selectedRole)
  const rolePerms = selectedRole ? getPermissionsForRole(selectedRole) : new Set<string>()

  async function handleCreateRole() {
    if (!newRole.nom || !newRole.code) return
    setSaving(true)
    try {
      await createRole(newRole)
      setShowCreate(false)
      setNewRole({ nom: '''', code: '''', description: '''' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Liste des rôles */}
      <div className="lg:col-span-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Rôles ({roles.length})</h3>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
          >
            <Plus className="w-3 h-3" /> Nouveau
          </button>
        </div>

        {showCreate && (
          <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
            <input
              placeholder="Nom du rôle"
              value={newRole.nom}
              onChange={e => setNewRole(f => ({ ...f, nom: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Code (ex: comptable)"
              value={newRole.code}
              onChange={e => setNewRole(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, ''_'') }))}
              className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <input
              placeholder="Description (optionnel)"
              value={newRole.description}
              onChange={e => setNewRole(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-800">Annuler</button>
              <button onClick={handleCreateRole} disabled={saving} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? ''...'' : ''Créer''}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {roles.map(role => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.id === selectedRole ? null : role.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                selectedRole === role.id
                  ? ''bg-blue-600 border-blue-700 text-white''
                  : ''bg-white border-gray-200 text-gray-700 hover:border-blue-300''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{role.nom}</div>
                  <div className={`text-xs font-mono ${selectedRole === role.id ? ''text-blue-200'' : ''text-gray-400''}`}>
                    {role.code}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {role.est_systeme && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${selectedRole === role.id ? ''bg-blue-500 text-blue-100'' : ''bg-gray-100 text-gray-500''}`}>
                      Système
                    </span>
                  )}
                  {!role.est_systeme && selectedRole !== role.id && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteRole(role.id) }}
                      className="text-red-400 hover:text-red-600 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Matrice permissions */}
      <div className="lg:col-span-2">
        {activeRole ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Permissions — {activeRole.nom}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {activeRole.est_systeme ? ''Rôle système — modifications autorisées'' : ''Rôle personnalisé''}
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
                {rolePerms.size} / {permissions.length}
              </span>
            </div>

            <div className="space-y-4">
              {modulesList.map(module => {
                const modPerms = permissions.filter(p => p.module === module)
                const allGranted = modPerms.every(p => rolePerms.has(p.id))
                return (
                  <div key={module} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                      <span className="text-sm font-medium text-gray-700">
                        {MODULE_LABELS[module] ?? module}
                      </span>
                      <button
                        onClick={() => modPerms.forEach(p => {
                          const has = rolePerms.has(p.id)
                          if (allGranted ? has : !has) togglePermission(activeRole.id, p.id, has)
                        })}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {allGranted ? ''Tout retirer'' : ''Tout accorder''}
                      </button>
                    </div>
                    <div className="p-3 flex flex-wrap gap-2">
                      {modPerms.map(perm => {
                        const has = rolePerms.has(perm.id)
                        return (
                          <button
                            key={perm.id}
                            onClick={() => togglePermission(activeRole.id, perm.id, has)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              has
                                ? ''bg-green-50 border-green-200 text-green-700 hover:bg-green-100''
                                : ''bg-white border-gray-200 text-gray-500 hover:border-blue-300''
                            }`}
                          >
                            {has ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            {ACTION_LABELS[perm.action] ?? perm.action}
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
          <div className="flex flex-col items-center justify-center h-full py-16 text-gray-400">
            <Users className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">Sélectionnez un rôle pour gérer ses permissions</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Onglet Sécurité ──────────────────────────────────────────────────────────

function TabSecurity({
  config, saving, onSave,
}: {
  config: EcoleConfig
  saving: boolean
  onSave: (p: Partial<EcoleConfig>) => Promise<void>
}) {
  const [tfa, setTfa]       = useState(config.tfa_required)
  const [ips, setIps]       = useState(config.ip_whitelist.join(''\n''))
  const [showSmtp, setShowSmtp] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSave() {
    await onSave({
      tfa_required:  tfa,
      ip_whitelist:  ips.split(''\n'').map(s => s.trim()).filter(Boolean),
    })
    setFeedback(''Paramètres de sécurité sauvegardés'')
    setTimeout(() => setFeedback(null), 3000)
  }

  return (
    <div className="space-y-6 max-w-lg">
      {feedback && <Alert type="success" msg={feedback} />}

      <div className="p-4 border border-gray-200 rounded-xl space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Authentification</h3>
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative mt-0.5">
            <input type="checkbox" checked={tfa} onChange={e => setTfa(e.target.checked)} className="sr-only" />
            <div
              onClick={() => setTfa(!tfa)}
              className={`w-10 h-5 rounded-full transition-colors ${tfa ? ''bg-blue-600'' : ''bg-gray-300''}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm m-0.5 transition-transform ${tfa ? ''translate-x-5'' : ''translate-x-0''}`} />
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-700">Double authentification (2FA)</div>
            <div className="text-xs text-gray-500">Exiger un code TOTP à chaque connexion</div>
          </div>
        </label>
      </div>

      <div className="p-4 border border-gray-200 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Liste blanche d''adresses IP</h3>
          <span className="text-xs text-gray-400">Une IP par ligne</span>
        </div>
        <textarea
          value={ips}
          onChange={e => setIps(e.target.value)}
          placeholder={"192.168.1.0/24\n41.217.x.x"}
          rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <p className="text-xs text-gray-400">
          Vide = aucune restriction. CIDR accepté (ex : 192.168.1.0/24)
        </p>
      </div>

      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <button
          onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </div>
    </div>
  )
}

// ─── Onglet Import / Export ───────────────────────────────────────────────────

function TabImportExport({ ecoleId }: { ecoleId: string | null }) {
  const [importing, setImporting] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: ''success'' | ''error''; msg: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [currentExportType, setCurrentExportType] = useState<string>('''')


  const EXPORT_TYPES = [
    { id: ''etudiants'',   label: ''Étudiants'',    icon: ''🎓'', desc: ''Exporter tous les étudiants en CSV'' },
    { id: ''enseignants'', label: ''Enseignants'',   icon: ''👨‍🏫'', desc: ''Exporter le corps enseignant''      },
    { id: ''notes'',       label: ''Notes'',         icon: ''📝'', desc: ''Exporter les notes par promotion''  },
    { id: ''inscriptions'',label: ''Inscriptions'',  icon: ''📋'', desc: ''Exporter les inscriptions''         },
  ]

  async function handleExport(type: string) {
    setExporting(type)
    // Simulation — dans la vraie implémentation, appel Supabase + génération CSV
    await new Promise(r => setTimeout(r, 1500))
    setExporting(null)
    setFeedback({ type: ''success'', msg: `Export ${type} généré avec succès` })
    setTimeout(() => setFeedback(null), 4000)
  }

  return (
    <div className="space-y-6">
      {feedback && <Alert type={feedback.type} msg={feedback.msg} />}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Exporter des données</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXPORT_TYPES.map(t => (
            <div key={t.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <div className="text-sm font-medium text-gray-700">{t.label}</div>
                  <div className="text-xs text-gray-500">{t.desc}</div>
                </div>
              </div>
              <button
                onClick={() => handleExport(t.id)}
                disabled={exporting === t.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 transition-colors"
              >
                {exporting === t.id
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                CSV
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Importer des données</h3>
        <p className="text-xs text-gray-500 mb-4">
          Formats acceptés : CSV (UTF-8). Téléchargez le modèle correspondant avant d''importer.
        </p>
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">Glisser-déposer ou cliquer pour sélectionner</p>
          <p className="text-xs text-gray-400 mt-1">CSV, XLSX · max 10 Mo</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" />
        <div className="mt-3 flex gap-3 flex-wrap">
          {[''etudiants'', ''enseignants''].map(t => (
            <button key={t} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-blue-300 hover:text-blue-600 flex items-center gap-1.5">
              <Download className="w-3 h-3" />
              Modèle {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Onglet Journal d''audit ───────────────────────────────────────────────────

function TabAudit({ ecoleId }: { ecoleId: string | null }) {
  const [filterModule, setFilterModule] = useState('''')
  const [filterAction, setFilterAction] = useState('''')
  const [search, setSearch] = useState('''')
  const { logs, loading, total, page, setPage, PAGE_SIZE, reload } = useAuditLogs(ecoleId)

  const MODULES = ['''', ''inscriptions'', ''notes'', ''presences'', ''deliberations'', ''parametres'', ''users'', ''rh'', ''finances'']
  const ACTIONS = ['''', ''CREATE'', ''UPDATE'', ''DELETE'', ''LOGIN'', ''EXPORT'', ''IMPORT'']

  function handleFilter() {
    reload({ module: filterModule || undefined, action: filterAction || undefined, search: search || undefined })
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Module</label>
          <select
            value={filterModule}
            onChange={e => setFilterModule(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {MODULES.map(m => <option key={m} value={m}>{m ? (MODULE_LABELS[m] ?? m) : ''Tous les modules''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action</label>
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {ACTIONS.map(a => <option key={a} value={a}>{a ? (ACTION_LOG_LABELS[a]?.label ?? a) : ''Toutes les actions''}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs text-gray-500 mb-1">Recherche</label>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Ressource, email..."
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleFilter}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Filtrer
        </button>
      </div>

      {/* Compteur */}
      <div className="text-xs text-gray-500">
        {total} entrée{total > 1 ? ''s'' : ''''} · Page {page + 1} / {Math.ceil(total / PAGE_SIZE) || 1}
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aucun événement enregistré</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[''Date'', ''Utilisateur'', ''Action'', ''Module'', ''Ressource''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => {
                const actionStyle = ACTION_LOG_LABELS[log.action]
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                      {fmtDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 max-w-xs truncate">
                      {log.user_email ?? ''—''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${actionStyle?.color ?? ''bg-gray-100 text-gray-600''}`}>
                        {actionStyle?.label ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {MODULE_LABELS[log.module] ?? log.module}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">
                      {log.ressource_ref ?? ''—''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-blue-300"
          >
            ← Précédent
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= total}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-blue-300"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ParametresPage() {
  const { ecoleId } = useEcole()
  const [activeTab, setActiveTab] = useState<TabId>(''theme'')
  const { config, loading, saving, error, saveConfig, uploadAsset } = useParametres(ecoleId)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-600" />
            Paramètres Avancés
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configuration de l''établissement · Rôles · Sécurité · Audit
          </p>
        </div>
      </div>

      {error && <Alert type="error" msg={error} />}

      {/* Layout : sidebar tabs + contenu */}
      <div className="flex gap-6">
        {/* Sidebar navigation */}
        <nav className="w-52 flex-shrink-0 space-y-1">
          {SECTION_TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? ''bg-blue-600 text-white shadow-sm''
                    : ''text-gray-600 hover:bg-gray-100''
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* Contenu */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          {activeTab === ''theme''    && <TabTheme    config={config} saving={saving} onSave={saveConfig} onUpload={uploadAsset} />}
          {activeTab === ''region''   && <TabRegion   config={config} saving={saving} onSave={saveConfig} />}
          {activeTab === ''roles''    && <TabRoles    ecoleId={ecoleId} />}
          {activeTab === ''security'' && <TabSecurity config={config} saving={saving} onSave={saveConfig} />}
          {activeTab === ''import''   && <TabImportExport ecoleId={ecoleId} />}
          {activeTab === ''audit''    && <TabAudit    ecoleId={ecoleId} />}
        </div>
      </div>
    </div>
  )
}

'@

[System.IO.File]::WriteAllText(
  "$PWD\src\modules\parametres\index.tsx",
  $pageContent,
  [System.Text.Encoding]::UTF8
)
Write-Host "   OK" -ForegroundColor Green

# ── TypeScript check + deploy ─────────────────────────────────
Write-Host "`n>> TypeScript check..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERREUR TypeScript" -ForegroundColor Red
  exit 1
}
Write-Host "   OK" -ForegroundColor Green

git add -A
git commit -m "feat(B5.1): add useParametres hook + parametres module"
npx vercel --prod
Write-Host "`n✅ Deploye" -ForegroundColor Green
