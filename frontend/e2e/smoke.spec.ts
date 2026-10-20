import { expect, test } from '@playwright/test';

/**
 * F0 smoke (spec F0 §8): login with the seeded user, choose a space, see the
 * shell, reload (active space persists), toggle the theme, log out.
 * Runs at 1280 and 360 (see playwright.config.ts) to cover AC-F0.8.
 */
test('login → picker → shell → logout', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  // Invalid credentials first (AC-F0.3) — the form stays usable.
  await page.getByLabel('Correo electrónico').fill('ana@demo.test');
  await page.getByLabel('Contraseña').fill('WrongPass123!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();

  // Real credentials (seed user with 2 memberships → picker).
  await page.getByLabel('Contraseña').fill('DevDemo123!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Elige un espacio' })).toBeVisible();

  await page.getByRole('button', { name: 'Gestión Demo' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeVisible();

  // Responsive (AC-F0.8): bottom nav <768, sidebar ≥768, no horizontal scroll.
  // Structural locators: `getByRole('navigation')` cannot tell the two apart
  // because the hidden one is excluded from the accessibility tree.
  const width = page.viewportSize()?.width ?? 0;
  const sidebarNav = page.locator('aside nav');
  const bottomNav = page.locator('nav[class*="md:hidden"]');
  if (width < 768) {
    await expect(bottomNav).toBeVisible();
    await expect(sidebarNav).toBeHidden();
  } else {
    await expect(sidebarNav).toBeVisible();
    await expect(bottomNav).toBeHidden();
  }
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);

  // Active space persists across reloads (AC-F0.5).
  await page.reload();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeVisible();

  // Theme applies instantly and persists (AC-F0.7): system → light → dark.
  const html = page.locator('html');
  await page.getByRole('button', { name: /Cambiar tema/ }).click();
  await page.getByRole('button', { name: /Cambiar tema/ }).click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);

  // Logout always lands on /login (spec F0 §11).
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});
