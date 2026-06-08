// src/modules/prospects/index.tsx
// CRM Prospects — Dashboard commercial EduLink Sup
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

type Statut = 'nouveau' | 'contacte' | 'demo_planifiee' | 'converti' | 'perdu';

interface Prospect {
  id: string;
  // Champs formulaire diagnostic
  nom: string | null;               // nom contact
  email: string | null;
  telephone: string | null;
  fonction: string | null;
  ecole_nom: string | null;         // nom établissement
  effectif: string | null;
  creneau: string | null;
  source: string | null;
  message: string | null;
  // Champs legacy alternatifs
  nom_etablissement: string | null;
  nom_contact: string | null;
  email_contact: string | null;
  telephone_contact: string | null;
  type_etablissement: string | null;
  ville: string | null;
  site_web: string | null;
  // CRM
  statut: Statut;
  notes_internes: string | null;
  rappele_par: string | null;
  created_at: string;
}

const STATUTS: Record<Statut, { label: string; color: string; badge: string }> = {
  nouveau:        { label: 'Nouveau',        color: '#3b82f6', badge: 'blue'   },
  contacte:       { label: 'Contacté',       color: '#f97316', badge: 'amber'  },
  demo_planifiee: { label: 'Démo planifiée', color: '#7c3aed', badge: 'purple' },
  converti:       { label: 'Converti',       color: '#059669', badge: 'green'  },
  perdu:          { label: 'Perdu',          color: '#dc2626', badge: 'red'    },
};

const TYPE_COLORS: Record<string, string> = {
  université: 'blue', grande_ecole: 'purple', lycee: 'amber',
  college: 'orange', primaire: 'teal',
};

