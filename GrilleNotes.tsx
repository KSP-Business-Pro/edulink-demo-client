// src/modules/saisie-notes/components/GrilleNotes.tsx
// B4.1 — Améliorations : stats grille, navigation Tab inter-cellules, export Excel

import { useState, useCallback, useRef } from 'react';
import type {
  Evaluation, EtudiantSaisie, NoteLMD,
  MatiereSaisie, SessionEvaluation,
} from '../../../types/saisie.types';
import {
  calculerLigneGrille, sauvegarderNote, toggleAbsent,
} from '../../../services/saisie.service';

interface Props {
  matiere:         MatiereSaisie;
  session:         SessionEvaluation;
  evalsCC:         Evaluation[];
  evalsEX:         Evaluation[];
  etudiants:       EtudiantSaisie[];
  notes:           NoteLMD[];
  ecoleId:         string;
  onRefresh:       () => void;
  onAjouterEval:   (cat: 'CC' | 'EXAMEN') => void;
  onChangerStatut: (statut: string) => void;
  onImporter:      () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function noteColor(val: number | null): { bg: string; color: string } {
  if (val === null) return { bg: '#f3f4f6', color: '#9ca3af' };
  if (val >= 16)   return { bg: '#dcfce7', color: '#166534' };
  if (val >= 12)   return { bg: '#dbeafe', color: '#1d4ed8' };
  if (val >= 10)   return { bg: '#fef9c3', color: '#854d0e' };
  return              { bg: '#fee2e2', color: '#991b1b' };
}

function NoteChip({ val, bold }: { val: number | null; bold?: boolean }) {
  const { bg, color } = noteColor(val);
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: bold ? 700 : 600, background: bg, color }}>
      {val !== null ? val.toFixed(2) : '—'}
    </span>
  );
}

