// src/modules/inscriptions/components/ModalInscriptionIndiv.tsx
// Inscription individuelle d'un étudiant à un semestre

import { useState, useEffect } from 'react';
import {
  fetchEtudiantsPromotion, inscrireEtudiant,
  type Semestre, type Promotion,
} from '../inscriptions.service';

interface Props {
  ecoleId:    string;
  semestres:  Semestre[];
  promotions: Promotion[];
  onClose:    () => void;
  onSuccess:  () => void;
}

interface EtudiantOption {
  id:           string;
  nom:          string;
  prenom:       string | null;
  matricule:    string | null;
  niveau:       string | null;
  deja_inscrit: boolean;
}

export function ModalInscriptionIndiv({ ecoleId, semestres, promotions, onClose, onSuccess }: Props) {
  const [semestreId,  setSemestreId]  = useState('');
  const [promotionId, setPromotionId] = useState('');
  const [etudiantId,  setEtudiantId]  = useState('');
  const [montant,     setMontant]     = useState('0');
  const [genFacture,  setGenFacture]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [loadingEtu,  setLoadingEtu]  = useState(false);
  const [etudiants,   setEtudiants]   = useState<EtudiantOption[]>([]);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  const promotion = promotions.find(p => p.id === promotionId);

  // Charger les étudiants quand promotion + semestre sont choisis
  useEffect(() => {
    if (!promotionId || !semestreId) { setEtudiants([]); setEtudiantId(''); return; }
    setLoadingEtu(true);
    fetchEtudiantsPromotion(ecoleId, promotionId, semestreId)
      .then(data => { setEtudiants(data); setEtudiantId(''); })
      .catch(() => setEtudiants([]))
      .finally(() => setLoadingEtu(false));
  }, [promotionId, semestreId, ecoleId]);

  async function handleSubmit() {
    if (!semestreId || !promotionId || !etudiantId) {
      setError('Tous les champs sont obligatoires.');
      return;
    }
    if (genFacture && Number(montant) <= 0) {
      setError('Montant requis pour générer la facture.');
      return;
    }
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await inscrireEtudiant({
        etudiantId,
        semestreId,
        promotionId,
        anneeAcademiqueId: promotion!.annee_academique_id,
        ecoleId,
        montantScolarite:  Number(montant),
        genererFacture:    genFacture,
      });
      if (!res.ok) {
        setError(res.error ?? 'Erreur inconnue');
      } else {
        const etu = etudiants.find(e => e.id === etudiantId);
        setSuccess(`✅ ${etu?.nom} ${etu?.prenom ?? ''} inscrit avec succès${res.facture_id ? ' · Facture générée' : ''}`);
        setEtudiantId('');
        // Rafraîchir la liste (l'étudiant est maintenant inscrit)
        fetchEtudiantsPromotion(ecoleId, promotionId, semestreId)
          .then(data => setEtudiants(data));
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  const etudiantsDisponibles = etudiants.filter(e => !e.deja_inscrit);
  const etudiantsInscrits    = etudiants.filter(e => e.deja_inscrit);

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.title}>➕ Inscription individuelle</div>
            <div style={S.sub}>Inscrire un étudiant à un semestre spécifique</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {/* Semestre */}
          <div style={S.field}>
            <label style={S.label}>Semestre <span style={{ color: '#dc2626' }}>*</span></label>
            <select style={S.select} value={semestreId} onChange={e => setSemestreId(e.target.value)}>
              <option value="">— Choisir un semestre —</option>
              {semestres.map(s => (
                <option key={s.id} value={s.id}>
                  {s.libelle} {s.statut === 'en_cours' ? '🟢' : s.statut === 'cloture' ? '🔒' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Promotion */}
          <div style={S.field}>
            <label style={S.label}>Promotion <span style={{ color: '#dc2626' }}>*</span></label>
            <select style={S.select} value={promotionId} onChange={e => setPromotionId(e.target.value)}>
              <option value="">— Choisir une promotion —</option>
              {promotions.map(p => (
                <option key={p.id} value={p.id}>{p.nom} · {p.niveau}</option>
              ))}
            </select>
          </div>

          {/* Étudiant */}
          <div style={S.field}>
            <label style={S.label}>
              Étudiant <span style={{ color: '#dc2626' }}>*</span>
              {etudiantsDisponibles.length > 0 && (
                <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>
                  ({etudiantsDisponibles.length} disponible{etudiantsDisponibles.length > 1 ? 's' : ''}
                  {etudiantsInscrits.length > 0 ? ` · ${etudiantsInscrits.length} déjà inscrit${etudiantsInscrits.length > 1 ? 's' : ''}` : ''})
                </span>
              )}
            </label>
            {loadingEtu ? (
              <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8' }}>Chargement…</div>
            ) : (
              <select
                style={{ ...S.select, opacity: !promotionId || !semestreId ? 0.5 : 1 }}
                value={etudiantId}
                onChange={e => setEtudiantId(e.target.value)}
                disabled={!promotionId || !semestreId}
              >
                <option value="">— Choisir un étudiant —</option>
                {etudiantsDisponibles.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.nom} {e.prenom ?? ''} · {e.matricule ?? '—'} · {e.niveau ?? '—'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Facturation */}
          <div style={{ ...S.field, marginTop: 4 }}>
            <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={genFacture}
                onChange={e => setGenFacture(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              Générer une facture de scolarité
            </label>
          </div>

          {genFacture && (
            <div style={S.field}>
              <label style={S.label}>Montant (FCFA) <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                type="number"
                style={S.input}
                value={montant}
                onChange={e => setMontant(e.target.value)}
                placeholder="ex : 350000"
                min="0"
                step="1000"
              />
            </div>
          )}

          {/* Messages */}
          {error && (
            <div style={{ background: '#fef2f2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: '#f0fdf4', color: '#166534', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #bbf7d0' }}>
              {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnSecondary} onClick={onClose}>Fermer</button>
          <button
            style={{ ...S.btnPrimary, opacity: loading || !etudiantId ? 0.6 : 1 }}
            onClick={handleSubmit}
            disabled={loading || !etudiantId || !semestreId || !promotionId}
          >
            {loading ? '⏳ Inscription…' : '✅ Inscrire'}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:      { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:        { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
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
