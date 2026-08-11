// =============================================================================
// EduLink Sup — Chantier E — Edge Function : notifier-email-evenement
// Envoi email réel pour les notifications automatiques du Chantier D
// (absence / note / paiement UNIQUEMENT — le releve garde son propre circuit
// riche via publish-releve, ne pas dupliquer l'envoi ici).
//
// Réutilise le même fournisseur (Brevo) et le même secret (BREVO_API_KEY) que
// publish-releve. Résout le modèle avec le même fallback global que
// fn_notifier_evenement (ecole-spécifique prime, sinon ecole_id IS NULL).
// Journalise dans journal_notifications (table déjà existante, réutilisée).
//
// B15 action 2 : gabarit email mutualisé dans _shared/email-charte.ts.
// B15 action 3 : filtre de préférence par destinataire (preferences_notification_famille) —
// si la famille a désactivé le canal email, l'envoi est court-circuité et
// journalisé avec le motif "opt_out". La messagerie interne et le centre
// d'alertes du portail (gérés par fn_notifier_evenement) ne sont JAMAIS
// filtrés — seuls les canaux externes le sont.
// =============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildEmailCharteHtml, escapeHtml } from "../_shared/email-charte.ts";
type TypeEvenement = "absence" | "note" | "paiement";
interface Payload {
  ecole_id: string;
  etudiant_id: string;
  type: TypeEvenement;
  vars?: Record<string, string>;
}
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CATEGORIE_LABEL: Record<TypeEvenement, string> = {
  absence: "Absence",
  note: "Note",
  paiement: "Paiement",
};
function substituerVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
async function envoyerEmail(
  etudiant: { nom: string; prenom: string; email_auth: string },
  ecole: { nom: string; logo_url: string | null },
  sujet: string,
  corpsTexte: string,
  badge: string,
): Promise<void> {
  const corpsHtml = escapeHtml(corpsTexte).replace(/\n/g, "<br/>");
  const htmlContent = buildEmailCharteHtml({
    sujet,
    corpsHtml,
    ecole,
    badge,
    salutationHtml: `Bonjour <strong>${escapeHtml(etudiant.prenom)} ${escapeHtml(etudiant.nom)}</strong>,`,
    piedNotes: [
      `Document généré automatiquement par EduLink Sup pour ${escapeHtml(ecole.nom)}. Ne pas répondre à cet email.`,
      `Confidentiel — destiné uniquement à ${escapeHtml(etudiant.prenom)} ${escapeHtml(etudiant.nom)}.`,
    ],
  });
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": Deno.env.get("BREVO_API_KEY")!,
    },
    body: JSON.stringify({
      sender: { name: ecole.nom, email: "edulink@kinnou.com" },
      to: [{ email: etudiant.email_auth, name: `${etudiant.prenom} ${etudiant.nom}` }],
      subject: sujet,
      htmlContent,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo error ${response.status}: ${err}`);
  }
}
async function journaliserEnvoi(
  supabase: ReturnType<typeof createClient>,
  params: {
    ecole_id: string; type: TypeEvenement; destinataire_id: string;
    destinataire_nom: string; destinataire_contact: string | null;
    sujet: string | null; statut: "envoye" | "echec"; erreur: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("journal_notifications").insert({
      ecole_id: params.ecole_id, type: params.type, canal: "email",
      destinataire_id: params.destinataire_id, destinataire_type: "etudiant",
      destinataire_nom: params.destinataire_nom, destinataire_contact: params.destinataire_contact,
      sujet: params.sujet, statut: params.statut, erreur: params.erreur,
    });
  } catch (e) {
    console.error("journal_notifications insert error:", e);
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }
  let payload: Payload;
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
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: "Unauthorized", detail: "invalid_token" }, { status: 401, headers: CORS_HEADERS });
  }
  const { ecole_id, etudiant_id, type, vars = {} } = payload;
  if (!ecole_id || !etudiant_id || !type) {
    return Response.json({ error: "Champs requis manquants" }, { status: 400, headers: CORS_HEADERS });
  }
  if (!["absence", "note", "paiement"].includes(type)) {
    return Response.json({ error: "Type non supporté (releve exclu volontairement)" }, { status: 400, headers: CORS_HEADERS });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profilAppelant } = await supabase
    .from("utilisateurs").select("role, ecole_id, actif").eq("auth_id", user.id).eq("actif", true).maybeSingle();
  if (!profilAppelant) {
    return Response.json({ error: "Forbidden", detail: "profil_introuvable" }, { status: 403, headers: CORS_HEADERS });
  }
  const estSuperadmin = profilAppelant.role === "admin" && profilAppelant.ecole_id === null;
  if (!estSuperadmin && profilAppelant.ecole_id !== ecole_id) {
    return Response.json({ error: "Forbidden", detail: "ecole_differente" }, { status: 403, headers: CORS_HEADERS });
  }
  try {
    const { data: etudiant } = await supabase
      .from("etudiants").select("nom, prenom, email_auth").eq("id", etudiant_id).eq("ecole_id", ecole_id).single();
    if (!etudiant) {
      return Response.json({ success: true, email_envoye: false, email_erreur: "etudiant_introuvable" }, { headers: CORS_HEADERS });
    }

    // ── B15 action 3 : filtre de préférence — canal email désactivé par la famille ──
    const { data: prefs } = await supabase
      .from("preferences_notification_famille")
      .select("email_actif").eq("etudiant_id", etudiant_id).maybeSingle();
    if (prefs?.email_actif === false) {
      await journaliserEnvoi(supabase, {
        ecole_id, type, destinataire_id: etudiant_id,
        destinataire_nom: `${etudiant.prenom} ${etudiant.nom}`, destinataire_contact: etudiant.email_auth ?? null,
        sujet: null, statut: "echec", erreur: "opt_out",
      });
      return Response.json({ success: true, email_envoye: false, email_erreur: "opt_out" }, { headers: CORS_HEADERS });
    }

    const { data: ecole } = await supabase.from("ecoles").select("nom, logo_url").eq("id", ecole_id).single();
    // Résolution du modèle — même fallback global que fn_notifier_evenement :
    // école-spécifique prime, sinon ecole_id IS NULL.
    const { data: modeles } = await supabase
      .from("modeles_notification")
      .select("ecole_id, actif, sujet, corps_texte")
      .eq("type", type).eq("canal", "email")
      .or(`ecole_id.eq.${ecole_id},ecole_id.is.null`);
    const modele = (modeles ?? []).sort((a, b) => (a.ecole_id ? 0 : 1) - (b.ecole_id ? 0 : 1))[0];
    if (!modele || modele.actif !== true) {
      await journaliserEnvoi(supabase, {
        ecole_id, type, destinataire_id: etudiant_id,
        destinataire_nom: `${etudiant.prenom} ${etudiant.nom}`, destinataire_contact: etudiant.email_auth ?? null,
        sujet: null, statut: "echec", erreur: "aucun_modele_actif",
      });
      return Response.json({ success: true, email_envoye: false, email_erreur: "aucun_modele_actif" }, { headers: CORS_HEADERS });
    }
    if (!etudiant.email_auth) {
      await journaliserEnvoi(supabase, {
        ecole_id, type, destinataire_id: etudiant_id,
        destinataire_nom: `${etudiant.prenom} ${etudiant.nom}`, destinataire_contact: null,
        sujet: null, statut: "echec", erreur: "no_email",
      });
      return Response.json({ success: true, email_envoye: false, email_erreur: "no_email" }, { headers: CORS_HEADERS });
    }
    const varsCompletes = { etudiant: `${etudiant.prenom} ${etudiant.nom}`, ...vars };
    const sujet = modele.sujet ? substituerVariables(modele.sujet, varsCompletes) : CATEGORIE_LABEL[type];
    const corps = modele.corps_texte ? substituerVariables(modele.corps_texte, varsCompletes) : "";
    let emailEnvoye = false;
    let erreur: string | null = null;
    try {
      await envoyerEmail(etudiant, ecole ?? { nom: "EduLink Sup", logo_url: null }, sujet, corps, CATEGORIE_LABEL[type]);
      emailEnvoye = true;
    } catch (e) {
      console.error("Brevo error:", e);
      erreur = e instanceof Error ? e.message : String(e);
    }
    await journaliserEnvoi(supabase, {
      ecole_id, type, destinataire_id: etudiant_id,
      destinataire_nom: `${etudiant.prenom} ${etudiant.nom}`, destinataire_contact: etudiant.email_auth,
      sujet, statut: emailEnvoye ? "envoye" : "echec", erreur,
    });
    return Response.json({ success: true, email_envoye: emailEnvoye, email_erreur: erreur }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("notifier-email-evenement error:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: CORS_HEADERS });
  }
});
