import { expect, test, type Page } from '@playwright/test';

/**
 * F2 dashboard flows (spec F2 §8) against the real API — the UI never
 * substitutes the server check (§16.1):
 * 1. dashboard per space (ana / Gestión Demo, read-only);
 * 2. accept end-to-end (ana assigns to bob → bob accepts → ana gets the
 *    `assignment_accepted` notification and marks it read);
 * 3. reject with reason (ana gets `assignment_rejected` with the reason);
 * 4. space separation (§2.4): carla assigns to ana in Taller Carla; the row
 *    only appears once ana switches to that space.
 *
 * Every flow creates uniquely-titled data per run (the two viewport projects
 * and CI retries run in parallel) and never mutates the seeded assignments
 * (spec F2 §8).
 */

const API = '/api/v1';

/** Unique per run: parallel projects + CI retries must not share state. */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function login(page: Page, email: string, password = 'DevDemo123!') {
  // Multi-user flows reuse the page: a lingering session would bounce /login
  // to the active space (F1-D6 guest routes), so always start clean.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Ana (owner of Gestión Demo, member of Taller Carla) → the F2 dashboard. */
async function openDashboardAsAna(page: Page) {
  await login(page, 'ana@demo.test');
  await expect(page.getByRole('heading', { name: 'Elige un espacio' })).toBeVisible();
  await page.getByRole('button', { name: 'Gestión Demo' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeVisible();
}

/** Company id of the logged-in user's space (from `me`, F0/F1 contract). */
async function companyIdOf(page: Page, companyName: string): Promise<string> {
  const res = await page.request.get(`${API}/auth/me`);
  expect(res.ok()).toBe(true);
  const me = (await res.json()) as {
    memberships: Array<{ companyId: string; companyName: string }>;
  };
  const membership = me.memberships.find((m) => m.companyName === companyName);
  expect(membership).toBeTruthy();
  return membership!.companyId;
}

async function membershipIdOf(page: Page, companyId: string, email: string): Promise<string> {
  const res = await page.request.get(`${API}/companies/${companyId}/members`);
  expect(res.ok()).toBe(true);
  const members = (await res.json()) as Array<{ membershipId: string; email: string }>;
  const member = members.find((m) => m.email === email);
  expect(member).toBeTruthy();
  return member!.membershipId;
}

async function propertyIdOf(page: Page, companyId: string): Promise<string> {
  const res = await page.request.get(`${API}/companies/${companyId}/properties`);
  expect(res.ok()).toBe(true);
  const properties = (await res.json()) as Array<{ id: string }>;
  if (properties.length > 0) return properties[0].id;
  // Spaces like Taller Carla start without properties (seed): create one.
  const created = await page.request.post(`${API}/companies/${companyId}/properties`, {
    data: { addressLine: `Calle E2E ${uniqueSuffix()}`, city: 'Madrid', state: 'ES' },
  });
  expect(created.ok()).toBe(true);
  const property = (await created.json()) as { id: string };
  return property.id;
}

/** Creates an order + one job + the job's assignment, via the API as the caller. */
async function createAssignedOrder(
  page: Page,
  companyId: string,
  assigneeMembershipId: string,
  title: string,
): Promise<void> {
  const orderRes = await page.request.post(`${API}/companies/${companyId}/orders`, {
    data: {
      propertyId: await propertyIdOf(page, companyId),
      title,
      description: 'Orden creada por el e2e de F2.',
    },
  });
  expect(orderRes.ok()).toBe(true);
  const order = (await orderRes.json()) as { id: string };

  const jobRes = await page.request.post(
    `${API}/companies/${companyId}/orders/${order.id}/jobs`,
    { data: { title: `Trabajo ${title}`, description: 'Trabajo creado por el e2e de F2.' } },
  );
  expect(jobRes.ok()).toBe(true);
  const job = (await jobRes.json()) as { id: string };

  const assignRes = await page.request.post(
    `${API}/companies/${companyId}/orders/${order.id}/assignments`,
    { data: { jobId: job.id, assigneeMembershipId } },
  );
  expect(assignRes.ok()).toBe(true);
}

test('dashboard per space: type label, open orders with BE-2 R5 labels, empty pending (AC-F2.1/AC-F2.2)', async ({
  page,
}) => {
  await openDashboardAsAna(page);

  // Header: active space + participant type of §2.1–§2.3 (F1-D2 text).
  await expect(page.getByText('Administradora de propiedades')).toBeVisible();

  const openCard = page.getByRole('region', { name: 'Órdenes abiertas' });
  // Seed: O_2 open ("Enviada") and O_3 in_progress ("En curso").
  const seedOpenRow = openCard.locator('li').filter({ hasText: 'Pintar sala antes del alquiler' });
  await expect(seedOpenRow).toBeVisible();
  await expect(seedOpenRow.getByText('Enviada')).toBeVisible();
  const seedProgressRow = openCard.locator('li').filter({ hasText: 'Reparar aire acondicionado' });
  await expect(seedProgressRow).toBeVisible();
  await expect(seedProgressRow.getByText('En curso')).toBeVisible();
  // `requested` and `completed` never render (F2-D1, §20.1).
  await expect(openCard.getByText('Fuga de agua en cocina')).toHaveCount(0);
  await expect(openCard.getByText('Instalación de ventilador de techo')).toHaveCount(0);

  // Ana has no pending assignments of her own (A_2 belongs to bob).
  await expect(
    page.getByText('No tienes asignaciones pendientes de respuesta.'),
  ).toBeVisible();

  // Notifications of the active space render (N_1, §2.4).
  await expect(
    page.getByRole('region', { name: 'Notificaciones' }).getByText('Nueva solicitud de trabajo'),
  ).toBeVisible();
});

test('accept end-to-end: row leaves, order stays open, assigner gets the notification (AC-F2.4)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const suffix = uniqueSuffix();
  const orderTitle = `Orden aceptar ${suffix}`;

  // Ana assigns a new job to bob through the real API.
  await openDashboardAsAna(page);
  const gestionId = await companyIdOf(page, 'Gestión Demo');
  const bobMembership = await membershipIdOf(page, gestionId, 'bob@demo.test');
  await createAssignedOrder(page, gestionId, bobMembership, orderTitle);

  // Bob: single membership → auto-enters the shell (F0-D1) and accepts.
  await login(page, 'bob@demo.test');
  await expect(page).toHaveURL(/\/app$/);
  const pendingCard = page.getByRole('region', { name: 'Pendientes de aceptar' });
  await expect(pendingCard.getByText(orderTitle, { exact: true })).toBeVisible();

  await pendingCard.getByRole('button', { name: `Aceptar: ${orderTitle}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('¿Aceptar este trabajo?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Aceptar trabajo' }).click();

  // The row leaves; the order stays in the open card (§20.2/§20.3).
  await expect(pendingCard.getByText(orderTitle)).toHaveCount(0);
  const openCard = page.getByRole('region', { name: 'Órdenes abiertas' });
  await expect(openCard.getByText(orderTitle, { exact: true })).toBeVisible();

  // Ana gets the in-app `assignment_accepted` and marks it read (§14.1).
  await login(page, 'ana@demo.test');
  await expect(page.getByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeVisible();
  const notifCard = page.getByRole('region', { name: 'Notificaciones' });
  const notifItem = notifCard.locator('li').filter({ hasText: orderTitle });
  await expect(notifItem).toBeVisible();
  await expect(notifItem.getByText('Asignación aceptada')).toBeVisible();

  const badge = notifCard.getByText(/\d+ notificaciones? sin leer/);
  const badgeCount = async () =>
    (await badge.count()) > 0
      ? parseInt((await badge.textContent())?.match(/\d+/)?.[0] ?? '0', 10)
      : 0;
  const before = await badgeCount();
  await notifItem.getByRole('button', { name: 'Marcar como leída' }).click();
  await expect(notifItem.getByText('Leída')).toBeVisible();
  // The badge drops (0 when no unread remains: AC-F2.8, proven in unit too).
  // Polled: the refetch can drop the badge to zero between count and text.
  await expect.poll(badgeCount).toBeLessThan(before);
});

test('reject with reason: row leaves and the assigner gets the reason in the body (AC-F2.5)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const suffix = uniqueSuffix();
  const orderTitle = `Orden rechazar ${suffix}`;
  const reason = `Motivo e2e ${suffix}`;

  await openDashboardAsAna(page);
  const gestionId = await companyIdOf(page, 'Gestión Demo');
  const bobMembership = await membershipIdOf(page, gestionId, 'bob@demo.test');
  await createAssignedOrder(page, gestionId, bobMembership, orderTitle);

  await login(page, 'bob@demo.test');
  await expect(page).toHaveURL(/\/app$/);
  const pendingCard = page.getByRole('region', { name: 'Pendientes de aceptar' });
  await expect(pendingCard.getByText(orderTitle, { exact: true })).toBeVisible();

  await pendingCard.getByRole('button', { name: `Rechazar: ${orderTitle}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('El trabajo queda libre para una nueva asignación.')).toBeVisible();
  await dialog.getByRole('textbox').fill(reason);
  await dialog.getByRole('button', { name: 'Rechazar trabajo' }).click();

  await expect(pendingCard.getByText(orderTitle)).toHaveCount(0);

  // Ana receives `assignment_rejected` carrying the reason (§5.6).
  await login(page, 'ana@demo.test');
  await expect(page.getByRole('heading', { name: 'Gestión Demo', level: 1 })).toBeVisible();
  const notifCard = page.getByRole('region', { name: 'Notificaciones' });
  const notifItem = notifCard.locator('li').filter({ hasText: reason });
  await expect(notifItem.getByText('Asignación rechazada')).toBeVisible();
  await expect(notifItem.getByText(`Motivo: ${reason}`)).toBeVisible();
});

test('space separation (§2.4): a Taller Carla assignment only appears in that space (AC-F2.7)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const suffix = uniqueSuffix();
  const orderTitle = `Orden taller ${suffix}`;

  // Carla (owner of Taller Carla) assigns a job to ana in her space.
  await login(page, 'carla@demo.test');
  await expect(page).toHaveURL(/\/app$/);
  const tallerId = await companyIdOf(page, 'Taller Carla');
  const anaMembership = await membershipIdOf(page, tallerId, 'ana@demo.test');
  await createAssignedOrder(page, tallerId, anaMembership, orderTitle);

  // Ana in Gestión Demo: the row of the other space never renders (§2.4).
  await openDashboardAsAna(page);
  await expect(
    page.getByRole('region', { name: 'Pendientes de aceptar' }).getByText(orderTitle),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Órdenes abiertas' }).getByText(orderTitle),
  ).toHaveCount(0);

  // Switching to Taller Carla re-filters: the row is there.
  await page.getByRole('combobox', { name: 'Cambiar de espacio' }).click();
  await page.getByRole('option', { name: 'Taller Carla' }).click();
  await expect(page.getByRole('heading', { name: 'Taller Carla', level: 1 })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Pendientes de aceptar' })
      .getByText(orderTitle, { exact: true }),
  ).toBeVisible();
});
