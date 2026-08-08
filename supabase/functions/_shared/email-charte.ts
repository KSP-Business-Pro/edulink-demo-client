// =============================================================================
// EduLink Sup — Module partagé : gabarit email charté (navy / ocre)
// B15 action 2 — source de vérité du design email, importée par :
//   send-notification-email, send-email, send-otp
// (publish-releve conserve son gabarit riche spécifique aux relevés.)
// Les dossiers préfixés "_" ne sont pas déployés comme fonctions par le CLI.
// =============================================================================

export const EMAIL_CHARTE = {
  navy:  "#1B2A4A",
  ocre:  "#C8932E",
  cream: "#F7F4ED",
  fond:  "#eef2f6",
  encre: "#1e293b",
  texte: "#374151",
  pied:  "#8a8574",
} as const;

export function escapeHtml(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface EmailCharteOptions {
  sujet: string;
  /** Contenu principal, déjà en HTML sûr (échappé par l'appelant si besoin). */
  corpsHtml: string;
  ecole?: { nom: string; logo_url?: string | null } | null;
  /** Ligne d'accroche HTML (ex. « Bonjour <strong>X</strong>, ») — null pour aucune. */
  salutationHtml?: string | null;
  /** Pastille ocre en tête de corps (ex. « Absence », « Sécurité ») — null pour aucune. */
  badge?: string | null;
  /** Lignes du pied de page crème. */
  piedNotes?: string[];
}

export function buildEmailCharteHtml(opts: EmailCharteOptions): string {
  const C = EMAIL_CHARTE;
  const ecole = opts.ecole ?? { nom: "EduLink Sup", logo_url: null };
  const logoOuNom = ecole.logo_url
    ? `<img src="${ecole.logo_url}" alt="${escapeHtml(ecole.nom)}" height="36" style="display:block;border:0;outline:none;" />`
    : `<span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(ecole.nom)}</span>`;
  const badge = opts.badge
    ? `<div style="margin:0 0 14px;"><span style="display:inline-block;background:${C.cream};border:1px solid ${C.ocre};color:${C.ocre};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:4px;padding:3px 10px;">${escapeHtml(opts.badge)}</span></div>`
    : "";
  const salutation = opts.salutationHtml
    ? `<p style="margin:0 0 12px;font-size:14px;color:${C.encre};">${opts.salutationHtml}</p>`
    : "";
  const piedNotes = (opts.piedNotes ?? [])
    .map((n, i) => `<p style="margin:${i === 0 ? "0" : "4px 0 0"};font-size:10px;color:${C.pied};">${n}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.sujet)}</title>
</head>
<body style="margin:0;padding:0;background:${C.fond};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fond};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background:${C.navy};padding:22px 28px;">${logoOuNom}</td>
          </tr>
          <tr>
            <td style="background:${C.ocre};height:3px;line-height:3px;font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${badge}${salutation}
              <div style="font-size:13px;color:${C.texte};line-height:1.6;">${opts.corpsHtml}</div>
            </td>
          </tr>
          <tr>
            <td style="background:${C.cream};padding:16px 28px;border-top:1px solid #ece7db;">${piedNotes}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
