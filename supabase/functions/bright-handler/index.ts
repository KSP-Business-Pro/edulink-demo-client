// supabase/functions/bright-handler/index.ts
//
// Edge Function : gestion des OTP + échange de token sécurisé
//
// VERSION 7 (2026-05-19) — SEC-02 : suppression du matricule comme password Auth
// Correctif v7 :
//   - passwordAuth n'est plus le matricule (visible publiquement sur bulletins/cartes).
//   - À la création : password aléatoire 32 bytes (hex 64 chars), jamais exposé.
//   - Pour les comptes existants (password = matricule) : rotation automatique
//     lors du prochain exchange réussi via admin.updateUserById().
//   - Stockage : colonne auth_password_set (bool) sur etudiants pour savoir
//     si la rotation a déjà été faite.
//   - Le matricule ne quitte JAMAIS l'Edge Function (déjà garanti v4+).
//
// VERSION 6 (2026-05-18) — Fix INSERT auth_tokens silencieux + query etudiants robuste aux doublons telephone_parent
// Correctif v6 :
//   - Si l'INSERT dans auth_tokens échoue, retourner une erreur explicite
//     au lieu de continuer avec un token fantôme (qui cause un 404 à l'exchange).
//   - Log détaillé de l'erreur INSERT pour faciliter le diagnostic futur.
//   - Query etudiants dans exchange : plusieurs étudiants peuvent partager le même
//     telephone_parent (fratrie dans écoles différentes). .maybeSingle() retournait
//     null dans ce cas. Correction : .order("created_at").limit(1) + traitement liste.
//
// VERSION 5 (2026-05-18) — Création Auth à la volée
// Problème résolu : depuis l'import Excel, les étudiants n'ont pas de compte
// auth.users associé. Conséquence : signInWithPassword échoue → portail
// retourne "Échec d'authentification".
//
// Correctif v5 :
//   - Lors de l'action "exchange", si signInWithPassword échoue parce que
//     le compte auth.users n'existe pas, on le CRÉE automatiquement avec
//     admin.createUser(), on lie l'auth_id dans la table etudiants, puis
//     on retente signInWithPassword.
//   - Le portail famille fonctionne maintenant immédiatement pour tout
//     étudiant créé via import Excel ou via UI individuelle.
//
// VERSION 4 (2026-05-14) — Sécurité password Auth
// Problème résolu : le matricule était utilisé comme password Supabase Auth,
// visible publiquement (cartes étudiantes, bulletins). Désormais :
//   1. OTP vérifié → bright-handler génère un auth_token aléatoire (32 bytes)
//   2. auth_token stocké dans public.auth_tokens (expire dans 5 min, usage unique)
//   3. Portail appelle action "exchange" avec auth_token
//   4. bright-handler vérifie token, récupère email+matricule, signe en Auth Supabase
//   5. Retourne access_token+refresh_token au portail
//   6. Le matricule ne quitte JAMAIS l'Edge Function
//
//   ⚠ Note v5 : le matricule reste utilisé comme password Auth en interne.
//     C'est une dette technique acceptée (cf SEC-02 dans le suivi v5).
//     À refactorer post-pub avec migration coordonnée des écoles en prod.
//
// Actions supportées :
//   POST { action: "send",     telephone: "+229..." }
//     → génère OTP, envoie SMS Twilio
//   POST { action: "verify",   telephone: "+229...", code: "123456" }
//     → vérifie OTP, génère auth_token, retourne { success, auth_token }
//   POST { action: "exchange", auth_token: "xxx..." }
//     → échange auth_token contre session Supabase Auth
//     → crée le compte auth.users à la volée si nécessaire (v5)
//     → retourne { access_token, refresh_token, expires_in }
//
// Secrets requis :
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injectés auto par Supabase)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ── CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Configuration
const MODE_DEMO = Deno.env.get("MODE_DEMO_OVERRIDE") === "true";
const OTP_DEMO = "123456";
const OTP_VALIDITE_MINUTES = 10;
const OTP_MAX_TENTATIVES = 5;
const AUTH_TOKEN_VALIDITE_MINUTES = 5;

