// src/modules/etudiants/components/ImportEtudiants.tsx
// Import Excel/CSV d'étudiants — parsing côté client via SheetJS, upsert batch Supabase

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { importEtudiants, type ImportEtudiantRow, type ImportResult } from '../etudiants.service';

interface Props {
  ecoleId: string;
  onClose:   () => void;
  onSuccess: (count: number) => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

// Mapping flexible des en-têtes Excel → champs internes
const HEADER_MAP: Record<string, keyof ImportEtudiantRow> = {
  // nom
  'nom': 'nom', 'name': 'nom', 'last name': 'nom', 'lastname': 'nom',
  'nom de famille': 'nom',
  // prenom
  'prenom': 'prenom', 'prénom': 'prenom', 'first name': 'prenom',
  'firstname': 'prenom', 'prenoms': 'prenom', 'prénoms': 'prenom',
  // matricule
  'matricule': 'matricule', 'numero etudiant': 'matricule',
  'numéro étudiant': 'matricule', 'id etudiant': 'matricule', 'student id': 'matricule',
  // sexe
  'sexe': 'sexe', 'genre': 'sexe', 'gender': 'sexe',
  // email
  'email': 'email_auth', 'email_auth': 'email_auth', 'e-mail': 'email_auth',
  'adresse email': 'email_auth', 'adresse e-mail': 'email_auth',
  // telephone
  'telephone': 'telephone', 'téléphone': 'telephone', 'tel': 'telephone',
  'phone': 'telephone', 'mobile': 'telephone',
  // telephone_parent
  'telephone_parent': 'telephone_parent', 'téléphone parent': 'telephone_parent',
  'tel parent': 'telephone_parent', 'phone parent': 'telephone_parent',
  // email_parent
  'email_parent': 'email_parent', 'email parent': 'email_parent',
  // filiere
  'filiere': 'filiere', 'filière': 'filiere', 'programme': 'filiere',
  'formation': 'filiere', 'departement': 'filiere', 'département': 'filiere',
  // niveau
  'niveau': 'niveau', 'level': 'niveau', 'annee': 'niveau', 'année': 'niveau',
  // statut
  'statut': 'statut', 'status': 'statut', 'etat': 'statut', 'état': 'statut',
  // date_naissance
  'date_naissance': 'date_naissance', 'date de naissance': 'date_naissance',
  'dob': 'date_naissance', 'birth date': 'date_naissance', 'naissance': 'date_naissance',
  // lieu_naissance
  'lieu_naissance': 'lieu_naissance', 'lieu de naissance': 'lieu_naissance',
  'birthplace': 'lieu_naissance',
  // nationalite
  'nationalite': 'nationalite', 'nationalité': 'nationalite',
  'nationality': 'nationalite', 'pays': 'nationalite',
  // adresse
  'adresse': 'adresse', 'address': 'adresse', 'domicile': 'adresse',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, ' ');
}

function parseRows(sheet: XLSX.WorkSheet): { rows: ImportEtudiantRow[]; warnings: string[] } {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!raw.length) return { rows: [], warnings: ['Feuille vide'] };

  const warnings: string[] = [];
  const rows: ImportEtudiantRow[] = [];

  raw.forEach((rawRow, idx) => {
    const row: Partial<ImportEtudiantRow> = {};
    Object.entries(rawRow).forEach(([key, val]) => {
      const mapped = HEADER_MAP[normalizeHeader(key)];
      if (mapped && val !== '' && val !== null && val !== undefined) {
        (row as Record<string, unknown>)[mapped] = String(val).trim();
      }
    });

    // Validation minimale
    if (!row.nom) { warnings.push(`Ligne ${idx + 2} : colonne "nom" manquante — ignorée`); return; }
    if (!row.prenom) { warnings.push(`Ligne ${idx + 2} : colonne "prénom" manquante — ignorée`); return; }

    // Normaliser sexe
    if (row.sexe) {
      const s = row.sexe.toUpperCase();
      row.sexe = (s === 'F' || s === 'FEMININ' || s === 'FÉMININ' || s === 'FEMALE') ? 'F' : 'M';
    }

    // Normaliser statut
    if (row.statut) {
      const st = row.statut.toLowerCase();
      if (st.includes('actif') || st === 'active') row.statut = 'actif';
      else if (st.includes('inactif') || st === 'inactive') row.statut = 'inactif';
      else if (st.includes('diplom')) row.statut = 'diplome';
      else if (st.includes('abandon')) row.statut = 'abandonne';
      else row.statut = 'actif';
    } else {
      row.statut = 'actif';
    }

    rows.push(row as ImportEtudiantRow);
  });

  return { rows, warnings };
}

