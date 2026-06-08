// ─────────────────────────────────────────────────────────────────────────────
//  ModalUE.tsx — CRUD Unité d'Enseignement
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import type { UniteEnseignement, TypeUE, Programme } from '../../../types/referentiel.types';
import { createUE, updateUE } from '../../../services/referentiel.service';

interface Props {
  ecoleId: string;
  ue?: UniteEnseignement | null;
  programmes: Programme[];
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_OPTIONS: { value: TypeUE; label: string }[] = [
  { value: 'fondamentale',  label: 'Fondamentale' },
  { value: 'optionnelle',   label: 'Optionnelle' },
  { value: 'transversale',  label: 'Transversale' },
];

export default function ModalUE({ ecoleId, ue, programmes, onClose, onSaved }: Props) {
  const isEdit = Boolean(ue);

  const [code, setCode]         = useState(ue?.code ?? '');
  const [intitule, setIntitule] = useState(ue?.intitule ?? '');
  const [typeUE, setTypeUE]     = useState<TypeUE>(ue?.type_ue ?? 'fondamentale');
  const [credits, setCredits]   = useState(ue?.credits_cect ?? 4);
  const [poidsCc, setPoidsCc]   = useState(Math.round((ue?.poids_cc ?? 0.4) * 100));
  const [progId, setProgId]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const poidsExam = 100 - poidsCc;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      ecole_id:     ecoleId,
      code:         code.trim().toUpperCase(),
      intitule:     intitule.trim(),
      type_ue:      typeUE,
      credits_cect: credits,
      poids_cc:     poidsCc / 100,
      poids_examen: poidsExam / 100,
    };
    try {
      if (isEdit && ue?.id) {
        await updateUE(ue.id, payload);
      } else {
        await createUE(payload, progId || undefined);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      const isDup = err.message?.includes('ue_unique') || err.message?.includes('duplicate');
      const isRls = err.message?.includes('row-level security');
      setError(
        isDup  ? 'Ce code UE existe déjà — choisissez un code différent.' :
        isRls  ? 'Accès refusé — vérifiez vos droits.' :
        'Erreur : ' + err.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
            {isEdit ? "Modifier l'UE" : "+ Nouvelle Unité d'Enseignement"}
          </h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Code + Intitulé */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Code *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="GFC-L1-UE3"
                required
              />
            </div>
            <div>
              <label>Intitulé *</label>
              <input
                type="text"
                value={intitule}
                onChange={(e) => setIntitule(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="ex : Comptabilité analytique"
                required
              />
            </div>
          </div>

          {/* Type + Crédits */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Type *</label>
              <select
                value={typeUE}
                onChange={(e) => setTypeUE(e.target.value as TypeUE)}
                style={{ width: '100%', marginTop: 4 }}
                required
              >
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label>Crédits CECT *</label>
              <input
                type="number"
                value={credits}
                onChange={(e) => setCredits(parseInt(e.target.value))}
                style={{ width: '100%', marginTop: 4 }}
                min={1} max={30}
                placeholder="4"
                required
              />
            </div>
          </div>

          {/* Pondération CC / Examen */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Pondération CC % *</label>
              <input
                type="number"
                value={poidsCc}
                onChange={(e) => setPoidsCc(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                style={{ width: '100%', marginTop: 4 }}
                min={0} max={100} step={5}
                placeholder="40"
                required
              />
            </div>
            <div>
              <label>Exam % (auto)</label>
              <input
                type="number"
                value={poidsExam}
                readOnly
                style={{ width: '100%', marginTop: 4, background: '#f9fafb', color: '#6b7280' }}
              />
            </div>
          </div>

          {/* Programme (création uniquement) */}
          {!isEdit && (
            <div style={{ marginBottom: '1.2rem' }}>
              <label>Programme (optionnel)</label>
              <select
                value={progId}
                onChange={(e) => setProgId(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              >
                <option value="">— sélectionner —</option>
                {programmes.map(p => (
                  <option key={p.id} value={p.id}>{p.intitule}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-blue" disabled={loading}>
              {loading ? (isEdit ? 'Enregistrement…' : 'Création…') : (isEdit ? 'Enregistrer' : "Créer l'UE →")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
