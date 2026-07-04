// supabase/functions/send-otp/index.ts
//
// Edge Function : envoi du code OTP de second facteur pour le personnel
// (B12.1 — 2FA). Réutilise l'infrastructure déjà en place :
//   - Brevo pour l'email (mêmes secrets que send-email)
//   - Twilio pour le SMS (mêmes secrets que bright-handler, déjà configurés)
//
// L'utilisateur doit déjà avoir une session Supabase Auth valide (login
// mot de passe réussi) — l'OTP est un SECOND facteur, pas le premier.
//
// POST { channel: "email" | "sms" }
//   → génère un code à 6 chiffres, le hache (SHA-256) avant stockage,
//     l'envoie sur le canal demandé, journalise dans audit_log.
//
// Secrets requis (déjà présents pour d'autres fonctions) :
//   BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OTP_VALIDITE_MINUTES = 10;
const RATE_LIMIT = 3;                 // 3 envois / 10 min / utilisateur
const RATE_WINDOW_MS = 10 * 60 * 1000;
const ROLES_2FA = ["admin", "direction", "scolarite", "enseignant", "comptable"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function genererOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function masquerEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function masquerTelephone(tel: string): string {
  return tel.length > 4 ? `***${tel.slice(-4)}` : "***";
}

async function envoiEmailOTP(apiKey: string, fromEmail: string, fromName: string, to: string, code: string) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject: "Votre code de connexion EduLink Sup",
      htmlContent: `
        <div style="font-family:'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;">
          <h2 style="color:#1B2A4A;margin-bottom:8px;">Code de vérification</h2>
          <p style="color:#374151;font-size:14px;">Voici votre code de connexion EduLink Sup :</p>
          <div style="background:#F7F4ED;border:1px solid #C8932E;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
            <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1B2A4A;">${code}</span>
          </div>
          <p style="color:#6b7280;font-size:12px;">Ce code expire dans ${OTP_VALIDITE_MINUTES} minutes. Ne le partagez avec personne.</p>
        </div>`,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) return { ok: false, error: data?.message || `Erreur Brevo ${resp.status}` };
  return { ok: true };
}

async function envoiSmsOTP(accountSid: string, authToken: string, fromNumber: string, to: string, code: string) {
  const recipient = to.startsWith("+") ? to : `+${to}`;
  const body = new URLSearchParams({
    From: fromNumber, To: recipient,
    Body: `EduLink : votre code de connexion est ${code}. Valable ${OTP_VALIDITE_MINUTES} min. Ne le partagez pas.`,
  }).toString();
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) return { ok: false, error: data?.message || `Erreur Twilio ${resp.status}` };
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentification requise" }, 401);
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
    if (authError || !user) return json({ error: "Token invalide" }, 401);

    // ── Profil + rôle
    const { data: profil, error: errProfil } = await supabase
      .from("utilisateurs")
      .select("role, ecole_id, actif, telephone, nom, prenom")
      .eq("auth_id", user.id)
      .eq("actif", true)
      .maybeSingle();

    if (errProfil || !profil) return json({ error: "Profil introuvable" }, 403);
    if (!ROLES_2FA.includes(profil.role)) {
      return json({ error: "2FA non requis pour ce rôle" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const channel = body.channel === "sms" ? "sms" : "email";

    if (channel === "sms" && !profil.telephone) {
      return json({ error: "Aucun numéro de téléphone enregistré pour ce compte. Utilisez l'email ou contactez un administrateur." }, 400);
    }

    // ── Rate limiting persisté
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count: used } = await supabase
      .from("staff_otp_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", windowStart);
    if ((used ?? 0) >= RATE_LIMIT) {
      return json({ error: "Trop de demandes de code. Réessayez dans quelques minutes." }, 429);
    }

    // ── Génération + stockage (haché)
    const code = genererOTP();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + OTP_VALIDITE_MINUTES * 60_000).toISOString();
    const destination = channel === "email" ? (user.email ?? "") : profil.telephone;
    const destinationMasquee = channel === "email" ? masquerEmail(user.email ?? "") : masquerTelephone(profil.telephone);

    const { error: insertErr } = await supabase.from("staff_otp_verifications").insert({
      user_id: user.id, code_hash: codeHash, channel, destination: destinationMasquee, expires_at: expiresAt,
    });
    if (insertErr) {
      console.error("[send-otp] insert failed:", insertErr.message);
      return json({ error: "Erreur serveur lors de la génération du code" }, 500);
    }

    // ── Envoi effectif
    let sendResult: { ok: boolean; error?: string };
    if (channel === "email") {
      const apiKey = Deno.env.get("BREVO_API_KEY");
      const fromEmail = Deno.env.get("BREVO_FROM_EMAIL");
      const fromName = Deno.env.get("BREVO_FROM_NAME") || "EduLink";
      if (!apiKey || !fromEmail) return json({ error: "Service email mal configuré côté serveur." }, 500);
      sendResult = await envoiEmailOTP(apiKey, fromEmail, fromName, destination, code);
    } else {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
      if (!accountSid || !authToken || !fromNumber) return json({ error: "Service SMS mal configuré côté serveur." }, 500);
      sendResult = await envoiSmsOTP(accountSid, authToken, fromNumber, destination, code);
    }

    // ── Journal d'audit — réutilise audit_logs + fn_audit_log() existants.
    // Appel via un client authentifié AVEC le JWT de l'utilisateur (pas le
    // service_role) pour que auth.uid() résolve correctement à l'intérieur
    // de la fonction SECURITY DEFINER, exactement comme le fait déjà le
    // module Utilisateurs.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    await userClient.rpc("fn_audit_log", {
      p_ecole_id: profil.ecole_id,
      p_action: sendResult.ok ? "OTP_ENVOYE" : "OTP_ENVOI_ECHEC",
      p_module: "auth_2fa",
      p_ressource_ref: `Canal: ${channel}, destination: ${destinationMasquee}${sendResult.error ? `, erreur: ${sendResult.error}` : ""}`,
    });

    if (!sendResult.ok) return json({ error: sendResult.error || "Échec de l'envoi du code" }, 500);

    return json({ success: true, channel, destination: destinationMasquee, expiresInMinutes: OTP_VALIDITE_MINUTES });
  } catch (err) {
    console.error("[send-otp] Exception:", err);
    return json({ error: err instanceof Error ? err.message : "Erreur serveur" }, 500);
  }
});
