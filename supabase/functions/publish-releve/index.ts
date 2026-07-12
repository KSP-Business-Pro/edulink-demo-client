// =============================================================================
// EduLink Sup — Phase 2 — Edge Function : publish-releve
// Version 7 — Multi-modes (publish / resend / lock / unlock) + RBAC explicite
// + Chantier 5.1 : branchement modeles_notification + journal_notifications (email)
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Mode = "publish" | "resend" | "lock" | "unlock";

interface PublishPayload {
  etudiant_id: string;
  semestre_id: string;
  session_id?: string;
  publie_par?: string;
  webhook_secret?: string;
  mode?: Mode;
  send_email?: boolean;
  republish?: boolean;
}

interface ResultatUE {
  ue_id: string;
  ue_code: string;
  ue_intitule: string;
  ue_credits: number;
  type_ue: string;
  obligatoire: boolean;
  poids_cc: number;
  poids_examen: number;
  moyenne_ue: number | null;
  ue_validee: boolean;
  est_exclu: boolean;
  credits_acquis: number;
  mention_ue: string | null;
}

interface SnapshotNotes {
  publie_le: string;
  semestre_libelle: string;
  programme_intitule: string;
  niveau: string;
  resultats_ue: ResultatUE[];
  credits_valides: number;
  credits_tentes: number;
  semestre_valide: boolean;
  moyenne_semestre: number | null;
  mention: string | null;
}

function calculMoyenneSemestre(resultats: ResultatUE[]): number | null {
  const uesAvecNote = resultats.filter((r) => r.moyenne_ue !== null && !r.est_exclu);
  if (uesAvecNote.length === 0) return null;
  const totalPoids = uesAvecNote.reduce((acc, r) => acc + (r.ue_credits || 1), 0);
  if (totalPoids === 0) return null;
  const sommePonderee = uesAvecNote.reduce((acc, r) => acc + (r.moyenne_ue ?? 0) * (r.ue_credits || 1), 0);
  return Math.round((sommePonderee / totalPoids) * 100) / 100;
}

function calculMention(moyenne: number | null): string | null {
  if (moyenne === null) return null;
  if (moyenne >= 16) return "tres_bien";
  if (moyenne >= 14) return "bien";
  if (moyenne >= 12) return "assez_bien";
  if (moyenne >= 10) return "passable";
  return null;
}

function substituerVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ── Chantier 5.1 : résolution du modèle personnalisé + journalisation ──

