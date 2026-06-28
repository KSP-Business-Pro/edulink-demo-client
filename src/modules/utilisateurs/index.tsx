// src/modules/utilisateurs/index.tsx
// B5.2 — Gestion Utilisateurs — inline styles (pattern projet)

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabase'
import type { UserRole, UtilisateurRow } from '../../types/auth.types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UtilisateurComplet extends UtilisateurRow {
  email: string
  ecole_nom?: string
  last_sign_in?: string
}

interface FormData {
  email:    string
  nom:      string
  prenom:   string
  role:     UserRole
  ecole_id: string | null
  actif:    boolean
  password: string
}

const FORM_INIT: FormData = {
  email: '', nom: '', prenom: '', role: 'scolarite',
  ecole_id: null, actif: true, password: '',
}

const ROLES: UserRole[] = ['admin','scolarite','enseignant','etudiant','parent','comptable','direction']

const ROLE_LABELS: Record<UserRole, string> = {
  admin:      'Administrateur',
  scolarite:  'Scolarité',
  enseignant: 'Enseignant',
  etudiant:   'Étudiant',
  parent:     'Parent',
  comptable:  'Comptable',
  direction:  'Direction',
  anon:       'Anonyme',
}

const ROLE_COLORS: Record<string, React.CSSProperties> = {
  admin:      { background: '#ede9fe', color: '#4c1d95' },
  scolarite:  { background: '#dbeafe', color: '#1e40af' },
  enseignant: { background: '#d1fae5', color: '#065f46' },
  etudiant:   { background: '#fef9c3', color: '#713f12' },
  parent:     { background: '#fff7ed', color: '#9a3412' },
  comptable:  { background: '#fce7f3', color: '#831843' },
  direction:  { background: '#e0f2fe', color: '#0c4a6e' },
  anon:       { background: '#f1f5f9', color: '#475569' },
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:         { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:           { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:          { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  filters:      { display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' as const },
  filterInput:  { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', flex: 1, minWidth: 180, fontFamily: 'inherit', background: '#fafafa' } as React.CSSProperties,
  filterSelect: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  errorBanner:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  successBanner:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  tableWrap:    { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:        { width: '100%', borderCollapse: 'collapse' as const },
  thead:        { background: '#f8fafc' },
  th:           { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  td:           { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const, borderBottom: '1px solid #f9fafb' } as React.CSSProperties,
  centered:     { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:      { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:        { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  btnPrimary:   { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary: { padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger:    { padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnGhost:     { padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
  pagination:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '8px 0' } as React.CSSProperties,
  overlay:      { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:        { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  modalTitle:   { fontSize: 17, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  modalBody:    { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  modalFooter:  { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  field:        { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label:        { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' } as React.CSSProperties,
  input:        { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa' } as React.CSSProperties,
  select:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fff' } as React.CSSProperties,
  grid2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  closeBtn:     { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, padding: 4 } as React.CSSProperties,
  avatarCircle: (role: string): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0,
    ...(ROLE_COLORS[role] ?? ROLE_COLORS.anon),
  }),
  roleBadge: (role: string): React.CSSProperties => ({
    display: 'inline-block', padding: '3px 8px', borderRadius: 5,
    fontSize: 11, fontWeight: 600,
    ...(ROLE_COLORS[role] ?? ROLE_COLORS.anon),
  }),
  statusDot: (actif: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
    color: actif ? '#166534' : '#6b7280',
  }),
  statsBar:     { display: 'flex', gap: 12, marginBottom: '1.25rem', flexWrap: 'wrap' as const },
  statCard:     { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '12px 18px', minWidth: 120, boxShadow: '0 1px 3px rgba(0,0,0,.04)' } as React.CSSProperties,
  statNum:      { fontSize: 22, fontWeight: 700, color: '#1e3a5f' } as React.CSSProperties,
  statLabel:    { fontSize: 11, color: '#64748b', marginTop: 2 } as React.CSSProperties,
}

const PAGE_SIZE = 20

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function initiales(nom: string, prenom?: string | null) {
  return ((prenom?.[0] ?? '') + (nom[0] ?? '')).toUpperCase() || '?'
}

// ─── Modal création / édition ─────────────────────────────────────────────────

function ModalUtilisateur({
  user, ecoles, onClose, onSaved,
}: {
  user: UtilisateurComplet | null
  ecoles: { id: string; nom: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!user
  const [form, setForm] = useState<FormData>(
    isEdit
      ? { email: user.email, nom: user.nom, prenom: user.prenom ?? '',
          role: user.role, ecole_id: user.ecole_id, actif: user.actif, password: '' }
      : { ...FORM_INIT }
  )
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [showPwd, setShowPwd] = useState(false)

  const set = (k: keyof FormData, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.nom.trim()) { setError('Le nom est requis'); return }
    if (!form.email.trim()) { setError("L'email est requis"); return }
    if (!isEdit && !form.password.trim()) { setError('Le mot de passe est requis'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit) {
        // Mise à jour profil
        const { error: e } = await supabase.from('utilisateurs').update({
          nom: form.nom, prenom: form.prenom || null,
          role: form.role, ecole_id: form.ecole_id, actif: form.actif,
        }).eq('id', user.id)
        if (e) throw e
        // Réinitialiser mot de passe si renseigné
        if (form.password.trim()) {
          const { error: pe } = await supabase.auth.admin.updateUserById(user.auth_id, {
            password: form.password,
          })
          if (pe) throw pe
        }
        // Audit log
        await supabase.rpc('fn_audit_log', {
          p_ecole_id: form.ecole_id, p_action: 'UPDATE', p_module: 'users',
          p_ressource_id: user.id,
          p_ressource_ref: `Utilisateur ${form.prenom} ${form.nom}`,
        })
      } else {
        // Création compte auth
        const { data: authData, error: ae } = await supabase.auth.admin.createUser({
          email: form.email, password: form.password, email_confirm: true,
        })
        if (ae) throw ae
        // Création profil
        const { error: pe } = await supabase.from('utilisateurs').insert({
          auth_id:  authData.user.id,
          nom:      form.nom,
          prenom:   form.prenom || null,
          role:     form.role,
          ecole_id: form.ecole_id,
          actif:    form.actif,
        })
        if (pe) throw pe
        await supabase.rpc('fn_audit_log', {
          p_ecole_id: form.ecole_id, p_action: 'CREATE', p_module: 'users',
          p_ressource_ref: `Utilisateur ${form.prenom} ${form.nom} (${form.email})`,
        })
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <div>
            <div style={S.modalTitle}>{isEdit ? '✏️ Modifier utilisateur' : '➕ Nouvel utilisateur'}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              {isEdit ? `${user.email}` : 'Création d\'un nouveau compte'}
            </div>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <div style={S.modalBody}>
          {error && <div style={{ background: '#fef2f2', color: '#991b1b', padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #fecaca' }}>⚠️ {error}</div>}

          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Nom *</label>
              <input value={form.nom} onChange={e => set('nom', e.target.value)} style={S.input} placeholder="KOUNDE" />
            </div>
            <div style={S.field}>
              <label style={S.label}>Prénom</label>
              <input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={S.input} placeholder="Ariel" />
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>Email *</label>
            <input value={form.email} onChange={e => set('email', e.target.value)}
              style={{ ...S.input, ...(isEdit ? { background: '#f8fafc', color: '#94a3b8' } : {}) }}
              placeholder="email@ecole.bj" disabled={isEdit} type="email" />
            {isEdit && <span style={{ fontSize: 11, color: '#94a3b8' }}>L'email ne peut pas être modifié</span>}
          </div>

          <div style={S.grid2}>
            <div style={S.field}>
              <label style={S.label}>Rôle *</label>
              <select value={form.role} onChange={e => set('role', e.target.value as UserRole)} style={S.select}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>École</label>
              <select value={form.ecole_id ?? ''} onChange={e => set('ecole_id', e.target.value || null)} style={S.select}>
                <option value="">— Super Admin (toutes écoles) —</option>
                {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>{isEdit ? 'Nouveau mot de passe (laisser vide = inchangé)' : 'Mot de passe *'}</label>
            <div style={{ position: 'relative' }}>
              <input
                value={form.password} onChange={e => set('password', e.target.value)}
                type={showPwd ? 'text' : 'password'}
                style={{ ...S.input, paddingRight: 40, width: '100%', boxSizing: 'border-box' as const }}
                placeholder={isEdit ? 'Laisser vide pour ne pas changer' : 'Minimum 8 caractères'}
              />
              <button onClick={() => setShowPwd(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8' }}>
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div onClick={() => set('actif', !form.actif)}
              style={{ width: 44, height: 24, borderRadius: 12, background: form.actif ? '#1e3a5f' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
              <div style={{ position: 'absolute', top: 3, left: form.actif ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </div>
            <span style={{ fontSize: 13, color: '#374151' }}>Compte actif</span>
          </div>
        </div>

        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={S.btnPrimary}>
            {saving ? '⏳ Enregistrement...' : isEdit ? '💾 Enregistrer' : '➕ Créer le compte'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal confirmation suppression ──────────────────────────────────────────

function ModalConfirmDelete({
  user, onClose, onConfirm,
}: { user: UtilisateurComplet; onClose: () => void; onConfirm: () => void }) {
  const [deleting, setDeleting] = useState(false)
  async function handleDelete() {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth: 420 }}>
        <div style={S.modalHeader}>
          <div style={S.modalTitle}>🗑️ Supprimer l'utilisateur</div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={{ ...S.modalBody, gap: '0.75rem' }}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#991b1b' }}>
            ⚠️ Cette action est irréversible. Le compte auth et le profil seront définitivement supprimés.
          </div>
          <div style={{ fontSize: 14, color: '#374151' }}>
            Supprimer <strong>{user.prenom} {user.nom}</strong> ({user.email}) ?
          </div>
        </div>
        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={handleDelete} disabled={deleting}
            style={{ ...S.btnPrimary, background: '#dc2626' }}>
            {deleting ? '⏳...' : '🗑️ Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal reset mot de passe ─────────────────────────────────────────────────

function ModalResetPwd({ user, onClose }: { user: UtilisateurComplet; onClose: () => void }) {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    setLoading(true); setError(null)
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (e) throw e
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth: 420 }}>
        <div style={S.modalHeader}>
          <div style={S.modalTitle}>🔑 Réinitialiser le mot de passe</div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={{ ...S.modalBody, gap: '0.75rem' }}>
          {sent ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#166534', textAlign: 'center' }}>
              ✅ Email de réinitialisation envoyé à <strong>{user.email}</strong>
            </div>
          ) : (
            <>
              {error && <div style={{ background: '#fef2f2', color: '#991b1b', padding: '10px', borderRadius: 8, fontSize: 13 }}>⚠️ {error}</div>}
              <div style={{ fontSize: 13, color: '#374151' }}>
                Un email de réinitialisation sera envoyé à <strong>{user.email}</strong>.
              </div>
            </>
          )}
        </div>
        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecondary}>{sent ? 'Fermer' : 'Annuler'}</button>
          {!sent && (
            <button onClick={handleReset} disabled={loading} style={S.btnPrimary}>
              {loading ? '⏳...' : '📧 Envoyer l\'email'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function UtilisateursPage() {
  const { user: me, isSuperAdmin } = useAuth()

  const [users,    setUsers]    = useState<UtilisateurComplet[]>([])
  const [ecoles,   setEcoles]   = useState<{ id: string; nom: string }[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(0)

  // Filtres
  const [search,      setSearch]      = useState('')
  const [filterRole,  setFilterRole]  = useState<string>('')
  const [filterEcole, setFilterEcole] = useState<string>('')
  const [filterActif, setFilterActif] = useState<string>('')

  // Modals
  const [modalCreate, setModalCreate]   = useState(false)
  const [modalEdit,   setModalEdit]     = useState<UtilisateurComplet | null>(null)
  const [modalDelete, setModalDelete]   = useState<UtilisateurComplet | null>(null)
  const [modalReset,  setModalReset]    = useState<UtilisateurComplet | null>(null)

  // ── Chargement ──────────────────────────────────────────────────────────────

  const loadEcoles = useCallback(async () => {
    const { data } = await supabase.from('ecoles').select('id,nom').order('nom')
    setEcoles(data ?? [])
  }, [])

  const loadUsers = useCallback(async (p = 0) => {
    setLoading(true); setError(null)
    try {
      let q = supabase
        .from('utilisateurs')
        .select(`id, auth_id, nom, prenom, role, ecole_id, actif, email,
                 ecoles(nom)`, { count: 'exact' })
        .order('nom')
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

      if (!isSuperAdmin && me?.ecole_id) q = q.eq('ecole_id', me.ecole_id)
      if (filterEcole) q = q.eq('ecole_id', filterEcole)
      if (filterRole)  q = q.eq('role', filterRole)
      if (filterActif !== '') q = q.eq('actif', filterActif === 'true')
      if (search) q = q.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%`)

      const { data, count, error: err } = await q
      if (err) throw err

      // Enrichir avec email depuis auth.users via RPC ou join
      // On récupère les emails depuis une vue ou la table auth_users_view si disponible
      const rows: UtilisateurComplet[] = (data ?? []).map((u: Record<string, unknown>) => ({
        id:       u.id as string,
        auth_id:  u.auth_id as string,
        nom:      u.nom as string,
        prenom:   u.prenom as string | null,
        role:     u.role as UserRole,
        ecole_id: u.ecole_id as string | null,
        actif:    u.actif as boolean,
        email:    (u.email as string) ?? '',
        ecole_nom: (u.ecoles as { nom: string } | null)?.nom,
      }))


      setUsers(rows)
      setTotal(count ?? 0)
      setPage(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin, me?.ecole_id, filterRole, filterEcole, filterActif, search])

  useEffect(() => { loadEcoles(); loadUsers(0) }, [loadEcoles])

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleDelete(u: UtilisateurComplet) {
    try {
      await supabase.from('utilisateurs').delete().eq('id', u.id)
      await supabase.auth.admin.deleteUser(u.auth_id)
      await supabase.rpc('fn_audit_log', {
        p_ecole_id: u.ecole_id, p_action: 'DELETE', p_module: 'users',
        p_ressource_ref: `Utilisateur ${u.prenom} ${u.nom} (${u.email})`,
      })
      setModalDelete(null)
      showSuccess(`${u.nom} supprimé`)
      loadUsers(page)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function toggleActif(u: UtilisateurComplet) {
    await supabase.from('utilisateurs').update({ actif: !u.actif }).eq('id', u.id)
    await supabase.rpc('fn_audit_log', {
      p_ecole_id: u.ecole_id, p_action: 'UPDATE', p_module: 'users',
      p_ressource_ref: `${u.nom} — ${u.actif ? 'désactivé' : 'activé'}`,
    })
    loadUsers(page)
  }

  function showSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3500)
  }

  function handleSaved() {
    setModalCreate(false); setModalEdit(null)
    showSuccess('Utilisateur enregistré')
    loadUsers(page)
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = {
    total:  total,
    actifs: users.filter(u => u.actif).length,
    admins: users.filter(u => ['admin','direction'].includes(u.role)).length,
    ecoles: new Set(users.map(u => u.ecole_id).filter(Boolean)).size,
  }

  return (
    <div style={S.page}>
      {/* En-tête */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>👤 Gestion des Utilisateurs</h1>
          <p style={S.sub}>Comptes, rôles et accès par établissement</p>
        </div>
        <button onClick={() => setModalCreate(true)} style={S.btnPrimary}>
          + Nouvel utilisateur
        </button>
      </div>

      {/* Alertes */}
      {error   && <div style={S.errorBanner}>⚠️ {error}<button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16 }}>✕</button></div>}
      {success && <div style={S.successBanner}>✅ {success}</div>}

      {/* Stats */}
      <div style={S.statsBar}>
        {[
          { num: stats.total,  label: 'Utilisateurs total' },
          { num: stats.actifs, label: 'Comptes actifs' },
          { num: stats.admins, label: 'Administrateurs' },
          { num: isSuperAdmin ? stats.ecoles : 1, label: isSuperAdmin ? 'Établissements' : 'Établissement' },
        ].map(({ num, label }) => (
          <div key={label} style={S.statCard}>
            <div style={S.statNum}>{num}</div>
            <div style={S.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={S.filters}>
        <input
          placeholder="🔍 Rechercher par nom, prénom..."
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadUsers(0)}
          style={S.filterInput}
        />
        <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(0) }} style={S.filterSelect}>
          <option value="">Tous les rôles</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        {isSuperAdmin && (
          <select value={filterEcole} onChange={e => { setFilterEcole(e.target.value); setPage(0) }} style={S.filterSelect}>
            <option value="">Tous les établissements</option>
            {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        )}
        <select value={filterActif} onChange={e => { setFilterActif(e.target.value); setPage(0) }} style={S.filterSelect}>
          <option value="">Tous statuts</option>
          <option value="true">Actifs</option>
          <option value="false">Inactifs</option>
        </select>
        <button onClick={() => loadUsers(0)} style={S.btnPrimary}>Filtrer</button>
        <button onClick={() => { setSearch(''); setFilterRole(''); setFilterEcole(''); setFilterActif(''); loadUsers(0) }} style={S.btnSecondary}>Réinitialiser</button>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={S.centered}><div style={S.spinner} /></div>
      ) : users.length === 0 ? (
        <div style={S.empty}>👤<br/>Aucun utilisateur trouvé</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead style={S.thead}>
              <tr>
                <th style={S.th}>Utilisateur</th>
                <th style={S.th}>Rôle</th>
                {isSuperAdmin && <th style={S.th}>École</th>}
                <th style={S.th}>Statut</th>
                <th style={{ ...S.th, textAlign: 'right' as const }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={S.avatarCircle(u.role)}>{initiales(u.nom, u.prenom)}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{u.prenom} {u.nom}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={S.td}>
                    <span style={S.roleBadge(u.role)}>{ROLE_LABELS[u.role] ?? u.role}</span>
                  </td>
                  {isSuperAdmin && (
                    <td style={{ ...S.td, fontSize: 12, color: '#64748b' }}>{u.ecole_nom ?? '— Réseau —'}</td>
                  )}
                  <td style={S.td}>
                    <span style={S.statusDot(u.actif)}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: u.actif ? '#22c55e' : '#d1d5db', display: 'inline-block' }} />
                      {u.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' as const }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => setModalEdit(u)} style={S.btnGhost} title="Modifier">✏️</button>
                      <button onClick={() => setModalReset(u)} style={S.btnGhost} title="Réinitialiser MDP">🔑</button>
                      <button onClick={() => toggleActif(u)}
                        style={{ ...S.btnGhost, color: u.actif ? '#dc2626' : '#16a34a' }}
                        title={u.actif ? 'Désactiver' : 'Activer'}>
                        {u.actif ? '🔒' : '🔓'}
                      </button>
                      <button onClick={() => setModalDelete(u)} style={S.btnDanger} title="Supprimer">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={S.pagination}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {total} utilisateur{total > 1 ? 's' : ''} · Page {page + 1} / {Math.ceil(total / PAGE_SIZE) || 1}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => loadUsers(page - 1)} disabled={page === 0} style={S.btnSecondary}>← Précédent</button>
          <button onClick={() => loadUsers(page + 1)} disabled={(page + 1) * PAGE_SIZE >= total} style={S.btnSecondary}>Suivant →</button>
        </div>
      </div>

      {/* Modals */}
      {(modalCreate || modalEdit) && (
        <ModalUtilisateur
          user={modalEdit}
          ecoles={ecoles}
          onClose={() => { setModalCreate(false); setModalEdit(null) }}
          onSaved={handleSaved}
        />
      )}
      {modalDelete && (
        <ModalConfirmDelete
          user={modalDelete}
          onClose={() => setModalDelete(null)}
          onConfirm={() => handleDelete(modalDelete)}
        />
      )}
      {modalReset && (
        <ModalResetPwd user={modalReset} onClose={() => setModalReset(null)} />
      )}
    </div>
  )
}
