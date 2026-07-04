// src/modules/semestres/components/ModalAnnee.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabase';

interface AnneeAcademique {
  id: string; libelle: string; date_debut: string | null;
  date_fin: string | null; est_courante: boolean;
}

interface Props {
  ecoleId: string;
  annee?: AnneeAcademique | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ModalAnnee({ ecoleId, annee, onClose, onSaved }: Props) {
  const isEdit = Boolean(annee);
  const [libelle, setLibelle]     = useState(annee?.libelle ?? '');
  const [dateDebut, setDateDebut] = useState(annee?.date_debut ?? '');
  const [dateFin, setDateFin]     = useState(annee?.date_fin ?? '');
  const [estCourante, setEstCourante] = useState(annee?.est_courante ?? false);
  const [libelleManual, setLibelleManual] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Auto-libellé depuis date début
  useEffect(() => {
    if (libelleManual || !dateDebut) return;
    const y = parseInt(dateDebut.substring(0, 4));
    if (!isNaN(y)) setLibelle(`${y}-${y + 1}`);
  }, [dateDebut]); // eslint-disable-line

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const payload = {
      ecole_id: ecoleId, libelle: libelle.trim(),
      date_debut: dateDebut || null, date_fin: dateFin || null,
      est_courante: estCourante,
    };
    try {
      // Si courante → désactiver les autres
      if (estCourante) {
        await supabase.from('annees_academiques')
          .update({ est_courante: false }).eq('ecole_id', ecoleId);
      }
      if (isEdit && annee?.id) {
        const { error: err } = await supabase.from('annees_academiques').update(payload).eq('id', annee.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('annees_academiques').insert(payload);
        if (err) throw err;
      }
      onSaved(); onClose();
    } catch (err: any) {
      setError('Erreur : ' + err.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
            {isEdit ? "Modifier l'année académique" : '+ Nouvelle année académique'}
          </h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={{ marginBottom: '.85rem' }}>
            <label htmlFor="annee-libelle">Libellé *</label>
            <input id="annee-libelle" name="libelle" type="text" value={libelle}
              onChange={e => { setLibelle(e.target.value); setLibelleManual(true); }}
              style={{ width: '100%', marginTop: 4 }} placeholder="ex : 2025-2026" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label htmlFor="annee-date-debut">Date début</label>
              <input id="annee-date-debut" name="date_debut" type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                style={{ width: '100%', marginTop: 4 }} />
            </div>
            <div>
              <label htmlFor="annee-date-fin">Date fin</label>
              <input id="annee-date-fin" name="date_fin" type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                style={{ width: '100%', marginTop: 4 }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.2rem' }}>
            <input type="checkbox" id="annee-courante" name="est_courante" checked={estCourante}
              onChange={e => setEstCourante(e.target.checked)}
              style={{ width: 16, height: 16, margin: 0 }} />
            <label htmlFor="annee-courante" style={{ fontSize: 13, fontWeight: 400, textTransform: 'none', letterSpacing: 0, margin: 0, cursor: 'pointer' }}>
              Année académique courante
            </label>
          </div>
          {estCourante && (
            <div role="alert" style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: '1rem' }}>
              ⚠️ Les autres années seront marquées comme non courantes.
            </div>
          )}
          {error && (
            <div role="alert" style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{error}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-blue" disabled={loading}>
              {loading ? (isEdit ? 'Enregistrement…' : 'Création…') : (isEdit ? 'Enregistrer' : "Créer l'année →")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
