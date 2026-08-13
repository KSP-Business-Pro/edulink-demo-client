// supabase/functions/auth-mfa-recovery/index.ts
// EduLink Sup — Récupération 2FA TOTP par code de secours (téléphone perdu)
//
// Appelée par le front depuis l'écran "Vérification en deux étapes", APRÈS un
// login mot de passe réussi (l'utilisateur possède donc une session aal1).
// Flux : identifie l'utilisateur via son access_token -> consomme un code de
// secours (fn_consommer_code_secours, limitation 5 essais / 15 min en SQL) ->
// supprime le(s) facteur(s) TOTP via l'Admin API -> purge les codes restants.
// L'utilisateur termine alors sa connexion par l'OTP email et peut ré-enrôler.
//
// Le portier Supabase exige apikey + Authorization: Bearer <anon> (même pattern
// que auth-login) ; l'access_token de session est passé dans le corps.

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

  let corps: { access_token?: string; code?: string };
  try {
    corps = await req.json();
  } catch {
    return reponse(400, { error: "json_invalide" });
  }

  const accessToken = (corps.access_token ?? "").trim();
  const code = (corps.code ?? "").trim();
  if (!accessToken || !code) {
    return reponse(400, { error: "parametres_manquants" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("auth-mfa-recovery: variables d'environnement manquantes");
    return reponse(500, { error: "erreur_interne" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Identifier l'utilisateur à partir de sa session (mot de passe déjà validé)
  const { data: userData, error: userError } = await admin.auth.getUser(
    accessToken,
  );
  if (userError || !userData?.user) {
    return reponse(401, { error: "session_invalide" });
  }
  const userId = userData.user.id;

  // 2. Vérifier et consommer le code de secours (limitation d'essais côté SQL)
  const { data: resultat, error: rpcError } = await admin.rpc(
    "fn_consommer_code_secours",
    { p_utilisateur_id: userId, p_code: code },
  );
  if (rpcError) {
    console.error("fn_consommer_code_secours:", rpcError.message);
    return reponse(500, { error: "erreur_interne" });
  }

  if (!resultat?.ok) {
    if (resultat?.motif === "bloque") {
      return reponse(429, {
        error: "bloque",
        reessayer_dans_s: resultat.reessayer_dans_s ?? 900,
      });
    }
    return reponse(400, {
      error: "code_invalide",
      essais_restants: resultat?.essais_restants ?? 0,
    });
  }

  // 3. Code valide : supprimer le(s) facteur(s) TOTP via l'Admin API.
  //    (Le unenroll self-service exige une session aal2, impossible sans le
  //    téléphone — d'où le passage par l'Admin API côté service_role.)
  const { data: facteurs, error: listError } = await admin.auth.admin.mfa
    .listFactors({ userId });
  if (listError) {
    console.error("listFactors:", listError.message);
    // Le code est déjà consommé mais le facteur subsiste : l'utilisateur
    // peut réessayer avec un autre code (il lui en reste 9).
    return reponse(500, { error: "erreur_interne" });
  }

  for (const facteur of facteurs?.factors ?? []) {
    if (facteur.factor_type === "totp") {
      const { error: delError } = await admin.auth.admin.mfa.deleteFactor({
        id: facteur.id,
        userId,
      });
      if (delError) {
        console.error("deleteFactor:", delError.message);
        return reponse(500, { error: "erreur_interne" });
      }
    }
  }

  // 4. Purger les codes de secours restants (liés à l'enrôlement supprimé).
  //    Best effort : un échec ici n'empêche pas la récupération.
  const { error: purgeError } = await admin
    .from("codes_secours_mfa")
    .delete()
    .eq("utilisateur_id", userId);
  if (purgeError) {
    console.error("purge codes_secours_mfa:", purgeError.message);
  }

  return reponse(200, { ok: true, message: "totp_desactive" });
});