// ─────────────────────────────────────────────────────────────────────────────
//  ModalSemestre.tsx — CRUD Semestre avec auto-libellé et niveaux dynamiques
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import type {
  Semestre, StatutSemestre, NiveauLMD, Programme, AnneeAcademique,
} from '../../../types/referentiel.types';
import {
  NIVEAUX_BY_GRADE, STATUT_SEMESTRE_LABEL,
} from '../../../types/referentiel.types';
import { createSemestre, updateSemestre } from '../../../services/referentiel.service';

interface Props {
  ecoleId: string;
  semestre?: Semestre | null;
  programmes: Programme[];
  annees: AnneeAcademique[];
  anneeActiveId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const STATUT_OPTIONS: StatutSemestre[] = ['planifie', 'en_cours', 'cloture', 'archive'];

export default function ModalSemestre({
  ecoleId, semestre, programmes, annees, anneeActiveId, onClose, onSaved,
}: Props) {
  const isEdit = Boolean(semestre);

  const [progId, setProgId]       = useState(semestre?.programme_id ?? '');
  const [anneeId, setAnneeId]     = useState(semestre?.annee_academique_id ?? anneeActiveId ?? '');
  const [numero, setNumero]       = useState(semestre?.numero ?? 1);
  const [libelle, setLibelle]     = useState(semestre?.libelle ?? '');
  const [niveau, setNiveau]       = useState<NiveauLMD | ''>(semestre?.niveau ?? '');
  const [statut, setStatut]       = useState<StatutSemestre>(semestre?.statut ?? 'planifie');
  const [dateDebut, setDateDebut] = useState(semestre?.date_debut ?? '');
  const [dateFin, setDateFin]     = useState(semestre?.date_fin ?? '');
  const [libelleManual, setLibelleManual] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Niveaux disponibles selon le programme sélectionné
  const prog      = programmes.find(p => p.id === progId);
  const niveauxOk = prog ? NIVEAUX_BY_GRADE[prog.grade] : (
    ['L1','L2','L3','M1','M2','D1','D2','D3'] as NiveauLMD[]
  );

  // Auto-libellé
  useEffect(() => {
    if (libelleManual) return;
    const annee = annees.find(a => a.id === anneeId);
    if (numero && prog) {
      const sug = `S${numero} — ${prog.intitule}${annee ? ' ' + annee.libelle : ''}`;
      setLibelle(sug);
    }
  }, [progId, numero, anneeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-niveau selon numéro de semestre
  useEffect(() => {
    if (!prog) return;
    const niveaux = NIVEAUX_BY_GRADE[prog.grade];
    const idx = Math.ceil(numero / 2) - 1;
    if (niveaux[idx]) setNiveau(niveaux[idx]);
  }, [progId, numero]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!niveau) { setError('Le niveau est obligatoire.'); return; }
    setLoading(true);
    setError(null);
    const payload = {
      ecole_id:            ecoleId,
      programme_id:        progId || null,
      annee_academique_id: anneeId || null,
      numero,
      libelle:             libelle.trim(),
      niveau:              niveau as NiveauLMD,
      statut,
      date_debut:          dateDebut || null,
      date_fin:            dateFin   || null,
    };
    try {
      if (isEdit && semestre?.id) {
        await updateSemestre(semestre.id, payload);
      } else {
        await createSemestre(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError('Erreur : ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
            {isEdit ? 'Modifier le semestre' : '+ Nouveau Semestre'}
          </h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Programme + Année */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Programme *</label>
              <select
                value={progId}
                onChange={(e) => { setProgId(e.target.value); setNiveau(''); }}
                style={{ width: '100%', marginTop: 4 }}
                required
              >
                <option value="">— Sélectionner —</option>
                {programmes.map(p => (
                  <option key={p.id} value={p.id}>{p.intitule}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Année académique</label>
              <select
                value={anneeId}
                onChange={(e) => setAnneeId(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              >
                <option value="">— Sélectionner —</option>
                {annees.map(a => (
                  <option key={a.id} value={a.id}>{a.libelle}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Numéro + Libellé */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>N° semestre *</label>
              <input
                type="number"
                value={numero}
                onChange={(e) => setNumero(parseInt(e.target.value) || 1)}
                style={{ width: '100%', marginTop: 4 }}
                min={1} max={12}
                placeholder="ex : 2"
                required
              />
            </div>
            <div>
              <label>Libellé *</label>
              <input
                type="text"
                value={libelle}
                onChange={(e) => { setLibelle(e.target.value); setLibelleManual(true); }}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="ex : S2 — Licence GFC 2025-2026"
                required
              />
            </div>
          </div>

          {/* Niveau + Statut */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Niveau *</label>
              <select
                value={niveau}
                onChange={(e) => setNiveau(e.target.value as NiveauLMD)}
                style={{ width: '100%', marginTop: 4 }}
                required
              >
                <option value="">—</option>
                {niveauxOk.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label>Statut *</label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value as StatutSemestre)}
                style={{ width: '100%', marginTop: 4 }}
                required
              >
                {STATUT_OPTIONS.map(s => (
                  <option key={s} value={s}>{STATUT_SEMESTRE_LABEL[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1.2rem' }}>
            <div>
              <label>Date début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
            <div>
              <label>Date fin</label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-blue" disabled={loading}>
              {loading ? (isEdit ? 'Enregistrement…' : 'Création…') : (isEdit ? 'Enregistrer' : 'Créer le semestre →')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
