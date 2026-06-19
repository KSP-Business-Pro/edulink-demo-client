// src/modules/deliberations/components/ModalPV.tsx
// B4.2 — Modal PV officiel de jury

import { useState, useEffect } from 'react';
import { upsertPV, validerPV } from '../../../services/deliberations.service';
import type { PVDelib } from '../../../types/deliberations.types';

interface Props {
  ecoleId:    string;
  semestreId: string;
  semLibelle: string;
  pv:         PVDelib | null;
  onClose:    () => void;
  onSaved:    () => void;
}

export function ModalPV({ ecoleId, semestreId, semLibelle, pv, onClose, onSaved }: Props) {
  const [date,        setDate]        = useState(pv?.date_deliberation ?? new Date().toISOString().split('T')[0]);
  const [president,   setPresident]   = useState(pv?.president_jury ?? '');
  const [membres,     setMembres]     = useState<string[]>(pv?.membres_jury ?? ['']);
  const [observations,setObservations]= useState(pv?.observations ?? '');
  const [saving,      setSaving]      = useState(false);
  const [validating,  setValidating]  = useState(false);
  const [error,       setError]       = useState('');

  const isValide = pv?.statut === 'valide';

  async function handleSave() {
    if (!president.trim()) { setError('Le président du jury est obligatoire.'); return; }
    setError(''); setSaving(true);
    try {
      await upsertPV({
        ecoleId, semestreId,
        dateDeliberation: date,
        presidentJury:    president.trim(),
        membresJury:      membres.filter(m => m.trim()),
        observations:     observations.trim(),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  async function handleValider() {
    if (!confirm('Valider définitivement ce PV ? Cette action est irréversible.')) return;
    setValidating(true);
    try {
      await validerPV(semestreId, ecoleId);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur validation');
    } finally {
      setValidating(false);
    }
  }

  const addMembre = () => setMembres(m => [...m, '']);
  const setMembre = (i: number, v: string) =>
    setMembres(m => m.map((x, j) => j === i ? v : x));
  const removeMembre = (i: number) =>
    setMembres(m => m.filter((_, j) => j !== i));

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.title}>📋 Procès-verbal de délibération</div>
            <div style={S.sub}>{semLibelle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pv?.statut && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                background: isValide ? '#d1fae5' : '#fef3c7',
                color:      isValide ? '#065f46' : '#92400e',
              }}>
                {isValide ? '✅ Validé' : '📝 Brouillon'}
              </span>
            )}
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={S.body}>
          {isValide && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534' }}>
              ✅ Ce PV a été validé officiellement. Il ne peut plus être modifié.
            </div>
          )}

          {/* Date */}
          <div style={S.field}>
            <label style={S.label}>Date de délibération <span style={{ color: '#dc2626' }}>*</span></label>
            <input type="date" style={S.input} value={date}
              onChange={e => setDate(e.target.value)} disabled={isValide} />
          </div>

          {/* Président */}
          <div style={S.field}>
            <label style={S.label}>Président du jury <span style={{ color: '#dc2626' }}>*</span></label>
            <input type="text" style={S.input}
              value={president}
              onChange={e => setPresident(e.target.value)}
              placeholder="Nom et titre du président"
              disabled={isValide}
            />
          </div>

          {/* Membres */}
          <div style={S.field}>
            <label style={S.label}>Membres du jury</label>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              {membres.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input type="text" style={{ ...S.input, flex: 1 }}
                    value={m}
                    onChange={e => setMembre(i, e.target.value)}
                    placeholder={`Membre ${i + 1}`}
                    disabled={isValide}
                  />
                  {!isValide && membres.length > 1 && (
                    <button onClick={() => removeMembre(i)}
                      style={{ padding: '6px 10px', border: '1px solid #fca5a5', borderRadius: 8, background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {!isValide && (
                <button onClick={addMembre}
                  style={{ padding: '6px 12px', border: '1px dashed #e2e8f0', borderRadius: 8, background: '#fafafa', color: '#64748b', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  + Ajouter un membre
                </button>
              )}
            </div>
          </div>

          {/* Observations */}
          <div style={S.field}>
            <label style={S.label}>Observations générales</label>
            <textarea style={{ ...S.input, height: 80, resize: 'vertical' as const }}
              value={observations}
              onChange={e => setObservations(e.target.value)}
              placeholder="Remarques du jury, conditions particulières…"
              disabled={isValide}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnSecondary} onClick={onClose}>Fermer</button>
          {!isValide && (
            <>
              <button style={{ ...S.btnSecondary, color: '#059669', borderColor: '#059669' }}
                onClick={handleValider} disabled={validating || !pv}>
                {validating ? '⏳' : '✅ Valider officiellement'}
              </button>
              <button style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }}
                onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Enregistrement…' : '💾 Enregistrer brouillon'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title:       { fontSize: 16, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  sub:         { fontSize: 11, color: '#94a3b8', marginTop: 3 } as React.CSSProperties,
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', padding: 4 } as React.CSSProperties,
  body:        { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.875rem' },
  footer:      { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 5 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafafa', color: '#1e293b' } as React.CSSProperties,
  btnPrimary:  { padding: '9px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
};

