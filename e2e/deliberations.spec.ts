// e2e/deliberations.spec.ts
// Test E2E - workflow deliberations : affichage, publication, verrouillage
// Utilise l'ecole de test isolee et l'etudiant DUPONT Jean (donnees creees en base)

import { test, expect } from '@playwright/test';
import { loginAsScolarite, resetReleveDupont } from './helpers';

test.beforeEach(async ({ page }) => {
  await loginAsScolarite(page);
  await page.goto('/deliberations');

  await page.locator('select').first().selectOption({ label: 'Semestre 1 - Test E2E' });
  await expect(page.getByText('DUPONT Jean').first()).toBeVisible({ timeout: 15000 });
});

test.describe('Deliberations - affichage', () => {
  test("affiche l'etudiant de test avec ses credits acquis", async ({ page }) => {
    await expect(page.getByText('TEST-E2E-0001').first()).toBeVisible();
    await expect(page.getByText('6 CECT').first()).toBeVisible();
  });

  test('affiche les compteurs de synthese du semestre', async ({ page }) => {
    await expect(page.locator('#el-main-content').getByText('Étudiants')).toBeVisible();
    await expect(page.getByText('Admis').first()).toBeVisible();
  });
});

test.describe('Deliberations - publication du releve', () => {
  test.beforeEach(async () => {
    // Idempotence : garantit l'etat "non publie" avant chaque run,
    // quel que soit l'etat laisse par les runs precedents.
    await resetReleveDupont();
  });

  test("publie le releve de l'etudiant de test", async ({ page }) => {
    // Le beforeEach global a charge la page AVANT le reset → recharger pour voir l'etat propre
    await page.reload();
    await page.locator('select').first().selectOption({ label: 'Semestre 1 - Test E2E' });
    const ligneEtudiant = page.locator('tr', { hasText: 'DUPONT Jean' });
    await expect(ligneEtudiant).toBeVisible({ timeout: 15000 });

    // Pas d'envoi email reel pendant les tests
    const emailCheckbox = page.locator('#delib-send-email');
    if (await emailCheckbox.isChecked()) await emailCheckbox.uncheck();

    await ligneEtudiant.getByRole('button', { name: 'Publier' }).click();
    await expect(ligneEtudiant.getByText('✓ Publié')).toBeVisible({ timeout: 15000 });
  });
});