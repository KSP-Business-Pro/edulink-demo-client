// src/modules/inscriptions/components/ModalInscriptionBatch.tsx
// Inscription d'une promotion entière à un semestre en 1 clic

import { useState } from 'react';
import { inscrirePromotion, type Semestre, type Promotion, type BatchResult } from '../inscriptions.service';

interface Props {
  ecoleId:    string;
  semestres:  Semestre[];
  promotions: Promotion[];
  onClose:    () => void;
  onSuccess:  (result: BatchResult) => void;
}

export function ModalInscriptionBatch({ ecoleId, semestres, promotions, onClose, onSuccess }: Props) {
  const [semestreId,    setSemestreId]    = useState('');
  const [promotionId,   setPromotionId]   = useState('');
  const [montant,       setMontant]       = useState('0');
  const [genFactures,   setGenFactures]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [result,        setResult]        = useState<BatchResult | null>(null);
  const [error,         setError]         = useState('');

  const promotion   = promotions.find(p => p.id === promotionId);
  const semestre    = semestres.find(s => s.id === semestreId);

  async function handleSubmit() {
    if (!semestreId || !promotionId) {
      setError('Sélectionnez un semestre et une promotion.');
      return;
    }
    if (genFactures && Number(montant) <= 0) {
      setError('Montant de scolarité requis pour générer les factures.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await inscrirePromotion({
        promotionId,
        semestreId,
        anneeAcademiqueId: promotion!.annee_academique_id,
        ecoleId,
        montantScolarite:  Number(montant),
        genererFactures:   genFactures,
      });
      setResult(res);
      if (res.inscrits > 0) onSuccess(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.title}>👥 Inscrire une promotion</div>
            <div style={S.sub}>Inscription en masse — tous les étudiants actifs de la promotion</div>
          </div>
          <button style={S.closeBtn} onClick={onClose} aria-label="Fermer la fenêtre">✕</button>
        </div>

        <div style={S.body}>
          {/* Résultat après exécution */}
          {result && (
            <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', marginBottom: 8 }}>✅ Inscription terminée</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { label: 'Inscrits',  val: result.inscrits, color: '#059669' },
                  { label: 'Doublons',  val: result.doublons, color: '#d97706' },
                  { label: 'Erreurs',   val: result.erreurs,  color: '#dc2626' },
                  { label: 'Factures',  val: result.factures, color: '#1d4ed8' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: 'center', background: '#fff', borderRadius: 8, padding: '8px 4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                  </div>
                ))}
              </div>
              <button style={{ ...S.btnPrimary, marginTop: 12, width: '100%' }} onClick={onClose}>
                Fermer
              </button>
            </div>
          )}

          {!result && (
            <>
              {/* Sélection semestre */}
              <div style={S.field}>
                <label htmlFor="insc-batch-semestre" style={S.label}>Semestre <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  id="insc-batch-semestre"
                  name="semestre"
                  style={S.select}
                  value={semestreId}
                  onChange={e => setSemestreId(e.target.value)}
                  aria-required="true"
                  aria-invalid={!!error && !semestreId}
                  aria-describedby={error ? 'insc-batch-error' : undefined}
                >
                  <option value="">— Choisir un semestre —</option>
                  {semestres.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.libelle} {s.statut === 'en_cours' ? '🟢' : s.statut === 'cloture' ? '🔒' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sélection promotion */}
              <div style={S.field}>
                <label htmlFor="insc-batch-promotion" style={S.label}>Promotion <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  id="insc-batch-promotion"
                  name="promotion"
                  style={S.select}
                  value={promotionId}
                  onChange={e => setPromotionId(e.target.value)}
                  aria-required="true"
                  aria-invalid={!!error && !promotionId}
                  aria-describedby={error ? 'insc-batch-error' : undefined}
                >
                  <option value="">— Choisir une promotion —</option>
                  {promotions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nom} · {p.niveau} · max {p.effectif_max ?? '—'} étudiants
                    </option>
                  ))}
                </select>
              </div>

              {/* Aperçu */}
              {promotion && semestre && (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#0369a1', marginBottom: 4 }}>
                  <strong>{promotion.nom}</strong> → <strong>{semestre.libelle}</strong>
                  <br />Tous les étudiants actifs de niveau <strong>{promotion.niveau}</strong> seront inscrits.
                </div>
              )}

              {/* Facturation */}
              <div style={{ ...S.field, marginTop: 4 }}>
                <label htmlFor="insc-batch-genfactures" style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    id="insc-batch-genfactures"
                    name="genererFactures"
                    checked={genFactures}
                    onChange={e => setGenFactures(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  Générer les factures de scolarité automatiquement
                </label>
              </div>

              {genFactures && (
                <div style={S.field}>
                  <label htmlFor="insc-batch-montant" style={S.label}>Montant scolarité par étudiant (FCFA) <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    type="number"
                    id="insc-batch-montant"
                    name="montant"
                    style={S.input}
                    value={montant}
                    onChange={e => setMontant(e.target.value)}
                    placeholder="ex : 350000"
                    min="0"
                    step="1000"
                    aria-required="true"
                    aria-invalid={!!error && Number(montant) <= 0}
                    aria-describedby={error ? 'insc-batch-error' : undefined}
                  />
                </div>
              )}

              {error && (
                <div id="insc-batch-error" role="alert" style={{ background: '#fef2f2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div style={S.footer}>
            <button style={S.btnSecondary} onClick={onClose} disabled={loading}>Annuler</button>
            <button style={{ ...S.btnPrimary, opacity: loading ? 0.7 : 1 }} onClick={handleSubmit} disabled={loading || !semestreId || !promotionId}>
              {loading ? '⏳ Inscription en cours…' : '✅ Lancer l\'inscription'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  overlay:      { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:        { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title:        { fontSize: 16, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  sub:          { fontSize: 11, color: '#94a3b8', marginTop: 3 } as React.CSSProperties,
  closeBtn:     { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, padding: 4 } as React.CSSProperties,
  body:         { padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.875rem' },
  footer:       { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  field:        { display: 'flex', flexDirection: 'column' as const, gap: 5 },
  label:        { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  select:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafafa', color: '#1e293b' } as React.CSSProperties,
  input:        { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafafa', color: '#1e293b' } as React.CSSProperties,
  btnPrimary:   { padding: '9px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary: { padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
};
