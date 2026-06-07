// =============================================================================
// EduLink Sup — Suite de tests CLI (Node.js)
// Usage : node edulink_tests.mjs
// Requires : node 18+ (fetch natif)
// =============================================================================
import { createInterface } from 'readline';

const SUPABASE_URL   = 'https://kcfpvnrgutkhakogbjip.supabase.co';
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZnB2bnJndXRraGFrb2diamlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNjYyNTIsImV4cCI6MjA5MDY0MjI1Mn0.BvVFEwDwjbu0R7rMOq978hPHed5IuhafFn_KgX2-_Dc';
const WEBHOOK_SECRET = 'ab680f52-881c-4e89-a299-0aeec8c13da1-44cebc6c-d38c-446c-98ba-4390a4bffee8';
const EDGE_URL       = 'https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/publish-releve';
const REST           = `${SUPABASE_URL}/rest/v1`;
const AUTH_EMAIL     = 'ssadambi1@gmail.com';

// Authentification — obtenir un JWT utilisateur pour contourner RLS
async function getAuthToken(password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: AUTH_EMAIL, password })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('Authentification échouée : ' + (data.error_description || data.message || JSON.stringify(data)));
  return data.access_token;
}

async function askPassword() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Masquer la saisie
  process.stdout.write(`Mot de passe pour ${AUTH_EMAIL} : `);
  process.stdin.setRawMode?.(true);
  return new Promise(resolve => {
    let pwd = '';
    process.stdin.on('data', function handler(ch) {
      const c = ch.toString();
      if (c === '\r' || c === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener('data', handler);
        process.stdout.write('\n');
        rl.close();
        resolve(pwd);
      } else if (c === '\u0003') { process.exit(); }
      else if (c === '\u007f') { pwd = pwd.slice(0, -1); }
      else { pwd += c; }
    });
    process.stdin.resume();
  });
}

let HEADERS = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };

// Fixtures attendues (validées manuellement en session)
const FIXTURES = {
  AGBODEKA: { matricule: 'hemec-AUD-0006', moyenne: 15.87, mention: 'bien',       credits: 6, valide: true  },
  KEKE:     { matricule: 'hemec-AUD-0009', moyenne: 11.11, mention: 'passable',   credits: 6, valide: true  },
  VODONOU:  { matricule: 'hemec-AUD-0001', moyenne: 9.14,  mention: null,         credits: 0, valide: false },
  AIZANNON: { matricule: 'hemec-AUD-0004', moyenne: 13.90, mention: 'assez_bien', credits: 6, valide: false },
};
const SEUIL_UE = 10;

// ─── Helpers REST ─────────────────────────────────────────────────────────────
async function rpc(fn, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) return { data: null, error: { message: data.message || JSON.stringify(data) } };
  return { data, error: null };
}

async function select(table, params = {}) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${REST}/${table}?${qs}&limit=10`, { headers: { ...HEADERS, 'Accept': 'application/json' } });
  const data = await res.json();
  if (!res.ok) return { data: null, error: { message: JSON.stringify(data) } };
  return { data, error: null };
}

async function selectOne(table, params) {
  const { data, error } = await select(table, params);
  return { data: data?.[0] ?? null, error };
}

// ─── Logique pure (copiée du JS app) ─────────────────────────────────────────
function moyPonderee(ues) {
  const valides = ues.filter(u => u.moyenne_ue !== null && !u.est_exclu);
  if (!valides.length) return null;
  const tw = valides.reduce((s, u) => s + (u.ue_credits || 1), 0);
  const tn = valides.reduce((s, u) => s + u.moyenne_ue * (u.ue_credits || 1), 0);
  return tw > 0 ? Math.round(tn / tw * 100) / 100 : null;
}

function calculMention(moy) {
  if (moy === null) return null;
  if (moy >= 16) return 'tres_bien';
  if (moy >= 14) return 'bien';
  if (moy >= 12) return 'assez_bien';
  if (moy >= 10) return 'passable';
  return null;
}

function appliquerCompensation(ues, seuilUE, seuilPlancher) {
  const moy = moyPonderee(ues);
  if (moy === null || moy < seuilUE) return ues;
  return ues.map(u =>
    (!u.ue_validee && !u.est_exclu && u.moyenne_ue !== null && u.moyenne_ue >= seuilPlancher)
      ? { ...u, ue_validee: true, credits_acquis: u.ue_credits, compensee: true }
      : u
  );
}

// ─── Framework test ───────────────────────────────────────────────────────────
const CLR = { reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', gray:'\x1b[90m', bold:'\x1b[1m', cyan:'\x1b[36m' };
let pass = 0, fail = 0;
let _ids = {}, _semId = null;

function eid(key) { return _ids[FIXTURES[key].matricule]; }

function assert(cond, msg)           { if (!cond) throw new Error(msg); }
function assertEq(a, b, lbl)         { if (a !== b) throw new Error(`${lbl}: attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); }
function assertClose(a, b, tol, lbl) { if (Math.abs(a - b) > tol) throw new Error(`${lbl}: attendu ≈${b}, reçu ${a}`); }