function nomEtablissement(p: Prospect) { return p.ecole_nom || p.nom_etablissement || '—'; }
function nomContact(p: Prospect)       { return p.nom || p.nom_contact || '—'; }
function emailContact(p: Prospect)     { return p.email || p.email_contact || null; }
function telContact(p: Prospect)       { return p.telephone || p.telephone_contact || null; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ProspectsPage() {
  const { user } = useAuth();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading]     = useState(false);
  const [filterStatut, setFilterStatut] = useState<Statut | 'all'>('all');
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Prospect | null>(null);
  const [editForm, setEditForm]   = useState({ statut: 'nouveau' as Statut, notes: '', rappele: '' });
  const [saving, setSaving]       = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('prospects_diagnostic')
        .select('*')
        .order('created_at', { ascending: false });
      setProspects((data ?? []) as Prospect[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Stats pipeline
  const stats = useMemo(() => {
    const total = prospects.length;
    const byStatut = Object.keys(STATUTS).reduce((acc, k) => {
      acc[k] = prospects.filter(p => (p.statut ?? 'nouveau') === k).length;
      return acc;
    }, {} as Record<string, number>);
    return { total, byStatut };
  }, [prospects]);

  // Filtrage
  const listeFiltree = useMemo(() => {
    let l = prospects;
    if (filterStatut !== 'all') l = l.filter(p => (p.statut ?? 'nouveau') === filterStatut);
    if (search) {
      const s = search.toLowerCase();
      l = l.filter(p =>
        `${nomEtablissement(p)} ${nomContact(p)} ${emailContact(p) ?? ''} ${p.ville ?? ''}`.toLowerCase().includes(s)
      );
    }
    return l;
  }, [prospects, filterStatut, search]);

  function openProspect(p: Prospect) {
    setSelected(p);
    setEditForm({ statut: p.statut ?? 'nouveau', notes: p.notes_internes ?? '', rappele: p.rappele_par ?? '' });
  }

  async function handleSauvegarder() {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('prospects_diagnostic').update({
        statut: editForm.statut,
        notes_internes: editForm.notes,
        rappele_par: editForm.rappele,
      }).eq('id', selected.id);
      if (error) throw error;
      setSelected(null);
      await load();
      showToast('Prospect mis à jour ✓');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  const toastBg = { success: '#059669', error: '#dc2626' };

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* En-tête */}
      <div className="top">
        <div>
          <h2>Prospects</h2>
          <div className="page-subtitle">CRM — Pipeline commercial EduLink Sup</div>
        </div>
        <div className="top-actions">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher…"
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: 200 }} />
        </div>
      </div>

      {/* Pipeline kanban stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: '1.5rem' }}>
        {(Object.entries(STATUTS) as [Statut, typeof STATUTS[Statut]][]).map(([k, v]) => (
          <div key={k} onClick={() => setFilterStatut(filterStatut === k ? 'all' : k)}
            className="card"
            style={{ padding: '.85rem', cursor: 'pointer', border: `2px solid ${filterStatut === k ? v.color : 'transparent'}`, transition: 'all .15s' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: v.color }}>{stats.byStatut[k] ?? 0}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{v.label}</div>
          </div>
        ))}
      </div>

      {/* Filtre actif */}
      {filterStatut !== 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
          <span className={`badge ${STATUTS[filterStatut].badge}`}>{STATUTS[filterStatut].label}</span>
          <button className="btn-ghost btn-sm" onClick={() => setFilterStatut('all')}>✕ Effacer filtre</button>
        </div>
      )}

      {/* Tableau */}
      {loading ? <div className="loading">Chargement…</div> :
        listeFiltree.length === 0
          ? (
            <div className="empty-state">
              <div className="es-ico">🎯</div>
              <h3>Aucun prospect</h3>
              <p>Les établissements ayant rempli le formulaire diagnostic apparaîtront ici</p>
            </div>
          )
          : (
            <>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: '.75rem' }}>
                {listeFiltree.length} prospect{listeFiltree.length > 1 ? 's' : ''} {filterStatut !== 'all' ? `· filtre : ${STATUTS[filterStatut].label}` : `au total (${stats.total})`}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Établissement</th>
                      <th>Type</th>
                      <th>Contact</th>
                      <th>Effectif</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'center' }}>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listeFiltree.map(p => {
                      const statut = (p.statut ?? 'nouveau') as Statut;
                      const tel = telContact(p);
                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{nomEtablissement(p)}</div>
                            {p.site_web && <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.site_web}</div>}
                            {p.ville && <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.ville}</div>}
                          </td>
                          <td>
                            {p.type_etablissement
                              ? <span className={`badge ${TYPE_COLORS[p.type_etablissement] ?? 'gray'}`}>{p.type_etablissement}</span>
                              : <span className="badge gray">—</span>
                            }
                          </td>
                          <td>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{nomContact(p)}</div>
                            {emailContact(p) && <div style={{ fontSize: 11, color: '#9ca3af' }}>{emailContact(p)}</div>}
                            {tel && <div style={{ fontSize: 11, color: '#9ca3af' }}>{tel}</div>}
                          </td>
                          <td style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>{p.effectif ?? '—'}</td>
                          <td style={{ fontSize: 12, color: '#6b7280' }}>{formatDate(p.created_at)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${STATUTS[statut]?.badge ?? 'blue'}`}>
                              {STATUTS[statut]?.label ?? statut}
                            </span>
                          </td>
                          <td style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-ghost btn-sm" onClick={() => openProspect(p)}>Voir</button>
                            {tel && (
                              <a href={`https://wa.me/${tel.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                                className="btn-ghost btn-sm" style={{ textDecoration: 'none' }}>📱</a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
      }

      {/* Modal détail prospect */}
      {selected && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal" style={{ width: 580, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                Prospect — {nomEtablissement(selected)}
              </h3>
              <button className="btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Infos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1rem' }}>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '.75rem' }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Établissement</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{nomEtablissement(selected)}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{selected.fonction ?? '—'}</div>
                {selected.ville && <div style={{ fontSize: 11, color: '#9ca3af' }}>{selected.ville}</div>}
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '.75rem' }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Contact</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{nomContact(selected)}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{emailContact(selected) ?? '—'}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{telContact(selected) ?? '—'}</div>
              </div>
            </div>

            {/* Métriques */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem', marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center', background: '#eff6ff', borderRadius: 8, padding: '.6rem' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1d4ed8' }}>{selected.effectif ?? '—'}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>Effectif</div>
              </div>
              <div style={{ textAlign: 'center', background: '#f0fdf4', borderRadius: 8, padding: '.6rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{selected.creneau ?? '—'}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>Créneau</div>
              </div>
              <div style={{ textAlign: 'center', background: '#faf5ff', borderRadius: 8, padding: '.6rem' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>{selected.source ?? '—'}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>Source</div>
              </div>
            </div>

            {/* Message */}
            {selected.message && (
              <div style={{ background: '#fff8f0', borderLeft: '3px solid #f97316', padding: '.75rem', borderRadius: '0 8px 8px 0', marginBottom: '1rem', fontSize: 13, color: '#374151' }}>
                {selected.message}
              </div>
            )}

            {/* Édition CRM */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
              <div>
                <label>Statut</label>
                <select value={editForm.statut} onChange={e => setEditForm(f => ({ ...f, statut: e.target.value as Statut }))}
                  style={{ width: '100%', marginTop: 4 }}>
                  {(Object.entries(STATUTS) as [Statut, typeof STATUTS[Statut]][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Rappelé par</label>
                <input type="text" value={editForm.rappele} onChange={e => setEditForm(f => ({ ...f, rappele: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} placeholder="Nom du commercial" />
              </div>
            </div>
            <div style={{ marginBottom: '1.2rem' }}>
              <label>Notes internes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Notes de suivi, prochaine action…" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
              {telContact(selected) ? (
                <a href={`https://wa.me/${(telContact(selected) ?? '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                  style={{ background: '#25d366', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                  📱 WhatsApp
                </a>
              ) : <span />}
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn-ghost" onClick={() => setSelected(null)}>Annuler</button>
                <button className="btn-blue" onClick={handleSauvegarder} disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
