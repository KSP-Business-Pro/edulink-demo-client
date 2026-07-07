// e2e/saisie-notes.spec.ts
// Test E2E - workflow saisie des notes avec le compte de test dedie
// Utilise l'ecole de test isolee (donnees creees en base pour ce parcours)

import { test, expect } from '@playwright/test';
import { loginAsScolarite } from './helpers';

test.beforeEach(async ({ page }) => {
  await loginAsScolarite(page);
  await page.goto('/saisie-notes');

  await page.locator('#saisie-semestre').selectOption({ label: 'Semestre 1 - Test E2E' });
  await expect(page.locator('body')).toContainText('UE-TEST-01', { timeout: 15000 });

  await page.locator('#saisie-ue').selectOption({ label: 'UE-TEST-01 — UE Test E2E' });
  await expect(page.locator('body')).toContainText('MAT-TEST-01', { timeout: 15000 });

  await page.locator('#saisie-matiere').selectOption({ label: 'MAT-TEST-01 — Matière Test E2E (coef 1)' });
});

test.describe('Saisie des notes - parcours de base', () => {
  test('affiche la grille avec les donnees du semestre/UE/matiere de test', async ({ page }) => {
    await expect(page.locator('body')).toContainText('UE-TEST-01');
    await expect(page.locator('body')).toContainText('MAT-TEST-01');
  });

  test("affiche l'etudiant de test dans la grille avec son matricule", async ({ page }) => {
    await expect(page.getByText('DUPONT Jean')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('TEST-E2E-0001')).toBeVisible({ timeout: 15000 });
  });

  test('affiche les ponderations CC/Examen configurees pour la matiere', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/CC 40%.*Exam 60%/, { timeout: 15000 });
  });
});