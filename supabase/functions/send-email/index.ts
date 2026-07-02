// supabase/functions/send-email/index.ts
//
// Edge Function : envoi d'emails via Brevo (côté serveur).
// La clé API Brevo n'est JAMAIS exposée au navigateur — elle vit
// uniquement dans les secrets Supabase de cette fonction.
//
// B9 — RBAC + validation destinataire + rate limiting persisté (2026-07)
//   - Seuls admin/directeur/scolarite peuvent appeler cette fonction.
//   - Le destinataire doit être un email connu (étudiant/parent/enseignant)
//     de la même école que l'appelant, sauf pour le superadmin.
//   - Rate limiting basé sur la table email_send_log (survit aux cold starts).
//
// Configuration des secrets (à faire UNE FOIS) :
//   supabase secrets set BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxx
//   supabase secrets set BREVO_FROM_EMAIL=contact@votre-domaine.com
//   supabase secrets set BREVO_FROM_NAME=EduLink

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT = 50; // 50 emails / heure / utilisateur
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ROLES_AUTORISES = ["admin", "directeur", "scolarite"];

interface EmailRequest {
  to: string;
  toName?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    // ── 1. Authentification JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Authentification requise" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Token invalide" }, 401);
    }

    // ── 2. RBAC — vérifier le rôle et récupérer ecole_id
    const { data: profil, error: errProfil } = await supabase
      .from("utilisateurs")
      .select("role, ecole_id, actif")
      .eq("auth_id", user.id)
      .eq("actif", true)
      .maybeSingle();

    if (errProfil || !profil) {
      return json({ error: "Forbidden", detail: "profil_introuvable" }, 403);
    }
    if (!ROLES_AUTORISES.includes(profil.role)) {
      return json({ error: "Forbidden", detail: "role_non_autorise" }, 403);
    }
    const estSuperadmin = profil.role === "admin" && profil.ecole_id === null;

    // ── 3. Rate limiting (persisté en base)
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count: usedCount, error: errCount } = await supabase
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", windowStart);

    if (errCount) {
      console.error("[send-email] rate limit check failed:", errCount.message);
    }
    const used = usedCount ?? 0;
    if (used >= RATE_LIMIT) {
      return json({ error: "Limite d'envoi atteinte (50 emails/h). Réessayez dans une heure." }, 429);
    }

    // ── 4. Parsing & validation du body
    const body: EmailRequest = await req.json();
    if (!body.to || !body.subject) {
      return json({ error: "Champs requis : to, subject" }, 400);
    }
    if (!body.html && !body.text) {
      return json({ error: "Contenu requis : html ou text" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)) {
      return json({ error: "Email destinataire invalide" }, 400);
    }

    // ── 5. Validation du destinataire — doit être connu de l'école de l'appelant
    // (sauf superadmin, qui peut écrire à n'importe quel destinataire connu)
    const destinataireLower = body.to.toLowerCase();

    let destinataireValide = false;

    // Étudiants (email_auth ou email_parent)
    let qEtudiants = supabase
      .from("etudiants")
      .select("id", { head: true, count: "exact" })
      .or(`email_auth.ilike.${destinataireLower},email_parent.ilike.${destinataireLower}`);
    if (!estSuperadmin) qEtudiants = qEtudiants.eq("ecole_id", profil.ecole_id);
    const { count: cEtudiants } = await qEtudiants;
    if ((cEtudiants ?? 0) > 0) destinataireValide = true;

    // Enseignants
    if (!destinataireValide) {
      let qEnseignants = supabase
        .from("enseignants")
        .select("id", { head: true, count: "exact" })
        .ilike("email", destinataireLower);
      if (!estSuperadmin) qEnseignants = qEnseignants.eq("ecole_id", profil.ecole_id);
      const { count: cEnseignants } = await qEnseignants;
      if ((cEnseignants ?? 0) > 0) destinataireValide = true;
    }

    // Utilisateurs back-office (admin/directeur/scolarite/etc. de la même école)
    if (!destinataireValide) {
      let qUtilisateurs = supabase
        .from("utilisateurs")
        .select("id", { head: true, count: "exact" })
        .ilike("email", destinataireLower);
      if (!estSuperadmin) qUtilisateurs = qUtilisateurs.eq("ecole_id", profil.ecole_id);
      const { count: cUtilisateurs } = await qUtilisateurs;
      if ((cUtilisateurs ?? 0) > 0) destinataireValide = true;
    }

    if (!destinataireValide) {
      return json({
        error: "Destinataire non reconnu dans votre établissement.",
        detail: "destinataire_non_autorise",
      }, 403);
    }

    // ── 6. Lecture des secrets
    const apiKey = Deno.env.get("BREVO_API_KEY");
    const fromEmail = Deno.env.get("BREVO_FROM_EMAIL");
    const fromName = Deno.env.get("BREVO_FROM_NAME") || "EduLink";

    if (!apiKey || !fromEmail) {
      console.error("[send-email] Configuration manquante", { hasKey: !!apiKey, hasFromEmail: !!fromEmail });
      return json({ error: "Service email mal configuré côté serveur. Contactez l'administrateur." }, 500);
    }

    // ── 7. Appel à Brevo
    const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: body.to, name: body.toName || body.to }],
        subject: body.subject,
        htmlContent: body.html || `<p>${(body.text || "").replace(/\n/g, "<br>")}</p>`,
        ...(body.replyTo ? { replyTo: { email: body.replyTo } } : {}),
      }),
    });

    const brevoData = await brevoResp.json();

    if (!brevoResp.ok) {
      console.error("[send-email] Erreur Brevo", brevoResp.status, brevoData);
      return json({ error: brevoData?.message || `Erreur Brevo ${brevoResp.status}`, code: brevoData?.code }, brevoResp.status);
    }

    // ── 8. Journalisation (pour le rate limiting des prochains appels)
    await supabase.from("email_send_log").insert({
      user_id: user.id,
      destinataire: body.to,
    });

    console.log(`[send-email] ✅ Email envoyé à ${body.to} (user ${user.id}, role ${profil.role})`);
    return json({
      success: true,
      messageId: brevoData?.messageId,
      rateLimitRemaining: RATE_LIMIT - used - 1,
    });
  } catch (err) {
    console.error("[send-email] Exception", err);
    return json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, 500);
  }
});