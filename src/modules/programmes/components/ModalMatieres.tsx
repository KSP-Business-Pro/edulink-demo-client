// ─────────────────────────────────────────────────────────────────────────────
//  ModalMatieres.tsx — Gestion matières d'une UE (list + form inline)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import type { MatiereLMD } from '../../../types/referentiel.types';
import {
  fetchMatieresByUE, createMatiere, updateMatiere, deleteMatiere,
} from '../../../services/referentiel.service';

interface Enseignant { id: string; nom: string; prenom: string }

interface Props {
  ecoleId: string;
  ueId: string;
  ueNom: string;
  enseignants: Enseignant[];
  onClose: () => void;
}

type ViewMode = 'list' | 'form';

const EMPTY_FORM = { code: '', nom: '', coefficient: 1, heures_cm: 0, heures_td: 0, enseignant_id: '' };

export default function ModalMatieres({ ecoleId, ueId, ueNom, enseignants, onClose }: Props) {
  const [matieres, setMatieres] = useState<MatiereLMD[]>([]);
  const [view, setView]         = useState<ViewMode>('list');
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try { setMatieres(await fetchMatieresByUE(ueId)); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setView('form');
  }

  function openEdit(m: MatiereLMD) {
    setEditId(m.id);
    setForm({
      code:          m.code,
      nom:           m.nom,
      coefficient:   m.coefficient,
      heures_cm:     m.heures_cm,
      heures_td:     m.heures_td,
      enseignant_id: m.enseignant_id ?? '',
    });
    setError(null);
    setView('form');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ecole_id:     ecoleId,
      ue_id:        ueId,
      code:         form.code.trim().toUpperCase(),
      nom:          form.nom.trim(),
      coefficient:  form.coefficient,
      heures_cm:    form.heures_cm,
      heures_td:    form.heures_td,
      enseignant_id: form.enseignant_id || null,
    };
    try {
      if (editId) {
        await updateMatiere(editId, payload);
      } else {
        await createMatiere(payload);
      }
      setView('list');
      await reload();
    } catch (err: any) {
      const isDup = err.message?.includes('duplicate') || err.message?.includes('unique');
      setError(isDup ? 'Ce code matière existe déjà.' : 'Erreur : ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer la matière "${nom}" ?`)) return;
    try {
      await deleteMatiere(id);
      await reload();
    } catch (err: any) {
      alert('Erreur : ' + err.message);
    }
  }

  const esc = (s: string) => s?.replace(/&/g,'&amp;').replace(/</g,'&lt;') ?? '';

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 720, padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
              Matières — {ueNom}
            </h3>
            {view === 'form' && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {editId ? 'Modifier la matière' : '+ Nouvelle matière'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {view === 'list' && (
              <button className="btn-sm btn-blue" onClick={openAdd}>+ Ajouter</button>
            )}
            <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Liste */}
        {view === 'list' && (
          <>
            {loading ? (
              <div className="loading">Chargement...</div>
            ) : matieres.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <p>Aucune matière — cliquez sur + Ajouter</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Nom</th>
                      <th style={{ textAlign: 'center' }}>Coef.</th>
                      <th>Horaires</th>
                      <th>Enseignant</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {matieres.map(m => (
                      <tr key={m.id}>
                        <td>
                          <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                            {m.code}
                          </code>
                        </td>
                        <td><strong>{m.nom}</strong></td>
                        <td style={{ textAlign: 'center' }}>{m.coefficient}</td>
                        <td style={{ fontSize: 12 }}>{m.heures_cm}h CM / {m.heures_td}h TD</td>
                        <td style={{ fontSize: 12 }}>
                          {m.enseignants
                            ? `${m.enseignants.prenom} ${m.enseignants.nom}`
                            : <span style={{ color: '#9ca3af' }}>—</span>
                          }
                        </td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-ghost btn-sm" onClick={() => openEdit(m)}>✏</button>
                          <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDelete(m.id, m.nom)}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Formulaire */}
        {view === 'form' && (
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem', marginBottom: '.85rem' }}>
              <div>
                <label>Code *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }}
                  placeholder="GFC-L1-COMPTA"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label>Nom *</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => setForm(f => ({ ...f, nom: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }}
                  placeholder="ex : Comptabilité générale I"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
              <div>
                <label>Coefficient *</label>
                <input
                  type="number"
                  value={form.coefficient}
                  onChange={(e) => setForm(f => ({ ...f, coefficient: parseFloat(e.target.value) || 1 }))}
                  style={{ width: '100%', marginTop: 4 }}
                  min={0.5} step={0.5}
                  required
                />
              </div>
              <div>
                <label>Heures CM</label>
                <input
                  type="number"
                  value={form.heures_cm}
                  onChange={(e) => setForm(f => ({ ...f, heures_cm: parseInt(e.target.value) || 0 }))}
                  style={{ width: '100%', marginTop: 4 }}
                  min={0}
                />
              </div>
              <div>
                <label>Heures TD</label>
                <input
                  type="number"
                  value={form.heures_td}
                  onChange={(e) => setForm(f => ({ ...f, heures_td: parseInt(e.target.value) || 0 }))}
                  style={{ width: '100%', marginTop: 4 }}
                  min={0}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <label>Enseignant</label>
              <select
                value={form.enseignant_id}
                onChange={(e) => setForm(f => ({ ...f, enseignant_id: e.target.value }))}
                style={{ width: '100%', marginTop: 4 }}
              >
                <option value="">— sélectionner —</option>
                {enseignants.map(en => (
                  <option key={en.id} value={en.id}>{en.prenom} {en.nom}</option>
                ))}
              </select>
            </div>

            {error && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
              <button type="button" className="btn-ghost" onClick={() => setView('list')}>
                ← Retour
              </button>
              <button type="submit" className="btn-blue" disabled={saving}>
                {saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Créer la matière →')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
