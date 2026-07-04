// supabase/functions/verify-otp/index.ts
//
// Edge Function : vérification du code OTP de second facteur (B12.1).
// POST { code: "123456" }
//   → vérifie le dernier code non expiré/non vérifié pour l'utilisateur,
//     incrémente les tentatives en cas d'échec, journalise dans audit_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TENTATIVES = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
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

    const { data: profil } = await supabase
      .from("utilisateurs").select("role, ecole_id").eq("auth_id", user.id).eq("actif", true).maybeSingle();

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    if (!/^\d{6}$/.test(code)) return json({ error: "Code invalide (6 chiffres attendus)" }, 400);

    // ── Récupérer le dernier OTP non vérifié
    const { data: otp, error: selectErr } = await supabase
      .from("staff_otp_verifications")
      .select("*")
      .eq("user_id", user.id)
      .is("verified_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectErr) return json({ error: "Erreur serveur" }, 500);
    if (!otp) return json({ error: "Aucun code en attente. Demandez un nouveau code." }, 400);

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return json({ error: "Code expiré. Demandez un nouveau code." }, 400);
    }
    if (otp.attempts >= MAX_TENTATIVES) {
      return json({ error: "Trop de tentatives échouées. Demandez un nouveau code." }, 429);
    }

    const codeHash = await hashCode(code);
    const isValid = codeHash === otp.code_hash;

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    if (!isValid) {
      await supabase.from("staff_otp_verifications").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      await userClient.rpc("fn_audit_log", {
        p_ecole_id: profil?.ecole_id, p_action: "OTP_ECHEC", p_module: "auth_2fa",
        p_ressource_ref: `Tentative ${otp.attempts + 1}/${MAX_TENTATIVES}`,
      });
      const restantes = MAX_TENTATIVES - (otp.attempts + 1);
      return json({ error: `Code incorrect${restantes > 0 ? ` (${restantes} tentative${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''})` : ''}.` }, 400);
    }

    await supabase.from("staff_otp_verifications").update({ verified_at: new Date().toISOString() }).eq("id", otp.id);
    await userClient.rpc("fn_audit_log", {
      p_ecole_id: profil?.ecole_id, p_action: "OTP_VERIFIE", p_module: "auth_2fa",
      p_ressource_ref: `Canal: ${otp.channel}`,
    });

    return json({ success: true });
  } catch (err) {
    console.error("[verify-otp] Exception:", err);
    return json({ error: err instanceof Error ? err.message : "Erreur serveur" }, 500);
  }
});
