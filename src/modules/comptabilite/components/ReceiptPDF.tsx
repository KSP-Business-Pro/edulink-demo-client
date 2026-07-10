// src/modules/comptabilite/components/ReceiptPDF.tsx
// B15 — Action 2, Chantier 3 : reçu de paiement imprimable
// Même pattern que RelevePDF.tsx (aperçu HTML + export PDF via window.print())
// Réutilise RELEVE_THEME (navy #1B2A4A + ocre #C8932E) plutôt que de dupliquer
// une 3e fois les couleurs — cf. constat "duplication de styles" du design system.

import { useRef } from 'react';
import { RELEVE_THEME } from '../../releves/components/releveTheme';

export interface ReceiptData {
  paiement: {
    numero_recu:   string;
    montant:       number;
    mode_paiement: string;
    reference:     string | null;
    date_paiement: string;
    caissier_nom:  string | null;
    observation:   string | null;
  };
  facture: {
    libelle:       string;
    reference:     string | null;
    montant_total: number;
    montant_paye_avant: number; // cumul AVANT ce paiement
  };
  etudiant: {
    nom: string; prenom: string; matricule: string;
  };
  ecole: {
    nom: string;
  };
}

interface Props {
  data:    ReceiptData;
  onClose: () => void;
}

const MODE_LABEL: Record<string, string> = {
  especes:      'Espèces',
  virement:     'Virement bancaire',
  mobile_money: 'Mobile Money',
  cheque:       'Chèque',
};

function fmtMontant(n: number): string {
  return n.toLocaleString('fr-FR') + ' FCFA';
}

