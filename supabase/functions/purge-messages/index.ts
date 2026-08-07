// ============================================================================
// EduLink Sup — Edge Function : purge-messages
// CHANTIER F, point 3 : Archivage légal / politique de conservation
//
// Rôle : exécuter la purge de façon atomique côté serveur :
//   1. Appelle fn_purger_messages_expires AU NOM DE L'UTILISATEUR appelant
//      (son Bearer token est transmis -> la RPC vérifie elle-même le rôle
//      direction/admin via auth.uid(), aucun RBAC dupliqué ici)
//   2. Supprime du bucket 'messages-pieces-jointes' les fichiers dont la RPC
//      renvoie les chemins (en SERVICE ROLE : seule cette étape en a besoin)
//
// Fichier à placer dans : supabase/functions/purge-messages/index.ts
// Déploiement           : npx supabase functions deploy purge-messages
// Aucun nouveau secret nécessaire (SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "messages-pieces-jointes";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "methode_non_autorisee" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "non_authentifie" }, 401);
    }

    const { ecole_id } = await req.json().catch(() => ({} as any));
    if (!ecole_id) {
      return json({ error: "ecole_id_requis" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // ------------------------------------------------------------------
    // 1) Purge SQL, au nom de l'utilisateur appelant (pas en service role)
    //    -> c'est fn_purger_messages_expires qui décide si l'appelant a le
    //       droit (direction/admin de l'école), via auth.uid()
    // ------------------------------------------------------------------
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data, error } = await userClient.rpc(
      "fn_purger_messages_expires",
      { p_ecole_id: ecole_id },
    );

    if (error) {
      const refuse = (error.message ?? "").includes("acces_refuse");
      return json({ error: error.message }, refuse ? 403 : 400);
    }

    // ------------------------------------------------------------------
    // 2) Nettoyage du bucket (service role : seule étape qui l'exige,
    //    les lignes SQL des PJ ont déjà été supprimées par cascade)
    // ------------------------------------------------------------------
    const chemins: string[] = Array.isArray(data?.chemins_storage)
      ? data.chemins_storage
      : [];

    let fichiersSupprimes = 0;
    const echecsStorage: string[] = [];

    if (chemins.length > 0) {
      const adminClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const TAILLE_LOT = 100;
      for (let i = 0; i < chemins.length; i += TAILLE_LOT) {
        const lot = chemins.slice(i, i + TAILLE_LOT);
        const { error: errStorage } = await adminClient.storage
          .from(BUCKET)
          .remove(lot);
        if (errStorage) {
          // La purge SQL est déjà faite et tracée dans journal_purges ;
          // on renvoie les chemins en échec pour permettre une reprise
          // manuelle plutôt que de faire échouer toute l'opération.
          echecsStorage.push(...lot);
        } else {
          fichiersSupprimes += lot.length;
        }
      }
    }

    return json({
      ok: true,
      nb_messages: data?.nb_messages ?? 0,
      nb_pieces_jointes: data?.nb_pieces_jointes ?? 0,
      nb_journal_notifications: data?.nb_journal_notifications ?? 0,
      fichiers_storage_supprimes: fichiersSupprimes,
      echecs_storage: echecsStorage,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