function escaperHtmlBasique(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface ModeleResolu {
  /** null = aucun modèle configuré pour cette école (comportement legacy) */
  actif: boolean | null;
  sujet: string | null;
  introHtml: string | null;
}

async function resoudreModeleEmail(
  supabase: ReturnType<typeof createClient>,
  ecoleId: string,
  vars: Record<string, string>,
): Promise<ModeleResolu> {
  const { data: modele } = await supabase
    .from("modeles_notification")
    .select("actif, sujet, corps_texte")
    .eq("ecole_id", ecoleId).eq("type", "releve").eq("canal", "email")
    .maybeSingle();

  if (!modele) return { actif: null, sujet: null, introHtml: null };

  const sujet = modele.sujet ? substituerVariables(modele.sujet, vars) : null;
  const introHtml = modele.corps_texte
    ? escaperHtmlBasique(substituerVariables(modele.corps_texte, vars)).replace(/\n/g, "<br/>")
    : null;

  return { actif: modele.actif, sujet, introHtml };
}

async function journaliserEnvoi(
  supabase: ReturnType<typeof createClient>,
  params: {
    ecole_id: string;
    canal: "email" | "sms" | "push";
    type: "releve" | "paiement" | "absence";
    destinataire_id: string;
    destinataire_nom: string;
    destinataire_contact: string | null;
    sujet: string | null;
    statut: "envoye" | "echec";
    erreur: string | null;
    envoye_par: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("journal_notifications").insert({
      ecole_id: params.ecole_id,
      type: params.type,
      canal: params.canal,
      destinataire_id: params.destinataire_id,
      destinataire_type: "etudiant",
      destinataire_contact: params.destinataire_contact,
      destinataire_nom: params.destinataire_nom,
      sujet: params.sujet,
      statut: params.statut,
      erreur: params.erreur,
      envoye_par: params.envoye_par,
    });
  } catch (e) {
    // Le journal ne doit jamais faire échouer l'envoi lui-même
    console.error("journal_notifications insert error:", e);
  }
}

const EMAIL_NAVY  = "#1B2A4A";
const EMAIL_OCRE  = "#C8932E";
const EMAIL_CREAM = "#F7F4ED";
const EMAIL_GRAY_BG = "#f8fafc";
const EMAIL_GRAY_TXT = "#64748b";
const EMAIL_GREEN = "#059669";
const EMAIL_GREEN_BG = "#d1fae5";
const EMAIL_AMBER = "#92400e";
const EMAIL_AMBER_BG = "#fef3c7";

function labelMentionUE(mention: string | null): string {
  const labels: Record<string, string> = {
    tres_bien: "Très Bien", bien: "Bien",
    assez_bien: "Assez Bien", passable: "Passable",
    insuffisant: "Insuffisant",
  };
  return mention ? (labels[mention] ?? mention) : "—";
}

function noteColorEmail(val: number | null): string {
  if (val === null) return EMAIL_GRAY_TXT;
  if (val >= 14) return EMAIL_GREEN;
  if (val >= 10) return "#1d4ed8";
  return "#dc2626";
}

function buildReleveEmailHtml(
  etudiant: { nom: string; prenom: string },
  ecole: { nom: string; logo_url: string | null },
  semestre: { libelle: string; niveau: string },
  snapshot: SnapshotNotes,
  introHtml?: string,
): string {
  const mentionLabel = labelMentionUE(snapshot.mention);
  const decisionLabel = snapshot.semestre_valide ? "Admis(e)" : "Ajourné(e)";
  const decisionBg = snapshot.semestre_valide ? EMAIL_GREEN_BG : EMAIL_AMBER_BG;
  const decisionColor = snapshot.semestre_valide ? "#065f46" : EMAIL_AMBER;
  const datePublication = new Date(snapshot.publie_le).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const logoOuNom = ecole.logo_url
    ? `<img src="${ecole.logo_url}" alt="${ecole.nom}" height="36" style="display:block;border:0;outline:none;" />`
    : `<span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#ffffff;">${ecole.nom}</span>`;

  const introParDefaut = `Votre relevé de notes pour <strong>${semestre.libelle}</strong> (${semestre.niveau}) a été publié le ${datePublication}. Voici un résumé de vos résultats.`;

  const lignesUE = snapshot.resultats_ue.map((ue, i) => {
    const rowBg = i % 2 === 0 ? "#ffffff" : EMAIL_GRAY_BG;
    const noteAffichee = ue.est_exclu
      ? `<span style="color:#dc2626;font-weight:600;font-size:12px;">Exclu(e)</span>`
      : ue.moyenne_ue !== null
        ? `<span style="color:${noteColorEmail(ue.moyenne_ue)};font-weight:700;">${Number(ue.moyenne_ue).toFixed(2)}</span>`
        : `<span style="color:${EMAIL_GRAY_TXT};">—</span>`;
    return `
      <tr>
        <td style="padding:8px 10px;background:${rowBg};border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:${EMAIL_GRAY_TXT};">${ue.ue_code}</td>
        <td style="padding:8px 10px;background:${rowBg};border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">${ue.ue_intitule}</td>
        <td align="center" style="padding:8px 10px;background:${rowBg};border-bottom:1px solid #f1f5f9;font-size:12px;color:#374151;">${ue.credits_acquis}/${ue.ue_credits}</td>
        <td align="center" style="padding:8px 10px;background:${rowBg};border-bottom:1px solid #f1f5f9;font-size:13px;">${noteAffichee}</td>
        <td align="center" style="padding:8px 10px;background:${rowBg};border-bottom:1px solid #f1f5f9;font-size:11px;color:#374151;">${labelMentionUE(ue.mention_ue)}</td>
      </tr>`;
  }).join("");

  const recapCell = (label: string, val: string, color: string) => `
    <td width="25%" align="center" style="padding:12px 6px;background:${EMAIL_GRAY_BG};border:1px solid #e2e8f0;">
      <div style="font-size:9px;font-weight:700;color:${EMAIL_GRAY_TXT};text-transform:uppercase;letter-spacing:0.04em;">${label}</div>
      <div style="font-size:16px;font-weight:800;color:${color};margin-top:4px;">${val}</div>
    </td>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relevé de notes — ${etudiant.nom} ${etudiant.prenom}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background:${EMAIL_NAVY};padding:22px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>${logoOuNom}</td>
                  <td align="right">
                    <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${EMAIL_OCRE};text-transform:uppercase;letter-spacing:0.06em;">Relevé de Notes</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 4px;font-size:14px;color:#1e293b;">Bonjour <strong>${etudiant.prenom} ${etudiant.nom}</strong>,</p>
              <p style="margin:0 0 20px;font-size:13px;color:${EMAIL_GRAY_TXT};line-height:1.5;">
                ${introHtml ?? introParDefaut}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border:1px solid #f1f5f9;border-radius:6px;overflow:hidden;">
                <tr>
                  <td style="background:${EMAIL_NAVY};padding:8px 10px;font-size:10px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.04em;">Code</td>
                  <td style="background:${EMAIL_NAVY};padding:8px 10px;font-size:10px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.04em;">Unité d'enseignement</td>
                  <td align="center" style="background:${EMAIL_NAVY};padding:8px 10px;font-size:10px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.04em;">Crédits</td>
                  <td align="center" style="background:${EMAIL_NAVY};padding:8px 10px;font-size:10px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.04em;">Moyenne</td>
                  <td align="center" style="background:${EMAIL_NAVY};padding:8px 10px;font-size:10px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.04em;">Mention</td>
                </tr>
                ${lignesUE}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border-spacing:6px 0;">
                <tr>
                  ${recapCell("Moyenne", snapshot.moyenne_semestre !== null ? Number(snapshot.moyenne_semestre).toFixed(2) : "—", noteColorEmail(snapshot.moyenne_semestre))}
                  ${recapCell("Crédits", `${snapshot.credits_valides}/${snapshot.credits_tentes}`, "#1d4ed8")}
                  ${recapCell("Mention", mentionLabel, "#7e22ce")}
                  ${recapCell("Décision", decisionLabel, decisionColor)}
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${decisionBg};border-radius:6px;margin-bottom:22px;">
                <tr>
                  <td style="padding:12px 16px;font-size:13px;font-weight:700;color:${decisionColor};">
                    Décision du jury : ${decisionLabel}
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;color:${EMAIL_GRAY_TXT};line-height:1.5;">
                Connectez-vous à votre espace EduLink Sup pour consulter le relevé complet et le télécharger au format PDF.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:${EMAIL_CREAM};padding:16px 28px;border-top:1px solid #ece7db;">
              <p style="margin:0;font-size:10px;color:#8a8574;">
                Document généré automatiquement par EduLink Sup pour ${ecole.nom}. Ne pas répondre à cet email.
              </p>
              <p style="margin:4px 0 0;font-size:10px;color:#8a8574;">
                Confidentiel — destiné uniquement à ${etudiant.prenom} ${etudiant.nom}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function envoyerEmailReleve(
  etudiant: { nom: string; prenom: string; email_auth: string },
  ecole: { nom: string; logo_url: string | null },
  semestre: { libelle: string; niveau: string },
  snapshot: SnapshotNotes,
  sujetEmail?: string,
  introHtml?: string,
): Promise<void> {
  const htmlContent = buildReleveEmailHtml(etudiant, ecole, semestre, snapshot, introHtml);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": Deno.env.get("BREVO_API_KEY")!,
    },
    body: JSON.stringify({
      sender: { name: ecole.nom, email: "contact@afryx.io" },
      to: [{ email: etudiant.email_auth, name: `${etudiant.prenom} ${etudiant.nom}` }],
      subject: sujetEmail ?? `Relevé de notes — ${semestre.libelle}`,
      htmlContent,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo error ${response.status}: ${err}`);
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req: Request) => {
  let lastEmailError: unknown = null;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  let payload: PublishPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized", detail: "missing_token" }, { status: 401, headers: CORS_HEADERS });
  }
  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: "Unauthorized", detail: "invalid_token" }, { status: 401, headers: CORS_HEADERS });
  }

  const {
    etudiant_id,
    semestre_id,
    session_id,
    publie_par,
    mode = "publish",
    send_email = false,
    republish = false,
  } = payload;

  if (!etudiant_id || !semestre_id) {
    return Response.json({ error: "Champs requis manquants (etudiant_id, semestre_id)" }, { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ROLES_AUTORISES = ["admin", "directeur", "scolarite", "responsable_pedagogique"];

  const { data: profilAppelant, error: errProfil } = await supabase
    .from("utilisateurs")
    .select("role, ecole_id, actif")
    .eq("auth_id", user.id)
    .eq("actif", true)
    .maybeSingle();

  if (errProfil || !profilAppelant) {
    return Response.json({ error: "Forbidden", detail: "profil_introuvable" }, { status: 403, headers: CORS_HEADERS });
  }

  if (!ROLES_AUTORISES.includes(profilAppelant.role)) {
    return Response.json({ error: "Forbidden", detail: "role_non_autorise" }, { status: 403, headers: CORS_HEADERS });
  }

  const { data: etudiantCible, error: errEtudiantCible } = await supabase
    .from("etudiants")
    .select("ecole_id")
    .eq("id", etudiant_id)
    .maybeSingle();

  if (errEtudiantCible || !etudiantCible) {
    return Response.json({ error: "Étudiant introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const estSuperadmin = profilAppelant.role === "admin" && profilAppelant.ecole_id === null;

  if (!estSuperadmin && profilAppelant.ecole_id !== etudiantCible.ecole_id) {
    return Response.json({ error: "Forbidden", detail: "ecole_differente" }, { status: 403, headers: CORS_HEADERS });
  }

  async function loadReleve() {
    let q = supabase.from("releves_notes").select("*")
      .eq("etudiant_id", etudiant_id).eq("semestre_id", semestre_id);
    if (session_id) q = q.eq("session_id", session_id);
    const { data } = await q.order("publie_le", { ascending: false }).limit(1).maybeSingle();
    return data;
  }

  async function loadContexteEmail() {
    const { data: etudiant } = await supabase.from("etudiants")
      .select("nom, prenom, email_auth, ecole_id").eq("id", etudiant_id).single();
    const { data: semestre } = await supabase.from("semestres")
      .select("libelle, niveau, programme_id").eq("id", semestre_id).single();
    const { data: ecole } = await supabase.from("ecoles")
      .select("nom, logo_url").eq("id", etudiant?.ecole_id).single();
    return { etudiant, semestre, ecole };
  }

  try {
    if (mode === "resend") {
      const releve = await loadReleve();
      if (!releve) {
        return Response.json({ error: "Aucun relevé publié à renvoyer" }, { status: 404, headers: CORS_HEADERS });
      }
      const { etudiant, semestre, ecole } = await loadContexteEmail();
      if (!etudiant?.email_auth) {
        return Response.json({ success: true, email_envoye: false, email_erreur: "no_email", detail: "no_email" }, { headers: CORS_HEADERS });
      }

      const varsResend = { semestre: semestre?.libelle ?? "", etudiant: `${etudiant.prenom} ${etudiant.nom}`, etablissement: ecole?.nom ?? "" };
      const modeleResend = await resoudreModeleEmail(supabase, etudiant.ecole_id, varsResend);
      const doitEnvoyerResend = modeleResend.actif !== null ? modeleResend.actif : true;

      let emailEnvoye = false;
      if (doitEnvoyerResend) {
        const { data: reglesResend } = await supabase.from("regles_ecole")
          .select("notif_releve_sujet").eq("ecole_id", etudiant.ecole_id).maybeSingle();
        const sujetResend = modeleResend.sujet ?? substituerVariables(
          reglesResend?.notif_releve_sujet ?? "Relevé de notes — {semestre}", varsResend
        );
        try {
          await envoyerEmailReleve(etudiant, ecole, semestre, releve.snapshot_notes as SnapshotNotes, sujetResend, modeleResend.introHtml ?? undefined);
          emailEnvoye = true;
        } catch (e) {
          console.error("Brevo resend error:", e);
          lastEmailError = e instanceof Error ? e.message : String(e);
        }
        await journaliserEnvoi(supabase, {
          ecole_id: etudiant.ecole_id, canal: "email", type: "releve",
          destinataire_id: etudiant_id, destinataire_nom: `${etudiant.prenom} ${etudiant.nom}`,
          destinataire_contact: etudiant.email_auth, sujet: sujetResend,
          statut: emailEnvoye ? "envoye" : "echec", erreur: emailEnvoye ? null : String(lastEmailError ?? ""),
          envoye_par: publie_par ?? null,
        });
      }
      return Response.json({ success: true, mode: "resend", email_envoye: emailEnvoye, email_erreur: emailEnvoye ? null : lastEmailError }, { headers: CORS_HEADERS });
    }

    if (mode === "lock" || mode === "unlock") {
      if (mode === "unlock" && !estSuperadmin) {
        return Response.json({ error: "Forbidden", detail: "deverrouillage_reserve_superadmin" }, { status: 403, headers: CORS_HEADERS });
      }
      const releve = await loadReleve();
      if (!releve) {
        return Response.json({ error: "Aucun relevé à verrouiller" }, { status: 404, headers: CORS_HEADERS });
      }
      const verrou = mode === "lock";
      const { error: errLock } = await supabase.from("releves_notes").update({
        verrouille: verrou,
        verrouille_le: verrou ? new Date().toISOString() : null,
        verrouille_par: verrou ? (publie_par ?? null) : null,
      }).eq("id", releve.id);
      if (errLock) throw new Error(`verrouillage: ${errLock.message}`);
      return Response.json({ success: true, verrouille: verrou }, { headers: CORS_HEADERS });
    }

    if (!session_id) {
      return Response.json({ error: "session_id requis pour la publication" }, { status: 400, headers: CORS_HEADERS });
    }

    const { data: etuGarde, error: errEtuGarde } = await supabase
      .from("etudiants").select("ecole_id").eq("id", etudiant_id).single();
    if (errEtuGarde) throw new Error(`etudiants (garde): ${errEtuGarde.message}`);

    const { data: regles } = await supabase
      .from("regles_ecole")
      .select("blocage_releve_impaye, tolerance_impaye_releve, notif_releve_active, notif_releve_sujet")
      .eq("ecole_id", etuGarde.ecole_id).maybeSingle();

    if (regles?.blocage_releve_impaye) {
      const { data: solde, error: errSolde } = await supabase
        .rpc("fn_solde_etudiant", { p_etudiant_id: etudiant_id });
      if (errSolde) throw new Error(`fn_solde_etudiant: ${errSolde.message}`);

      const soldeDu = Number(solde) || 0;
      const tolerance = Number(regles.tolerance_impaye_releve) || 0;
      if (soldeDu > tolerance) {
        return Response.json({
          error: "Relevé bloqué — solde impayé",
          detail: "solde_impaye",
          solde_du: soldeDu,
          tolerance,
        }, { status: 402, headers: CORS_HEADERS });
      }
    }

    const existant = await loadReleve();
    if (existant?.verrouille) {
      return Response.json({
        error: "Relevé verrouillé — déverrouillez-le avant toute republication",
        detail: "verrouille",
      }, { status: 409, headers: CORS_HEADERS });
    }

    if (existant && !republish) {
      let emailEnvoye = false;
      if (send_email) {
        const { etudiant, semestre, ecole } = await loadContexteEmail();
        if (etudiant?.email_auth) {
          const varsExistant = { semestre: semestre?.libelle ?? "", etudiant: `${etudiant.prenom} ${etudiant.nom}`, etablissement: ecole?.nom ?? "" };
          const modeleExistant = await resoudreModeleEmail(supabase, etudiant.ecole_id, varsExistant);
          const doitEnvoyerExistant = modeleExistant.actif !== null ? modeleExistant.actif : (regles?.notif_releve_active ?? true);

          if (doitEnvoyerExistant) {
            const sujetResolu = modeleExistant.sujet ?? substituerVariables(
              regles?.notif_releve_sujet ?? "Relevé de notes — {semestre}", varsExistant
            );
            try {
              await envoyerEmailReleve(etudiant, ecole, semestre, existant.snapshot_notes as SnapshotNotes, sujetResolu, modeleExistant.introHtml ?? undefined);
              emailEnvoye = true;
            } catch (e) { console.error("Brevo error:", e); lastEmailError = e instanceof Error ? e.message : String(e); }
            await journaliserEnvoi(supabase, {
              ecole_id: etudiant.ecole_id, canal: "email", type: "releve",
              destinataire_id: etudiant_id, destinataire_nom: `${etudiant.prenom} ${etudiant.nom}`,
              destinataire_contact: etudiant.email_auth, sujet: sujetResolu,
              statut: emailEnvoye ? "envoye" : "echec", erreur: emailEnvoye ? null : String(lastEmailError ?? ""),
              envoye_par: publie_par ?? null,
            });
          }
        }
      }
      return Response.json({
        success: true,
        releve_id: existant.id,
        mention: existant.mention,
        deja_publie: true,
        email_envoye: emailEnvoye,
        email_erreur: emailEnvoye ? null : lastEmailError,
      }, { headers: CORS_HEADERS });
    }

    const { data: resultats, error: errR } = await supabase.rpc("fn_resultats_semestre", {
      p_etudiant_id: etudiant_id, p_semestre_id: semestre_id
    });
    if (errR) throw new Error(`fn_resultats_semestre: ${errR.message}`);
    if (!resultats?.length) {
      return Response.json({ error: "Aucun résultat trouvé" }, { status: 404, headers: CORS_HEADERS });
    }

    const { data: etudiant } = await supabase.from("etudiants")
      .select("nom, prenom, email_auth, ecole_id").eq("id", etudiant_id).single();
    const { data: semestre } = await supabase.from("semestres")
      .select("libelle, niveau, programme_id").eq("id", semestre_id).single();
    const { data: programme } = await supabase.from("programmes_lmd")
      .select("intitule").eq("id", semestre.programme_id).single();
    const { data: ecole } = await supabase.from("ecoles")
      .select("nom, logo_url").eq("id", etudiant.ecole_id).single();

    const creditsTentes = (resultats as ResultatUE[]).reduce((a, r) => a + (r.obligatoire ? r.ue_credits : 0), 0);
    const creditsValides = (resultats as ResultatUE[]).reduce((a, r) => a + r.credits_acquis, 0);
    const moyenneSemestre = calculMoyenneSemestre(resultats as ResultatUE[]);
    const mention = calculMention(moyenneSemestre);
    const semestreValide = (resultats as ResultatUE[]).filter(r => r.obligatoire).every(r => r.ue_validee);

    const snapshot: SnapshotNotes = {
      publie_le: new Date().toISOString(),
      semestre_libelle: semestre.libelle,
      programme_intitule: programme.intitule,
      niveau: semestre.niveau,
      resultats_ue: resultats as ResultatUE[],
      credits_valides: creditsValides,
      credits_tentes: creditsTentes,
      semestre_valide: semestreValide,
      moyenne_semestre: moyenneSemestre,
      mention,
    };

    const { data: releve, error: errReleve } = await supabase.from("releves_notes").upsert({
      etudiant_id, semestre_id, session_id,
      ecole_id: etudiant.ecole_id,
      snapshot_notes: snapshot,
      moyenne_semestre: moyenneSemestre,
      credits_valides: creditsValides,
      credits_tentes: creditsTentes,
      mention,
      decision: semestreValide ? "admis" : "ajourné",
      publie_le: new Date().toISOString(),
      publie_par: publie_par ?? null,
      verrouille: false,
    }, { onConflict: "etudiant_id,semestre_id,session_id" }).select().single();

    if (errReleve) throw new Error(`releves_notes: ${errReleve.message}`);

    let emailEnvoye = false;
    if (send_email && etudiant.email_auth) {
      const varsPublish = { semestre: semestre.libelle, etudiant: `${etudiant.prenom} ${etudiant.nom}`, etablissement: ecole.nom };
      const modelePublish = await resoudreModeleEmail(supabase, etudiant.ecole_id, varsPublish);
      const doitEnvoyerPublish = modelePublish.actif !== null ? modelePublish.actif : (regles?.notif_releve_active ?? true);

      if (doitEnvoyerPublish) {
        const sujetResolu = modelePublish.sujet ?? substituerVariables(
          regles?.notif_releve_sujet ?? "Relevé de notes — {semestre}", varsPublish
        );
        try {
          await envoyerEmailReleve(etudiant, ecole, semestre, snapshot, sujetResolu, modelePublish.introHtml ?? undefined);
          emailEnvoye = true;
        } catch (e) {
          console.error("Brevo error:", e);
          lastEmailError = e instanceof Error ? e.message : String(e);
        }
        await journaliserEnvoi(supabase, {
          ecole_id: etudiant.ecole_id, canal: "email", type: "releve",
          destinataire_id: etudiant_id, destinataire_nom: `${etudiant.prenom} ${etudiant.nom}`,
          destinataire_contact: etudiant.email_auth, sujet: sujetResolu,
          statut: emailEnvoye ? "envoye" : "echec", erreur: emailEnvoye ? null : String(lastEmailError ?? ""),
          envoye_par: publie_par ?? null,
        });
      }
    }

    return Response.json({
      success: true,
      releve_id: releve.id,
      etudiant: `${etudiant.prenom} ${etudiant.nom}`,
      semestre: semestre.libelle,
      credits_valides: creditsValides,
      semestre_valide: semestreValide,
      mention,
      republie: !!existant,
      email_envoye: emailEnvoye,
      email_erreur: emailEnvoye ? null : lastEmailError,
    }, { headers: CORS_HEADERS });

  } catch (err) {
    console.error("publish-releve error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
