// e2e/helpers.ts
// Fonctions partagees pour les tests E2E authentifies

import { Page, expect } from '@playwright/test';

export const E2E_TEST_USER_ID = 'f61c6f96-bc16-4e21-9289-615cba0a7cf1';

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