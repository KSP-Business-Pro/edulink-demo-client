// src/hooks/useParametres.ts
// B5.1 — Hook principal pour les paramètres avancés

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'

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
  langue: 'fr-FR' | 'fr-BJ' | 'en-US'
  timezone: string
  date_format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  session_timeout_min: number
  tfa_required: boolean
  ip_whitelist: string[]
  smtp: Partial<SmtpConfig>
}

export const DEFAULT_CONFIG: EcoleConfig = {
  theme: {
    primary:    '#1a56db',
    secondary:  '#1e429f',
    accent:     '#fdba8c',
    background: '#f9fafb',
  },
  logo_url:            '',
  favicon_url:         '',
  langue:              'fr-FR',
  timezone:            'Africa/Porto-Novo',
  date_format:         'DD/MM/YYYY',
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
  const [config, setConfig] = useState<EcoleConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Charger la config de l'école
  const loadConfig = useCallback(async () => {
    if (!ecoleId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('ecoles')
        .select('config')
        .eq('id', ecoleId)
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
        .from('ecoles')
        .update({ config: newConfig })
        .eq('id', ecoleId)
      if (err) throw err
      setConfig(newConfig)
      // Audit log
      await supabase.rpc('fn_audit_log', {
        p_ecole_id:      ecoleId,
        p_action:        'UPDATE',
        p_module:        'parametres',
        p_ressource_ref: 'Configuration école',
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
    type: 'logo' | 'favicon'
  ): Promise<string> => {
    if (!ecoleId) throw new Error('Aucune école sélectionnée')
    const ext = file.name.split('.').pop()
    const path = `${ecoleId}/${type}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('ecole-assets')
      .upload(path, file, { upsert: true })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('ecole-assets').getPublicUrl(path)
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
        supabase.from('roles').select('*').order('est_systeme', { ascending: false }),
        supabase.from('permissions').select('*').order('module').order('action'),
        supabase.from('role_permissions').select('*'),
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
      await supabase.from('role_permissions').delete()
        .eq('role_id', roleId).eq('permission_id', permissionId)
      setRolePermissions(prev =>
        prev.filter(rp => !(rp.role_id === roleId && rp.permission_id === permissionId))
      )
    } else {
      await supabase.from('role_permissions').insert({ role_id: roleId, permission_id: permissionId })
      setRolePermissions(prev => [...prev, { role_id: roleId, permission_id: permissionId }])
    }
  }, [])

  const createRole = useCallback(async (data: {
    nom: string; code: string; description?: string
  }) => {
    if (!ecoleId) return
    const { data: created, error: err } = await supabase
      .from('roles')
      .insert({ ...data, ecole_id: ecoleId, est_systeme: false })
      .select()
      .single()
    if (err) throw err
    setRoles(prev => [...prev, created])
    return created
  }, [ecoleId])

  const deleteRole = useCallback(async (roleId: string) => {
    const { error: err } = await supabase.from('roles').delete().eq('id', roleId)
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
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

      if (ecoleId) q = q.eq('ecole_id', ecoleId)
      if (opts?.module) q = q.eq('module', opts.module)
      if (opts?.action) q = q.eq('action', opts.action)
      if (opts?.search) q = q.ilike('ressource_ref', `%${opts.search}%`)

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
