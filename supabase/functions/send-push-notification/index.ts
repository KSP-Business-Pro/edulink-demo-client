// Edge Function Supabase — send-push-notification
// Envoie des notifications Push FCM V1 via OAuth2 (compte de service)
// B9 — clé privée déplacée en secrets + RBAC ajouté (2026-07)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const FIREBASE_PROJECT_ID = "edulink-demo-client";
const ROLES_AUTORISES = ["admin", "directeur", "scolarite"];

function getServiceAccount() {
  const client_email = Deno.env.get("FIREBASE_CLIENT_EMAIL");
  const private_key_id = Deno.env.get("FIREBASE_PRIVATE_KEY_ID");
  const private_key = Deno.env.get("FIREBASE_PRIVATE_KEY");
  if (!client_email || !private_key_id || !private_key) {
    throw new Error("Configuration Firebase manquante côté serveur.");
  }
  return { client_email, private_key_id, private_key };
}

async function getAccessToken(): Promise<string> {
  const SERVICE_ACCOUNT = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
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
    "pkcs8", keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(sigInput)
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

async function sendFCM(token: string, titre: string, body: string, url: string, accessToken: string) {
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: titre, body },
          webpush: {
            notification: {
              title: titre,
              body,
              icon: "https://edulink-demo-client.vercel.app/icon-192.png",
              badge: "https://edulink-demo-client.vercel.app/icon-72.png",
              requireInteraction: false,
            },
            fcm_options: { link: url || "https://edulink-demo-client.vercel.app/edulink-portail.html" },
          },
        },
      }),
    }
  );
  return resp.json();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
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
    if (authError || !user) return json({ error: "Token invalide" }, 401);

    const { data: profil, error: errProfil } = await supabase
      .from("utilisateurs")
      .select("role, actif")
      .eq("auth_id", user.id)
      .eq("actif", true)
      .maybeSingle();

    if (errProfil || !profil) return json({ error: "Forbidden", detail: "profil_introuvable" }, 403);
    if (!ROLES_AUTORISES.includes(profil.role)) {
      return json({ error: "Forbidden", detail: "role_non_autorise" }, 403);
    }

    const { tokens, titre, body, url } = await req.json();
    if (!tokens?.length || !titre || !body) {
      return json({ error: "tokens, titre et body requis" }, 400);
    }

    const accessToken = await getAccessToken();

    let succes = 0, echecs = 0;
    const batchSize = 50;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((t: string) => sendFCM(t, titre, body, url, accessToken))
      );
      results.forEach(r => {
        if (r.status === "fulfilled" && r.value?.name) succes++;
        else echecs++;
      });
    }

    return json({ succes, echecs, total: tokens.length });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});