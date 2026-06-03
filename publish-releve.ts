// =============================================================================
// EduLink Sup — Phase 2 — Edge Function : publish-releve
// Version 4 — Garde serveur "blocage relevé si impayés" (inviolable)
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublishPayload {
  etudiant_id: string;
  semestre_id: string;
  session_id: string;
  publie_par?: string;
  webhook_secret?: string;
}

interface ResultatUE {
  ue_id: string;
  ue_code: string;
  ue_intitule: string;
  ue_credits: number;
  type_ue: string;
  obligatoire: boolean;
  poids_cc: number;
  poids_examen: number;
  moyenne_ue: number | null;
  ue_validee: boolean;
  est_exclu: boolean;
  credits_acquis: number;
  mention_ue: string | null;
}

interface SnapshotNotes {
  publie_le: string;
  semestre_libelle: string;
  programme_intitule: string;
  niveau: string;
  resultats_ue: ResultatUE[];
  credits_valides: number;
  credits_tentes: number;
  semestre_valide: boolean;
  moyenne_semestre: number | null;
  mention: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculMoyenneSemestre(resultats: ResultatUE[]): number | null {
  const uesAvecNote = resultats.filter((r) => r.moyenne_ue !== null);
  if (uesAvecNote.length === 0) return null;
  const somme = uesAvecNote.reduce((acc, r) => acc + (r.moyenne_ue ?? 0), 0);
  return Math.round((somme / uesAvecNote.length) * 100) / 100;
}

function calculMention(moyenne: number | null): string | null {
  if (moyenne === null) return null;
  if (moyenne >= 16) return "tres_bien";
  if (moyenne >= 14) return "bien";
  if (moyenne >= 12) return "assez_bien";
  if (moyenne >= 10) return "passable";
  return null;
}

function labelMention(mention: string | null): string {
  const labels: Record<string, string> = {
    tres_bien: "Très Bien", bien: "Bien",
    assez_bien: "Assez Bien", passable: "Passable",
  };
  return mention ? (labels[mention] ?? mention) : "—";
}

// ---------------------------------------------------------------------------
// Email Brevo
// ---------------------------------------------------------------------------

async function envoyerEmailReleve(
  etudiant: { nom: string; prenom: string; email_auth: string },
  ecole: { nom: string; logo_url: string | null },
  semestre: { libelle: string; niveau: string },
  snapshot: SnapshotNotes
): Promise<void> {
  const mention = labelMention(snapshot.mention);
  const statutSemestre = snapshot.semestre_valide ? "✅ Semestre validé" : "❌ Semestre non validé";
  const lignesUE = snapshot.resultats_ue.map((ue) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${ue.ue_code}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${ue.ue_intitule}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">
        ${ue.moyenne_ue !== null ? Number(ue.moyenne_ue).toFixed(2) : "—"}
      </td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">
        ${ue.credits_acquis} / ${ue.ue_credits}
      </td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">
        ${ue.ue_validee ? "✅" : ue.est_exclu ? "⛔ Exclu" : "❌"}
      </td>
    </tr>`
  ).join("");

  const htmlContent = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#1a1a2e;padding:24px 32px;text-align:center">
      <span style="color:#fff;font-size:18px;font-weight:600">${ecole.nom}</span>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 8px;color:#1a1a2e">Relevé de notes semestriel</h2>
      <p style="color:#666;margin:0 0 24px">${semestre.libelle} — ${semestre.niveau}</p>
      <p>Bonjour <strong>${etudiant.prenom} ${etudiant.nom}</strong>,</p>
      <p>Votre relevé de notes pour le semestre <strong>${semestre.libelle}</strong> est disponible.</p>
      <div style="background:#f8f8f8;border-radius:6px;padding:16px 20px;margin:20px 0">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span>Crédits validés</span><strong>${snapshot.credits_valides} / ${snapshot.credits_tentes} CECT</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span>Moyenne</span><strong>${snapshot.moyenne_semestre !== null ? Number(snapshot.moyenne_semestre).toFixed(2) + " / 20" : "—"}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span>Mention</span><strong>${mention}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span>Résultat</span><strong>${statutSemestre}</strong>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:8px 12px;text-align:left">Code</th>
          <th style="padding:8px 12px;text-align:left">UE</th>
          <th style="padding:8px 12px;text-align:center">Moyenne</th>
          <th style="padding:8px 12px;text-align:center">Crédits</th>
          <th style="padding:8px 12px;text-align:center">Statut</th>
        </tr></thead>
        <tbody>${lignesUE}</tbody>
      </table>
    </div>
    <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#aaa">
      EduLink Sup — LMD CAMES — email automatique
    </div>
  </div>
</body></html>`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": Deno.env.get("BREVO_API_KEY")!,
    },
    body: JSON.stringify({
      sender: { name: ecole.nom, email: "contact@afryx.io" },
      to: [{ email: etudiant.email_auth, name: `${etudiant.prenom} ${etudiant.nom}` }],
      subject: `Relevé de notes — ${semestre.libelle}`,
      htmlContent,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo error ${response.status}: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  // Parser le body en premier — avant toute autre chose
  let payload: PublishPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  // Vérifier le secret depuis le body
  const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
  const secret = payload.webhook_secret || req.headers.get("x-webhook-secret");

  console.log("Secret reçu:", secret ? secret.substring(0, 8) + "..." : "undefined");
  console.log("Secret attendu:", WEBHOOK_SECRET ? WEBHOOK_SECRET.substring(0, 8) + "..." : "undefined");

  if (!secret || secret !== WEBHOOK_SECRET) {
    return Response.json({ error: "Unauthorized", detail: "secret_mismatch" }, { status: 401, headers: CORS_HEADERS });
  }

  const { etudiant_id, semestre_id, session_id, publie_par } = payload;
  if (!etudiant_id || !semestre_id || !session_id) {
    return Response.json({ error: "Champs requis manquants" }, { status: 400, headers: CORS_HEADERS });
  }

  // Client service_role (bypass RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 0. GARDE — blocage relevé si impayés (inviolable côté serveur)
    //    Récupère l'école de l'étudiant, lit la règle, et refuse la publication
    //    si le solde dû dépasse la tolérance configurée. Backstop du contrôle
    //    déjà fait côté client : protège aussi les appels directs (portail, scripts).
    {
      const { data: etuGarde, error: errEtuGarde } = await supabase
        .from("etudiants").select("ecole_id").eq("id", etudiant_id).single();
      if (errEtuGarde) throw new Error(`etudiants (garde): ${errEtuGarde.message}`);

      const { data: regles } = await supabase
        .from("regles_ecole")
        .select("blocage_releve_impaye, tolerance_impaye_releve")
        .eq("ecole_id", etuGarde.ecole_id).maybeSingle();

      if (regles?.blocage_releve_impaye) {
        const { data: solde, error: errSolde } = await supabase
          .rpc("fn_solde_etudiant", { p_etudiant_id: etudiant_id });
        if (errSolde) throw new Error(`fn_solde_etudiant: ${errSolde.message}`);

        const soldeDu = Number(solde) || 0;
        const tolerance = Number(regles.tolerance_impaye_releve) || 0;
        if (soldeDu > tolerance) {
          return Response.json({
            error: "Relevé bloqué — solde impayé",
            detail: "solde_impaye",
            solde_du: soldeDu,
            tolerance,
          }, { status: 402, headers: CORS_HEADERS });
        }
      }
    }

    // 1. Résultats LMD
    const { data: resultats, error: errR } = await supabase.rpc("fn_resultats_semestre", {
      p_etudiant_id: etudiant_id, p_semestre_id: semestre_id
    });
    if (errR) throw new Error(`fn_resultats_semestre: ${errR.message}`);
    if (!resultats?.length) {
      return Response.json({ error: "Aucun résultat trouvé" }, { status: 404, headers: CORS_HEADERS });
    }

    // 2. Métadonnées
    const { data: etudiant } = await supabase.from("etudiants")
      .select("nom, prenom, email_auth, ecole_id").eq("id", etudiant_id).single();
    const { data: semestre } = await supabase.from("semestres")
      .select("libelle, niveau, programme_id").eq("id", semestre_id).single();
    const { data: programme } = await supabase.from("programmes_lmd")
      .select("intitule").eq("id", semestre.programme_id).single();
    const { data: ecole } = await supabase.from("ecoles")
      .select("nom, logo_url").eq("id", etudiant.ecole_id).single();

    // 3. Snapshot
    const creditsTentes = (resultats as ResultatUE[]).reduce((a, r) => a + (r.obligatoire ? r.ue_credits : 0), 0);
    const creditsValides = (resultats as ResultatUE[]).reduce((a, r) => a + r.credits_acquis, 0);
    const moyenneSemestre = calculMoyenneSemestre(resultats as ResultatUE[]);
    const mention = calculMention(moyenneSemestre);
    const semestreValide = (resultats as ResultatUE[]).filter(r => r.obligatoire).every(r => r.ue_validee);

    const snapshot: SnapshotNotes = {
      publie_le: new Date().toISOString(),
      semestre_libelle: semestre.libelle,
      programme_intitule: programme.intitule,
      niveau: semestre.niveau,
      resultats_ue: resultats as ResultatUE[],
      credits_valides: creditsValides,
      credits_tentes: creditsTentes,
      semestre_valide: semestreValide,
      moyenne_semestre: moyenneSemestre,
      mention,
    };

    // 4. Upsert releves_notes
    const { data: releve, error: errReleve } = await supabase.from("releves_notes").upsert({
      etudiant_id, semestre_id, session_id,
      ecole_id: etudiant.ecole_id,
      snapshot_notes: snapshot,
      moyenne_semestre: moyenneSemestre,
      credits_valides: creditsValides,
      credits_tentes: creditsTentes,
      mention,
      decision: semestreValide ? "admis" : "ajourné",
      publie_le: new Date().toISOString(),
      publie_par: publie_par ?? null,
    }, { onConflict: "etudiant_id,semestre_id,session_id" }).select().single();

    if (errReleve) throw new Error(`releves_notes: ${errReleve.message}`);

    // 5. Email Brevo
    let emailEnvoye = false;
    if (etudiant.email_auth) {
      try {
        await envoyerEmailReleve(etudiant, ecole, semestre, snapshot);
        emailEnvoye = true;
      } catch (e) {
        console.error("Brevo error:", e);
      }
    }

    return Response.json({
      success: true,
      releve_id: releve.id,
      etudiant: `${etudiant.prenom} ${etudiant.nom}`,
      semestre: semestre.libelle,
      credits_valides: creditsValides,
      semestre_valide: semestreValide,
      mention,
      email_envoye: emailEnvoye,
    }, { headers: CORS_HEADERS });

  } catch (err) {
    console.error("publish-releve error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
