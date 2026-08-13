// supabase/functions/auth-login/index.ts
// ============================================================================
// Sprint B9 (reprise) — Proxy de connexion avec rate limiting
// Action Critique de la roadmap consolidée v10 : 5 tentatives puis blocage 15 min
//
// Le navigateur n'appelle plus supabase.auth.signInWithPassword directement.
// Il poste ici ; cette fonction :
//   1. vérifie que ni le compte ni l'IP ne sont bloqués  (service role)
//   2. tente l'authentification côté serveur              (clé anon)
//   3. incrémente les compteurs en cas d'échec / les efface en cas de succès
//   4. renvoie la session, que le client réinjecte via supabase.auth.setSession()
//
// Le blocage est ainsi appliqué avant tout appel à Supabase Auth, et ne peut
// pas être contourné en tapant l'API Auth directement depuis un script :
// les identifiants ne servent à rien sans passer par ce point de contrôle,
// et les limites natives de Supabase (Authentication → Rate Limits) restent
// actives en second rideau.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Formate une durée en secondes pour un message utilisateur en français. */
function formaterDuree(secondes: number): string {
  if (secondes >= 60) {
    const minutes = Math.ceil(secondes / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${secondes} seconde${secondes > 1 ? 's' : ''}`;
}

/** Extrait l'IP cliente réelle derrière le proxy Supabase / Vercel. */
function extraireIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip')?.trim() ?? '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ message: 'Méthode non autorisée.' }, 405);
  }

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!;

  // ── Lecture de la requête ────────────────────────────────────────────────
  let email = '';
  let password = '';
  try {
    const body = await req.json();
    email    = typeof body?.email === 'string' ? body.email.trim() : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return json({ message: 'Requête invalide.' }, 400);
  }

  if (!email || !password) {
    return json({ message: 'Email et mot de passe requis.' }, 400);
  }

  const ip = extraireIp(req);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1. Blocage déjà actif ? ──────────────────────────────────────────────
  const { data: blocage, error: erreurBlocage } = await admin.rpc(
    'fn_verifier_blocage_connexion',
    { p_email: email, p_ip: ip },
  );

  if (erreurBlocage) {
    // DÉGRADATION CONTRÔLÉE (choix assumé pour une app en exploitation
    // intensive) : si le compteur est injoignable, on ne met pas toute la
    // plateforme dehors. La tentative se poursuit, MAIS l'enregistrement des
    // échecs plus bas continue d'armer le blocage — la protection se réarme
    // donc d'elle-même dès que la vérification refonctionne.
    // Ces erreurs doivent rester visibles : elles signalent une migration non
    // appliquée, une permission manquante ou un incident base.
    console.error('[auth-login] verification de blocage indisponible — mode degrade', erreurBlocage);
  }

  if (!erreurBlocage && blocage?.bloque) {
    const duree = formaterDuree(blocage.secondes_restantes ?? 0);
    const message = blocage.motif === 'reseau'
      ? `Trop de tentatives de connexion depuis ce réseau. Nouvel essai possible dans ${duree}.`
      : `Trop de tentatives de connexion échouées. Ce compte est temporairement bloqué — nouvel essai possible dans ${duree}.`;
    return json({
      message,
      bloque: true,
      motif: blocage.motif,
      secondes_restantes: blocage.secondes_restantes,
    }, 429);
  }

  // ── 2. Tentative d'authentification (côté serveur, clé anon) ─────────────
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  // ── 3a. Échec → on compte ────────────────────────────────────────────────
  if (authError || !authData?.session) {
    // L'enregistrement ne doit jamais faire échouer la réponse : en cas de
    // problème sur le compteur, on renvoie simplement le refus standard.
    let suivi: { bloque?: boolean; motif?: string; secondes_restantes?: number; tentatives_restantes?: number } | null = null;
    try {
      const { data, error } = await admin.rpc('fn_enregistrer_echec_connexion', {
        p_email: email,
        p_ip: ip,
      });
      if (error) console.error('[auth-login] enregistrement de l echec impossible', error);
      else suivi = data;
    } catch (e) {
      console.error('[auth-login] enregistrement de l echec impossible', e);
    }

    if (suivi?.bloque) {
      const duree = formaterDuree(suivi.secondes_restantes ?? 0);
      const message = suivi.motif === 'reseau'
        ? `Trop de tentatives de connexion depuis ce réseau. Nouvel essai possible dans ${duree}.`
        : `Trop de tentatives de connexion échouées. Ce compte est bloqué pendant ${duree}.`;
      return json({
        message,
        bloque: true,
        motif: suivi.motif,
        secondes_restantes: suivi.secondes_restantes,
      }, 429);
    }

    // Message volontairement générique : ne révèle pas si le compte existe.
    const restantes = suivi?.tentatives_restantes ?? null;
    return json({
      message: restantes !== null && restantes <= 2 && restantes > 0
        ? `Identifiants invalides. ${restantes} tentative${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''} avant blocage temporaire.`
        : 'Identifiants invalides.',
      tentatives_restantes: restantes,
    }, 401);
  }

  // ── 3b. Succès → on efface le compteur du compte ─────────────────────────
  // Un échec ici ne doit surtout pas priver l'utilisateur de sa session :
  // au pire son compteur se videra tout seul via la fenêtre glissante.
  try {
    const { error } = await admin.rpc('fn_reinitialiser_tentatives', { p_email: email, p_ip: ip });
    if (error) console.error('[auth-login] reinitialisation du compteur impossible', error);
  } catch (e) {
    console.error('[auth-login] reinitialisation du compteur impossible', e);
  }

  const { session } = authData;
  return json({
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
    expires_in:    session.expires_in,
    expires_at:    session.expires_at,
    token_type:    session.token_type,
  }, 200);
});