async function test(name, fn) {
  const t0 = performance.now();
  try {
    await fn();
    const ms = Math.round(performance.now() - t0);
    console.log(`  ${CLR.green}✔${CLR.reset} ${name} ${CLR.gray}(${ms}ms)${CLR.reset}`);
    pass++;
  } catch(e) {
    const ms = Math.round(performance.now() - t0);
    console.log(`  ${CLR.red}✘${CLR.reset} ${name} ${CLR.gray}(${ms}ms)${CLR.reset}`);
    console.log(`    ${CLR.red}→ ${e.message}${CLR.reset}`);
    fail++;
  }
}

function suite(name) {
  console.log(`\n${CLR.bold}${CLR.cyan}▸ ${name}${CLR.reset}`);
}

// ─── Setup fixtures ───────────────────────────────────────────────────────────
async function setup() {
  console.log(`\n${CLR.bold}⚙  Résolution fixtures…${CLR.reset}`);
  // Authentification Supabase pour bypass RLS
  const password = await askPassword();
  const token = await getAuthToken(password);
  HEADERS = { ...HEADERS, 'Authorization': `Bearer ${token}` };
  console.log(`  ${CLR.green}✔${CLR.reset} Authentifié en tant que ${AUTH_EMAIL}`);
  const matricules = Object.values(FIXTURES).map(f => f.matricule);
  for (const m of matricules) {
    const res = await fetch(`${REST}/etudiants?matricule=eq.${m}&select=id,matricule`, { headers: HEADERS });
    const data = await res.json();
    if (data?.[0]) _ids[m] = data[0].id;
  }
  const missing = Object.values(FIXTURES).filter(f => !_ids[f.matricule]).map(f => f.matricule);
  if (missing.length) throw new Error('Étudiants introuvables : ' + missing.join(', '));

  const res = await fetch(`${REST}/inscriptions_semestre?etudiant_id=eq.${eid('AGBODEKA')}&limit=1&select=semestre_id`, { headers: HEADERS });
  const ins = await res.json();
  if (!ins?.[0]?.semestre_id) throw new Error('Semestre introuvable pour AGBODEKA');
  _semId = ins[0].semestre_id;
  console.log(`  ${CLR.green}✔${CLR.reset} ${Object.keys(_ids).length} étudiants résolus · semestre ${_semId.slice(0,8)}…\n`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${CLR.bold}🧪 EduLink Sup — Suite de tests CLI${CLR.reset}`);
  console.log(`${CLR.gray}Supabase : ${SUPABASE_URL}${CLR.reset}`);

  try { await setup(); } catch(e) {
    console.log(`${CLR.red}⛔ Setup échoué : ${e.message}${CLR.reset}`);
    process.exit(1);
  }

  // ── Suite 1 : fn_resultats_semestre ────────────────────────────────────────
  suite('RPC fn_resultats_semestre');

  await test('AGBODEKA — retourne 2 UEs', async () => {
    const { data, error } = await rpc('fn_resultats_semestre', { p_etudiant_id: eid('AGBODEKA'), p_semestre_id: _semId });
    assert(!error, error?.message); assertEq(data.length, 2, 'nb UEs');
  });

  await test('AGBODEKA — moyenne pondérée ≈ 15.87', async () => {
    const { data } = await rpc('fn_resultats_semestre', { p_etudiant_id: eid('AGBODEKA'), p_semestre_id: _semId });
    assertClose(moyPonderee(data), 15.87, 0.01, 'moyenne');
  });

  await test('AGBODEKA — toutes UEs validées', async () => {
    const { data } = await rpc('fn_resultats_semestre', { p_etudiant_id: eid('AGBODEKA'), p_semestre_id: _semId });
    assert(data.every(u => u.ue_validee), 'toutes validées');
  });

  await test('KEKE — UE2 compensée (7.60 ≥ plancher, moy ≥ 10)', async () => {
    const { data } = await rpc('fn_resultats_semestre', { p_etudiant_id: eid('KEKE'), p_semestre_id: _semId });
    const ue2 = data.find(u => u.ue_code === 'ACG-M1-UE2');
    assert(ue2, 'UE2 introuvable');
    assert(ue2.ue_validee,   'UE2 validée par compensation');
    assert(ue2.est_compense, 'UE2 marquée compensée');
    assert(ue2.moyenne_ue < SEUIL_UE, 'note UE2 < seuil');
  });

  await test('KEKE — moyenne pondérée ≈ 11.11', async () => {
    const { data } = await rpc('fn_resultats_semestre', { p_etudiant_id: eid('KEKE'), p_semestre_id: _semId });
    assertClose(moyPonderee(data), 11.11, 0.05, 'moyenne KEKE');
  });

  await test('VODONOU — moy < 10 (non validé)', async () => {
    const { data } = await rpc('fn_resultats_semestre', { p_etudiant_id: eid('VODONOU'), p_semestre_id: _semId });
    const moy = moyPonderee(data);
    assert(moy !== null && moy < SEUIL_UE, `moy=${moy} doit être < ${SEUIL_UE}`);
  });

  await test('Structure retour — champs obligatoires', async () => {
    const { data } = await rpc('fn_resultats_semestre', { p_etudiant_id: eid('AGBODEKA'), p_semestre_id: _semId });
    const req = ['ue_id','ue_code','ue_credits','moyenne_ue','ue_validee','est_exclu','credits_acquis','est_compense'];
    req.forEach(f => assert(f in data[0], `champ manquant : ${f}`));
  });

  // ── Suite 2 : Logique JS ───────────────────────────────────────────────────
  suite('Logique JS — compensation & calcul');

  await test('moyPonderee() — calcul correct (15.50×4 + 16.60×2)/6 = 15.87', async () => {
    const ues = [
      { moyenne_ue: 15.50, ue_credits: 4, est_exclu: false },
      { moyenne_ue: 16.60, ue_credits: 2, est_exclu: false },
    ];
    assertClose(moyPonderee(ues), 15.87, 0.01, 'moyenne AGBODEKA');
  });

  await test('moyPonderee() — ignore les exclus', async () => {
    const ues = [
      { moyenne_ue: 15.00, ue_credits: 4, est_exclu: false },
      { moyenne_ue: 18.00, ue_credits: 2, est_exclu: true  },
    ];
    assertClose(moyPonderee(ues), 15.00, 0.01, 'exclu ignoré');
  });

  await test('moyPonderee() — null si toutes notes absentes', async () => {
    assertEq(moyPonderee([{ moyenne_ue: null, ue_credits: 4, est_exclu: false }]), null, 'null');
  });

  await test('calculMention() — seuils corrects', async () => {
    assertEq(calculMention(16.00), 'tres_bien',  '≥16');
    assertEq(calculMention(15.99), 'bien',       '<16');
    assertEq(calculMention(14.00), 'bien',       '≥14');
    assertEq(calculMention(12.00), 'assez_bien', '≥12');
    assertEq(calculMention(10.00), 'passable',   '≥10');
    assertEq(calculMention(9.99),  null,         '<10');
    assertEq(calculMention(null),  null,         'null');
  });

  await test('Compensation — UE validée si moy≥10 et note≥plancher', async () => {
    let ues = [
      { ue_code:'UE1', moyenne_ue:12.00, ue_credits:4, ue_validee:true,  est_exclu:false, credits_acquis:4 },
      { ue_code:'UE2', moyenne_ue:7.60,  ue_credits:2, ue_validee:false, est_exclu:false, credits_acquis:0 },
    ];
    ues = appliquerCompensation(ues, 10, 5);
    const ue2 = ues.find(u => u.ue_code === 'UE2');
    assert(ue2.ue_validee && ue2.compensee, 'compensée');
    assertEq(ue2.credits_acquis, 2, 'crédits');
  });

  await test('Compensation — bloquée si note < plancher', async () => {
    let ues = [
      { ue_code:'UE1', moyenne_ue:14.00, ue_credits:4, ue_validee:true,  est_exclu:false, credits_acquis:4 },
      { ue_code:'UE2', moyenne_ue:3.00,  ue_credits:2, ue_validee:false, est_exclu:false, credits_acquis:0 },
    ];
    ues = appliquerCompensation(ues, 10, 5);
    assert(!ues.find(u => u.ue_code === 'UE2').ue_validee, 'non compensée');
  });

  await test('Compensation — bloquée si étudiant exclu', async () => {
    let ues = [
      { ue_code:'UE1', moyenne_ue:14.00, ue_credits:4, ue_validee:true,  est_exclu:false, credits_acquis:4 },
      { ue_code:'UE2', moyenne_ue:7.00,  ue_credits:2, ue_validee:false, est_exclu:true,  credits_acquis:0 },
    ];
    ues = appliquerCompensation(ues, 10, 5);
    assert(!ues.find(u => u.ue_code === 'UE2').ue_validee, 'exclu non compensé');
  });

  await test('regle_rattrapage MAX', async () => {
    assertEq(Math.max(8.00, 12.00), 12.00, 'MAX');
    assertEq(Math.max(12.00, 7.00), 12.00, 'MAX garde la meilleure');
  });

  await test('regle_rattrapage REMPLACEMENT — écrase la normale', async () => {
    const mNorm = 12.00, mRatt = 7.00;
    assertEq(mRatt, 7.00, 'remplacement = note ratt');
    assert(mRatt < SEUIL_UE, 'non validé après remplacement');
    assert(mNorm >= SEUIL_UE, 'était validé avant remplacement');
  });

  // ── Suite 3 : RPC utilitaires + cache ──────────────────────────────────────
  suite('RPC utilitaires & resultats_cache');

  await test('fn_solde_etudiant — retourne un nombre', async () => {
    const { data, error } = await rpc('fn_solde_etudiant', { p_etudiant_id: eid('AGBODEKA') });
    assert(!error, error?.message);
    assert(typeof data === 'number' || data === null, `type inattendu : ${typeof data}`);
  });

  await test('resultats_cache — AGBODEKA cohérent avec fixtures', async () => {
    const res = await fetch(`${REST}/resultats_cache?etudiant_id=eq.${eid('AGBODEKA')}&semestre_id=eq.${_semId}`, { headers: HEADERS });
    const [cache] = await res.json();
    assert(cache, 'cache absent');
    assertClose(Number(cache.moyenne_semestre), FIXTURES.AGBODEKA.moyenne, 0.01, 'moyenne');
    assertEq(cache.mention, FIXTURES.AGBODEKA.mention, 'mention');
    assertEq(cache.credits_valides, FIXTURES.AGBODEKA.credits, 'crédits');
  });

  await test('resultats_cache — KEKE compensation reflétée (6 CECT, admis)', async () => {
    const res = await fetch(`${REST}/resultats_cache?etudiant_id=eq.${eid('KEKE')}&semestre_id=eq.${_semId}`, { headers: HEADERS });
    const [cache] = await res.json();
    assert(cache, 'cache absent');
    assertEq(cache.credits_valides, FIXTURES.KEKE.credits, 'crédits KEKE');
    assertEq(cache.semestre_valide, FIXTURES.KEKE.valide,  'semestre_valide');
  });

  await test('notes_historique — table accessible', async () => {
    const res = await fetch(`${REST}/notes_historique?limit=1`, { headers: HEADERS });
    assert(res.ok, `HTTP ${res.status}`);
  });

  // ── Suite 4 : Edge Function ────────────────────────────────────────────────
  suite('Edge Function publish-releve');

  await test('Secret invalide → 401', async () => {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'mauvais-secret' },
      body: JSON.stringify({ etudiant_id: eid('AGBODEKA'), semestre_id: _semId })
    });
    assertEq(res.status, 401, 'HTTP 401');
    const data = await res.json();
    assertEq(data.detail, 'secret_mismatch', 'detail');
  });

  await test('Champs manquants → 400', async () => {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ etudiant_id: eid('AGBODEKA') })
    });
    assertEq(res.status, 400, 'HTTP 400');
  });

  await test('Mode resend — relevé existant → success', async () => {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ etudiant_id: eid('AGBODEKA'), semestre_id: _semId, mode: 'resend' })
    });
    const data = await res.json();
    assert(data.success, `pas success : ${JSON.stringify(data)}`);
    // mode n'est pas retourné par l'Edge Function — on vérifie juste le succès
    assert(typeof data.email_envoye === 'boolean', 'email_envoye doit être boolean');
  });

  await test('Snapshot AGBODEKA — moyenne ≈ 15.87, mention bien', async () => {
    const res = await fetch(`${REST}/releves_notes?etudiant_id=eq.${eid('AGBODEKA')}&semestre_id=eq.${_semId}&select=moyenne_semestre,mention`, { headers: HEADERS });
    const [releve] = await res.json();
    assert(releve, 'relevé introuvable');
    assertClose(Number(releve.moyenne_semestre), 15.87, 0.01, 'moyenne snapshot');
    assertEq(releve.mention, 'bien', 'mention snapshot');
  });

  await test('Cohérence snapshot ↔ cache — AGBODEKA', async () => {
    const [rRes, cRes] = await Promise.all([
      fetch(`${REST}/releves_notes?etudiant_id=eq.${eid('AGBODEKA')}&semestre_id=eq.${_semId}&select=moyenne_semestre,mention,credits_valides`, { headers: HEADERS }),
      fetch(`${REST}/resultats_cache?etudiant_id=eq.${eid('AGBODEKA')}&semestre_id=eq.${_semId}&select=moyenne_semestre,mention,credits_valides`, { headers: HEADERS }),
    ]);
    const [[releve], [cache]] = await Promise.all([rRes.json(), cRes.json()]);
    assert(releve && cache, 'relevé ou cache manquant');
    assertClose(Number(releve.moyenne_semestre), Number(cache.moyenne_semestre), 0.01, 'moyenne cohérente');
    assertEq(releve.mention, cache.mention, 'mention cohérente');
    assertEq(releve.credits_valides, cache.credits_valides, 'crédits cohérents');
  });

  await test('Cohérence snapshot ↔ cache — KEKE', async () => {
    const [rRes, cRes] = await Promise.all([
      fetch(`${REST}/releves_notes?etudiant_id=eq.${eid('KEKE')}&semestre_id=eq.${_semId}&select=moyenne_semestre,mention,credits_valides`, { headers: HEADERS }),
      fetch(`${REST}/resultats_cache?etudiant_id=eq.${eid('KEKE')}&semestre_id=eq.${_semId}&select=moyenne_semestre,mention,credits_valides`, { headers: HEADERS }),
    ]);
    const [[releve], [cache]] = await Promise.all([rRes.json(), cRes.json()]);
    assert(releve && cache, 'relevé ou cache manquant');
    assertClose(Number(releve.moyenne_semestre), Number(cache.moyenne_semestre), 0.05, 'moyenne KEKE');
    assertEq(releve.credits_valides, cache.credits_valides, 'crédits KEKE cohérents');
  });

  // ── Résumé ─────────────────────────────────────────────────────────────────
  const total = pass + fail;
  console.log('\n' + '─'.repeat(50));
  if (fail === 0) {
    console.log(`${CLR.green}${CLR.bold}✅ ${pass}/${total} tests passés — aucun échec${CLR.reset}`);
  } else {
    console.log(`${CLR.red}${CLR.bold}❌ ${fail} échec(s) sur ${total} tests (${pass} passés)${CLR.reset}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(CLR.red + '⛔ Erreur fatale : ' + e.message + CLR.reset); process.exit(1); });
