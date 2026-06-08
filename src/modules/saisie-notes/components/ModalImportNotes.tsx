// src/modules/saisie-notes/components/ModalImportNotes.tsx
import { useState, useRef } from 'react';
import type { Evaluation, EtudiantSaisie, ImportRow } from '../../../types/saisie.types';
import { parseCSV, importerNotes } from '../../../services/saisie.service';

interface Props {
  evaluations: Evaluation[];
  etudiants: EtudiantSaisie[];
  ecoleId: string;
  onClose: () => void;
  onImported: (ok: number, skip: number) => void;
}

export default function ModalImportNotes({ evaluations, etudiants, ecoleId, onClose, onImported }: Props) {
  const [evalId, setEvalId]   = useState(evaluations[0]?.id ?? '');
  const [rows, setRows]       = useState<ImportRow[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseErr(null);
    try {
      let parsed: ImportRow[];
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        parsed = parseCSV(await file.text());
      } else {
        // Excel via SheetJS (chargé globalement dans le legacy — ici on requiert l'import dynamique)
        const XLSX = (window as any).XLSX;
        if (!XLSX) throw new Error('SheetJS non disponible — utilisez un fichier CSV');
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        parsed = data.map((row: any) => {
          const matKey  = Object.keys(row).find((k: string) => k.toLowerCase().includes('matri'));
          const noteKey = Object.keys(row).find((k: string) => k.toLowerCase().includes('note') || k.toLowerCase().includes('mark'));
          return { matricule: String(row[matKey] ?? '').trim(), note: parseFloat(row[noteKey]) };
        }).filter((r: ImportRow) => r.matricule && !isNaN(r.note));
      }
      setRows(parsed);
    } catch (err: any) {
      setParseErr(err.message);
      setRows(null);
    }
  }

  async function handleImport() {
    if (!rows?.length || !evalId) return;
    setLoading(true);
    try {
      const { ok, skip } = await importerNotes(rows, evalId, ecoleId, etudiants);
      onImported(ok, skip);
      onClose();
    } catch (err: any) {
      setParseErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 500, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Import de notes</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: '.85rem' }}>
          <label>Évaluation cible *</label>
          <select value={evalId} onChange={e => setEvalId(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
            {evaluations.map(e => (
              <option key={e.id} value={e.id}>[{e.categorie}] {e.intitule || e.format}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '.85rem' }}>
          <label>Fichier CSV ou Excel *</label>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile}
            style={{ width: '100%', marginTop: 4 }} />
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            Format : colonne <strong>Matricule</strong> + colonne <strong>Note</strong> (0-20). Première ligne = en-têtes.
          </div>
        </div>

        {rows && (
          <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: '.85rem', fontSize: 12, color: '#374151', background: '#f9fafb', borderRadius: 8, padding: '.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{rows.length} ligne(s) détectée(s)</div>
            {rows.slice(0, 5).map((r, i) => <div key={i}>{r.matricule} → {r.note}</div>)}
            {rows.length > 5 && <div style={{ color: '#9ca3af' }}>…</div>}
          </div>
        )}

        {parseErr && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '.85rem' }}>
            {parseErr}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-blue" onClick={handleImport} disabled={!rows?.length || loading}>
            {loading ? 'Import…' : 'Importer →'}
          </button>
        </div>
      </div>
    </div>
  );
}
