// src/modules/enseignants/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

interface EcoleOption { id: string; nom: string }

interface Enseignant {
  id: string; ecole_id: string;
  nom: string; prenom: string | null;
  grade: string; specialite: string | null;
  email: string | null; telephone: string | null;
  statut: 'actif' | 'inactif';
}

interface MatiereLMD {
  id: string; nom: string; code: string; coefficient: number;
  unites_enseignement?: { code: string; intitule: string; credits_cect: number };
}

const GRADES = ['Assistant', 'Maître-Assistant', 'Maître de Conférences', 'Professeur'];
const GRADE_COLOR: Record<string, string> = {
  'Assistant': 'blue', 'Maître-Assistant': 'purple',
  'Maître de Conférences': 'teal', 'Professeur': 'orange',
};

const EMPTY_FORM = { nom: '', prenom: '', grade: 'Assistant', specialite: '', email: '', telephone: '', statut: 'actif' as const };

export default function EnseignantsPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [loading, setLoading]   = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [matiereModal, setMatiereModal] = useState<{ ensId: string; nom: string } | null>(null);
  const [matieres, setMatieres] = useState<MatiereLMD[]>([]);
  const [matiereLoading, setMatiereLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('enseignants')
        .select('*').eq('ecole_id', ecoleId).order('nom').order('prenom');
      setEnseignants((data ?? []) as Enseignant[]);
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true);
  }

  function openEdit(e: Enseignant) {
    setEditId(e.id);
    setForm({ nom: e.nom, prenom: e.prenom ?? '', grade: e.grade, specialite: e.specialite ?? '', email: e.email ?? '', telephone: e.telephone ?? '', statut: e.statut });
    setFormError(null); setModalOpen(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault(); setSaving(true); setFormError(null);
    const payload = { ecole_id: ecoleId, nom: form.nom.trim(), prenom: form.prenom.trim() || null, grade: form.grade, specialite: form.specialite.trim() || null, email: form.email.trim() || null, telephone: form.telephone.trim() || null, statut: form.statut };
    try {
      if (editId) {
        const { error } = await supabase.from('enseignants').update(payload).eq('id', editId);
        if (error) throw error;
        showToast('Enseignant modifié ✓');
      } else {
        const { error } = await supabase.from('enseignants').insert(payload);
        if (error) throw error;
        showToast('Enseignant créé ✓');
      }
      setModalOpen(false); await load();
    } catch (err: any) { setFormError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(e: Enseignant) {
    const nom = e.prenom ? `${e.prenom} ${e.nom}` : e.nom;
    if (!confirm(`Supprimer "${nom}" ?`)) return;
    try {
      const { error } = await supabase.from('enseignants').delete().eq('id', e.id);
      if (error) throw error;
      await load(); showToast('Enseignant supprimé');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function openMatieres(e: Enseignant) {
    const nom = e.prenom ? `${e.prenom} ${e.nom}` : e.nom;
    setMatiereModal({ ensId: e.id, nom }); setMatiereLoading(true);
    const { data } = await supabase.from('matieres_lmd')
      .select('*, unites_enseignement(code,intitule,credits_cect)')
      .eq('enseignant_id', e.id);
    setMatieres((data ?? []) as MatiereLMD[]);
    setMatiereLoading(false);
  }

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.type === 'success' ? '#059669' : '#dc2626', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* En-tête */}
      <div className="top">
        <div>
          <h2>Enseignants</h2>
          <div className="page-subtitle">Corps enseignant — grades CAMES</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <button className="btn-blue" onClick={openCreate}>+ Enseignant</button>
        </div>
      </div>

      {loading ? <div className="loading">Chargement…</div> :
        enseignants.length === 0
          ? (
            <div className="empty-state">
              <div className="es-ico">👨‍🏫</div>
              <h3>Aucun enseignant</h3>
              <p>Ajoutez votre corps enseignant</p>
            </div>
          )
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Enseignant</th>
                    <th>Spécialité</th>
                    <th>Grade</th>
                    <th>Contact</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {enseignants.map(e => {
                    const initiales = ((e.prenom?.[0] ?? '') + (e.nom?.[0] ?? '')).toUpperCase();
                    return (
                      <tr key={e.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {initiales}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{e.nom} {e.prenom ?? ''}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{e.email ?? '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#6b7280' }}>{e.specialite ?? '—'}</td>
                        <td>
                          {e.grade
                            ? <span className={`badge ${GRADE_COLOR[e.grade] ?? 'gray'}`}>{e.grade}</span>
                            : <span className="badge gray">—</span>
                          }
                        </td>
                        <td style={{ fontSize: 12, color: '#6b7280' }}>{e.telephone ?? '—'}</td>
                        <td>
                          <span className={`badge ${e.statut === 'actif' ? 'green' : 'gray'}`}>{e.statut}</span>
                        </td>
                        <td style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 160 }}>
                          <button className="btn-ghost btn-sm" onClick={() => openMatieres(e)}>Matières</button>
                          <button className="btn-ghost btn-sm" onClick={() => openEdit(e)}>✏</button>
                          <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDelete(e)}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      }

      {/* Modal CRUD */}
      {modalOpen && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ width: 500, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {editId ? 'Modifier enseignant' : '+ Nouvel Enseignant'}
              </h3>
              <button className="btn-ghost btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} autoComplete="off">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label>Nom *</label>
                  <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="NOM (majuscules)" required autoFocus />
                </div>
                <div>
                  <label>Prénom</label>
                  <input type="text" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="Prénom" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label>Grade *</label>
                  <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} required>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label>Statut *</label>
                  <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value as 'actif' | 'inactif' }))}
                    style={{ width: '100%', marginTop: 4 }} required>
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label>Spécialité</label>
                <input type="text" value={form.specialite} onChange={e => setForm(f => ({ ...f, specialite: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} placeholder="ex : Comptabilité, Marketing, Droit…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1.2rem' }}>
                <div>
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="enseignant@email.com" />
                </div>
                <div>
                  <label>Téléphone</label>
                  <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="+229 …" />
                </div>
              </div>
              {formError && (
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{formError}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>
                  {saving ? (editId ? 'Enregistrement…' : 'Création…') : (editId ? 'Enregistrer' : 'Créer →')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal matières */}
      {matiereModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setMatiereModal(null)}>
          <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Matières de {matiereModal.nom}</h3>
              <button className="btn-ghost btn-sm" onClick={() => setMatiereModal(null)}>✕</button>
            </div>
            {matiereLoading ? <div className="loading">Chargement…</div> :
              matieres.length === 0
                ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucune matière LMD assignée</p>
                : matieres.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem', background: '#f9fafb', borderRadius: 8, marginBottom: '.4rem', border: '1px solid #f3f4f6' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{m.nom}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        UE {m.unites_enseignement?.code ?? '—'} · {m.unites_enseignement?.intitule ?? '—'}
                      </div>
                    </div>
                    <span className="badge teal">{m.unites_enseignement?.credits_cect ?? 0} CECT</span>
                    <span className="badge gray">Coef. {m.coefficient}</span>
                  </div>
                ))
            }
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6', marginTop: '.5rem' }}>
              <button className="btn-secondary btn-sm" onClick={() => setMatiereModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
