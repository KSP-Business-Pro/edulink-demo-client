// src/modules/presences/components/ModalSaisiePresence.tsx
import { useState, useEffect, useCallback } from 'react';
import type { EtudiantPresence, Presence, StatutPresence } from '../../../services/presences.service';
import { fetchPresences, marquerPresence, toutMarquerPresent } from '../../../services/presences.service';

interface Props {
  seanceId: string;
  matiereNom: string;
  etudiants: EtudiantPresence[];
  ecoleId: string;
  onClose: () => void;
}

const STATUT_CONFIG: Record<StatutPresence, { label: string; bg: string; border: string; btnClass: string; icon: string }> = {
  present:  { label: 'Présent',  bg: '#f0fdf4', border: '#bbf7d0', btnClass: 'btn-green',  icon: '✅' },
  retard:   { label: 'Retard',   bg: '#fef9c3', border: '#fde68a', btnClass: '',           icon: '⏰' },
  absent:   { label: 'Absent',   bg: '#fef2f2', border: '#fecaca', btnClass: 'btn-red',    icon: '❌' },
  justifie: { label: 'Justifié', bg: '#f3e8ff', border: '#d8b4fe', btnClass: '',           icon: '📄' },
};

export default function ModalSaisiePresence({ seanceId, matiereNom, etudiants, ecoleId, onClose }: Props) {
  const [presMap, setPresMap] = useState<Record<string, StatutPresence>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    const pres = await fetchPresences(seanceId);
    const m: Record<string, StatutPresence> = {};
    pres.forEach((p: Presence) => { m[p.etudiant_id] = p.statut; });
    setPresMap(m);
    setLoading(false);
  }, [seanceId]);

  useEffect(() => { reload(); }, [reload]);

  async function handleMarquer(etudiantId: string, statut: StatutPresence) {
    setSaving(s => ({ ...s, [etudiantId]: true }));
    setPresMap(m => ({ ...m, [etudiantId]: statut }));
    try {
      await marquerPresence(seanceId, etudiantId, statut, ecoleId);
    } catch {
      // rollback
      setPresMap(m => { const n = { ...m }; delete n[etudiantId]; return n; });
    } finally {
      setSaving(s => { const n = { ...s }; delete n[etudiantId]; return n; });
    }
  }

  async function handleTousPresents() {
    const ids = etudiants.map(e => e.id);
    const newMap: Record<string, StatutPresence> = {};
    ids.forEach(id => { newMap[id] = 'present'; });
    setPresMap(newMap);
    await toutMarquerPresent(seanceId, ids, ecoleId);
  }

  const nbPresents = Object.values(presMap).filter(s => s === 'present').length;
  const nbAbsents  = Object.values(presMap).filter(s => s === 'absent').length;
  const nbRetards  = Object.values(presMap).filter(s => s === 'retard').length;

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680, padding: '1.5rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
            Présences — {matiereNom}
          </h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Compteurs + action */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{etudiants.length} étudiants inscrits</span>
          <span className="badge green">{nbPresents} présents</span>
          <span className="badge red">{nbAbsents} absents</span>
          {nbRetards > 0 && <span className="badge amber">{nbRetards} retards</span>}
          <button className="btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={handleTousPresents}>
            ✅ Tous présents
          </button>
        </div>

        {/* Liste étudiants */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div className="loading">Chargement…</div>
          ) : (
            etudiants.map(et => {
              const statut = presMap[et.id] ?? 'absent';
              const cfg = STATUT_CONFIG[statut];
              const isSav = !!saving[et.id];
              return (
                <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.5rem .75rem', borderRadius: 8, marginBottom: '.3rem', background: cfg.bg, border: `1px solid ${cfg.border}`, opacity: isSav ? .7 : 1, transition: 'all .1s' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{et.nom} {et.prenom}</div>
                    <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{et.matricule ?? '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '.3rem' }}>
                    {(['present', 'retard', 'absent', 'justifie'] as StatutPresence[]).map(s => {
                      const c = STATUT_CONFIG[s];
                      const isActive = statut === s;
                      return (
                        <button key={s}
                          disabled={isSav}
                          onClick={() => handleMarquer(et.id, s)}
                          style={{
                            padding: '3px 8px', fontSize: 11, borderRadius: 6,
                            cursor: isSav ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', fontWeight: 600,
                            border: `1px solid ${isActive ? 'transparent' : '#e5e7eb'}`,
                            background: isActive
                              ? (s === 'present' ? '#059669' : s === 'absent' ? '#dc2626' : s === 'retard' ? '#d97706' : '#7c3aed')
                              : '#f9fafb',
                            color: isActive ? '#fff' : '#6b7280',
                          }}>
                          {c.icon} {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6', marginTop: '.5rem' }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Présents : <strong style={{ color: '#059669' }}>{nbPresents}</strong> · Absents : <strong style={{ color: '#dc2626' }}>{nbAbsents}</strong> · Retards : <strong style={{ color: '#d97706' }}>{nbRetards}</strong>
          </span>
          <button className="btn-blue btn-sm" onClick={onClose}>✓ Terminer la saisie</button>
        </div>
      </div>
    </div>
  );
}
