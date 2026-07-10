// src/modules/releves/components/RelevePDF.tsx
// B4.3 — Génération PDF relevé de notes LMD-CAMES
// Aperçu HTML + export PDF via window.print()
//
// Sprint B15 — Action 2 (étape 2/3) :
//  - Import des constantes de style depuis releveTheme.ts (fin de la duplication
//    entre les styles inline React de l'aperçu et le CSS injecté à l'impression)
//  - Navy aligné sur la valeur canonique #1B2A4A (au lieu de #1e3a5f)
//  - Ajout de l'ocre #C8932E : bordure supérieure du tableau UE (cohérent avec
//    .table-wrap dans le CSS partagé de l'app) + liseré sous l'en-tête

import { useRef } from 'react';
import {
  RELEVE_THEME, noteColor, decisionBg, MENTION_FR, DECISION_FR,
} from './releveTheme';

// ── Types snapshot ─────────────────────────────────────────────────────────
interface ResultatUE {
  ue_id:           string;
  ue_code:         string;
  ue_intitule:     string;
  type_ue:         string;
  obligatoire:     boolean;
  ue_credits:      number;
  credits_acquis:  number;
  ue_validee:      boolean;
  moyenne_ue:      number | null;
  mention_ue:      string | null;
  est_exclu:       boolean;
  est_compense:    boolean;
  poids_cc:        number;
  poids_examen:    number;
}

interface SnapshotNotes {
  niveau:             string;
  semestre_libelle:   string;
  programme_intitule: string;
  mention:            string | null;
  moyenne_semestre:   number | null;
  credits_valides:    number;
  credits_tentes:     number;
  semestre_valide:    boolean;
  resultats_ue:       ResultatUE[];
  publie_le:          string;
}

export interface ReleveData {
  etudiant: {
    nom:       string;
    prenom:    string;
    matricule: string;
    filiere:   string;
  };
  ecole: {
    nom:    string;
    code:   string;
  };
  snapshot:   SnapshotNotes;
  decision:   string | null;
  publie_le:  string;
}

interface Props {
  data:    ReleveData;
  onClose: () => void;
}

