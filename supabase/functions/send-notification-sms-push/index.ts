// =============================================================================
// EduLink Sup — Chantier E — Edge Function : send-notification-sms-push
// Envoi SMS (Twilio) + Push (FCM) pour les notifications automatiques du
// Chantier D (absence / note / paiement UNIQUEMENT — releve garde son propre
// circuit via publish-releve, ne pas dupliquer).
//
// Réutilise les mêmes secrets que publish-releve (TWILIO_*) et
// send-push-notification (FIREBASE_*), déjà configurés côté projet.
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

function substituerVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ── SMS (Twilio) — repris de publish-releve ──────────────────────────────
function formatTelephoneE164(tel: string): string {
  const nettoye = tel.trim();
  return nettoye.startsWith("+") ? nettoye : `+${nettoye}`;
}

async function envoyerSms(telephone: string, corps: string): Promise<void> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Service SMS mal configuré côté serveur (secrets Twilio manquants).");
  }
  const body = new URLSearchParams({
    From: fromNumber,
    To: formatTelephoneE164(telephone),
    Body: corps,
  }).toString();
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || `Twilio error ${response.status}`);
}

// ── Push (FCM V1 via OAuth2) — repris de send-push-notification ─────────
const FIREBASE_PROJECT_ID = "edulink-demo-client";

function getServiceAccount() {
  const client_email    = Deno.env.get("FIREBASE_CLIENT_EMAIL");
  const private_key_id  = Deno.env.get("FIREBASE_PRIVATE_KEY_ID");
  const private_key     = Deno.env.get("FIREBASE_PRIVATE_KEY");
  if (!client_email || !private_key_id || !private_key) {
    throw new Error("Configuration Firebase manquante côté serveur.");
  }
  return { client_email, private_key_id, private_key };
}

async function getFcmAccessToken(): Promise<string> {
  const SERVICE_ACCOUNT = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header64  = encode(header);
  const payload64 = encode(payload);
  const sigInput  = `${header64}.${payload64}`;

  const pemKey = SERVICE_ACCOUNT.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const keyBuffer = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBuffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(sigInput)
  );
  const sig64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${sigInput}.${sig64}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Token OAuth2 non obtenu: " + JSON.stringify(data));
  return data.access_token;
}

async function sendFCM(token: string, titre: string, body: string, accessToken: string) {
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: titre, body },
          webpush: {
            notification: {
              title: titre, body,
              icon: "https://edulink-demo-client.vercel.app/icon-192.png",
              badge: "https://edulink-demo-client.vercel.app/icon-72.png",
            },
            fcm_options: { link: "https://edulink-demo-client.vercel.app/edulink-portail.html" },
          },
        },
      }),
    }
  );
  return resp.json();
}

// ── Journalisation ────────────────────────────────────────────────────────
async function journaliserEnvoi(
  supabase: ReturnType<typeof createClient>,
  params: {
    ecole_id: string; canal: "sms" | "push"; type: TypeEvenement;
    destinataire_id: string; destinataire_nom: string; destinataire_contact: string | null;
    sujet: string | null; statut: "envoye" | "echec"; erreur: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("journal_notifications").insert({
      ecole_id: params.ecole_id, type: params.type, canal: params.canal,
      destinataire_id: params.destinataire_id, destinataire_type: "etudiant",
      destinataire_nom: params.destinataire_nom, destinataire_contact: params.destinataire_contact,
      sujet: params.sujet, statut: params.statut, erreur: params.erreur,
    });
  } catch (e) {
    console.error("journal_notifications insert error:", e);
  }
}