export function ReceiptModal({ data, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const T = RELEVE_THEME;
  const { paiement, facture, etudiant, ecole } = data;

  const resteApres = Math.max(0, facture.montant_total - (facture.montant_paye_avant + paiement.montant));
  const modeLabel = MODE_LABEL[paiement.mode_paiement] ?? paiement.mode_paiement;
  const dateFormatee = new Date(paiement.date_paiement).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const heureFormatee = new Date(paiement.date_paiement).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  });

  function handlePrint() {
    const printContent = printRef.current?.innerHTML;
    if (!printContent) return;

    const win = window.open('', '_blank', 'width=700,height=800');
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Reçu ${paiement.numero_recu} — ${etudiant.nom} ${etudiant.prenom}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #1e293b; background: #fff; }
          @page { size: A5 portrait; margin: 12mm 10mm; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
          .recu-wrap { max-width: 130mm; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${T.navy}; padding-bottom: 10px; margin-bottom: 3px; }
          .header-accent { height: 2px; background: ${T.ocre}; margin-bottom: 14px; }
          .ecole-nom { font-size: 13pt; font-weight: 800; color: ${T.navy}; }
          .doc-title { font-size: 13pt; font-weight: 800; color: ${T.navy}; text-transform: uppercase; letter-spacing: 0.05em; text-align: right; }
          .numero-recu { font-family: monospace; font-size: 10pt; color: ${T.matriculeText}; background: ${T.matriculeBg}; padding: 3px 10px; border-radius: 4px; display: inline-block; margin-top: 4px; }
          .field-label { font-size: 7.5pt; font-weight: 600; color: ${T.grayText}; text-transform: uppercase; letter-spacing: 0.04em; }
          .field-value { font-size: 10pt; font-weight: 600; color: ${T.textDark}; margin-top: 1px; }
          .card { background: ${T.grayBg}; border: 1px solid ${T.grayBorder}; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; }
          .montant-box { background: ${T.navy}; color: #fff; border-radius: 6px; padding: 14px 18px; text-align: center; margin-bottom: 14px; }
          .montant-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; opacity: .85; }
          .montant-val { font-size: 20pt; font-weight: 800; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border-top: 2px solid ${T.ocre}; }
          td { padding: 6px 8px; font-size: 9.5pt; border-bottom: 1px solid ${T.rowBorder}; }
          td.label { color: ${T.grayText}; font-weight: 600; width: 45%; }
          td.val { color: ${T.textDark}; text-align: right; }
          .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid ${T.grayBorder}; display: flex; justify-content: space-between; align-items: flex-end; }
          .footer-mention { font-size: 7.5pt; color: ${T.grayTextLight}; }
          .signature-line { width: 90px; border-top: 1px solid #1e293b; margin: 26px auto 4px; }
          .signature-label { font-size: 7pt; color: ${T.grayText}; text-align: center; }
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

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.toolbar}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
              🧾 Reçu — {etudiant.nom} {etudiant.prenom}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{paiement.numero_recu}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnSecondary} onClick={onClose}>✕ Fermer</button>
            <button style={S.btnPrimary} onClick={handlePrint}>🖨️ Imprimer / PDF</button>
          </div>
        </div>

        <div style={S.body}>
          <div ref={printRef} className="recu-wrap" style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#1e293b', maxWidth: 480, margin: '0 auto' }}>

            {/* ── En-tête ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${T.navy}`, paddingBottom: 10, marginBottom: 3 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.navy }}>{ecole.nom}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.navy, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Reçu de Paiement
                </div>
              </div>
            </div>
            <div style={{ height: 2, background: T.ocre, marginBottom: 14 }} />

            {/* ── Numéro de reçu ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: T.grayText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reçu N°</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: T.matriculeBg, color: T.matriculeText, padding: '4px 10px', borderRadius: 4, display: 'inline-block', marginTop: 3 }}>
                {paiement.numero_recu}
              </div>
            </div>

            {/* ── Identité étudiant ── */}
            <div style={{ background: T.grayBg, border: `1px solid ${T.grayBorder}`, borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: T.grayText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Étudiant</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textDark, marginTop: 1 }}>{etudiant.nom} {etudiant.prenom}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: T.grayText, marginTop: 2 }}>{etudiant.matricule}</div>
            </div>

            {/* ── Montant ── */}
            <div style={{ background: T.navy, color: '#fff', borderRadius: 6, padding: '14px 18px', textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: .85 }}>Montant reçu</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{fmtMontant(paiement.montant)}</div>
            </div>

            {/* ── Détails ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, borderTop: `2px solid ${T.ocre}` }}>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.grayText, fontWeight: 600, borderBottom: `1px solid ${T.rowBorder}` }}>Motif</td>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.textDark, textAlign: 'right', borderBottom: `1px solid ${T.rowBorder}` }}>{facture.libelle}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.grayText, fontWeight: 600, borderBottom: `1px solid ${T.rowBorder}` }}>Mode de paiement</td>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.textDark, textAlign: 'right', borderBottom: `1px solid ${T.rowBorder}` }}>{modeLabel}</td>
                </tr>
                {paiement.reference && (
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.grayText, fontWeight: 600, borderBottom: `1px solid ${T.rowBorder}` }}>Référence</td>
                    <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.textDark, textAlign: 'right', borderBottom: `1px solid ${T.rowBorder}`, fontFamily: 'monospace' }}>{paiement.reference}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.grayText, fontWeight: 600, borderBottom: `1px solid ${T.rowBorder}` }}>Date</td>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.textDark, textAlign: 'right', borderBottom: `1px solid ${T.rowBorder}` }}>{dateFormatee} à {heureFormatee}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.grayText, fontWeight: 600, borderBottom: `1px solid ${T.rowBorder}` }}>Total facture</td>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, color: T.textDark, textAlign: 'right', borderBottom: `1px solid ${T.rowBorder}` }}>{fmtMontant(facture.montant_total)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, fontWeight: 700, color: resteApres > 0 ? '#dc2626' : '#059669' }}>Reste dû après ce paiement</td>
                  <td style={{ padding: '6px 8px', fontSize: 9.5, fontWeight: 700, color: resteApres > 0 ? '#dc2626' : '#059669', textAlign: 'right' }}>
                    {resteApres > 0 ? fmtMontant(resteApres) : 'Soldé ✓'}
                  </td>
                </tr>
              </tbody>
            </table>

            {paiement.observation && (
              <div style={{ fontSize: 9, color: T.grayText, fontStyle: 'italic', marginBottom: 12 }}>
                Observation : {paiement.observation}
              </div>
            )}

            {/* ── Pied de page ── */}
            <div style={{ marginTop: 18, paddingTop: 10, borderTop: `1px solid ${T.grayBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 7.5, color: T.grayTextLight }}>Document généré par EduLink Sup · {ecole.nom}</div>
                <div style={{ fontSize: 7.5, color: T.grayTextLight, marginTop: 1 }}>Ce reçu fait foi de paiement.</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 90, borderTop: '1px solid #1e293b', margin: '26px auto 4px' }} />
                <div style={{ fontSize: 7, color: T.grayText }}>
                  {paiement.caissier_nom ?? 'Le Caissier'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '95vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 24px 64px rgba(0,0,0,.3)' },
  toolbar:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '12px 12px 0 0' },
  body:        { flex: 1, overflowY: 'auto' as const, padding: '1.5rem', background: '#fff' },
  btnPrimary:  { padding: '8px 16px', background: '#1B2A4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
};
