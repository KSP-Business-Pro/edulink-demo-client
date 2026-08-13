// e2e/auth.spec.ts
// Tests E2E - authentification et protection des routes (sans compte reel)

import { test, expect } from '@playwright/test';
import { resetRateLimit } from './helpers';

// Rate limiting : le test "identifiants invalides" cree un vrai echec comptabilise
// par l'Edge Function auth-login → on encadre le fichier par un reset des compteurs.
test.beforeAll(resetRateLimit); // part d'un compteur vierge
test.afterAll(resetRateLimit);  // ne laisse pas un compteur residuel pour le run suivant

test.describe('Page de connexion', () => {
  test('affiche le formulaire de connexion avec le branding EduLink Sup', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'EduLink Sup' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('affiche un message d\'erreur avec des identifiants invalides', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('inexistant@edulink.bj');
    await page.locator('input[type="password"]').fill('mauvais-mot-de-passe-123');
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page.getByText(/erreur de connexion|identifiants invalides|invalid login credentials/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Protection des routes (securite)', () => {
  test('redirige vers /login si on accede a /dashboard sans authentification', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirige vers /login si on accede a /utilisateurs sans authentification', async ({ page }) => {
    await page.goto('/utilisateurs');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirige vers /login si on accede a /deliberations sans authentification', async ({ page }) => {
    await page.goto('/deliberations');
    await expect(page).toHaveURL(/\/login/);
  });
});