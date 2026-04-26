// Edge Function Supabase — send-push-notification
// Envoie des notifications Push FCM V1 via OAuth2 (compte de service)
// Déployée sur : supabase/functions/send-push-notification/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FIREBASE_PROJECT_ID = "edulink-demo-client";
const SERVICE_ACCOUNT = {
  client_email: "firebase-adminsdk-fbsvc@edulink-demo-client.iam.gserviceaccount.com",
  private_key_id: "2b153a5f40fed6f22e44cb644662383f939208aa",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQClb1YHjFb2Cu+R\nSwPRUcr7e6+QrbyBkFl7IcGO0lw0YgAJHKEL9fA+xh/uAXdQ+OzIeecg/4jcyoxC\nuYYIBcSN/7AlGuuG2hheHHWgT8Vl8QeDnkQq5Ko6jrUN5tQ3j3r9FLgIp3YkWIZm\nLhOerEc8r4qZ1EcJoPubLq3kdhYarmL9GjCgMLntnze6tTDD8tvSfqD9jv+Ro48T\nxiYWJI79kx9CK4hYicbcF7liHYZNLQe6GTXEu0Ir53Sqv5+mU52kJImZoQ7erwog\nun54PrYvuV0Y8FXrP6lCB6jWHUXQPVS+QbXFhkaf7GMidN7qDOXAon5EwXoxALGY\nAzNVYTCJAgMBAAECggEABJ6VQmSy0PABPIdhteiYyGjtwBZ52wxS01Nf+kL5fCT4\nZ0i7XoAhkz8pCRZVZJdu1TJCN/OquK+XNw3DJloy4Nww6PhVd1CDua0Fw9I2auBO\nG2jB8oisEDKH77lwV5TUFFkNwoAalm06Y4QJ3DZnTtSABEefLC+olu64wFZjy57j\nd/mlTrA7vJgkIWxmi6GxrHiuOyo54gYCBNAD7ad0h2AifyEoMvBADcAvhyeqIwVZ\nSH++z2lZLFUccIyWHnG1sbPB000fSSksrBkoRVuhDOmqX0z0DhJ1YsJS1F8iCVik\nJyICvpvXkTNOKUhL35PQnIacZlMxfOdlBUplNStj+QKBgQDWg6hVuXQHrhvC0BFP\nv/VWmsG5JO1FObRzZoMKPjAIkYFg8zF/1Dro6jnx9TjcC9hs8ps0hnY19NEbdJ1n\npXjmfKv+wsahU7D2JeGebMsRcxDLsKLt82u/UCZ4NkoAeWeS+SX0RkGmbuRgKvWl\nxx0qoEX1ILGHuckidYkuSWZwLwKBgQDFbdFcZLP2rcO0fOQ7qQchUAeCTqKzUGUr\ngnNoRSf6sev9pFvFWx4L1C0O3KOTN5wvpO9puDt0DwnuGkqxkGf8V6uHVXYvHLG4\nl9QRNtTzR5wT7iHZshcjITQQEop4eN+ejJHXO8I5Fgzbb3WMh2vtcHzcYoKvBld2\n+kUSQeTExwKBgCPMevY7adKySq27PXhap53ZW8UDFZm85JFxpSK7eBal+bptO3CC\nwYYHOL5ZVzDZxTeBUUd1vRqKDa+QSYh3g/KrEaUFalKX/etGLR3cOBNkaYQkqTwe\nqHeX76OWI8lqeU98xsm6Q9B7px8pbC9LSGHJt4MN/rKQ3bEjfk48L50/AoGAc77c\nXUSU1WwuLmSCEhAYpAkdPeIINQRPK+EA9AKHW8xvxHZVbzDqPpkYCXyFUcvqf2w9\nCEgAYxxl//feDpfQvvpPD7qk3R3/e29X3ve8hRxYfr6/jbeBJRFUSo/0KokC4Rsc\nbYkVZw5sX0HLMqY6OiwWp8YBQ8d+A7zaPcfv7QUCgYEAivKAUA6T55LAtyXbndOm\nFNbpWiNBrxfpJUdgWR51BIEdqenrxwrSLJHXs2k3xZwEsb/zLRSCgXysPKP8OBMD\nNi4E5dB62CdLR461pYvza2Mr2CUMYqTGUjtPS5CSt3STInnmUMyIOg8QF9NLgs7z\nedaXNvdHN+/AndIL8ok9mxs=\n-----END PRIVATE KEY-----\n",
};

// ── Générer un JWT signé pour OAuth2 Google ──────────────────────────────
async function getAccessToken(): Promise<string> {
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

  // Importer la clé privée RSA
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

  // Signer
  const sigBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(sigInput)
  );
  const sig64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${sigInput}.${sig64}`;

  // Échanger le JWT contre un access token
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Token OAuth2 non obtenu: " + JSON.stringify(data));
  return data.access_token;
}

// ── Envoyer un message FCM V1 vers un token ──────────────────────────────
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

// ── Handler principal ────────────────────────────────────────────────────
serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const { tokens, titre, body, url } = await req.json();
    if (!tokens?.length || !titre || !body) {
      return new Response(JSON.stringify({ error: "tokens, titre et body requis" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Obtenir le token OAuth2
    const accessToken = await getAccessToken();

    // Envoyer à tous les tokens en parallèle (max 50 simultanés)
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

    return new Response(
      JSON.stringify({ succes, echecs, total: tokens.length }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});