// ── Composant principal ────────────────────────────────────────────────────
export function ReleveModal({ data, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const T = RELEVE_THEME;

  const { etudiant, ecole, snapshot, decision, publie_le } = data;
  const dec = decisionBg(decision);

  function handlePrint() {
    const printContent = printRef.current?.innerHTML;
    if (!printContent) return;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Relevé de notes — ${etudiant.nom} ${etudiant.prenom}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #1e293b; background: #fff; }
          @page { size: A4 portrait; margin: 15mm 12mm; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
          .releve-wrap { max-width: 190mm; margin: 0 auto; padding: 0; }

          /* En-tête — bordure navy + liseré ocre (B15 action 2) */
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${T.navy}; padding-bottom: 10px; margin-bottom: 3px; }
          .header-accent { height: 2px; background: ${T.ocre}; margin-bottom: 12px; }
          .logo-zone { display: flex; flex-direction: column; }
          .ecole-nom { font-size: 13pt; font-weight: 700; color: ${T.navy}; }
          .ecole-sub { font-size: 8pt; color: ${T.grayText}; margin-top: 2px; }
          .doc-title { text-align: right; }
          .doc-title h1 { font-size: 14pt; font-weight: 700; color: ${T.navy}; }
          .doc-title p { font-size: 8pt; color: ${T.grayText}; margin-top: 2px; }

          /* Identité étudiant */
          .etudiant-card { background: ${T.grayBg}; border: 1px solid ${T.grayBorder}; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
          .field-label { font-size: 7.5pt; font-weight: 600; color: ${T.grayText}; text-transform: uppercase; letter-spacing: 0.04em; }
          .field-value { font-size: 10pt; font-weight: 600; color: ${T.textDark}; margin-top: 1px; }
          .matricule-badge { font-family: monospace; font-size: 9.5pt; background: ${T.matriculeBg}; color: ${T.matriculeText}; padding: 2px 8px; border-radius: 4px; display: inline-block; }

          /* Tableau UEs — bordure supérieure ocre (cohérent avec .table-wrap de l'app) */
          .section-title { font-size: 9pt; font-weight: 700; color: ${T.navy}; text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 6px; padding-bottom: 3px; border-bottom: 1px solid ${T.grayBorder}; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; border-top: 2px solid ${T.ocre}; }
          th { background: ${T.navy}; color: #fff; font-size: 8pt; font-weight: 600; padding: 6px 8px; text-align: left; }
          th.center { text-align: center; }
          td { padding: 6px 8px; font-size: 9pt; border-bottom: 1px solid ${T.rowBorder}; vertical-align: middle; }
          td.center { text-align: center; }
          tr:nth-child(even) td { background: ${T.grayBg}; }
          .ue-code { font-family: monospace; font-size: 8pt; color: ${T.grayText}; }
          .ue-intitule { font-weight: 600; }
          .ue-type { font-size: 7.5pt; color: ${T.grayTextLight}; }
          .note-val { font-weight: 700; }
          .badge-vert  { background: #d1fae5; color: #065f46; padding: 1px 6px; border-radius: 10px; font-size: 8pt; font-weight: 600; }
          .badge-rouge { background: #fee2e2; color: #991b1b; padding: 1px 6px; border-radius: 10px; font-size: 8pt; font-weight: 600; }
          .badge-gris  { background: #f3f4f6; color: #6b7280; padding: 1px 6px; border-radius: 10px; font-size: 8pt; }
          .exclu { color: #dc2626; font-size: 8pt; }

          /* Récapitulatif */
          .recap { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
          .recap-item { background: ${T.grayBg}; border: 1px solid ${T.grayBorder}; border-radius: 6px; padding: 8px; text-align: center; }
          .recap-label { font-size: 7.5pt; color: ${T.grayText}; text-transform: uppercase; letter-spacing: 0.04em; }
          .recap-val { font-size: 16pt; font-weight: 800; margin-top: 2px; }

          /* Décision */
          .decision-band { border-radius: 6px; padding: 8px 14px; margin: 10px 0; display: flex; justify-content: space-between; align-items: center; }
          .decision-label { font-size: 9pt; font-weight: 700; }
          .decision-val { font-size: 11pt; font-weight: 800; }

          /* Pied */
          .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid ${T.grayBorder}; display: flex; justify-content: space-between; align-items: flex-end; }
          .footer-mention { font-size: 8pt; color: ${T.grayTextLight}; }
          .signature-zone { text-align: center; }
          .signature-line { width: 100px; border-top: 1px solid #1e293b; margin: 30px auto 4px; }
          .signature-label { font-size: 7.5pt; color: ${T.grayText}; }
          .watermark { font-size: 7pt; color: #d1d5db; text-align: center; margin-top: 10px; }
        </style>
      </head>
      <body>
        ${printContent}
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  const datePublication = new Date(publie_le).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const moyenneColor = noteColor(snapshot.moyenne_semestre);

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Barre actions */}
        <div style={S.toolbar}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
              📄 Relevé de notes — {etudiant.nom} {etudiant.prenom}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {snapshot.semestre_libelle}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnSecondary} onClick={onClose}>✕ Fermer</button>
            <button style={S.btnPrimary} onClick={handlePrint}>🖨️ Imprimer / PDF</button>
          </div>
        </div>

        {/* Corps aperçu */}
        <div style={S.body}>
          <div ref={printRef} className="releve-wrap" style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#1e293b', maxWidth: 750, margin: '0 auto' }}>

            {/* ── En-tête — bordure navy + liseré ocre ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${T.navy}`, paddingBottom: 12, marginBottom: 3 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.navy }}>{ecole.nom}</div>
                <div style={{ fontSize: 9, color: T.grayText, marginTop: 2 }}>
                  Enseignement Supérieur · Système LMD-CAMES
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.navy, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Relevé de Notes
                </div>
                <div style={{ fontSize: 9, color: T.grayText, marginTop: 2 }}>
                  Publié le {datePublication}
                </div>
              </div>
            </div>
            <div style={{ height: 2, background: T.ocre, marginBottom: 14 }} />

            {/* ── Identité étudiant ── */}
            <div style={{ background: T.grayBg, border: `1px solid ${T.grayBorder}`, borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
              <div>
                <div style={{ fontSize: 8, fontWeight: 600, color: T.grayText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nom & Prénom</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.textDark, marginTop: 1 }}>{etudiant.nom} {etudiant.prenom}</div>
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 600, color: T.grayText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Matricule</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, background: T.matriculeBg, color: T.matriculeText, padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                  {etudiant.matricule}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 600, color: T.grayText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Programme</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.textDark, marginTop: 1 }}>{snapshot.programme_intitule}</div>
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 600, color: T.grayText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Niveau · Semestre</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.textDark, marginTop: 1 }}>
                  {snapshot.niveau} · {snapshot.semestre_libelle}
                </div>
              </div>
            </div>

            {/* ── Tableau UEs — bordure supérieure ocre ── */}
            <div style={{ fontSize: 9, fontWeight: 700, color: T.navy, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, paddingBottom: 3, borderBottom: `1px solid ${T.grayBorder}` }}>
              Résultats par Unité d'Enseignement
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14, borderTop: `2px solid ${T.ocre}` }}>
              <thead>
                <tr>
                  <th style={{ background: T.navy, color: '#fff', fontSize: 8, fontWeight: 600, padding: '6px 8px', textAlign: 'left' }}>Code</th>
                  <th style={{ background: T.navy, color: '#fff', fontSize: 8, fontWeight: 600, padding: '6px 8px', textAlign: 'left' }}>Unité d'Enseignement</th>
                  <th style={{ background: T.navy, color: '#fff', fontSize: 8, fontWeight: 600, padding: '6px 8px', textAlign: 'center' }}>Crédits</th>
                  <th style={{ background: T.navy, color: '#fff', fontSize: 8, fontWeight: 600, padding: '6px 8px', textAlign: 'center' }}>Moyenne</th>
                  <th style={{ background: T.navy, color: '#fff', fontSize: 8, fontWeight: 600, padding: '6px 8px', textAlign: 'center' }}>Mention</th>
                  <th style={{ background: T.navy, color: '#fff', fontSize: 8, fontWeight: 600, padding: '6px 8px', textAlign: 'center' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.resultats_ue.map((ue, i) => {
                  const bg = i % 2 === 0 ? '#fff' : T.grayBg;
                  return (
                    <tr key={ue.ue_id}>
                      <td style={{ padding: '6px 8px', background: bg, borderBottom: `1px solid ${T.rowBorder}`, fontFamily: 'monospace', fontSize: 9, color: T.grayText }}>
                        {ue.ue_code}
                      </td>
                      <td style={{ padding: '6px 8px', background: bg, borderBottom: `1px solid ${T.rowBorder}` }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: T.textDark }}>{ue.ue_intitule}</div>
                        <div style={{ fontSize: 8, color: T.grayTextLight, marginTop: 1 }}>
                          {ue.type_ue} · CC {Math.round(ue.poids_cc * 100)}% / Exam {Math.round(ue.poids_examen * 100)}%
                          {!ue.obligatoire && ' · Optionnelle'}
                        </div>
                      </td>
                      <td style={{ padding: '6px 8px', background: bg, borderBottom: `1px solid ${T.rowBorder}`, textAlign: 'center', fontSize: 10 }}>
                        <span style={{ fontWeight: 600, color: T.textDark }}>{ue.credits_acquis}</span>
                        <span style={{ color: T.grayTextLight, fontSize: 8 }}>/{ue.ue_credits}</span>
                      </td>
                      <td style={{ padding: '6px 8px', background: bg, borderBottom: `1px solid ${T.rowBorder}`, textAlign: 'center' }}>
                        {ue.est_exclu ? (
                          <span style={{ fontSize: 9, color: '#dc2626', fontWeight: 600 }}>Exclu(e)</span>
                        ) : ue.moyenne_ue !== null ? (
                          <span style={{ fontSize: 12, fontWeight: 800, color: noteColor(ue.moyenne_ue) }}>
                            {Number(ue.moyenne_ue).toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: T.grayTextLight, fontSize: 9 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', background: bg, borderBottom: `1px solid ${T.rowBorder}`, textAlign: 'center' }}>
                        {ue.mention_ue ? (
                          <span style={{ fontSize: 8, fontWeight: 600, color: '#374151' }}>
                            {MENTION_FR[ue.mention_ue] ?? ue.mention_ue}
                          </span>
                        ) : (
                          <span style={{ color: T.grayTextLight, fontSize: 8 }}>—</span>
                        )}
                        {ue.est_compense && (
                          <div style={{ fontSize: 7, color: '#d97706', marginTop: 1 }}>Compensé</div>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', background: bg, borderBottom: `1px solid ${T.rowBorder}`, textAlign: 'center' }}>
                        {ue.est_exclu ? (
                          <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 10, fontSize: 8, fontWeight: 600 }}>Exclu</span>
                        ) : ue.ue_validee ? (
                          <span style={{ background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 10, fontSize: 8, fontWeight: 600 }}>✓ Validée</span>
                        ) : (
                          <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 10, fontSize: 8, fontWeight: 600 }}>✗ Non validée</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── Récapitulatif ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Moyenne générale', val: snapshot.moyenne_semestre !== null ? Number(snapshot.moyenne_semestre).toFixed(2) : '—', color: moyenneColor },
                { label: 'Crédits validés', val: `${snapshot.credits_valides} / ${snapshot.credits_tentes}`, color: '#1d4ed8' },
                { label: 'Mention', val: MENTION_FR[snapshot.mention ?? ''] ?? '—', color: '#7e22ce' },
                { label: 'Semestre', val: snapshot.semestre_valide ? 'Validé ✓' : 'Non validé', color: snapshot.semestre_valide ? '#059669' : '#dc2626' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: T.grayBg, border: `1px solid ${T.grayBorder}`, borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7.5, fontWeight: 600, color: T.grayText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color, marginTop: 3, lineHeight: 1 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* ── Décision jury ── */}
            <div style={{ background: dec.bg, borderRadius: 6, padding: '8px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${dec.color}40` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: dec.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Décision du Jury
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: dec.color }}>
                {DECISION_FR[decision ?? ''] ?? decision ?? '—'}
              </div>
            </div>

            {/* ── Pied de page ── */}
            <div style={{ marginTop: 16, paddingTop: 10, borderTop: `1px solid ${T.grayBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 8, color: T.grayTextLight }}>
                  Document généré par EduLink Sup · {ecole.nom}
                </div>
                <div style={{ fontSize: 8, color: T.grayTextLight, marginTop: 1 }}>
                  Publié le {datePublication} · Confidentiel
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 100, borderTop: '1px solid #1e293b', margin: '28px auto 4px' }} />
                <div style={{ fontSize: 8, color: T.grayText }}>Le Chef d'Établissement</div>
              </div>
            </div>

            {/* Filigrane numérique */}
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 8, color: '#d1d5db' }}>
              {etudiant.matricule} · {snapshot.semestre_libelle} · {datePublication}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 820, maxHeight: '95vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 24px 64px rgba(0,0,0,.3)' },
  toolbar:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '12px 12px 0 0' },
  body:        { flex: 1, overflowY: 'auto' as const, padding: '1.5rem', background: '#fff' },
  btnPrimary:  { padding: '8px 16px', background: '#1B2A4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
};
