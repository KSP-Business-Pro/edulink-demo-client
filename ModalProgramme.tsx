// ─────────────────────────────────────────────────────────────────────────────
//  ModalProgramme.tsx — CRUD Programme LMD
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import type { Programme, GradeLMD } from '../../../types/referentiel.types';
import {
  CREDITS_DEFAULTS, GRADE_LABEL,
} from '../../../types/referentiel.types';
import { createProgramme, updateProgramme } from '../../../services/referentiel.service';

interface Props {
  ecoleId: string;
  programme?: Programme | null;  // null = création
  onClose: () => void;
  onSaved: () => void;
}

const GRADE_OPTIONS: GradeLMD[] = ['licence', 'master', 'doctorat'];

export default function ModalProgramme({ ecoleId, programme, onClose, onSaved }: Props) {
  const isEdit = Boolean(programme);

  const [grade, setGrade]       = useState<GradeLMD>(programme?.grade ?? 'licence');
  const [code, setCode]         = useState(programme?.code ?? '');
  const [intitule, setIntitule] = useState(programme?.intitule ?? '');
  const [credits, setCredits]   = useState(programme?.credits_total ?? CREDITS_DEFAULTS.licence.credits);
  const [duree, setDuree]       = useState(programme?.duree_annees ?? CREDITS_DEFAULTS.licence.duree);
  const [actif, setActif]       = useState(programme?.actif ?? true);
  const [creditsManual, setCreditsManual] = useState(false);
  const [dureeManual, setDureeManual]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Auto-fill crédits/durée quand le grade change (si pas de saisie manuelle)
  useEffect(() => {
    if (!creditsManual) setCredits(CREDITS_DEFAULTS[grade].credits);
    if (!dureeManual)   setDuree(CREDITS_DEFAULTS[grade].duree);
  }, [grade]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      ecole_id:      ecoleId,
      code:          code.trim().toUpperCase(),
      intitule:      intitule.trim(),
      grade,
      credits_total: credits,
      duree_annees:  duree,
      actif,
    };
    try {
      if (isEdit && programme?.id) {
        await updateProgramme(programme.id, payload);
      } else {
        await createProgramme(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      const isDup = err.message?.includes('unique') || err.message?.includes('duplicate');
      setError(isDup ? 'Ce code programme existe déjà.' : 'Erreur : ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
            {isEdit ? 'Modifier le programme' : '+ Nouveau Programme'}
          </h3>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Fermer la fenêtre">✕</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Grade */}
          <div style={{ marginBottom: '.85rem' }}>
            <label htmlFor="prog-grade">Grade *</label>
            <select
              id="prog-grade" name="grade"
              value={grade}
              onChange={(e) => { setGrade(e.target.value as GradeLMD); setCreditsManual(false); setDureeManual(false); }}
              style={{ width: '100%', marginTop: 4 }}
              required
            >
              {GRADE_OPTIONS.map(g => (
                <option key={g} value={g}>
                  {GRADE_LABEL[g]} — {CREDITS_DEFAULTS[g].credits} CECT · {CREDITS_DEFAULTS[g].duree} ans
                </option>
              ))}
            </select>
          </div>

          {/* Code + Intitulé */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label htmlFor="prog-code">Code *</label>
              <input
                id="prog-code" name="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="LIC-GFC"
                required
              />
            </div>
            <div>
              <label htmlFor="prog-intitule">Intitulé complet *</label>
              <input
                id="prog-intitule" name="intitule"
                type="text"
                value={intitule}
                onChange={(e) => setIntitule(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="ex : Licence Gestion Financière et Comptable"
                required
              />
            </div>
          </div>

          {/* Crédits + Durée */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label htmlFor="prog-credits">Crédits CECT *</label>
              <input
                id="prog-credits" name="credits"
                type="number"
                value={credits}
                onChange={(e) => { setCredits(parseInt(e.target.value)); setCreditsManual(true); }}
                style={{ width: '100%', marginTop: 4 }}
                min={1} max={360}
                required
              />
            </div>
            <div>
              <label htmlFor="prog-duree">Durée (années) *</label>
              <input
                id="prog-duree" name="duree"
                type="number"
                value={duree}
                onChange={(e) => { setDuree(parseInt(e.target.value)); setDureeManual(true); }}
                style={{ width: '100%', marginTop: 4 }}
                min={1} max={10}
                required
              />
            </div>
          </div>

          {/* Actif */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.2rem' }}>
            <input
              type="checkbox"
              id="prog-actif"
              checked={actif}
              onChange={(e) => setActif(e.target.checked)}
              style={{ width: 16, height: 16, margin: 0 }}
            />
            <label htmlFor="prog-actif" style={{ fontSize: 13, fontWeight: 400, textTransform: 'none', letterSpacing: 0, margin: 0, cursor: 'pointer' }}>
              Programme actif
            </label>
          </div>

          {error && (
            <div role="alert" style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-blue" disabled={loading}>
              {loading ? (isEdit ? 'Enregistrement…' : 'Création…') : (isEdit ? 'Enregistrer' : 'Créer le programme →')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
