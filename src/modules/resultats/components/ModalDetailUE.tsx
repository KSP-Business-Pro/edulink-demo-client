// src/modules/resultats/components/ModalDetailUE.tsx
import { useState, useEffect } from 'react';
import type { UEResultat } from '../../../types/resultats.types';
import { fetchDetailUE } from '../../../services/resultats.service';

interface Props {
  etudiantId: string;
  semId: string;
  nom: string;
  onClose: () => void;
}

export default function ModalDetailUE({ etudiantId, semId, nom, onClose }: Props) {
  const [ues, setUes]       = useState<UEResultat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetchDetailUE(etudiantId, semId)
      .then(setUes)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 640, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
            Résultats : {nom}
          </h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="loading">Chargement…</div>}
        {error && <div style={{ color: '#dc2626', fontSize: 13 }}>Erreur : {error}</div>}

        {!loading && !error && ues.length === 0 && (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucun résultat calculé — lancez le calcul d'abord.</p>
        )}

        {!loading && ues.map(r => {
          const statusClass = r.ue_validee ? 'green' : r.est_exclu ? 'gray' : 'red';
          const statusLabel = r.ue_validee ? (r.compensee ? 'Compensée' : 'Validée') : r.est_exclu ? 'Exclue' : 'Échec';
          const moyColor    = r.moyenne_ue === null ? '#9ca3af' : r.moyenne_ue >= 10 ? '#059669' : '#dc2626';
          return (
            <div key={r.ue_id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem', background: r.ue_validee ? '#f0fdf4' : r.est_exclu ? '#f9fafb' : '#fff5f5', borderRadius: 10, marginBottom: '.5rem', border: `1px solid ${r.ue_validee ? '#bbf7d0' : r.est_exclu ? '#e5e7eb' : '#fecaca'}` }}>
              <div style={{ minWidth: 70 }}>
                <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{r.ue_code}</code>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{r.ue_intitule}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {r.type_ue} · {r.obligatoire ? 'Obligatoire' : 'Optionnelle'} · CC {Math.round(r.poids_cc * 100)}% / Exam {Math.round(r.poids_examen * 100)}%
                </div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: moyColor }}>
                  {r.moyenne_ue !== null ? r.moyenne_ue.toFixed(2) : '—'}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>/ 20</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 60, fontSize: 12, color: '#6b7280' }}>
                {r.credits_acquis}/{r.ue_credits} cr.
              </div>
              <span className={`badge ${statusClass}`}>{statusLabel}</span>
            </div>
          );
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6', marginTop: '.5rem' }}>
          <button className="btn-secondary btn-sm" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