export function ImportEtudiants({ ecoleId, onClose, onSuccess }: Props) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const [step,        setStep]        = useState<Step>('upload');
  const [rows,        setRows]        = useState<ImportEtudiantRow[]>([]);
  const [warnings,    setWarnings]    = useState<string[]>([]);
  const [result,      setResult]      = useState<ImportResult | null>(null);
  const [dragging,    setDragging]    = useState(false);
  const [fileName,    setFileName]    = useState('');
  const [progress,    setProgress]    = useState(0);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data  = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb    = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const { rows: parsed, warnings: w } = parseRows(sheet);
        setRows(parsed);
        setWarnings(w);
        setStep('preview');
      } catch {
        setWarnings(['Fichier invalide — vérifiez que c\'est un Excel (.xlsx/.xls) ou CSV valide']);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    setStep('importing');
    setProgress(0);
    const res = await importEtudiants(ecoleId, rows, (pct) => setProgress(pct));
    setResult(res);
    setStep('result');
    if (res.inserted + res.updated > 0) onSuccess(res.inserted + res.updated);
  }

  // ── Rendu ──────────────────────────────────────────────────────────────
  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.title}>📥 Import étudiants</div>
            <div style={S.subtitle}>
              {step === 'upload'    && 'Chargez un fichier Excel ou CSV'}
              {step === 'preview'   && `${rows.length} étudiant${rows.length > 1 ? 's' : ''} détecté${rows.length > 1 ? 's' : ''} — vérifiez avant d'importer`}
              {step === 'importing' && 'Import en cours…'}
              {step === 'result'    && 'Import terminé'}
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── STEP 1 : Upload ── */}
        {step === 'upload' && (
          <div style={{ padding: '1.5rem' }}>
            <div
              style={{ ...S.dropZone, borderColor: dragging ? '#1e3a5f' : '#e2e8f0', background: dragging ? '#f0f4ff' : '#fafafa' }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                Glissez votre fichier ici
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                ou cliquez pour parcourir — Excel (.xlsx, .xls) ou CSV
              </div>
              <input
                ref={fileRef} type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {/* Template téléchargeable */}
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0369a1', marginBottom: 6 }}>
                💡 Colonnes supportées
              </div>
              <div style={{ fontSize: 11, color: '#0c4a6e', lineHeight: 1.6 }}>
                <strong>Obligatoires :</strong> nom, prenom<br />
                <strong>Optionnelles :</strong> matricule, sexe (M/F), email, telephone, telephone_parent, email_parent, filiere, niveau, statut, date_naissance, lieu_naissance, nationalite, adresse
              </div>
              <button style={{ ...S.btnSecondary, marginTop: 8 }} onClick={downloadTemplate}>
                ⬇️ Télécharger le modèle Excel
              </button>
            </div>

            {warnings.length > 0 && (
              <div style={S.warnBox}>
                {warnings.map((w, i) => <div key={i} style={{ fontSize: 12 }}>⚠️ {w}</div>)}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2 : Preview ── */}
        {step === 'preview' && (
          <div style={{ padding: '0 1.5rem 1.5rem' }}>
            {warnings.length > 0 && (
              <div style={{ ...S.warnBox, margin: '0 0 12px' }}>
                {warnings.slice(0, 5).map((w, i) => <div key={i} style={{ fontSize: 11 }}>⚠️ {w}</div>)}
                {warnings.length > 5 && <div style={{ fontSize: 11, color: '#92400e' }}>+ {warnings.length - 5} autre(s) avertissement(s)</div>}
              </div>
            )}

            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
              Fichier : <strong>{fileName}</strong> · {rows.length} ligne{rows.length > 1 ? 's' : ''} valide{rows.length > 1 ? 's' : ''}
            </div>

            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0', maxHeight: 320 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    {['#', 'Nom', 'Prénom', 'Matricule', 'Filière', 'Niveau', 'Statut', 'Tél. parent'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={S.td}><span style={{ color: '#94a3b8' }}>{i + 1}</span></td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{r.nom}</td>
                      <td style={S.td}>{r.prenom}</td>
                      <td style={S.td}>
                        {r.matricule
                          ? <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>{r.matricule}</code>
                          : <span style={{ color: '#d1d5db' }}>auto</span>
                        }
                      </td>
                      <td style={S.td}>{r.filiere ?? '—'}</td>
                      <td style={S.td}>
                        {r.niveau
                          ? <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 999, fontWeight: 700 }}>{r.niveau}</span>
                          : '—'}
                      </td>
                      <td style={S.td}>
                        <span style={{
                          background: r.statut === 'actif' ? '#d1fae5' : '#f3f4f6',
                          color: r.statut === 'actif' ? '#065f46' : '#374151',
                          padding: '1px 6px', borderRadius: 999,
                        }}>{r.statut}</span>
                      </td>
                      <td style={{ ...S.td, color: '#6b7280' }}>{r.telephone_parent ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 50 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                Aperçu limité à 50 lignes — {rows.length - 50} ligne{rows.length - 50 > 1 ? 's' : ''} supplémentaire{rows.length - 50 > 1 ? 's' : ''} sera importée{rows.length - 50 > 1 ? 's' : ''}
              </div>
            )}

            <div style={S.actions}>
              <button style={S.btnSecondary} onClick={() => { setStep('upload'); setRows([]); setWarnings([]); }}>
                ← Changer de fichier
              </button>
              <button style={S.btnPrimary} onClick={handleImport} disabled={rows.length === 0}>
                Importer {rows.length} étudiant{rows.length > 1 ? 's' : ''} →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3 : Importing ── */}
        {step === 'importing' && (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>
              Import en cours…
            </div>
            <div style={{ background: '#f1f5f9', borderRadius: 999, height: 8, overflow: 'hidden', maxWidth: 320, margin: '0 auto' }}>
              <div style={{ height: '100%', background: '#1e3a5f', borderRadius: 999, width: `${progress}%`, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{progress}%</div>
          </div>
        )}

        {/* ── STEP 4 : Result ── */}
        {step === 'result' && result && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ ...S.statCard, borderColor: '#bbf7d0' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{result.inserted}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Nouveaux</div>
              </div>
              <div style={{ ...S.statCard, borderColor: '#bfdbfe' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>{result.updated}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Mis à jour</div>
              </div>
              <div style={{ ...S.statCard, borderColor: '#fecaca' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>{result.errors.length}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Erreurs</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div style={S.warnBox}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Erreurs :</div>
                {result.errors.slice(0, 8).map((e, i) => (
                  <div key={i} style={{ fontSize: 11 }}>❌ {e}</div>
                ))}
                {result.errors.length > 8 && (
                  <div style={{ fontSize: 11, color: '#92400e' }}>+ {result.errors.length - 8} autre(s) erreur(s)</div>
                )}
              </div>
            )}

            <div style={S.actions}>
              <button style={S.btnSecondary} onClick={() => { setStep('upload'); setRows([]); setWarnings([]); setResult(null); }}>
                Importer un autre fichier
              </button>
              <button style={S.btnPrimary} onClick={onClose}>
                Fermer ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template Excel téléchargeable ──────────────────────────────────────────
function downloadTemplate() {
  const headers = [
    'nom', 'prenom', 'matricule', 'sexe', 'email', 'telephone',
    'telephone_parent', 'email_parent', 'filiere', 'niveau', 'statut',
    'date_naissance', 'lieu_naissance', 'nationalite', 'adresse',
  ];
  const example = [
    'AGOSSOU', 'Koffi', 'HEMEC-001', 'M', 'k.agossou@email.com', '+22997000001',
    '+22997000002', 'parent@email.com', 'Marketing et Commerce', 'L1', 'actif',
    '2003-05-15', 'Cotonou', 'Béninoise', 'Akpakpa, Cotonou',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  // Largeurs colonnes
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Étudiants');
  XLSX.writeFile(wb, 'modele_import_etudiants.xlsx');
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  overlay:  { position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:    { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title:    { fontSize: 16, fontWeight: 700, color: '#1e293b' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  closeBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#94a3b8', padding: '2px 6px', borderRadius: 4 },
  dropZone: { border: '2px dashed', borderRadius: 12, padding: '2.5rem', textAlign: 'center' as const, cursor: 'pointer', transition: 'all .2s' },
  warnBox:  { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  actions:  { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  btnPrimary:  { padding: '9px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnSecondary:{ padding: '9px 16px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  th: { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const },
  td: { padding: '7px 10px', fontSize: 12, verticalAlign: 'middle' as const },
  statCard: { background: '#fff', border: '1.5px solid', borderRadius: 10, padding: '16px', textAlign: 'center' as const },
};
