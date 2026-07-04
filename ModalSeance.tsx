// src/modules/emploi-du-temps/components/ModalSeance.tsx

import { useState, useEffect } from 'react';
import {
  createSeance, updateSeance, fetchMatieresBySemestre,
  type Seance, type SeancePayload, type TypeSeance,
  type MatiereOption, type EnseignantOption, type SemestreOption,
  TYPE_LABELS,
} from '../emploi-du-temps.service';

const TYPES: TypeSeance[] = [
  'CM','TD','TP','devoir_surveille','partiel',
  'examen_final','examen','rattrapage','expose','projet','autre',
];

const HEURES = Array.from({ length: 27 }, (_, i) => {
  const h = Math.floor(i / 2) + 7;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

interface Props {
  ecoleId:    string;
  seance:     Partial<Seance> | null; // null = création, objet = édition
  semestres:  SemestreOption[];
  enseignants:EnseignantOption[];
  onClose:    () => void;
  onSaved:    () => void;
}

const INIT: SeancePayload = {
  matiere_id: '', semestre_id: '', enseignant_id: null,
  date_seance: '', heure_debut: '08:00', heure_fin: '10:00',
  type_seance: 'CM', salle: '', observations: '',
};

export function ModalSeance({ ecoleId, seance, semestres, enseignants, onClose, onSaved }: Props) {
  const isEdit = !!(seance?.id);
  const [form,     setForm]     = useState<SeancePayload>(INIT);
  const [matieres, setMatieres] = useState<MatiereOption[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Pré-remplir en mode édition ou création avec date/heure pré-sélectionnées
  useEffect(() => {
    if (seance) {
      setForm({
        matiere_id:    seance.matiere_id    ?? '',
        semestre_id:   seance.semestre_id   ?? '',
        enseignant_id: seance.enseignant_id ?? null,
        date_seance:   seance.date_seance   ?? '',
        heure_debut:   seance.heure_debut?.slice(0, 5) ?? '08:00',
        heure_fin:     seance.heure_fin?.slice(0, 5)   ?? '10:00',
        type_seance:   (seance.type_seance  ?? 'CM') as TypeSeance,
        salle:         seance.salle         ?? '',
        observations:  seance.observations  ?? '',
      });
    }
  }, [seance]);

  // Charger matières quand semestre change
  useEffect(() => {
    if (!form.semestre_id) { setMatieres([]); return; }
    fetchMatieresBySemestre(ecoleId, form.semestre_id)
      .then(setMatieres)
      .catch(() => setMatieres([]));
  }, [form.semestre_id, ecoleId]);

  const set = (k: keyof SeancePayload, v: string | null) =>
    setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.date_seance)  { setError('Date obligatoire.');    return; }
    if (!form.semestre_id)  { setError('Semestre obligatoire.'); return; }
    if (!form.matiere_id)   { setError('Matière obligatoire.');  return; }
    if (form.heure_debut >= form.heure_fin) {
      setError('L\'heure de fin doit être après l\'heure de début.'); return;
    }
    setError(''); setSaving(true);
    try {
      if (isEdit && seance?.id) {
        await updateSeance(seance.id, form);
      } else {
        await createSeance(ecoleId, form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.title}>{isEdit ? '✏️ Modifier la séance' : '➕ Nouvelle séance'}</div>
            <div style={S.sub}>Emploi du temps — HEMEC</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {/* Ligne 1 : Date + Type */}
          <div style={S.row2}>
            <div style={S.field}>
              <label htmlFor="seance-date" style={S.label}>Date <span style={S.req}>*</span></label>
              <input id="seance-date" name="seance-date" type="date" style={S.input}
                value={form.date_seance}
                onChange={e => set('date_seance', e.target.value)}
              />
            </div>
            <div style={S.field}>
              <label htmlFor="seance-type-de-s-ance" style={S.label}>Type de séance <span style={S.req}>*</span></label>
              <select id="seance-type-de-s-ance" name="seance-type-de-s-ance" style={S.input} value={form.type_seance}
                onChange={e => set('type_seance', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          {/* Ligne 2 : Heure début / fin */}
          <div style={S.row2}>
            <div style={S.field}>
              <label htmlFor="seance-heure-d-but" style={S.label}>Heure début <span style={S.req}>*</span></label>
              <select id="seance-heure-d-but" name="seance-heure-d-but" style={S.input} value={form.heure_debut}
                onChange={e => set('heure_debut', e.target.value)}>
                {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label htmlFor="seance-heure-fin" style={S.label}>Heure fin <span style={S.req}>*</span></label>
              <select id="seance-heure-fin" name="seance-heure-fin" style={S.input} value={form.heure_fin}
                onChange={e => set('heure_fin', e.target.value)}>
                {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Semestre */}
          <div style={S.field}>
            <label htmlFor="seance-semestre" style={S.label}>Semestre <span style={S.req}>*</span></label>
            <select id="seance-semestre" name="seance-semestre" style={S.input} value={form.semestre_id}
              onChange={e => { set('semestre_id', e.target.value); set('matiere_id', ''); }}>
              <option value="">— Choisir un semestre —</option>
              {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
            </select>
          </div>

          {/* Matière */}
          <div style={S.field}>
            <label htmlFor="seance-mati-re" style={S.label}>Matière <span style={S.req}>*</span></label>
            <select id="seance-mati-re" name="seance-mati-re"
              style={{ ...S.input, opacity: !form.semestre_id ? 0.5 : 1 }}
              value={form.matiere_id}
              onChange={e => set('matiere_id', e.target.value)}
              disabled={!form.semestre_id}
            >
              <option value="">— Choisir une matière —</option>
              {matieres.map(m => (
                <option key={m.id} value={m.id}>{m.nom} ({m.code})</option>
              ))}
            </select>
            {form.semestre_id && matieres.length === 0 && (
              <div style={{ fontSize: 11, color: '#f97316', marginTop: 2 }}>
                Aucune matière liée à ce semestre
              </div>
            )}
          </div>

          {/* Enseignant */}
          <div style={S.field}>
            <label htmlFor="seance-enseignant" style={S.label}>Enseignant</label>
            <select id="seance-enseignant" name="seance-enseignant" style={S.input} value={form.enseignant_id ?? ''}
              onChange={e => set('enseignant_id', e.target.value || null)}>
              <option value="">— Aucun / À définir —</option>
              {enseignants.map(e => (
                <option key={e.id} value={e.id}>{e.nom} {e.prenom ?? ''}</option>
              ))}
            </select>
          </div>

          {/* Salle */}
          <div style={S.field}>
            <label htmlFor="seance-salle" style={S.label}>Salle</label>
            <input id="seance-salle" name="seance-salle" type="text" style={S.input}
              value={form.salle}
              onChange={e => set('salle', e.target.value)}
              placeholder="ex : Amphi A, Salle 12…"
            />
          </div>

          {/* Observations */}
          <div style={S.field}>
            <label htmlFor="seance-observations" style={S.label}>Observations</label>
            <textarea id="seance-observations" name="seance-observations" style={{ ...S.input, height: 60, resize: 'vertical' as const }}
              value={form.observations}
              onChange={e => set('observations', e.target.value)}
              placeholder="Notes, informations complémentaires…"
            />
          </div>

          {error && (
            <div role="alert" style={{ background: '#fef2f2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnSecondary} onClick={onClose} disabled={saving}>Annuler</button>
          <button style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Enregistrement…' : isEdit ? '✅ Modifier' : '✅ Créer la séance'}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title:       { fontSize: 16, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  sub:         { fontSize: 11, color: '#94a3b8', marginTop: 3 } as React.CSSProperties,
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', padding: 4 } as React.CSSProperties,
  body:        { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  footer:      { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  row2:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  req:         { color: '#dc2626' },
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafafa', color: '#1e293b' } as React.CSSProperties,
  btnPrimary:  { padding: '9px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
};
