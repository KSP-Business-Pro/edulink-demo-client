// e2e/scolarite.spec.ts
// Tests E2E authentifies - compte de test dedie (ecole isolee, role scolarite)
// Identifiants charges depuis .env.test.local (jamais commite)

import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.beforeEach(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'E2E_TEST_EMAIL / E2E_TEST_PASSWORD manquants. Verifier .env.test.local ou les secrets CI.'
    );
  }
});

test.describe('Connexion avec le compte de test (role scolarite)', () => {
  test('se connecte avec succes et arrive sur le dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.getByRole('button', { name: /se connecter/i }).click();

    await expect(page).toHaveURL(/\/dashboard|\/deux-etapes|\/2fa/i, { timeout: 15000 });
  });
});