// src/modules/saisie-notes/components/ModalImportNotes.tsx
// B4.1 — Import Excel via CDN (même pattern que enseignants + matieres)

import { useState, useRef } from 'react';
import type { Evaluation, EtudiantSaisie, ImportRow } from '../../../types/saisie.types';
import { parseCSV, importerNotes } from '../../../services/saisie.service';

// Type xlsx CDN (aligné sur src/types/xlsx-cdn.d.ts)
type XLSXMod = typeof import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');

interface Props {
  evaluations: Evaluation[];
  etudiants:   EtudiantSaisie[];
  ecoleId:     string;
  onClose:     () => void;
  onImported:  (ok: number, skip: number) => void;
}

interface PreviewRow extends ImportRow {
  nom?:    string;
  found:   boolean;
}

export default function ModalImportNotes({
  evaluations, etudiants, ecoleId, onClose, onImported,
}: Props) {
  const [evalId,    setEvalId]    = useState(evaluations[0]?.id ?? '');
  const [rows,      setRows]      = useState<PreviewRow[] | null>(null);
  const [parseErr,  setParseErr]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [imported,  setImported]  = useState<{ ok: number; skip: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Index matricule → étudiant
  const matMap: Record<string, EtudiantSaisie> = {};
  etudiants.forEach(e => { if (e.matricule) matMap[e.matricule.trim().toLowerCase()] = e; });

  function enrichRows(raw: ImportRow[]): PreviewRow[] {
    return raw.map(r => {
      const etu = matMap[r.matricule.trim().toLowerCase()];
      return { ...r, nom: etu ? `${etu.nom} ${etu.prenom ?? ''}` : undefined, found: !!etu };
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseErr(null); setRows(null); setImported(null);
    try {
      let parsed: ImportRow[];
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        parsed = parseCSV(await file.text());
      } else {
        // Import Excel via CDN — même pattern que enseignants/index.tsx
        let XLSX = (window as unknown as { XLSX?: XLSXMod }).XLSX;
        if (!XLSX) {
          const mod = await import(
            /* @vite-ignore */
            'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'
          ) as { default?: XLSXMod } & XLSXMod;
          XLSX = mod.default ?? mod;
        }
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        parsed = (data as Record<string, string>[]).map(row => {
          const matKey  = Object.keys(row).find(k => k.toLowerCase().includes('matri'));
          const noteKey = Object.keys(row).find(k =>
            k.toLowerCase().includes('note') || k.toLowerCase().includes('mark') || k.toLowerCase().includes('valeur')
          );
          return {
            matricule: String(row[matKey ?? ''] ?? '').trim(),
            note:      parseFloat(String(row[noteKey ?? ''] ?? '')),
          };
        }).filter(r => r.matricule && !isNaN(r.note) && r.note >= 0 && r.note <= 20);
      }

      if (!parsed.length) throw new Error('Aucune ligne valide détectée (vérifiez colonnes Matricule et Note)');
      setRows(enrichRows(parsed));
    } catch (err: unknown) {
      setParseErr(err instanceof Error ? err.message : 'Erreur de lecture');
      setRows(null);
    }
  }

  async function handleImport() {
    if (!rows?.length || !evalId) return;
    setLoading(true);
    try {
      const validRows = rows.filter(r => r.found);
      const { ok, skip } = await importerNotes(
        validRows.map(r => ({ matricule: r.matricule, note: r.note })),
        evalId, ecoleId, etudiants
      );
      setImported({ ok, skip: skip + rows.filter(r => !r.found).length });
      onImported(ok, skip + rows.filter(r => !r.found).length);
    } catch (err: unknown) {
      setParseErr(err instanceof Error ? err.message : 'Erreur import');
    } finally {
      setLoading(false);
    }
  }

  const evalSelectionnee = evaluations.find(e => e.id === evalId);
  const nbFound    = rows?.filter(r => r.found).length ?? 0;
  const nbNotFound = rows?.filter(r => !r.found).length ?? 0;

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.title}>⬆ Import de notes</div>
            <div style={S.sub}>CSV ou Excel · colonnes Matricule + Note (0–20)</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {/* Résultat import */}
          {imported && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', marginBottom: 8 }}>✅ Import terminé</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ textAlign: 'center', background: '#fff', borderRadius: 8, padding: '8px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{imported.ok}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Importées</div>
                </div>
                <div style={{ textAlign: 'center', background: '#fff', borderRadius: 8, padding: '8px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>{imported.skip}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Ignorées</div>
                </div>
              </div>
              <button style={{ ...S.btnPrimary, marginTop: 12, width: '100%' }} onClick={onClose}>
                Fermer
              </button>
            </div>
          )}

          {!imported && (
            <>
              {/* Sélection évaluation */}
              <div style={S.field}>
                <label style={S.label}>Évaluation cible <span style={{ color: '#dc2626' }}>*</span></label>
                <select style={S.input} value={evalId} onChange={e => setEvalId(e.target.value)}>
                  {evaluations.map(e => (
                    <option key={e.id} value={e.id}>
                      [{e.categorie}] {e.intitule || e.format}
                    </option>
                  ))}
                </select>
                {evalSelectionnee && (
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Pondération : {Math.round(evalSelectionnee.ponderation * 100)}%
                  </div>
                )}
              </div>

              {/* Upload fichier */}
              <div style={S.field}>
                <label style={S.label}>Fichier CSV ou Excel <span style={{ color: '#dc2626' }}>*</span></label>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
                  onChange={handleFile}
                  style={{ ...S.input, padding: '6px' }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Format attendu : colonne <strong>Matricule</strong> + colonne <strong>Note</strong> — première ligne = en-têtes
                </div>
              </div>

              {/* Modèle téléchargeable */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#64748b', border: '1px solid #f1f5f9' }}>
                <strong>Exemple :</strong>
                <div style={{ fontFamily: 'monospace', marginTop: 4, color: '#374151' }}>
                  Matricule;Note<br />
                  HEMEC/0001/GFC/2026;14.5<br />
                  HEMEC/0002/GFC/2026;12<br />
                </div>
              </div>

              {/* Erreur */}
              {parseErr && (
                <div style={{ background: '#fef2f2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 12, border: '1px solid #fecaca' }}>
                  {parseErr}
                </div>
              )}

              {/* Aperçu lignes */}
              {rows && (
                <div>
                  {/* Résumé */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, background: '#f0fdf4', color: '#166534', padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
                      ✓ {nbFound} reconnu{nbFound > 1 ? 's' : ''}
                    </span>
                    {nbNotFound > 0 && (
                      <span style={{ fontSize: 12, background: '#fef2f2', color: '#991b1b', padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
                        ✗ {nbNotFound} matricule{nbNotFound > 1 ? 's' : ''} introuvable{nbNotFound > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Liste preview */}
                  <div style={{ maxHeight: 180, overflowY: 'auto', background: '#f9fafb', borderRadius: 8, padding: '0.5rem' }}>
                    {rows.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '4px 6px', borderRadius: 6,
                        background: r.found ? 'transparent' : '#fef2f2',
                        marginBottom: 2,
                      }}>
                        <span style={{ fontSize: 11, color: r.found ? '#059669' : '#dc2626', fontWeight: 700, flexShrink: 0 }}>
                          {r.found ? '✓' : '✗'}
                        </span>
                        <code style={{ fontSize: 10, color: '#374151', flex: 1 }}>{r.matricule}</code>
                        <span style={{ fontSize: 11, color: '#6b7280', flex: 1 }}>
                          {r.nom ?? <em style={{ color: '#dc2626' }}>Introuvable</em>}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: r.note >= 10 ? '#059669' : '#dc2626', minWidth: 32, textAlign: 'right' as const }}>
                          {r.note}/20
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!imported && (
          <div style={S.footer}>
            <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
            <button
              style={{ ...S.btnPrimary, opacity: (!rows?.length || loading || nbFound === 0) ? 0.6 : 1 }}
              onClick={handleImport}
              disabled={!rows?.length || loading || nbFound === 0}
            >
              {loading ? '⏳ Import…' : `Importer ${nbFound} note${nbFound > 1 ? 's' : ''} →`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title:       { fontSize: 16, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  sub:         { fontSize: 11, color: '#94a3b8', marginTop: 3 } as React.CSSProperties,
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', padding: 4 } as React.CSSProperties,
  body:        { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.875rem' },
  footer:      { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafafa', color: '#1e293b' } as React.CSSProperties,
  btnPrimary:  { padding: '9px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
};
