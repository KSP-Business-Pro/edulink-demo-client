// e2e/helpers.ts
// Fonctions partagees pour les tests E2E authentifies

import { Page, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const E2E_TEST_USER_ID = '1f9bcdba-686c-46b8-b3c2-022db0da4473';
export const E2E_ETUDIANT_ID = '848502ac-040c-41bd-8f7a-ac43d92c0ce8'; // DUPONT Jean
export const E2E_ECOLE_TEST_ID = 'bdc151c1-e4b2-463f-9ab5-27772541dd94'; // École Test E2E

const SUPABASE_URL = 'https://kcfpvnrgutkhakogbjip.supabase.co';

export async function loginAsScolarite(page: Page): Promise<void> {
  const EMAIL = process.env.E2E_TEST_EMAIL;
  const PASSWORD = process.env.E2E_TEST_PASSWORD;

  if (!EMAIL || !PASSWORD) {
    throw new Error('E2E_TEST_EMAIL / E2E_TEST_PASSWORD manquants.');
  }

  await page.goto('/login');

  // Marque la MFA comme deja verifiee pour cette session de navigateur
  // (meme mecanisme que celui utilise par l'app pour un utilisateur reel
  // qui a deja valide son code sur cet appareil/session).
  await page.evaluate((uid) => {
    sessionStorage.setItem(`edulink_mfa_verified_${uid}`, 'true');
  }, E2E_TEST_USER_ID);

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

// ── Client admin (service role) — reserve au setup/teardown des tests ──────
export function adminClient() {
  const key = process.env.E2E_SUPABASE_SERVICE_KEY;
  if (!key) {
    throw new Error('E2E_SUPABASE_SERVICE_KEY manquante dans .env.test.local');
  }
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

// ── Clients "utilisateur connecte" (auth.uid() renseigne cote RPC) ─────────
export async function signInClient(email?: string, password?: string): Promise<SupabaseClient> {
  const anon = process.env.E2E_SUPABASE_ANON_KEY;
  if (!anon) {
    throw new Error('E2E_SUPABASE_ANON_KEY manquante dans .env.test.local');
  }
  if (!email || !password) {
    throw new Error('Identifiants de test manquants dans .env.test.local');
  }
  const client = createClient(SUPABASE_URL, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Connexion API echouee pour ${email} : ${error.message}`);
  }
  return client;
}

export function adminUserClient(): Promise<SupabaseClient> {
  return signInClient(process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
}

export function scolariteUserClient(): Promise<SupabaseClient> {
  return signInClient(process.env.E2E_TEST_EMAIL, process.env.E2E_TEST_PASSWORD);
}

// ── Remet le releve de DUPONT Jean a l'etat "non publie" ───────────────────
// "Publie" = une ligne existe dans releves_notes pour (etudiant, semestre).
// La supprimer redonne le bouton "Publier" dans /deliberations.
export async function resetReleveDupont(): Promise<void> {
  const admin = adminClient();

  const { data: sem, error: e1 } = await admin
    .from('semestres')
    .select('id')
    .eq('libelle', 'Semestre 1 - Test E2E')
    .single();
  if (e1 || !sem) {
    throw new Error(`Semestre de test introuvable : ${e1?.message ?? 'aucune ligne'}`);
  }

  const { error: e2 } = await admin
    .from('releves_notes')
    .delete()
    .eq('etudiant_id', E2E_ETUDIANT_ID)
    .eq('semestre_id', sem.id);
  if (e2) {
    throw new Error(`Reset releve echoue : ${e2.message}`);
  }
}