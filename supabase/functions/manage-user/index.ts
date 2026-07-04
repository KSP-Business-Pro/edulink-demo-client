// supabase/functions/manage-user/index.ts
//
// Edge Function : gestion sécurisée des comptes Auth (création, reset mot
// de passe, suppression) pour le module Utilisateurs.
//
// Corrige un bug préexistant : le frontend appelait supabase.auth.admin.*
// directement avec la clé anon, ce qui échoue toujours ("User not allowed")
// car ces méthodes exigent la clé service_role — jamais exposable côté
// navigateur. Cette fonction centralise ces opérations côté serveur.
//
// Réservé au rôle 'admin' (super-admin réseau, seul à avoir
// gerer_utilisateurs=true dans la matrice de permissions).
//
// POST { action: 'create', email, password, nom, prenom, role, ecole_id, telephone }
// POST { action: 'reset_password', auth_id, password, utilisateur_id, nom, prenom }
// POST { action: 'delete', auth_id, utilisateur_id, nom, prenom, email, ecole_id }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// L'API GoTrue admin ne propose pas de recherche directe par email dans
// supabase-js — on pagine (perPage large, limite raisonnable de pages pour
// éviter un scan illimité sur une base qui grossirait beaucoup).
async function trouverUtilisateurAuthParEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ data: { id: string; email?: string } | null; error: string | null }> {
  const cible = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { data: null, error: error.message };
    const trouve = data.users.find(u => (u.email ?? "").toLowerCase() === cible);
    if (trouve) return { data: { id: trouve.id, email: trouve.email }, error: null };
    if (data.users.length < 200) break; // dernière page atteinte
  }
  return { data: null, error: "Introuvable" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentification requise" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !caller) return json({ error: "Token invalide" }, 401);

    // ── Autorisation : seul le rôle 'admin' (super-admin) gère les comptes
    const { data: callerProfil } = await admin
      .from("utilisateurs").select("role, actif").eq("auth_id", caller.id).eq("actif", true).maybeSingle();
    if (!callerProfil || callerProfil.role !== "admin") {
      return json({ error: "Action réservée aux super-administrateurs." }, 403);
    }

    // Client authentifié comme l'appelant, pour que fn_audit_log() résolve auth.uid() correctement
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ── CRÉATION ────────────────────────────────────────────────────────
    if (action === "create") {
      const { email, password, nom, prenom, role, ecole_id, telephone } = body;
      if (!email || !password || !nom || !role) {
        return json({ error: "Champs obligatoires manquants (email, mot de passe, nom, rôle)." }, 400);
      }

      let authUserId: string;
      const { data: authData, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });

      if (createErr) {
        // Cas fréquent : un compte Auth existe déjà pour cet email (ancien
        // test, compte orphelin sans profil applicatif...) — on le rattache
        // plutôt que d'échouer, et on aligne son mot de passe sur celui saisi.
        const dejaEnregistre = /already.*registered/i.test(createErr.message);
        if (!dejaEnregistre) {
          return json({ error: `Création du compte : ${createErr.message}` }, 400);
        }

        const { data: existant, error: findErr } = await trouverUtilisateurAuthParEmail(admin, email);
        if (findErr || !existant) {
          return json({ error: `Cet email est déjà utilisé, mais le compte associé est introuvable. Contactez le support Supabase.` }, 400);
        }

        // Vérifier qu'aucun profil applicatif n'est déjà lié à ce compte
        const { data: profilExistant } = await admin
          .from("utilisateurs").select("id").eq("auth_id", existant.id).maybeSingle();
        if (profilExistant) {
          return json({ error: "Un profil utilisateur existe déjà pour cet email." }, 409);
        }

        // Aligner le mot de passe sur celui saisi dans le formulaire
        const { error: pwErr } = await admin.auth.admin.updateUserById(existant.id, { password });
        if (pwErr) return json({ error: `Compte existant retrouvé, mais échec de la réinitialisation du mot de passe : ${pwErr.message}` }, 400);

        authUserId = existant.id;
      } else {
        authUserId = authData.user.id;
      }

      const { error: profilErr } = await admin.from("utilisateurs").insert({
        auth_id: authUserId, email, nom, prenom: prenom || null,
        role, ecole_id: ecole_id ?? null, telephone: telephone || null, actif: true,
      });
      if (profilErr) {
        // Rollback uniquement si le compte Auth vient d'être créé à l'instant
        // (on ne supprime jamais un compte préexistant rattaché)
        if (!createErr) await admin.auth.admin.deleteUser(authUserId);
        return json({ error: `Création du profil : ${profilErr.message}` }, 400);
      }

      await userClient.rpc("fn_audit_log", {
        p_ecole_id: ecole_id ?? null, p_action: "CREATE", p_module: "users",
        p_ressource_ref: `Utilisateur ${prenom ?? ''} ${nom} (${email})${createErr ? ' — compte Auth existant rattaché' : ''}`,
      });

      return json({ success: true, auth_id: authUserId });
    }

    // ── RÉINITIALISATION MOT DE PASSE ──────────────────────────────────
    if (action === "reset_password") {
      const { auth_id, password, ecole_id, nom, prenom } = body;
      if (!auth_id || !password) return json({ error: "auth_id et mot de passe requis." }, 400);
      if (password.length < 8) return json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, 400);

      const { error: pwErr } = await admin.auth.admin.updateUserById(auth_id, { password });
      if (pwErr) return json({ error: `Réinitialisation : ${pwErr.message}` }, 400);

      await userClient.rpc("fn_audit_log", {
        p_ecole_id: ecole_id ?? null, p_action: "RESET_PASSWORD", p_module: "users",
        p_ressource_ref: `Mot de passe réinitialisé : ${prenom ?? ''} ${nom ?? ''}`,
      });

      return json({ success: true });
    }

    // ── SUPPRESSION ─────────────────────────────────────────────────────
    if (action === "delete") {
      const { auth_id, utilisateur_id, nom, prenom, email, ecole_id } = body;
      if (!auth_id || !utilisateur_id) return json({ error: "Identifiants manquants." }, 400);

      const { error: delProfilErr } = await admin.from("utilisateurs").delete().eq("id", utilisateur_id);
      if (delProfilErr) return json({ error: `Suppression du profil : ${delProfilErr.message}` }, 400);

      const { error: delAuthErr } = await admin.auth.admin.deleteUser(auth_id);
      if (delAuthErr) {
        // Le profil est déjà supprimé ; on journalise quand même l'échec Auth sans bloquer
        console.error("[manage-user] delete auth user failed:", delAuthErr.message);
      }

      await userClient.rpc("fn_audit_log", {
        p_ecole_id: ecole_id ?? null, p_action: "DELETE", p_module: "users",
        p_ressource_ref: `Utilisateur ${prenom ?? ''} ${nom ?? ''} (${email ?? ''})`,
      });

      return json({ success: true });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (err) {
    console.error("[manage-user] Exception:", err);
    return json({ error: err instanceof Error ? err.message : "Erreur serveur" }, 500);
  }
});
