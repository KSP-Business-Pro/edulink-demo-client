// supabase/functions/admin-reset-mfa/index.ts
// EduLink Sup — Réinitialisation 2FA TOTP par un administrateur (back-office)
//
// Supprime le(s) facteur(s) TOTP d'un utilisateur via l'Admin API et purge ses
// codes de secours + son compteur de récupération. L'utilisateur retombe sur
// l'OTP email à sa prochaine connexion et peut ré-enrôler un nouveau téléphone.
//
// Autorisation : l'appelant doit être role='admin' actif ; s'il est rattaché à
// une école (ecole_id non null), la cible doit appartenir à la même école.
// Appel front : Authorization: Bearer <access_token de session> (même pattern
// que manage-user), corps { auth_id: "<uuid auth de la cible>" }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reponse(status: number, corps: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reponse(405, { error: "methode_non_autorisee" });
  }

  let corps: { auth_id?: string };
  try {
    corps = await req.json();
  } catch {
    return reponse(400, { error: "json_invalide" });
  }

  const targetAuthId = (corps.auth_id ?? "").trim();
  if (!targetAuthId) {
    return reponse(400, { error: "parametres_manquants" });
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return reponse(401, { error: "non_authentifie" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("admin-reset-mfa: variables d'environnement manquantes");
    return reponse(500, { error: "erreur_interne" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Identifier l'appelant et vérifier son rôle
  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return reponse(401, { error: "session_invalide" });
  }

  const { data: appelant } = await admin
    .from("utilisateurs")
    .select("role, ecole_id")
    .eq("auth_id", callerData.user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!appelant || appelant.role !== "admin") {
    return reponse(403, { error: "acces_refuse" });
  }

  // 2. Vérifier la cible et le périmètre école
  const { data: cible } = await admin
    .from("utilisateurs")
    .select("id, ecole_id, nom, prenom")
    .eq("auth_id", targetAuthId)
    .maybeSingle();

  if (!cible) {
    return reponse(404, { error: "utilisateur_introuvable" });
  }
  if (appelant.ecole_id && appelant.ecole_id !== cible.ecole_id) {
    return reponse(403, { error: "acces_refuse" });
  }

  // 3. Supprimer le(s) facteur(s) TOTP via l'Admin API
  const { data: facteurs, error: listError } = await admin.auth.admin.mfa
    .listFactors({ userId: targetAuthId });
  if (listError) {
    console.error("listFactors:", listError.message);
    return reponse(500, { error: "erreur_interne" });
  }

  let supprimes = 0;
  for (const facteur of facteurs?.factors ?? []) {
    if (facteur.factor_type === "totp") {
      const { error: delError } = await admin.auth.admin.mfa.deleteFactor({
        id: facteur.id,
        userId: targetAuthId,
      });
      if (delError) {
        console.error("deleteFactor:", delError.message);
        return reponse(500, { error: "erreur_interne" });
      }
      supprimes++;
    }
  }

  // 4. Purger codes de secours et compteur de récupération (best effort)
  const { error: purgeCodes } = await admin
    .from("codes_secours_mfa")
    .delete()
    .eq("utilisateur_id", targetAuthId);
  if (purgeCodes) console.error("purge codes_secours_mfa:", purgeCodes.message);

  const { error: purgeTentatives } = await admin
    .from("tentatives_recuperation_mfa")
    .delete()
    .eq("utilisateur_id", targetAuthId);
  if (purgeTentatives) console.error("purge tentatives_recuperation_mfa:", purgeTentatives.message);

  return reponse(200, { ok: true, facteurs_supprimes: supprimes });
});