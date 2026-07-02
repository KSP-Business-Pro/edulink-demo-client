// =============================================================================
// EduLink Sup — Phase 2 — Edge Function : publish-releve
// Version 6 — Multi-modes (publish / resend / lock / unlock) + RBAC explicite
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Mode = "publish" | "resend" | "lock" | "unlock";

interface PublishPayload {
  etudiant_id: string;
  semestre_id: string;
  session_id?: string;
  publie_par?: string;
  webhook_secret?: string;
  mode?: Mode;
  send_email?: boolean;
  republish?: boolean;
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

function calculMoyenneSemestre(resultats: ResultatUE[]): number | null {
  const uesAvecNote = resultats.filter((r) => r.moyenne_ue !== null && !r.est_exclu);
  if (uesAvecNote.length === 0) return null;
  const totalPoids = uesAvecNote.reduce((acc, r) => acc + (r.ue_credits || 1), 0);
  if (totalPoids === 0) return null;
  const sommePonderee = uesAvecNote.reduce((acc, r) => acc + (r.moyenne_ue ?? 0) * (r.ue_credits || 1), 0);
  return Math.round((sommePonderee / totalPoids) * 100) / 100;
}

function calculMention(moyenne: number | null): string | null {
  if (moyenne === null) return null;
  if (moyenne >= 16) return "tres_bien";
  if (moyenne >= 14) return "bien";
  if (moyenne >= 12) return "assez_bien";
  if (moyenne >= 10) return "passable";
  return null;
}

function substituerVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function labelMention(mention: string | null): string {
  const labels: Record<string, string> = {
    tres_bien: "Très Bien", bien: "Bien",
    assez_bien: "Assez Bien", passable: "Passable",
  };
  return mention ? (labels[mention] ?? mention) : "—";
}

async function envoyerEmailReleve(
  etudiant: { nom: string; prenom: string; email_auth: string },
  ecole: { nom: string; logo_url: string | null },
  semestre: { libelle: string; niveau: string },
  snapshot: SnapshotNotes,
  sujetEmail?: string
): Promise<void> {
  const mention = labelMention(snapshot.mention);
  const statutSemestre = snapshot.semestre_valide ? "OK" : "NON";
  const lignesUE = snapshot.resultats_ue.map((ue) => `<tr><td>${ue.ue_code}</td></tr>`).join("");

  const htmlContent = `<html><body>${lignesUE}${mention}${statutSemestre}</body></html>`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": Deno.env.get("BREVO_API_KEY")!,
    },
    body: JSON.stringify({
      sender: { name: ecole.nom, email: "contact@afryx.io" },
      to: [{ email: etudiant.email_auth, name: `${etudiant.prenom} ${etudiant.nom}` }],
      subject: sujetEmail ?? `Relevé de notes — ${semestre.libelle}`,
      htmlContent,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo error ${response.status}: ${err}`);
  }
}

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

  let payload: PublishPayload;
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
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: "Unauthorized", detail: "invalid_token" }, { status: 401, headers: CORS_HEADERS });
  }

  const {
    etudiant_id,
    semestre_id,
    session_id,
    publie_par,
    mode = "publish",
    send_email = false,
    republish = false,
  } = payload;

  if (!etudiant_id || !semestre_id) {
    return Response.json({ error: "Champs requis manquants (etudiant_id, semestre_id)" }, { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ROLES_AUTORISES = ["admin", "directeur", "scolarite", "responsable_pedagogique"];

  const { data: profilAppelant, error: errProfil } = await supabase
    .from("utilisateurs")
    .select("role, ecole_id, actif")
    .eq("auth_id", user.id)
    .eq("actif", true)
    .maybeSingle();

  if (errProfil || !profilAppelant) {
    return Response.json({ error: "Forbidden", detail: "profil_introuvable" }, { status: 403, headers: CORS_HEADERS });
  }

  if (!ROLES_AUTORISES.includes(profilAppelant.role)) {
    return Response.json({ error: "Forbidden", detail: "role_non_autorise" }, { status: 403, headers: CORS_HEADERS });
  }

  const { data: etudiantCible, error: errEtudiantCible } = await supabase
    .from("etudiants")
    .select("ecole_id")
    .eq("id", etudiant_id)
    .maybeSingle();

  if (errEtudiantCible || !etudiantCible) {
    return Response.json({ error: "Étudiant introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const estSuperadmin = profilAppelant.role === "admin" && profilAppelant.ecole_id === null;

  if (!estSuperadmin && profilAppelant.ecole_id !== etudiantCible.ecole_id) {
    return Response.json({ error: "Forbidden", detail: "ecole_differente" }, { status: 403, headers: CORS_HEADERS });
  }

  async function loadReleve() {
    let q = supabase.from("releves_notes").select("*")
      .eq("etudiant_id", etudiant_id).eq("semestre_id", semestre_id);
    if (session_id) q = q.eq("session_id", session_id);
    const { data } = await q.order("publie_le", { ascending: false }).limit(1).maybeSingle();
    return data;
  }

  async function loadContexteEmail() {
    const { data: etudiant } = await supabase.from("etudiants")
      .select("nom, prenom, email_auth, ecole_id").eq("id", etudiant_id).single();
    const { data: semestre } = await supabase.from("semestres")
      .select("libelle, niveau, programme_id").eq("id", semestre_id).single();
    const { data: ecole } = await supabase.from("ecoles")
      .select("nom, logo_url").eq("id", etudiant?.ecole_id).single();
    return { etudiant, semestre, ecole };
  }

  try {
    if (mode === "resend") {
      const releve = await loadReleve();
      if (!releve) {
        return Response.json({ error: "Aucun relevé publié à renvoyer" }, { status: 404, headers: CORS_HEADERS });
      }
      const { etudiant, semestre, ecole } = await loadContexteEmail();
      if (!etudiant?.email_auth) {
        return Response.json({ success: true, email_envoye: false, detail: "no_email" }, { headers: CORS_HEADERS });
      }
      const { data: reglesResend } = await supabase.from("regles_ecole")
        .select("notif_releve_sujet").eq("ecole_id", etudiant.ecole_id).maybeSingle();
      const sujetResend = substituerVariables(
        reglesResend?.notif_releve_sujet ?? "Relevé de notes — {semestre}",
        { semestre: semestre?.libelle ?? "", etudiant: `${etudiant.prenom} ${etudiant.nom}`, etablissement: ecole?.nom ?? "" }
      );
      let emailEnvoye = false;
      try {
        await envoyerEmailReleve(etudiant, ecole, semestre, releve.snapshot_notes as SnapshotNotes, sujetResend);
        emailEnvoye = true;
      } catch (e) {
        console.error("Brevo resend error:", e);
      }
      return Response.json({ success: true, mode: "resend", email_envoye: emailEnvoye }, { headers: CORS_HEADERS });
    }

    if (mode === "lock" || mode === "unlock") {
      const releve = await loadReleve();
      if (!releve) {
        return Response.json({ error: "Aucun relevé à verrouiller" }, { status: 404, headers: CORS_HEADERS });
      }
      const verrou = mode === "lock";
      const { error: errLock } = await supabase.from("releves_notes").update({
        verrouille: verrou,
        verrouille_le: verrou ? new Date().toISOString() : null,
        verrouille_par: verrou ? (publie_par ?? null) : null,
      }).eq("id", releve.id);
      if (errLock) throw new Error(`verrouillage: ${errLock.message}`);
      return Response.json({ success: true, verrouille: verrou }, { headers: CORS_HEADERS });
    }

    if (!session_id) {
      return Response.json({ error: "session_id requis pour la publication" }, { status: 400, headers: CORS_HEADERS });
    }

    const { data: etuGarde, error: errEtuGarde } = await supabase
      .from("etudiants").select("ecole_id").eq("id", etudiant_id).single();
    if (errEtuGarde) throw new Error(`etudiants (garde): ${errEtuGarde.message}`);

    const { data: regles } = await supabase
      .from("regles_ecole")
      .select("blocage_releve_impaye, tolerance_impaye_releve, notif_releve_active, notif_releve_sujet")
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

    const existant = await loadReleve();
    if (existant?.verrouille) {
      return Response.json({
        error: "Relevé verrouillé — déverrouillez-le avant toute republication",
        detail: "verrouille",
      }, { status: 409, headers: CORS_HEADERS });
    }

    if (existant && !republish) {
      let emailEnvoye = false;
      if (send_email) {
        const { etudiant, semestre, ecole } = await loadContexteEmail();
        if (etudiant?.email_auth) {
          const sujetResolu = substituerVariables(
            regles?.notif_releve_sujet ?? "Relevé de notes — {semestre}",
            { semestre: semestre?.libelle ?? "", etudiant: `${etudiant.prenom} ${etudiant.nom}`, etablissement: ecole?.nom ?? "" }
          );
          try {
            await envoyerEmailReleve(etudiant, ecole, semestre, existant.snapshot_notes as SnapshotNotes, sujetResolu);
            emailEnvoye = true;
          } catch (e) { console.error("Brevo error:", e); }
        }
      }
      return Response.json({
        success: true,
        releve_id: existant.id,
        mention: existant.mention,
        deja_publie: true,
        email_envoye: emailEnvoye,
      }, { headers: CORS_HEADERS });
    }

    const { data: resultats, error: errR } = await supabase.rpc("fn_resultats_semestre", {
      p_etudiant_id: etudiant_id, p_semestre_id: semestre_id
    });
    if (errR) throw new Error(`fn_resultats_semestre: ${errR.message}`);
    if (!resultats?.length) {
      return Response.json({ error: "Aucun résultat trouvé" }, { status: 404, headers: CORS_HEADERS });
    }

    const { data: etudiant } = await supabase.from("etudiants")
      .select("nom, prenom, email_auth, ecole_id").eq("id", etudiant_id).single();
    const { data: semestre } = await supabase.from("semestres")
      .select("libelle, niveau, programme_id").eq("id", semestre_id).single();
    const { data: programme } = await supabase.from("programmes_lmd")
      .select("intitule").eq("id", semestre.programme_id).single();
    const { data: ecole } = await supabase.from("ecoles")
      .select("nom, logo_url").eq("id", etudiant.ecole_id).single();

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
      verrouille: false,
    }, { onConflict: "etudiant_id,semestre_id,session_id" }).select().single();

    if (errReleve) throw new Error(`releves_notes: ${errReleve.message}`);

    let emailEnvoye = false;
    if (send_email && etudiant.email_auth) {
      const sujetResolu = substituerVariables(
        regles?.notif_releve_sujet ?? "Relevé de notes — {semestre}",
        { semestre: semestre.libelle, etudiant: `${etudiant.prenom} ${etudiant.nom}`, etablissement: ecole.nom }
      );
      try {
        await envoyerEmailReleve(etudiant, ecole, semestre, snapshot, sujetResolu);
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
      republie: !!existant,
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