export default function GrilleNotes({
  matiere, session, evalsCC, evalsEX, etudiants, notes,
  ecoleId, onRefresh, onAjouterEval, onChangerStatut, onImporter,
}: Props) {
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  const poids_cc = matiere.unites_enseignement?.poids_cc     ?? 0.4;
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

  // ── Statistiques grille ────────────────────────────────────────────────────
  const totalCells   = etudiants.length * (evalsCC.length + evalsEX.length);
  const saisiesCells = notes.filter(n => n.valeur !== null || n.absent).length;
  const pctCompletion = totalCells > 0 ? Math.round((saisiesCells / totalCells) * 100) : 0;

  const finales = lignes.map(l => l.finale).filter((v): v is number => v !== null);
  const moyenneClasse = finales.length > 0
    ? Math.round(finales.reduce((s, v) => s + v, 0) / finales.length * 100) / 100
    : null;
  const nbReussite = finales.filter(v => v >= 10).length;
  const tauxReussite = finales.length > 0 ? Math.round((nbReussite / finales.length) * 100) : 0;

  // ── Navigation Tab inter-cellules ──────────────────────────────────────────
  // Toutes les cellules input indexées par [etudiantIndex][evalIndex]
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const getNextInput = (etIdx: number, evalIdx: number): HTMLInputElement | null => {
    const allEvals = [...evalsCC, ...evalsEX];
    let nextEvalIdx = evalIdx + 1;
    let nextEtIdx   = etIdx;
    if (nextEvalIdx >= allEvals.length) { nextEvalIdx = 0; nextEtIdx++; }
    if (nextEtIdx >= etudiants.length)  return null;
    return inputRefs.current[nextEtIdx]?.[nextEvalIdx] ?? null;
  };

  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    etIdx: number, evalIdx: number
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      e.currentTarget.blur();
      setTimeout(() => {
        const next = getNextInput(etIdx, evalIdx);
        next?.focus();
      }, 50);
    }
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  }, [etudiants.length, evalsCC.length, evalsEX.length]); // eslint-disable-line

  // ── Sauvegarde note ────────────────────────────────────────────────────────
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
    } catch (err: unknown) {
      setErrors(e => ({ ...e, [key]: err instanceof Error ? err.message : 'Erreur' }));
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
    } catch { /* silencieux */ }
  }, [ecoleId, onRefresh]);

  // ── Export Excel ───────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const mod = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm') as any;
      const XLSX = mod.default ?? mod;

      const allEvals = [...evalsCC, ...evalsEX];
      const headers = [
        'Matricule', 'Nom', 'Prénom',
        ...evalsCC.map(e => `CC - ${e.intitule || e.format}`),
        ...evalsEX.map(e => `EXAM - ${e.intitule || e.format}`),
        'Moy. CC', 'Note finale',
      ];

      const rows = lignes.map(l => {
        const row: (string | number)[] = [
          l.etudiant.matricule ?? '',
          l.etudiant.nom,
          l.etudiant.prenom ?? '',
        ];
        evalsCC.forEach((e, i) => {
          const n = notesMap[l.etudiant.id]?.[e.id];
          row.push(n?.absent ? 'ABS' : (n?.valeur ?? ''));
        });
        evalsEX.forEach((e, i) => {
          const n = notesMap[l.etudiant.id]?.[e.id];
          row.push(n?.absent ? 'ABS' : (n?.valeur ?? ''));
        });
        row.push(l.moyCC ?? '');
        row.push(l.finale ?? '');
        return row;
      });

      // Ligne stats en bas
      rows.push([]);
      rows.push(['Moyenne classe', '', '', ...Array(allEvals.length).fill(''), moyenneClasse ?? '', moyenneClasse ?? '']);
      rows.push(['Taux réussite', '', '', ...Array(allEvals.length).fill(''), `${tauxReussite}%`, `${tauxReussite}%`]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Notes');
      XLSX.writeFile(wb, `Notes_${matiere.code}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const statusColor = sessLocked ? '#dc2626' : sessPlanned ? '#f97316' : '#059669';
  const statusLabel = sessLocked ? '🔒 Verrouillée' : sessPlanned ? '⏳ Planifiée' : '🔓 Ouverte';

  return (
    <div>
      {/* ── En-tête matière ── */}
      <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
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
              <button onClick={() => onAjouterEval('CC')}
                style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                + CC
              </button>
              <button onClick={() => onAjouterEval('EXAMEN')}
                style={{ background: 'rgba(201,124,26,.8)', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Exam
              </button>
            </>
          )}
          <button onClick={onImporter}
            style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            ⬆ Import
          </button>
          <button onClick={handleExport} disabled={exporting}
            style={{ background: 'rgba(16,185,129,.4)', color: '#fff', border: '1px solid rgba(16,185,129,.6)', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1 }}>
            {exporting ? '⏳' : '⬇ Excel'}
          </button>
          {!sessLocked && !sessPlanned && (
            <button onClick={() => onChangerStatut('close')}
              style={{ background: 'rgba(220,38,38,.7)', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              Clôturer
            </button>
          )}
          {sessLocked && (
            <button onClick={() => onChangerStatut('ouverte')}
              style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              Rouvrir
            </button>
          )}
        </div>
      </div>

      {/* ── Bandeau statistiques ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '0.75rem' }}>
        {[
          {
            label: 'Complétion',
            val: `${pctCompletion}%`,
            sub: `${saisiesCells} / ${totalCells} notes`,
            color: pctCompletion === 100 ? '#059669' : pctCompletion >= 50 ? '#d97706' : '#dc2626',
            bg: pctCompletion === 100 ? '#f0fdf4' : pctCompletion >= 50 ? '#fffbeb' : '#fef2f2',
          },
          {
            label: 'Moyenne classe',
            val: moyenneClasse !== null ? moyenneClasse.toFixed(2) : '—',
            sub: `${finales.length} notes finales`,
            color: moyenneClasse !== null ? (moyenneClasse >= 10 ? '#059669' : '#dc2626') : '#94a3b8',
            bg: moyenneClasse !== null ? (moyenneClasse >= 10 ? '#f0fdf4' : '#fef2f2') : '#f8fafc',
          },
          {
            label: 'Taux de réussite',
            val: finales.length > 0 ? `${tauxReussite}%` : '—',
            sub: `${nbReussite} / ${finales.length} ≥ 10`,
            color: tauxReussite >= 70 ? '#059669' : tauxReussite >= 50 ? '#d97706' : '#dc2626',
            bg: tauxReussite >= 70 ? '#f0fdf4' : tauxReussite >= 50 ? '#fffbeb' : '#fef2f2',
          },
          {
            label: 'Absents',
            val: notes.filter(n => n.absent).length.toString(),
            sub: `sur ${totalCells} pointages`,
            color: '#7e22ce',
            bg: '#f5f3ff',
          },
        ].map(({ label, val, sub, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.6rem 0.875rem', border: `1px solid ${bg}` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Grille de saisie ── */}
      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#6b7280', borderBottom: '2px solid #e5e7eb', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 1, minWidth: 180 }}>
                Étudiant
              </th>
              {evalsCC.map(e => (
                <th key={e.id} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#1d4ed8', borderBottom: '2px solid #dbeafe', minWidth: 90 }}>
                  <div style={{ fontWeight: 700 }}>CC</div>
                  <div style={{ fontWeight: 400, color: '#6b7280', fontSize: 9 }}>{e.intitule || e.format}</div>
                  <div style={{ fontSize: 9, color: '#c97c1a' }}>{Math.round(e.ponderation * 100)}%</div>
                </th>
              ))}
              {evalsEX.map(e => (
                <th key={e.id} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#7c3aed', borderBottom: '2px solid #ede9fe', minWidth: 90 }}>
                  <div style={{ fontWeight: 700 }}>EXAMEN</div>
                  <div style={{ fontWeight: 400, color: '#6b7280', fontSize: 9 }}>{e.intitule || e.format}</div>
                </th>
              ))}
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#059669', borderBottom: '2px solid #dcfce7', minWidth: 70 }}>Moy. CC</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#374151', borderBottom: '2px solid #e5e7eb', minWidth: 80 }}>Note finale</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, etIdx) => {
              const et  = ligne.etudiant;
              const bg  = etIdx % 2 === 0 ? '#fff' : '#fafafa';
              const allEvals = [...evalsCC, ...evalsEX];
              if (!inputRefs.current[etIdx]) inputRefs.current[etIdx] = [];

              return (
                <tr key={et.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {/* Étudiant */}
                  <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: bg, zIndex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{et.nom} {et.prenom}</div>
                    <code style={{ fontSize: 9, color: '#94a3b8', background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>
                      {et.matricule ?? '—'}
                    </code>
                  </td>

                  {/* Cellules CC */}
                  {evalsCC.map((e, evalIdx) => {
                    const n      = notesMap[et.id]?.[e.id];
                    const isAbs  = ligne.absentsCC[evalIdx];
                    const key    = `${et.id}-${e.id}`;
                    const isErr  = !!errors[key];
                    const isSav  = !!saving[key];
                    const globalEvalIdx = evalIdx;

                    return (
                      <td key={e.id} style={{ padding: '4px 6px', textAlign: 'center', background: bg }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                          <input
                            ref={el => { if (!inputRefs.current[etIdx]) inputRefs.current[etIdx] = []; inputRefs.current[etIdx][globalEvalIdx] = el; }}
                            type="number" min={0} max={20} step={0.5}
                            defaultValue={isAbs ? '' : (n?.valeur ?? '')}
                            disabled={isAbs || sessLocked || isSav}
                            placeholder="—"
                            title={isSav ? 'Sauvegarde…' : isErr ? errors[key] : ''}
                            style={{
                              width: 54, textAlign: 'center', padding: 4,
                              border: `1px solid ${isErr ? '#dc2626' : isSav ? '#d97706' : isAbs || sessLocked ? '#f3f4f6' : '#e5e7eb'}`,
                              borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                              background: isSav ? '#fffbeb' : isAbs || sessLocked ? '#f9fafb' : '#fff',
                              color: isAbs || sessLocked ? '#9ca3af' : '#111827',
                              transition: 'border-color 0.15s',
                            }}
                            onFocus={el => (el.currentTarget.style.borderColor = '#1e3a5f')}
                            onBlur={el => handleBlur(el.currentTarget, et.id, e.id)}
                            onKeyDown={el => handleKeyDown(el, etIdx, globalEvalIdx)}
                          />
                          <button
                            disabled={sessLocked}
                            onClick={() => handleToggleAbsent(et.id, e.id, isAbs)}
                            title={isAbs ? 'Marquer présent' : 'Marquer absent'}
                            style={{ padding: '1px 4px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: sessLocked ? 'not-allowed' : 'pointer', border: `1px solid ${isAbs ? '#dc2626' : '#e5e7eb'}`, background: isAbs ? '#fee2e2' : '#f9fafb', color: isAbs ? '#dc2626' : '#9ca3af', lineHeight: 1.6, flexShrink: 0, fontFamily: 'inherit', opacity: sessLocked ? .4 : 1 }}
                          >ABS</button>
                        </div>
                      </td>
                    );
                  })}

                  {/* Cellules EXAMEN */}
                  {evalsEX.map((e, exIdx) => {
                    const n     = notesMap[et.id]?.[e.id];
                    const isAbs = ligne.absentsEX[exIdx];
                    const key   = `${et.id}-${e.id}`;
                    const isErr = !!errors[key];
                    const isSav = !!saving[key];
                    const globalEvalIdx = evalsCC.length + exIdx;

                    return (
                      <td key={e.id} style={{ padding: '4px 6px', textAlign: 'center', background: bg }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                          <input
                            ref={el => { if (!inputRefs.current[etIdx]) inputRefs.current[etIdx] = []; inputRefs.current[etIdx][globalEvalIdx] = el; }}
                            type="number" min={0} max={20} step={0.5}
                            defaultValue={isAbs ? '' : (n?.valeur ?? '')}
                            disabled={isAbs || sessLocked || isSav}
                            placeholder="—"
                            title={isSav ? 'Sauvegarde…' : isErr ? errors[key] : ''}
                            style={{
                              width: 54, textAlign: 'center', padding: 4,
                              border: `1px solid ${isErr ? '#dc2626' : isSav ? '#d97706' : isAbs ? '#f3f4f6' : '#ede9fe'}`,
                              borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                              background: isSav ? '#fffbeb' : isAbs ? '#f9fafb' : '#fff',
                              color: isAbs ? '#9ca3af' : '#111827',
                              transition: 'border-color 0.15s',
                            }}
                            onFocus={el => (el.currentTarget.style.borderColor = '#7c3aed')}
                            onBlur={el => handleBlur(el.currentTarget, et.id, e.id)}
                            onKeyDown={el => handleKeyDown(el, etIdx, globalEvalIdx)}
                          />
                          <button
                            disabled={sessLocked}
                            onClick={() => handleToggleAbsent(et.id, e.id, isAbs)}
                            title={isAbs ? 'Marquer présent' : 'Marquer absent'}
                            style={{ padding: '1px 4px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: sessLocked ? 'not-allowed' : 'pointer', border: `1px solid ${isAbs ? '#dc2626' : '#ede9fe'}`, background: isAbs ? '#fee2e2' : '#f9fafb', color: isAbs ? '#dc2626' : '#9ca3af', lineHeight: 1.6, flexShrink: 0, fontFamily: 'inherit', opacity: sessLocked ? .4 : 1 }}
                          >ABS</button>
                        </div>
                      </td>
                    );
                  })}

                  {/* Moyennes */}
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

          {/* Ligne moyenne classe */}
          {finales.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e5e7eb' }}>
                <td style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#374151', position: 'sticky', left: 0, background: '#f8fafc' }}>
                  Moyenne classe
                </td>
                {[...evalsCC, ...evalsEX].map(e => {
                  const vals = lignes
                    .map(l => notesMap[l.etudiant.id]?.[e.id]?.valeur)
                    .filter((v): v is number => v !== null && v !== undefined);
                  const moy = vals.length > 0
                    ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 100) / 100
                    : null;
                  return (
                    <td key={e.id} style={{ padding: '6px', textAlign: 'center' }}>
                      <NoteChip val={moy} />
                    </td>
                  );
                })}
                <td style={{ padding: '6px', textAlign: 'center' }}>
                  <NoteChip val={lignes.map(l => l.moyCC).filter((v): v is number => v !== null).reduce((s, v, _, a) => s + v / a.length, 0) || null} />
                </td>
                <td style={{ padding: '6px', textAlign: 'center' }}>
                  <NoteChip val={moyenneClasse} bold />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Aide */}
      <div style={{ marginTop: '.75rem', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          💡 <strong>Entrée</strong> ou <strong>Tab</strong> pour sauvegarder et passer à la cellule suivante
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          · <strong>ABS</strong> pour marquer un absent (note → 0)
        </span>
        {pctCompletion < 100 && (
          <span style={{ fontSize: 11, color: '#d97706', marginLeft: 'auto' }}>
            ⚠️ {totalCells - saisiesCells} note{totalCells - saisiesCells > 1 ? 's' : ''} manquante{totalCells - saisiesCells > 1 ? 's' : ''}
          </span>
        )}
        {pctCompletion === 100 && (
          <span style={{ fontSize: 11, color: '#059669', marginLeft: 'auto' }}>
            ✅ Saisie complète
          </span>
        )}
      </div>
    </div>
  );
}
