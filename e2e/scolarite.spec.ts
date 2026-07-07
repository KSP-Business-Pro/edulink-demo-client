// e2e/scolarite.spec.ts
// Tests E2E authentifies - compte de test dedie (ecole isolee, role scolarite)
// Identifiants charges depuis .env.test.local (jamais commite)

import { test, expect } from '@playwright/test';
import { loginAsScolarite } from './helpers';

test.describe('Connexion avec le compte de test (role scolarite)', () => {
  test('se connecte avec succes et arrive sur le dashboard', async ({ page }) => {
    await loginAsScolarite(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});