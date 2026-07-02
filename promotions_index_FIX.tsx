// src/modules/promotions/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type { Programme, AnneeAcademique } from '../../types/referentiel.types';
import { NIVEAUX_BY_GRADE } from '../../types/referentiel.types';

interface EcoleOption { id: string; nom: string }

interface Promotion {
  id: string; ecole_id: string;
  programme_id: string | null; annee_academique_id: string | null;
  niveau: string; nom: string;
  effectif_max: number | null; responsable: string | null;
  programmes_lmd?: { intitule: string; grade: string };
  annees_academiques?: { libelle: string };
}

const GRADE_COLORS: Record<string, { bg: string; fg: string }> = {
  licence:  { bg: '#dbeafe', fg: '#1d4ed8' },
  master:   { bg: '#ede9fe', fg: '#7c3aed' },
  doctorat: { bg: '#ccfbf1', fg: '#0d9488' },
};

const EMPTY_FORM = { programme_id: '', annee_academique_id: '', niveau: '', nom: '', effectif_max: '', responsable: '' };

export default function PromotionsPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [inscritsMap, setInscritsMap] = useState<Record<string, number>>({});
  const [programmes, setProgrammes]   = useState<Programme[]>([]);
  const [annees, setAnnees]           = useState<AnneeAcademique[]>([]);
  const [loading, setLoading]         = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [nomManual, setNomManual]     = useState(false);
  const [modalOpen, setModalOpen]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const [{ data: promos }, { data: ins }, { data: progs }, { data: ans }] = await Promise.all([
        // RPCs SECURITY DEFINER — contournent RLS
        supabase.rpc('fn_get_promotions', { p_ecole_id: ecoleId }),
        supabase.from('inscriptions_semestre').select('promotion_id').eq('ecole_id', ecoleId).eq('statut', 'active'),
        supabase.rpc('fn_get_programmes_lmd', { p_ecole_id: ecoleId }),
        supabase.rpc('fn_get_annees_academiques', { p_ecole_id: ecoleId }),
      ]);
      setPromotions((promos ?? []) as Promotion[]);
      const map: Record<string, number> = {};
      (ins ?? []).forEach((i: any) => { map[i.promotion_id] = (map[i.promotion_id] || 0) + 1; });
      setInscritsMap(map);
      setProgrammes((progs ?? []) as Programme[]);
      setAnnees((ans ?? []) as AnneeAcademique[]);
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  // Auto-nom promotion
  useEffect(() => {
    if (nomManual) return;
    const prog = programmes.find(p => p.id === form.programme_id);
    const annee = annees.find(a => a.id === form.annee_academique_id);
    if (prog && form.niveau) {
      setForm(f => ({ ...f, nom: `Promo ${f.niveau} — ${prog.intitule}${annee ? ' ' + annee.libelle : ''}` }));
    }
  }, [form.programme_id, form.niveau, form.annee_academique_id]); // eslint-disable-line

  const progSelectionne = programmes.find(p => p.id === form.programme_id);
  const niveauxDispo = progSelectionne ? NIVEAUX_BY_GRADE[progSelectionne.grade as keyof typeof NIVEAUX_BY_GRADE] ?? [] : [];

  function openCreate() {
    setEditId(null); setForm(EMPTY_FORM); setNomManual(false); setFormError(null); setModalOpen(true);
  }

  async function openEdit(p: Promotion) {
    setEditId(p.id);
    setForm({ programme_id: p.programme_id ?? '', annee_academique_id: p.annee_academique_id ?? '', niveau: p.niveau, nom: p.nom, effectif_max: p.effectif_max?.toString() ?? '', responsable: p.responsable ?? '' });
    setNomManual(true); setFormError(null); setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null);
    const payload = {
      ecole_id: ecoleId,
      programme_id: form.programme_id || null,
      annee_academique_id: form.annee_academique_id || null,
      niveau: form.niveau,
      nom: form.nom.trim(),
      effectif_max: form.effectif_max ? parseInt(form.effectif_max) : null,
      responsable: form.responsable.trim() || null,
    };
    try {
      if (editId) {
        const { error } = await supabase.from('promotions').update(payload).eq('id', editId);
        if (error) throw error;
        showToast('Promotion modifiée ✓');
      } else {
        const { error } = await supabase.from('promotions').insert(payload);
        if (error) throw error;
        showToast('Promotion créée ✓');
      }
      setModalOpen(false); await load();
    } catch (err: any) { setFormError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(p: Promotion) {
    if (!confirm(`Supprimer la promotion "${p.nom}" ?`)) return;
    try {
      const { error } = await supabase.from('promotions').delete().eq('id', p.id);
      if (error) throw error;
      await load(); showToast('Promotion supprimée');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.type === 'success' ? '#059669' : '#dc2626', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}
      <div className="top">
        <div><h2>Promotions</h2><div className="page-subtitle">Groupes d'étudiants par niveau et programme</div></div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select id="promotions-ecole" name="ecole" value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <button className="btn-blue" onClick={openCreate}>+ Promotion</button>
        </div>
      </div>

      {loading ? <div className="loading">Chargement…</div> :
        promotions.length === 0
          ? <div className="empty-state"><div className="es-ico">👥</div><h3>Aucune promotion</h3><p>Créez votre première promotion</p></div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1rem' }}>
              {promotions.map(p => {
                const ins = inscritsMap[p.id] || 0;
                const pct = p.effectif_max ? Math.round(ins / p.effectif_max * 100) : 0;
                const grade = p.programmes_lmd?.grade ?? 'licence';
                const { bg, fg } = GRADE_COLORS[grade] ?? GRADE_COLORS.licence;
                const barColor = pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#1e3a5f';
                return (
                  <div key={p.id} className="card" style={{ padding: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.85rem' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: fg, flexShrink: 0 }}>
                        {p.niveau}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{p.programmes_lmd?.intitule ?? '—'}</div>
                      </div>
                      <span className={`badge ${grade === 'licence' ? 'blue' : grade === 'master' ? 'purple' : 'teal'}`} style={{ fontSize: 10 }}>{grade}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.75rem' }}>
                      <div style={{ background: '#f9fafb', borderRadius: 8, padding: '.6rem', textAlign: 'center', border: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a5f' }}>{ins}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>Inscrits</div>
                      </div>
                      <div style={{ background: '#f9fafb', borderRadius: 8, padding: '.6rem', textAlign: 'center', border: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a5f' }}>{p.effectif_max ?? '∞'}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>Capacité</div>
                      </div>
                    </div>
                    {p.effectif_max && (
                      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: '.75rem' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width .5s' }} />
                      </div>
                    )}
                    <div style={{ paddingTop: '.75rem', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                      <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.annees_academiques?.libelle ?? '—'} · Resp: {p.responsable ?? 'N/A'}
                      </span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="btn-ghost btn-sm" onClick={() => openEdit(p)}>✏</button>
                        <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDelete(p)}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
      }

      {modalOpen && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {editId ? 'Modifier la promotion' : '+ Nouvelle Promotion'}
              </h3>
              <button className="btn-ghost btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} autoComplete="off">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label htmlFor="promo-programme">Programme *</label>
                  <select id="promo-programme" name="programme_id" value={form.programme_id} onChange={e => { setForm(f => ({ ...f, programme_id: e.target.value, niveau: '' })); setNomManual(false); }} style={{ width: '100%', marginTop: 4 }} required>
                    <option value="">— Sélectionner —</option>
                    {programmes.map(p => <option key={p.id} value={p.id}>{p.intitule}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="promo-niveau">Niveau *</label>
                  <select id="promo-niveau" name="niveau" value={form.niveau} onChange={e => { setForm(f => ({ ...f, niveau: e.target.value })); setNomManual(false); }} style={{ width: '100%', marginTop: 4 }} required>
                    <option value="">— Niveau —</option>
                    {niveauxDispo.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label htmlFor="promo-annee">Année académique</label>
                  <select id="promo-annee" name="annee_academique_id" value={form.annee_academique_id} onChange={e => { setForm(f => ({ ...f, annee_academique_id: e.target.value })); setNomManual(false); }} style={{ width: '100%', marginTop: 4 }}>
                    <option value="">— Sélectionner —</option>
                    {annees.map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="promo-effectif">Effectif max</label>
                  <input id="promo-effectif" name="effectif_max" type="number" value={form.effectif_max} onChange={e => setForm(f => ({ ...f, effectif_max: e.target.value }))} style={{ width: '100%', marginTop: 4 }} min={1} max={500} placeholder="ex : 50" />
                </div>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="promo-nom">Nom de la promotion *</label>
                <input id="promo-nom" name="nom" autoComplete="off" type="text" value={form.nom} onChange={e => { setForm(f => ({ ...f, nom: e.target.value })); setNomManual(true); }} style={{ width: '100%', marginTop: 4 }} placeholder="ex : Promo L1 — Licence GFC 2025-2026" required />
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="promo-responsable">Responsable pédagogique</label>
                <input id="promo-responsable" name="responsable" autoComplete="off" type="text" value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} style={{ width: '100%', marginTop: 4 }} placeholder="Nom du responsable (optionnel)" />
              </div>
              {formError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{formError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>
                  {saving ? (editId ? 'Enregistrement…' : 'Création…') : (editId ? 'Enregistrer' : 'Créer la promotion →')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