async function resoudreModele(
  supabase: ReturnType<typeof createClient>,
  ecoleId: string, type: TypeEvenement, canal: "sms" | "push",
): Promise<{ actif: boolean; sujet: string | null; corps: string | null } | null> {
  const { data: modeles } = await supabase
    .from("modeles_notification")
    .select("ecole_id, actif, sujet, corps_texte")
    .eq("type", type).eq("canal", canal)
    .or(`ecole_id.eq.${ecoleId},ecole_id.is.null`);
  const modele = (modeles ?? []).sort((a, b) => (a.ecole_id ? 0 : 1) - (b.ecole_id ? 0 : 1))[0];
  if (!modele || modele.actif !== true) return null;
  return { actif: true, sujet: modele.sujet, corps: modele.corps_texte };
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

  const { data: etudiant } = await supabase
    .from("etudiants").select("nom, prenom, telephone_parent, auth_id").eq("id", etudiant_id).eq("ecole_id", ecole_id).single();
  if (!etudiant) {
    return Response.json({ success: true, sms_envoye: false, push_envoye: false }, { headers: CORS_HEADERS });
  }
  const varsCompletes = { etudiant: `${etudiant.prenom} ${etudiant.nom}`, ...vars };

  // ── SMS ──────────────────────────────────────────────────────────────
  let smsEnvoye = false, smsErreur: string | null = null;
  const modeleSms = await resoudreModele(supabase, ecole_id, type, "sms");
  if (!modeleSms) {
    smsErreur = "aucun_modele_actif";
  } else if (!etudiant.telephone_parent) {
    smsErreur = "no_phone";
  } else {
    const corpsSms = substituerVariables(modeleSms.corps ?? "", varsCompletes);
    try {
      await envoyerSms(etudiant.telephone_parent, corpsSms);
      smsEnvoye = true;
    } catch (e) {
      smsErreur = e instanceof Error ? e.message : String(e);
    }
  }
  await journaliserEnvoi(supabase, {
    ecole_id, canal: "sms", type, destinataire_id: etudiant_id,
    destinataire_nom: varsCompletes.etudiant, destinataire_contact: etudiant.telephone_parent ?? null,
    sujet: null, statut: smsEnvoye ? "envoye" : "echec", erreur: smsEnvoye ? null : smsErreur,
  });

  // ── Push ─────────────────────────────────────────────────────────────
  let pushEnvoye = false, pushErreur: string | null = null;
  const modelePush = await resoudreModele(supabase, ecole_id, type, "push");
  if (!modelePush) {
    pushErreur = "aucun_modele_actif";
  } else if (!etudiant.auth_id) {
    pushErreur = "no_auth_id";
  } else {
    const { data: tokens } = await supabase
      .from("push_tokens").select("token").eq("utilisateur_id", etudiant.auth_id).eq("actif", true);
    if (!tokens?.length) {
      pushErreur = "no_token";
    } else {
      const titre = substituerVariables(modelePush.sujet ?? "EduLink Sup", varsCompletes);
      const corps = substituerVariables(modelePush.corps ?? "", varsCompletes);
      try {
        const accessToken = await getFcmAccessToken();
        const resultats = await Promise.allSettled(
          tokens.map(t => sendFCM(t.token, titre, corps, accessToken))
        );
        pushEnvoye = resultats.some(r => r.status === "fulfilled" && (r.value as any)?.name);
        if (!pushEnvoye) pushErreur = "fcm_echec_tous_tokens";
      } catch (e) {
        pushErreur = e instanceof Error ? e.message : String(e);
      }
    }
  }
  await journaliserEnvoi(supabase, {
    ecole_id, canal: "push", type, destinataire_id: etudiant_id,
    destinataire_nom: varsCompletes.etudiant, destinataire_contact: null,
    sujet: modelePush?.sujet ? substituerVariables(modelePush.sujet, varsCompletes) : null,
    statut: pushEnvoye ? "envoye" : "echec", erreur: pushEnvoye ? null : pushErreur,
  });

  return Response.json({ success: true, sms_envoye: smsEnvoye, sms_erreur: smsErreur, push_envoye: pushEnvoye, push_erreur: pushErreur }, { headers: CORS_HEADERS });
});
