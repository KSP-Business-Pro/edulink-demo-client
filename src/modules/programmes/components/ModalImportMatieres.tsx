// src/modules/programmes/components/ModalImportMatieres.tsx
import { useState, useRef } from 'react';
import type { ImportMatiereLigne } from '../../../services/import-matieres.service';
import {
  parseImportMatieres, parseImportMatieresXLSX, importerMatieres,
} from '../../../services/import-matieres.service';

interface Props {
  ecoleId: string;
  onClose: () => void;
  onImported: (ok: number, skip: number) => void;
}

export default function ModalImportMatieres({ ecoleId, onClose, onImported }: Props) {
  const [rows, setRows]         = useState<ImportMatiereLigne[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const fileRef                 = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseErr(null); setRows(null);
    try {
      let parsed: ImportMatiereLigne[];
      if (file.name.endsWith('.csv')) {
        parsed = parseImportMatieres(await file.text());
      } else {
        type XLSXMod = typeof import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
        let XLSX = (window as unknown as { XLSX?: XLSXMod }).XLSX;
        if (!XLSX) {
          const mod = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
          XLSX = mod.default ?? mod;
        }
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        parsed = parseImportMatieresXLSX(data);
      }
      if (!parsed.length) throw new Error('Aucune ligne valide détectée');
      setRows(parsed);
    } catch (err: any) {
      setParseErr(err.message);
    }
  }

  async function handleImport() {
    if (!rows?.length) return;
    setLoading(true);
    try {
      const { ok, skip, results } = await importerMatieres(rows, ecoleId);
      setRows(results);
      onImported(ok, skip);
    } catch (err: any) {
      setParseErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  const alreadyRun = rows?.some(r => r._ok !== undefined) ?? false;

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 580, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Import de matières</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Template */}
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '.75rem', marginBottom: '1rem', fontSize: 12, color: '#374151' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Format CSV / Excel attendu :</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280', lineHeight: 1.8 }}>
            Code | Nom | Coefficient | UE | Heures_CM | Heures_TD | Enseignant<br />
            <span style={{ color: '#059669' }}>INFO101 | Introduction à l'Informatique | 2 | INFO-UE1 | 30 | 15 | DUPONT</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
            <strong>Code</strong>, <strong>Nom</strong> et <strong>UE</strong> (code de l'UE) sont obligatoires. 
            Un upsert est fait sur <code>ecole_id + code</code> — les matières existantes seront mises à jour.
          </div>
        </div>

        <div style={{ marginBottom: '.85rem' }}>
          <label>Fichier CSV ou Excel *</label>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile}
            style={{ width: '100%', marginTop: 4 }} />
        </div>

        {parseErr && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '.85rem' }}>
            {parseErr}
          </div>
        )}

        {rows && (
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: '.85rem', fontSize: 12, background: '#f9fafb', borderRadius: 8, padding: '.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {alreadyRun
                ? `${rows.filter(r => r._ok).length} importée(s) · ${rows.filter(r => !r._ok).length} erreur(s)`
                : `${rows.length} matière(s) détectée(s)`
              }
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                {r._ok !== undefined && (
                  <span style={{ fontSize: 13, color: r._ok ? '#059669' : '#dc2626', flexShrink: 0 }}>{r._ok ? '✓' : '✗'}</span>
                )}
                <div style={{ flex: 1, color: r._err ? '#dc2626' : '#374151' }}>
                  <span style={{ fontWeight: 600 }}>{r.code}</span> — {r.nom}
                  <span style={{ color: '#9ca3af', marginLeft: 6 }}>UE: {r.ue_code} · coef {r.coefficient}</span>
                  {r.enseignant_nom && <span style={{ color: '#7c3aed', marginLeft: 6 }}>👤 {r.enseignant_nom}</span>}
                  {r._err && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 1 }}>⚠ {r._err}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
          <button className="btn-ghost" onClick={onClose}>
            {alreadyRun ? 'Fermer' : 'Annuler'}
          </button>
          {!alreadyRun && (
            <button className="btn-blue" onClick={handleImport}
              disabled={!rows?.length || loading}>
              {loading ? 'Import…' : `Importer ${rows?.length ?? 0} matière(s) →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