// ── Rate limiting OTP — persisté en base (survit aux cold starts / instances multiples)
const RATE_LIMIT_PER_PHONE = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

async function checkRateLimit(
  supabase: any, phone: string
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("telephone", phone)
    .gte("created_at", windowStart);
  if (error) {
    console.error("[bright-handler] checkRateLimit error:", error.message);
    return { allowed: true, remaining: RATE_LIMIT_PER_PHONE }; // fail-open : ne bloque pas un usage légitime en cas de bug du check lui-même
  }
  const used = count ?? 0;
  return { allowed: used < RATE_LIMIT_PER_PHONE, remaining: Math.max(0, RATE_LIMIT_PER_PHONE - used) };
}

function normaliserTelephone(tel: string): string {
  if (!tel) return "";
  return tel.replace(/[\s\-().]/g, "").trim();
}

function genererOTP(): string {
  if (MODE_DEMO) return OTP_DEMO;
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Génère un token aléatoire 32 bytes hex (64 chars)
function genererAuthToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ═══════════════════════════════════════════════════════
//  ENVOI SMS VIA TWILIO
// ═══════════════════════════════════════════════════════
async function envoiSMS(
  telephone: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  if (MODE_DEMO) {
    console.log(`[bright-handler] 📱 SMS DÉMO → ${telephone} : ${code}`);
    return { ok: true };
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: "Configuration Twilio manquante" };
  }

  const recipient = telephone.startsWith("+") ? telephone : `+${telephone}`;
  const content =
    `EduLink : votre code de connexion est ${code}. ` +
    `Valable ${OTP_VALIDITE_MINUTES} min. Ne le partagez pas.`;

  const formBody = new URLSearchParams({
    From: fromNumber, To: recipient, Body: content,
  }).toString();

  const basicAuth = btoa(`${accountSid}:${authToken}`);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });
    const data = await resp.json();

    if (!resp.ok) {
      console.error(`[bright-handler] Twilio ${resp.status} code=${data.code}:`, data.message);
      if (resp.status === 401)       return { ok: false, error: "Identifiants Twilio invalides" };
      if (data.code === 21211)       return { ok: false, error: "Numéro destinataire invalide" };
      if (data.code === 21408 || data.code === 21610) return { ok: false, error: "Numéro non autorisé" };
      return { ok: false, error: `Erreur Twilio ${data.code || resp.status}: ${data.message}` };
    }

    console.log(`[bright-handler] ✅ SMS Twilio sid=${data.sid} status=${data.status}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur réseau Twilio" };
  }
}

// ═══════════════════════════════════════════════════════
//  V5 : CRÉATION AUTH À LA VOLÉE (helper)
// ═══════════════════════════════════════════════════════
//
// Tente de connecter un étudiant via signInWithPassword.
// Si le compte n'existe pas (ou si auth_id est null en base), crée le
// compte auth.users automatiquement et lie l'auth_id dans la table etudiants.
//
// Retourne { session, user } en cas de succès, ou { error } en cas d'échec.
async function signInOuCreerEtudiant(
  supabase: any,
  etudiant: { id: string; matricule: string; email_auth: string | null; auth_id: string | null },
  emailAuth: string,
  passwordAuth: string,
): Promise<{ session?: any; user?: any; error?: string; mode?: string }> {

  // ── Tentative 1 : signInWithPassword direct (compte existe déjà)
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email: emailAuth, password: passwordAuth });

  if (!signInError && signInData?.session) {
    console.log(`[bright-handler v5] ✅ Sign-in direct OK pour ${emailAuth}`);
    return { session: signInData.session, user: signInData.user, mode: "existing" };
  }

  // Si l'erreur n'est pas "Invalid login credentials", on remonte
  const errMsg = String(signInError?.message || "").toLowerCase();
  const isCredsError = errMsg.includes("invalid") || errMsg.includes("credentials");
  if (signInError && !isCredsError) {
    console.error(`[bright-handler v5] Erreur signIn non-creds:`, signInError);
    return { error: signInError.message };
  }

  // ── Tentative 2 : créer le compte auth.users à la volée
  console.log(`[bright-handler v5] 🆕 Création compte Auth pour ${emailAuth}`);
  const { data: createData, error: createError } =
    await supabase.auth.admin.createUser({
      email: emailAuth,
      password: passwordAuth,
      email_confirm: true,  // pas besoin de confirmation email pour les comptes étudiants
      user_metadata: {
        matricule: etudiant.matricule,
        source: "bright-handler-v5-auto-create",
        created_at: new Date().toISOString(),
      },
    });

  // Cas où le compte existe déjà dans auth.users mais pas lié dans etudiants
  // (compte orphelin créé manuellement ou par une migration précédente)
  if (createError && String(createError.message || "").toLowerCase().includes("already")) {
    console.log(`[bright-handler v5] ⚠ Compte ${emailAuth} déjà dans auth.users mais non lié`);
    // Re-tenter signInWithPassword (au cas où le password était bon mais le compte
    // existant a un autre password, on échouera de manière propre ci-dessous)
    const { data: retryData, error: retryError } =
      await supabase.auth.signInWithPassword({ email: emailAuth, password: passwordAuth });
    if (retryError || !retryData?.session) {
      console.error(`[bright-handler v5] Compte orphelin avec password différent`);
      return { error: "Compte existant non synchronisable. Contactez l'administrateur." };
    }
    // Lier l'auth_id dans etudiants
    await supabase.from("etudiants")
      .update({ auth_id: retryData.user!.id, email_auth: emailAuth })
      .eq("id", etudiant.id);
    return { session: retryData.session, user: retryData.user, mode: "orphan-linked" };
  }

  if (createError || !createData?.user) {
    console.error(`[bright-handler v5] Échec createUser:`, createError);
    return { error: createError?.message || "Échec création compte Auth" };
  }

  // Lier l'auth_id dans la table etudiants
  const { error: linkError } = await supabase.from("etudiants")
    .update({ auth_id: createData.user.id, email_auth: emailAuth })
    .eq("id", etudiant.id);

  if (linkError) {
    console.error(`[bright-handler v5] Échec liaison auth_id:`, linkError);
    // Le compte Auth existe maintenant mais n'est pas lié. On continue quand même —
    // la connexion fonctionnera, et un prochain exchange pourra lier proprement.
  }

  // Maintenant signInWithPassword devrait fonctionner
  const { data: finalSignIn, error: finalError } =
    await supabase.auth.signInWithPassword({ email: emailAuth, password: passwordAuth });

  if (finalError || !finalSignIn?.session) {
    console.error(`[bright-handler v5] Échec signIn après création:`, finalError);
    return { error: "Échec authentification après création" };
  }

  console.log(`[bright-handler v5] ✅ Création + sign-in OK pour ${emailAuth}`);
  return { session: finalSignIn.session, user: finalSignIn.user, mode: "auto-created" };
}
// ═══════════════════════════════════════════════════════
// SEC-02 / v7 : Connexion sécurisée sans matricule comme password
// ───────────────────────────────────────────────────────
// Stratégie :
//   1. Compte inexistant → createUser(securePassword aléatoire)
//   2. Compte existant (auth_password_set=true) → admin.updateUserById + signIn
//      (on régénère le password à chaque exchange : ephémère, jamais stocké)
//   3. Compte existant (auth_password_set=false) → signIn(matricule) pour confirmer,
//      puis rotation vers securePassword + auth_password_set=true en base
// ═══════════════════════════════════════════════════════
async function signInOuCreerEtudiantV7(
  supabase: any,
  etudiant: { id: string; matricule: string; email_auth: string | null; auth_id: string | null; auth_password_set?: boolean },
  emailAuth: string,
  securePassword: string,
  matricule: string,
): Promise<{ session?: any; user?: any; error?: string; mode?: string }> {

  const passwordSetEnBase = etudiant.auth_password_set === true;

  // ── Cas A : compte inexistant (auth_id null) ──
  if (!etudiant.auth_id) {
    console.log(`[v7] Nouveau compte securise pour ${emailAuth}`);
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: emailAuth,
      password: securePassword,
      email_confirm: true,
      user_metadata: { matricule, source: "bright-handler-v7", created_at: new Date().toISOString() },
    });
    if (createError) {
      if (String(createError.message || "").toLowerCase().includes("already")) {
        // Compte orphelin : reset via admin
        const { data: ul } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = ul?.users?.find((u: any) => u.email === emailAuth);
        if (existing) {
          await supabase.auth.admin.updateUserById(existing.id, { password: securePassword });
          await supabase.from("etudiants").update({ auth_id: existing.id, email_auth: emailAuth, auth_password_set: true }).eq("id", etudiant.id);
          const { data: si } = await supabase.auth.signInWithPassword({ email: emailAuth, password: securePassword });
          if (si?.session) return { session: si.session, user: si.user, mode: "orphan-reset-v7" };
        }
        return { error: "Compte existant non recuperable." };
      }
      return { error: createError.message || "Echec creation compte" };
    }
    await supabase.from("etudiants")
      .update({ auth_id: createData.user.id, email_auth: emailAuth, auth_password_set: true })
      .eq("id", etudiant.id);
    const { data: si } = await supabase.auth.signInWithPassword({ email: emailAuth, password: securePassword });
    if (!si?.session) return { error: "Echec sign-in apres creation" };
    return { session: si.session, user: si.user, mode: "created-v7" };
  }

  // ── Cas B : compte existe, password securise (auth_password_set = true) ──
  // On met a jour le password avec le securePassword ephemere de cet exchange
  if (passwordSetEnBase) {
    const { error: updErr } = await supabase.auth.admin.updateUserById(etudiant.auth_id, { password: securePassword });
    if (updErr) {
      console.error(`[v7-DEBUG] updateUserById échoué pour auth_id=${etudiant.auth_id}:`, updErr.message, updErr.status, JSON.stringify(updErr));
      return { error: "Erreur rotation password." };
    }
    const { data: si, error: siErr } = await supabase.auth.signInWithPassword({ email: emailAuth, password: securePassword });
    if (siErr || !si?.session) return { error: "Echec authentification." };
    return { session: si.session, user: si.user, mode: "secure-v7" };
  }

  // ── Cas C : ancien compte (password = matricule) — rotation automatique ──
  console.log(`[v7] Rotation password matricule->securise pour ${emailAuth}`);
  const { data: siOld } = await supabase.auth.signInWithPassword({ email: emailAuth, password: matricule });
  if (!siOld?.session) {
    // Matricule invalide : reset force
    await supabase.auth.admin.updateUserById(etudiant.auth_id, { password: securePassword });
    await supabase.from("etudiants").update({ auth_password_set: true }).eq("id", etudiant.id);
    const { data: siNew } = await supabase.auth.signInWithPassword({ email: emailAuth, password: securePassword });
    if (!siNew?.session) return { error: "Echec apres reset force." };
    return { session: siNew.session, user: siNew.user, mode: "forced-reset-v7" };
  }
  // Rotation : passer au password securise
  await supabase.auth.admin.updateUserById(etudiant.auth_id, { password: securePassword });
  await supabase.from("etudiants").update({ auth_password_set: true }).eq("id", etudiant.id);
  console.log(`[v7] Rotation OK pour ${emailAuth}`);
  return { session: siOld.session, user: siOld.user, mode: "rotated-v7" };
}



// ═══════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body   = await req.json();
    const action = body.action;

    // ─────────────────────────────────────────────────
    // ACTION : send
    // ─────────────────────────────────────────────────
    if (action === "send") {
      const telephone = normaliserTelephone(body.telephone || "");
      if (!telephone || telephone.length < 6) {
        return new Response(
          JSON.stringify({ error: "Numéro de téléphone invalide" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const rl = await checkRateLimit(supabase, telephone);
      if (!rl.allowed) {
        return new Response(
          JSON.stringify({ error: "Trop de demandes. Réessayez dans une heure." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const code     = genererOTP();
      const expireAt = new Date(Date.now() + OTP_VALIDITE_MINUTES * 60_000).toISOString();

      // Invalider anciens codes non utilisés
      await supabase.from("otp_codes").update({ valide: true, used_at: new Date().toISOString() })
        .eq("telephone", telephone).eq("valide", false);

      const { error: insertError } = await supabase.from("otp_codes").insert({
        telephone, code, expire_at: expireAt, tentatives: 0, valide: false,
      });

      if (insertError) {
        return new Response(
          JSON.stringify({ error: "Erreur stockage OTP : " + insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const smsResult = await envoiSMS(telephone, code);
      if (!smsResult.ok) {
        return new Response(
          JSON.stringify({ error: smsResult.error || "Erreur envoi SMS" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: MODE_DEMO ? "OTP envoyé (mode démo)" : "Code envoyé par SMS",
          mode: MODE_DEMO ? "demo" : "production",
          rateLimitRemaining: rl.remaining,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─────────────────────────────────────────────────
    // ACTION : verify
    // ─────────────────────────────────────────────────
    if (action === "verify") {
      const telephone = normaliserTelephone(body.telephone || "");
      const code      = String(body.code || "").trim();

      if (!code || !/^\d{4,8}$/.test(code)) {
        return new Response(
          JSON.stringify({ error: "Code OTP invalide" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: otp, error: selectError } = await supabase
        .from("otp_codes")
        .select("*")
        .eq("telephone", telephone)
        .eq("valide", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectError) {
        return new Response(
          JSON.stringify({ error: "Erreur serveur" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!otp) {
        return new Response(
          JSON.stringify({ error: "Aucun code en attente. Demandez un nouveau code." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (new Date(otp.expire_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "Code expiré. Demandez un nouveau code." }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (otp.tentatives >= OTP_MAX_TENTATIVES) {
        return new Response(
          JSON.stringify({ error: "Trop de tentatives. Demandez un nouveau code." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const codeAttendu = MODE_DEMO ? OTP_DEMO : otp.code;
      if (code !== codeAttendu) {
        await supabase.from("otp_codes").update({ tentatives: otp.tentatives + 1 }).eq("id", otp.id);
        return new Response(
          JSON.stringify({
            error: `Code incorrect. ${OTP_MAX_TENTATIVES - otp.tentatives - 1} tentative(s) restante(s).`,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // OTP valide → marquer consommé
      await supabase.from("otp_codes")
        .update({ valide: true, used_at: new Date().toISOString() })
        .eq("id", otp.id);

      // ── Générer auth_token temporaire
      const authToken = genererAuthToken();
      const authExpireAt = new Date(
        Date.now() + AUTH_TOKEN_VALIDITE_MINUTES * 60_000
      ).toISOString();

      await supabase.from("auth_tokens")
        .update({ consomme: true, consomme_at: new Date().toISOString() })
        .eq("telephone", telephone)
        .eq("consomme", false);

      // v6 : INSERT avec vérification stricte — ne pas retourner le token si l'INSERT échoue
      const { data: insertedToken, error: tokenError } = await supabase
        .from("auth_tokens")
        .insert({
          telephone,
          token: authToken,
          expire_at: authExpireAt,
          consomme: false,
        })
        .select("id")
        .single();

      if (tokenError || !insertedToken) {
        console.error("[bright-handler v6] Erreur INSERT auth_token:", tokenError?.message, tokenError?.code, tokenError?.details);
        return new Response(
          JSON.stringify({ error: "Erreur création token d'authentification. Réessayez." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(`[bright-handler v6] ✅ OTP validé + auth_token inséré (id=${insertedToken.id}) pour ${telephone}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Code vérifié",
          auth_token: authToken,
          expires_in: AUTH_TOKEN_VALIDITE_MINUTES * 60,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─────────────────────────────────────────────────
    // ACTION : exchange (v5 : crée le compte Auth à la volée si manquant)
    // Échange l'auth_token contre une session Supabase Auth
    // ─────────────────────────────────────────────────
    if (action === "exchange") {
      const authToken = String(body.auth_token || "").trim();

      if (!authToken || authToken.length !== 64) {
        return new Response(
          JSON.stringify({ error: "Token d'authentification invalide" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: tokenRow, error: tokenSelectError } = await supabase
        .from("auth_tokens")
        .select("*")
        .eq("token", authToken)
        .eq("consomme", false)
        .maybeSingle();

      if (tokenSelectError) {
        return new Response(
          JSON.stringify({ error: "Erreur serveur" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!tokenRow) {
        return new Response(
          JSON.stringify({ error: "Token invalide ou déjà utilisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (new Date(tokenRow.expire_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "Token expiré. Recommencez la connexion." }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Récupérer étudiant via téléphone parent
      // v5 : on récupère plus de champs (id, auth_id, email_auth) pour pouvoir
      // créer/lier le compte Auth si nécessaire
      const telephone = tokenRow.telephone;
      // v6 : plusieurs étudiants peuvent partager le même telephone_parent
      // (fratrie dans des écoles différentes). On prend le plus récent non-demo
      // ayant un auth_id valide en priorité, sinon le premier par created_at.
      const { data: etudiantsList, error: etudiantError } = await supabase
        .from("etudiants")
        .select("id, matricule, email_parent, email_auth, auth_id, ecole_id, auth_password_set")
        .eq("telephone_parent", telephone)
        .eq("is_demo", false)
        .order("created_at", { ascending: false });

      if (etudiantError || !etudiantsList || etudiantsList.length === 0) {
        console.error("[bright-handler v6] Étudiant non trouvé pour", telephone, etudiantError?.message);
        return new Response(
          JSON.stringify({ error: "Étudiant non trouvé pour ce numéro." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Préférer l'étudiant qui a déjà un auth_id lié (compte déjà créé)
      const etudiant = etudiantsList.find(e => e.auth_id) || etudiantsList[0];
      console.log(`[bright-handler v6] Étudiant sélectionné: ${etudiant.matricule} parmi ${etudiantsList.length} résultat(s)`);

      // Construire email Auth (même logique que le portail actuel)
      const matricule = etudiant.matricule;
      const emailAuth = `${matricule.toLowerCase().replace(/[^a-z0-9]/g, "-")}@portail.edulink.bj`;

      // SEC-02 (v7) : NE PLUS utiliser le matricule comme password.
      // On génère un password aléatoire fort côté serveur — jamais exposé côté client.
      // Pour les comptes existants (password = matricule), on effectue une rotation
      // automatique lors du premier exchange réussi.
      const securePassword = (() => {
        const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const lower = "abcdefghijkmnpqrstuvwxyz";
        const digits = "23456789";
        const special = "!@#$%^&*()_+-=";
        const all = upper + lower + digits + special;
        const rand = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
        // Garantit au moins un caractère de chaque catégorie exigée par la policy Supabase
        let pwd = rand(upper) + rand(lower) + rand(digits) + rand(special);
        for (let i = 0; i < 28; i++) pwd += rand(all);
        // Mélange pour ne pas avoir un pattern prévisible en tête
        return pwd.split("").sort(() => crypto.getRandomValues(new Uint8Array(1))[0] - 128).join("");
      })();

      // ── v5/v7 : sign-in OU création à la volée
      const result = await signInOuCreerEtudiantV7(
        supabase,
        etudiant,
        emailAuth,
        securePassword,
        matricule,
      );

      if (result.error || !result.session) {
        console.error("[bright-handler v5] Échec final exchange:", result.error);
        return new Response(
          JSON.stringify({ error: "Échec d'authentification. Contactez l'administrateur." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Marquer auth_token comme consommé (usage unique)
      await supabase.from("auth_tokens")
        .update({ consomme: true, consomme_at: new Date().toISOString() })
        .eq("id", tokenRow.id);

      console.log(
        `[bright-handler v5] ✅ Exchange réussi pour ${telephone} → ${emailAuth} (mode=${result.mode})`
      );

      return new Response(
        JSON.stringify({
          success: true,
          access_token:  result.session.access_token,
          refresh_token: result.session.refresh_token,
          expires_in:    result.session.expires_in,
          user: {
            id:    result.user?.id,
            email: result.user?.email,
          },
          mode: result.mode,  // v5 : informe le portail si on a auto-créé
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Action inconnue. Utilisez 'send', 'verify' ou 'exchange'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[bright-handler] Exception", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
