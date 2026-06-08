// src/modules/saisie-notes/components/GrilleNotes.tsx
import { useState, useCallback } from 'react';
import type { Evaluation, EtudiantSaisie, NoteLMD, MatiereSaisie, SessionEvaluation } from '../../../types/saisie.types';
import { calculerLigneGrille, sauvegarderNote, toggleAbsent } from '../../../services/saisie.service';

interface Props {
  matiere: MatiereSaisie;
  session: SessionEvaluation;
  evalsCC: Evaluation[];
  evalsEX: Evaluation[];
  etudiants: EtudiantSaisie[];
  notes: NoteLMD[];
  ecoleId: string;
  onRefresh: () => void;
  onAjouterEval: (cat: 'CC' | 'EXAMEN') => void;
  onChangerStatut: (statut: string) => void;
  onImporter: () => void;
}

export default function GrilleNotes({
  matiere, session, evalsCC, evalsEX, etudiants, notes,
  ecoleId, onRefresh, onAjouterEval, onChangerStatut, onImporter,
}: Props) {
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const poids_cc = matiere.unites_enseignement?.poids_cc ?? 0.4;
  const poids_ex = matiere.unites_enseignement?.poids_examen ?? 0.6;
  const sessLocked  = session.statut === 'close';
  const sessPlanned = session.statut === 'planifiee';

  // Build notesMap
  const notesMap: Record<string, Record<string, NoteLMD>> = {};
  notes.forEach(n => {
    if (!notesMap[n.etudiant_id]) notesMap[n.etudiant_id] = {};
    notesMap[n.etudiant_id][n.evaluation_id] = n;
  });

  const lignes = etudiants.map(et =>
    calculerLigneGrille(et, evalsCC, evalsEX, notesMap, poids_cc, poids_ex)
  );

  const handleBlur = useCallback(async (
    inputEl: HTMLInputElement, etudiantId: string, evaluationId: string
  ) => {
    const raw = inputEl.value.trim();
    if (raw === '') return;
    const valeur = parseFloat(raw);
    const key = `${etudiantId}-${evaluationId}`;
    if (isNaN(valeur) || valeur < 0 || valeur > 20) {
      setErrors(e => ({ ...e, [key]: 'invalide' }));
      return;
    }
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
    setSaving(s => ({ ...s, [key]: true }));
    try {
      await sauvegarderNote(etudiantId, evaluationId, valeur, ecoleId);
      onRefresh();
    } catch (err: any) {
      setErrors(e => ({ ...e, [key]: err.message }));
    } finally {
      setSaving(s => { const n = { ...s }; delete n[key]; return n; });
    }
  }, [ecoleId, onRefresh]);

  const handleToggleAbsent = useCallback(async (
    etudiantId: string, evaluationId: string, isAbsent: boolean
  ) => {
    try {
      await toggleAbsent(etudiantId, evaluationId, isAbsent, ecoleId);
      onRefresh();
    } catch {}
  }, [ecoleId, onRefresh]);

  const statusColor = sessLocked ? '#dc2626' : sessPlanned ? '#f97316' : '#059669';
  const statusLabel = sessLocked ? '🔒 Verrouillée' : sessPlanned ? '⏳ Planifiée' : '🔓 Ouverte';

  return (
    <div>
      {/* En-tête matière */}
      <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{matiere.nom}</div>
          <div style={{ fontSize: 12, opacity: .7 }}>
            UE {matiere.unites_enseignement?.code ?? '—'} · Coef. {matiere.coefficient} · CC {Math.round(poids_cc * 100)}% / Exam {Math.round(poids_ex * 100)}%
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, opacity: .7 }}>{etudiants.length} étudiants</span>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600, background: statusColor, color: '#fff' }}>
            {statusLabel}
          </span>
          {!sessPlanned && !sessLocked && (
            <>
              <button onClick={() => onAjouterEval('CC')} style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>+ CC</button>
              <button onClick={() => onAjouterEval('EXAMEN')} style={{ background: 'rgba(201,124,26,.8)', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>+ Exam</button>
            </>
          )}
          <button onClick={onImporter} style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>⬆ Import</button>
          {!sessLocked && !sessPlanned && (
            <button onClick={() => onChangerStatut('close')} style={{ background: 'rgba(220,38,38,.7)', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Clôturer</button>
          )}
          {sessLocked && (
            <button onClick={() => onChangerStatut('ouverte')} style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Rouvrir</button>
          )}
        </div>
      </div>

      {/* Grille */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#6b7280', borderBottom: '2px solid #e5e7eb', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 1 }}>Étudiant</th>
              {evalsCC.map(e => (
                <th key={e.id} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#1d4ed8', borderBottom: '2px solid #dbeafe', minWidth: 80 }}>
                  <div>CC</div>
                  <div style={{ fontWeight: 400, color: '#9ca3af' }}>{e.intitule || e.format}</div>
                  <div style={{ fontSize: 9, color: '#c97c1a' }}>{Math.round(e.ponderation * 100)}%</div>
                </th>
              ))}
              {evalsEX.map(e => (
                <th key={e.id} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#7c3aed', borderBottom: '2px solid #ede9fe', minWidth: 80 }}>
                  <div>EXAMEN</div>
                  <div style={{ fontWeight: 400, color: '#9ca3af' }}>{e.intitule || e.format}</div>
                </th>
              ))}
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#059669', borderBottom: '2px solid #dcfce7', minWidth: 70 }}>Moy. CC</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#374151', borderBottom: '2px solid #e5e7eb', minWidth: 70 }}>Note finale</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, idx) => {
              const et = ligne.etudiant;
              const bg = idx % 2 === 0 ? '#fff' : '#fafafa';
              return (
                <tr key={et.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: bg, zIndex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{et.nom} {et.prenom}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{et.matricule ?? '—'}</div>
                  </td>

                  {evalsCC.map((e, i) => {
                    const n = notesMap[et.id]?.[e.id];
                    const isAbs = ligne.absentsCC[i];
                    const key = `${et.id}-${e.id}`;
                    const isErr = !!errors[key];
                    const isSav = !!saving[key];
                    return (
                      <td key={e.id} style={{ padding: '4px 6px', textAlign: 'center', background: bg }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                          <input
                            type="number" min={0} max={20} step={0.5}
                            defaultValue={isAbs ? '' : (n?.valeur ?? '')}
                            disabled={isAbs || sessLocked || isSav}
                            placeholder="—"
                            style={{ width: 54, textAlign: 'center', padding: 4, border: `1px solid ${isErr ? '#dc2626' : isAbs || sessLocked ? '#f3f4f6' : '#e5e7eb'}`, borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: isAbs || sessLocked ? '#f9fafb' : '#fff', color: isAbs || sessLocked ? '#9ca3af' : '#111827' }}
                            onFocus={el => (el.currentTarget.style.borderColor = '#1e3a5f')}
                            onBlur={el => handleBlur(el.currentTarget, et.id, e.id)}
                            onKeyDown={el => { if (el.key === 'Enter' || el.key === 'Tab') el.currentTarget.blur(); }}
                          />
                          <button
                            disabled={sessLocked}
                            onClick={() => handleToggleAbsent(et.id, e.id, isAbs)}
                            style={{ padding: '1px 4px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: sessLocked ? 'not-allowed' : 'pointer', border: `1px solid ${isAbs ? '#dc2626' : '#e5e7eb'}`, background: isAbs ? '#fee2e2' : '#f9fafb', color: isAbs ? '#dc2626' : '#9ca3af', lineHeight: 1.6, flexShrink: 0, fontFamily: 'inherit', opacity: sessLocked ? .4 : 1 }}
                          >ABS</button>
                        </div>
                      </td>
                    );
                  })}

                  {evalsEX.map((e, i) => {
                    const n = notesMap[et.id]?.[e.id];
                    const isAbs = ligne.absentsEX[i];
                    const key = `${et.id}-${e.id}`;
                    const isErr = !!errors[key];
                    const isSav = !!saving[key];
                    return (
                      <td key={e.id} style={{ padding: '4px 6px', textAlign: 'center', background: bg }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                          <input
                            type="number" min={0} max={20} step={0.5}
                            defaultValue={isAbs ? '' : (n?.valeur ?? '')}
                            disabled={isAbs || sessLocked || isSav}
                            placeholder="—"
                            style={{ width: 54, textAlign: 'center', padding: 4, border: `1px solid ${isErr ? '#dc2626' : isAbs ? '#f3f4f6' : '#ede9fe'}`, borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: isAbs ? '#f9fafb' : '#fff', color: isAbs ? '#9ca3af' : '#111827' }}
                            onFocus={el => (el.currentTarget.style.borderColor = '#7c3aed')}
                            onBlur={el => handleBlur(el.currentTarget, et.id, e.id)}
                            onKeyDown={el => { if (el.key === 'Enter' || el.key === 'Tab') el.currentTarget.blur(); }}
                          />
                          <button
                            disabled={sessLocked}
                            onClick={() => handleToggleAbsent(et.id, e.id, isAbs)}
                            style={{ padding: '1px 4px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: sessLocked ? 'not-allowed' : 'pointer', border: `1px solid ${isAbs ? '#dc2626' : '#ede9fe'}`, background: isAbs ? '#fee2e2' : '#f9fafb', color: isAbs ? '#dc2626' : '#9ca3af', lineHeight: 1.6, flexShrink: 0, fontFamily: 'inherit', opacity: sessLocked ? .4 : 1 }}
                          >ABS</button>
                        </div>
                      </td>
                    );
                  })}

                  <td style={{ padding: '8px 6px', textAlign: 'center', background: bg }}>
                    <NoteChip val={ligne.moyCC} />
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', background: bg }}>
                    <NoteChip val={ligne.finale} bold />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '.75rem', fontSize: 11, color: '#9ca3af' }}>
        💡 Saisissez une note et appuyez sur Entrée ou Tab pour sauvegarder automatiquement.
      </div>
    </div>
  );
}

function NoteChip({ val, bold }: { val: number | null; bold?: boolean }) {
  const color = val === null ? '#9ca3af' : val >= 10 ? '#059669' : '#dc2626';
  const bg    = val === null ? '#f3f4f6' : val >= 10 ? '#dcfce7' : '#fee2e2';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: bold ? 700 : 600, background: bg, color }}>
      {val !== null ? val.toFixed(2) : '—'}
    </span>
  );
}
