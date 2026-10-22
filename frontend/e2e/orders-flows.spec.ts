import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * F4 order flows (spec F4 §8) against the real API — the UI never
 * substitutes the server check (§16.1):
 * 1. full cycle (ana + bob): urgent order → assign → accept/start/progress/
 *    complete → close → «Cerrada» (AC-F4.3/AC-F4.4/AC-F4.7);
 * 2. reject with reason → reassign → revoke, history keeps every row
 *    (AC-F4.5);
 * 3. cancel with the required reason; a started job hides the button and the
 *    API cancel answers 409 (AC-F4.8, server rules);
 * 4. incomplete → resume → complete; second job not realized → close of the
 *    compound order (AC-F4.6/AC-F4.7);
 * 5. carla (`own_business`) adds and assigns a second job; the F3 portal
 *    request converts into «Enviada» with its first job (AC-F4.9);
 * 6. cross-space assignee sees access + his jobs only; revoke → 404 in API
 *    and screen (AC-F4.10); «Crear orden» tile and assignment notification
 *    navigation (AC-F4.11).
 *
 * Every flow creates uniquely-titled data per run (the two viewport projects
 * and CI retries run in parallel) and never mutates the seeded data.
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
  // The session cookie must exist before any API helper runs (`page.request`
  // shares the context cookies): wait until the app leaves /login — a failed
  // login never navigates, so a timeout here means bad credentials.
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')),
    page.getByRole('button', { name: 'Iniciar sesión' }).click(),
  ]);
}

/**
 * Picks the space when the picker shows (ana, two memberships, F0-D1). With a
 * single membership `activeId` resolves without the picker — no waiting on
 * timers: the decision comes from `me`. Only call this on the *first* login of
 * a test: `activeId` is persisted in localStorage for the whole test run.
 */
async function pickSpace(page: Page, companyName: string) {
  const me = await page.request.get(`${API}/auth/me`);
  expect(me.ok(), 'login must leave an authenticated session').toBe(true);
  const { memberships } = (await me.json()) as { memberships: unknown[] };
  if (memberships.length <= 1) return; // auto-selected (F0-D1)
  const picker = page.getByRole('heading', { name: 'Elige un espacio' });
  await expect(picker).toBeVisible();
  await page.getByRole('button', { name: companyName }).click();
  await expect(picker).toBeHidden();
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

/** First property of the space (with its address), or one created via API. */
async function firstProperty(page: Page, companyId: string): Promise<{ id: string; addressLine: string }> {
  const res = await page.request.get(`${API}/companies/${companyId}/properties`);
  expect(res.ok()).toBe(true);
  const properties = (await res.json()) as Array<{ id: string; addressLine: string }>;
  if (properties.length > 0) return properties[0];
  const created = await page.request.post(`${API}/companies/${companyId}/properties`, {
    data: { addressLine: `Calle F4 E2E ${uniqueSuffix()}`, city: 'Madrid', state: 'ES' },
  });
  expect(created.ok()).toBe(true);
  return (await created.json()) as { id: string; addressLine: string };
}

/** Membership id of a member of the space (assign picker, §5.6). */
async function memberMembershipId(page: Page, companyId: string, email: string): Promise<string> {
  const res = await page.request.get(`${API}/companies/${companyId}/members`);
  expect(res.ok()).toBe(true);
  const members = (await res.json()) as Array<{ membershipId: string; email: string }>;
  const member = members.find((m) => m.email === email);
  expect(member).toBeTruthy();
  return member!.membershipId;
}

interface CreatedOrder {
  orderId: string;
  jobId: string;
}

/** Order with its single first job (`POST /orders`, §5.1). */
async function createOrderApi(
  page: Page,
  companyId: string,
  data: Record<string, unknown>,
): Promise<CreatedOrder> {
  const res = await page.request.post(`${API}/companies/${companyId}/orders`, { data });
  expect(res.ok()).toBe(true);
  const order = (await res.json()) as { id: string; jobs: Array<{ id: string }> };
  return { orderId: order.id, jobId: order.jobs[0].id };
}

/** Proposes the job (§5.6): returns the new assignment id. */
async function assignJobApi(
  page: Page,
  companyId: string,
  orderId: string,
  jobId: string,
  assigneeMembershipId: string,
): Promise<string> {
  const res = await page.request.post(`${API}/companies/${companyId}/orders/${orderId}/assignments`, {
    data: { jobId, assigneeMembershipId },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Limited-link mailbox (pattern F1 / F3): the console transport appends each
// email to EMAIL_OUTBOX_FILE (JSONL). Without the mailbox the token test
// skips (F0-D5); the rest still run.
// ---------------------------------------------------------------------------

const OUTBOX_FILE =
  process.env.E2E_OUTBOX_FILE ?? path.resolve(process.cwd(), '..', 'e2e-outbox.jsonl');
const outboxAvailable =
  process.env.E2E_OUTBOX_FILE !== undefined || existsSync(OUTBOX_FILE);
const noMailbox =
  'backend test mailbox (EMAIL_OUTBOX_FILE) not available; run the e2e backend with EMAIL_TRANSPORT=console to enable';

const LIMITED_LINK = /https?:\/\/\S*\/limited\/([A-Za-z0-9_-]+)/;

interface OutboxEntry {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

function outboxSize(): number {
  return existsSync(OUTBOX_FILE) ? statSync(OUTBOX_FILE).size : 0;
}

/** Polls the mailbox until the email to `to` contains a `/limited/` link. */
async function waitForOutboxToken(to: string, fromOffset: number): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (existsSync(OUTBOX_FILE)) {
      const chunk = readFileSync(OUTBOX_FILE).subarray(fromOffset).toString('utf8');
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        let entry: OutboxEntry;
        try {
          entry = JSON.parse(line) as OutboxEntry;
        } catch {
          continue; // torn line (backend writing right now): keep polling
        }
        if (entry.to !== to) continue;
        const match = entry.text.match(LIMITED_LINK);
        if (match) return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No /limited/ email for ${to} found in ${OUTBOX_FILE}`);
}

test.describe('F4 orders flows (spec F4 §8)', () => {
  // Several logins + transitions per flow: give them room on slow CI runners.
  test.beforeEach(() => {
    test.setTimeout(90_000);
  });

  test('1. ciclo completo: urgente → asignar → trabajar → cerrar (AC-F4.3/AC-F4.4/AC-F4.7)', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const title = `Orden ciclo E2E ${suffix}`;

    await login(page, 'ana@demo.test');
    await pickSpace(page, 'Gestión Demo');
    const companyId = await companyIdOf(page, 'Gestión Demo');
    const property = await firstProperty(page, companyId);

    // Create through the form with the urgent flag (AC-F4.3).
    await page.goto('/app/orders/new');
    await page.getByRole('combobox', { name: 'Propiedad', exact: true }).click();
    await page.getByRole('option', { name: property.addressLine, exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill(title);
    await page
      .getByLabel('Descripción', { exact: true })
      .fill('La entrada hace ruido extraño desde el lunes.');
    await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check();
    await page.getByRole('button', { name: 'Crear orden', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/orders\/[0-9a-f-]+$/);
    const orderId = page.url().split('/').pop()!;

    // 201 → open order, urgent and a first job mirroring title/description.
    await expect(page.getByText('Urgente', { exact: true })).toBeVisible();
    await expect(page.getByText('Enviada', { exact: true })).toBeVisible();
    const firstJob = page.getByRole('article', { name: `1. ${title}`, exact: true });
    await expect(firstJob.getByText('Pendiente', { exact: true })).toBeVisible();

    // The owner proposes the job to bob (§5.6) → a «Propuesta» joins the log.
    await page.getByRole('button', { name: 'Asignar', exact: true }).click();
    const assignDialog = page.getByRole('dialog');
    await assignDialog.getByRole('combobox', { name: 'Asignar a', exact: true }).click();
    await page.getByRole('option', { name: 'Bob Contratista', exact: true }).click();
    await assignDialog.getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(page.getByText('Propuesta', { exact: true })).toBeVisible();
    await expect(page.getByText('Asignado a: Bob Contratista')).toBeVisible();

    // Bob runs his life-cycle (AC-F4.4). As a member of the owning space he
    // also sees its decisions (spec F4 §2: inside the responsible company the
    // contract does not distinguish roles); what matters here are the
    // assignee actions he is about to drive.
    await login(page, 'bob@demo.test');
    await page.goto(`/app/orders/${orderId}`);
    await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rechazar', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
    const acceptDialog = page.getByRole('dialog');
    await acceptDialog.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(firstJob.getByText('Aceptado', { exact: true })).toBeVisible();
    await expect(firstJob.getByText('En curso', { exact: true })).toHaveCount(0); // accepted ≠ started

    await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
    await expect(firstJob.getByText('En curso', { exact: true })).toBeVisible();
    // The order badge and the job badge both read «En curso» (§20.1–§20.2).
    await expect(page.getByText('En curso', { exact: true })).toHaveCount(2);

    // Progress (§6.1): the dialog stores the event — 201, no banner. The
    // event is read back with the F5 history (spec F4 §2.3.4 note).
    const progressResponse = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('/progress'),
    );
    await page.getByRole('button', { name: 'Registrar avance', exact: true }).click();
    const progressDialog = page.getByRole('dialog');
    await progressDialog
      .getByLabel('Avance', { exact: true })
      .fill('Ya abrí el panel; el ruido viene del rodamiento.');
    await progressDialog.getByRole('button', { name: 'Registrar', exact: true }).click();
    expect((await progressResponse).status()).toBe(201);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('La acción no se pudo completar.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Completar', exact: true }).click();
    const completeDialog = page.getByRole('dialog');
    await completeDialog.getByRole('button', { name: 'Completar', exact: true }).click();
    await expect(firstJob.getByText('Completado', { exact: true })).toBeVisible();

    // Ana closes the order (§6.4) → «Cerrada» with its date (AC-F4.7).
    await login(page, 'ana@demo.test');
    await page.goto(`/app/orders/${orderId}`);
    await page.getByRole('button', { name: 'Cerrar orden', exact: true }).click();
    const closeDialog = page.getByRole('dialog');
    await closeDialog.getByRole('button', { name: 'Cerrar orden', exact: true }).click();
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    await expect(page.getByText(/Cerrada el/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar orden', exact: true })).toHaveCount(0);
  });

  test('2. rechaza con motivo, reasigna y revoca: el historial conserva todo (AC-F4.5)', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const reason = 'Estoy de viaje esta semana.';

    await login(page, 'ana@demo.test');
    await pickSpace(page, 'Gestión Demo');
    const companyId = await companyIdOf(page, 'Gestión Demo');
    const property = await firstProperty(page, companyId);
    const created = await createOrderApi(page, companyId, {
      propertyId: property.id,
      title: `Orden rechazo E2E ${suffix}`,
      description: 'Rechazo y reasignación del flujo F4.',
    });
    const bobMembershipId = await memberMembershipId(page, companyId, 'bob@demo.test');
    await assignJobApi(page, companyId, created.orderId, created.jobId, bobMembershipId);

    // Bob rejects with the optional reason → job back to «Pendiente» (§5.6).
    await login(page, 'bob@demo.test');
    await page.goto(`/app/orders/${created.orderId}`);
    await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
    const rejectDialog = page.getByRole('dialog');
    await rejectDialog.getByLabel('Motivo (opcional)', { exact: true }).fill(reason);
    await rejectDialog.getByRole('button', { name: 'Rechazar', exact: true }).click();
    await expect(page.getByText('Pendiente', { exact: true })).toBeVisible();
    await expect(page.getByText(`Motivo: ${reason}`)).toBeVisible();

    // Ana proposes again and then reassigns (§5.7): previous → Revocada.
    await login(page, 'ana@demo.test');
    await page.goto(`/app/orders/${created.orderId}`);
    const history = page.getByRole('region', { name: 'Asignaciones', exact: true });
    await expect(history.getByText('Rechazada', { exact: true })).toHaveCount(1);

    await page.getByRole('button', { name: 'Asignar', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Asignar a', exact: true }).click();
    await page.getByRole('option', { name: 'Bob Contratista', exact: true }).click();
    await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(history.getByText('Propuesta', { exact: true })).toHaveCount(1);

    await page.getByRole('button', { name: 'Reasignar', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Asignar a', exact: true }).click();
    await page.getByRole('option', { name: 'Ana Admin', exact: true }).click();
    await dialog.getByRole('button', { name: 'Reasignar', exact: true }).click();
    await expect(history.getByText('Rechazada', { exact: true })).toHaveCount(1);
    await expect(history.getByText('Revocada', { exact: true })).toHaveCount(1);
    await expect(history.getByText('Propuesta', { exact: true })).toHaveCount(1);

    // Revoking the live proposal leaves no active assignment behind (§20.3).
    await page.getByRole('button', { name: 'Revocar', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Revocar', exact: true }).click();
    await expect(history.getByText('Revocada', { exact: true })).toHaveCount(2);
    await expect(history.getByText('Propuesta', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Asignar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reasignar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revocar', exact: true })).toHaveCount(0);
    await expect(page.getByText('Pendiente', { exact: true })).toBeVisible();
  });

  test('3. cancelar con motivo obligatorio; trabajo iniciado → API 409 (AC-F4.8)', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const cancelReason = 'El inquilino lo arregló con otro gremio.';

    await login(page, 'ana@demo.test');
    await pickSpace(page, 'Gestión Demo');
    const companyId = await companyIdOf(page, 'Gestión Demo');
    const property = await firstProperty(page, companyId);

    // A fresh open order cancels with the required reason (§20.1).
    const first = await createOrderApi(page, companyId, {
      propertyId: property.id,
      title: `Orden cancel E2E ${suffix}`,
      description: 'Se resuelve por otro canal.',
    });
    await page.goto(`/app/orders/${first.orderId}`);
    await page.getByRole('button', { name: 'Cancelar orden', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancelar orden', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Este campo es obligatorio.');
    await dialog.getByLabel('Motivo', { exact: true }).fill(cancelReason);
    await dialog.getByRole('button', { name: 'Cancelar orden', exact: true }).click();
    await expect(page.getByText('Cancelada', { exact: true })).toBeVisible();
    await expect(page.getByText('Motivo de cancelación')).toBeVisible();
    await expect(page.getByText(cancelReason)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar orden', exact: true })).toHaveCount(0);

    // A started job hides the button and the API answers 409 (server rules).
    const started = await createOrderApi(page, companyId, {
      propertyId: property.id,
      title: `Orden iniciada E2E ${suffix}`,
      description: 'Trabajo ya en curso.',
    });
    const bobMembershipId = await memberMembershipId(page, companyId, 'bob@demo.test');
    const assignmentId = await assignJobApi(
      page,
      companyId,
      started.orderId,
      started.jobId,
      bobMembershipId,
    );

    // Bob (the assignee) accepts and starts the job (§5.6/§6.1).
    await login(page, 'bob@demo.test');
    expect(
      (
        await page.request.post(`${API}/companies/${companyId}/assignments/${assignmentId}/accept`, {
          data: {},
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await page.request.post(`${API}/companies/${companyId}/jobs/${started.jobId}/start`, {
        data: {},
      })).ok(),
    ).toBe(true);

    // §20.1 state gate: a started job hides the cancel decision (bob also
    // sees the owning space's decisions, spec F4 §2); the API answers 409.
    await page.goto(`/app/orders/${started.orderId}`);
    await expect(page.getByRole('button', { name: 'Cancelar orden', exact: true })).toHaveCount(0);
    const conflict = await page.request.post(
      `${API}/companies/${companyId}/orders/${started.orderId}/cancel`,
      { data: { reason: 'No debería cancelarse.' } },
    );
    expect(conflict.status()).toBe(409);
  });

  test('4. incompleto → reanudar → completar; segundo trabajo no concretado → cerrar', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();

    await login(page, 'ana@demo.test');
    await pickSpace(page, 'Gestión Demo');
    const companyId = await companyIdOf(page, 'Gestión Demo');
    const property = await firstProperty(page, companyId);

    const created = await createOrderApi(page, companyId, {
      propertyId: property.id,
      title: `Orden incompleta E2E ${suffix}`,
      description: 'Ciclo incompleto, reanudación y cierre compuesto.',
    });
    // The job is bob's: the assignee reports incomplete/complete (§6.1–§6.2)
    // and the owner resumes it (§20.2). Ana never carries a pending
    // assignment — the F2 portada asserts she has none (dashboard-flows).
    const bobMembershipId = await memberMembershipId(page, companyId, 'bob@demo.test');
    const assignmentId = await assignJobApi(
      page,
      companyId,
      created.orderId,
      created.jobId,
      bobMembershipId,
    );

    await login(page, 'bob@demo.test');
    expect(
      (
        await page.request.post(`${API}/companies/${companyId}/assignments/${assignmentId}/accept`, {
          data: {},
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await page.request.post(`${API}/companies/${companyId}/jobs/${created.jobId}/start`, {
        data: {},
      })).ok(),
    ).toBe(true);

    await page.goto(`/app/orders/${created.orderId}`);
    const job1 = page.getByRole('article', { name: `1. Orden incompleta E2E ${suffix}`, exact: true });
    await expect(job1.getByText('En curso', { exact: true })).toBeVisible();

    // incomplete with reason → «Incompleto» (§6.2)
    await page.getByRole('button', { name: 'Informar incompleto', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Motivo', { exact: true }).fill('Falta una pieza del proveedor.');
    await dialog.getByRole('button', { name: 'Marcar incompleto', exact: true }).click();
    await expect(job1.getByText('Incompleto', { exact: true })).toBeVisible();

    // the owner resumes with the same professional → «En curso» (§20.2)
    await login(page, 'ana@demo.test');
    await page.goto(`/app/orders/${created.orderId}`);
    await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
    await expect(job1.getByText('En curso', { exact: true })).toBeVisible();

    // …and the assignee completes it (§6.1)
    await login(page, 'bob@demo.test');
    await page.goto(`/app/orders/${created.orderId}`);
    await page.getByRole('button', { name: 'Completar', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
    await expect(job1.getByText('Completado', { exact: true })).toBeVisible();

    // Compound: the owner adds a second job (§5.5)…
    await login(page, 'ana@demo.test');
    await page.goto(`/app/orders/${created.orderId}`);
    const job2Title = `Trabajo extra E2E ${suffix}`;
    await page.getByRole('button', { name: 'Agregar trabajo', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título del trabajo', { exact: true }).fill(job2Title);
    await dialog.getByLabel('Descripción del trabajo', { exact: true }).fill('Revisar también el motor.');
    await dialog.getByRole('button', { name: 'Agregar trabajo', exact: true }).click();
    const job2 = page.getByRole('article', { name: `2. ${job2Title}`, exact: true });
    await expect(job2).toBeVisible();

    // …propose it to bob and mark it not realized (§6.3, AC-F4.6)
    await job2.getByRole('button', { name: 'Asignar', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Asignar a', exact: true }).click();
    await page.getByRole('option', { name: 'Bob Contratista', exact: true }).click();
    await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(job2.getByText('Propuesta', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'No pudo concretarse', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Motivo', { exact: true }).fill('El proveedor nunca envió la pieza.');
    await dialog.getByRole('button', { name: 'Marcar como no concretado', exact: true }).click();
    await expect(job2.getByText('No pudo concretarse', { exact: true })).toBeVisible();
    await expect(job2.getByText('Revocada', { exact: true })).toBeVisible(); // active assignment revoked

    // Every job terminal → close the compound order (§6.4).
    await page.getByRole('button', { name: 'Cerrar orden', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cerrar orden', exact: true }).click();
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    await expect(job1.getByText('Completado', { exact: true })).toBeVisible();
    await expect(job2.getByText('No pudo concretarse', { exact: true })).toBeVisible();
  });

  test('5a. carla (own_business): agrega un trabajo y lo asigna (§5.5)', async ({ page }) => {
    const suffix = uniqueSuffix();
    const title = `Orden compuesta carla E2E ${suffix}`;
    const job2Title = `Trabajo extra carla E2E ${suffix}`;

    await login(page, 'carla@demo.test');
    const companyId = await companyIdOf(page, 'Taller Carla');
    const property = await firstProperty(page, companyId);

    await page.goto('/app/orders/new');
    // own_business spaces bill their own clients (F4 §4.1).
    await expect(page.getByLabel('Cliente propio (opcional)', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Propiedad', exact: true }).click();
    await page.getByRole('option', { name: property.addressLine, exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill(title);
    await page
      .getByLabel('Descripción', { exact: true })
      .fill('Ruido en la compuerta del jardín.');
    await page.getByRole('button', { name: 'Crear orden', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/orders\/[0-9a-f-]+$/);

    // Compound order: a second job joins the first one (§5.5).
    await page.getByRole('button', { name: 'Agregar trabajo', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título del trabajo', { exact: true }).fill(job2Title);
    await dialog.getByLabel('Descripción del trabajo', { exact: true }).fill('Revisar también el motor.');
    await dialog.getByRole('button', { name: 'Agregar trabajo', exact: true }).click();
    const job2 = page.getByRole('article', { name: `2. ${job2Title}`, exact: true });
    await expect(job2).toBeVisible();

    // The new job is proposed to the space's professional (§5.6).
    await job2.getByRole('button', { name: 'Asignar', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Asignar a', exact: true }).click();
    await page.getByRole('option', { name: 'Carla Dueña', exact: true }).click();
    await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(job2.getByText('Propuesta', { exact: true })).toBeVisible();
  });

  test('5b. pedido del portal F3 → «Convertir y enviar» → Enviada con primer trabajo (AC-F4.9)', async ({
    page,
  }) => {
    test.skip(!outboxAvailable, noMailbox);
    const suffix = uniqueSuffix();
    const address = `Vivienda F4 E2E ${suffix}`;
    const tenantEmail = `inquilino-f4-${suffix}@demo.test`;
    const requestTitle = `Pedido F4 E2E ${suffix}`;

    await login(page, 'ana@demo.test');
    await pickSpace(page, 'Gestión Demo');
    const companyId = await companyIdOf(page, 'Gestión Demo');

    // Property + tenant: the limited link arrives by email (F3 pattern).
    const propertyRes = await page.request.post(`${API}/companies/${companyId}/properties`, {
      // occupied: the server only accepts tenants on an occupied property.
      data: { addressLine: address, city: 'Springfield', state: 'IL', occupancy: 'occupied' },
    });
    expect(propertyRes.ok()).toBe(true);
    const propertyId = ((await propertyRes.json()) as { id: string }).id;
    // One order on the housing so the portal list renders (§4.3, F3 pattern).
    const seedOrder = await page.request.post(`${API}/companies/${companyId}/orders`, {
      data: { propertyId, title: `Orden vivienda F4 ${suffix}`, description: 'Listado del portal.' },
    });
    expect(seedOrder.ok()).toBe(true);

    const offsetBefore = outboxSize();
    const tenantRes = await page.request.post(
      `${API}/companies/${companyId}/properties/${propertyId}/tenants`,
      { data: { kind: 'tenant', name: `Inquilino F4 ${suffix}`, phones: ['555-0001'], email: tenantEmail } },
    );
    expect(tenantRes.ok()).toBe(true);
    const token = await waitForOutboxToken(tenantEmail, offsetBefore);

    // The tenant requests the work from his portal (BE-2 R5 → «Borrador»).
    await page.goto(`/limited/${token}`);
    await page.getByRole('combobox', { name: 'Propiedad', exact: true }).click();
    // Portal option label: "{{address}} ({{city}})" (limited:request.propertyOption).
    await page.getByRole('option', { name: `${address} (Springfield)`, exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill(requestTitle);
    await page
      .getByLabel('Descripción', { exact: true })
      .fill('La ducha no calienta desde el martes.');
    await page.getByRole('button', { name: 'Enviar pedido', exact: true }).click();
    await expect(page.getByText(/Pedido registrado/)).toBeVisible();

    // The owner converts the request into a sent order with its first job.
    await page.goto('/app/orders');
    const row = page.locator('li').filter({ hasText: requestTitle }).first();
    await expect(row.getByText('Borrador', { exact: true })).toBeVisible();
    await row.getByRole('link', { name: `Abrir orden: ${requestTitle}` }).click();
    await expect(page).toHaveURL(/\/app\/orders\/[0-9a-f-]+$/);
    await expect(
      page.getByRole('article', { name: `1. ${requestTitle}`, exact: true }),
    ).toHaveCount(0); // no job before converting
    await page.getByRole('button', { name: 'Convertir y enviar', exact: true }).click();
    await expect(page.getByText('Enviada', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('article', { name: `1. ${requestTitle}`, exact: true }).getByText('Pendiente', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convertir y enviar', exact: true })).toHaveCount(0);
  });

  test('6a. portada: tile «Crear orden» y notificación de asignación (AC-F4.11)', async ({ page }) => {
    const suffix = uniqueSuffix();

    await login(page, 'ana@demo.test');
    await pickSpace(page, 'Gestión Demo');
    const companyId = await companyIdOf(page, 'Gestión Demo');
    const property = await firstProperty(page, companyId);
    const created = await createOrderApi(page, companyId, {
      propertyId: property.id,
      title: `Orden notif E2E ${suffix}`,
      description: 'Notificación enlazada al detalle.',
    });
    const bobMembershipId = await memberMembershipId(page, companyId, 'bob@demo.test');
    await assignJobApi(page, companyId, created.orderId, created.jobId, bobMembershipId);

    // Bob lands on the portada: the «Crear orden» tile opens the form.
    await login(page, 'bob@demo.test');
    await page.goto('/app');
    await page.getByRole('link', { name: 'Crear orden', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/orders\/new$/);
    await page.goBack();
    await expect(page.getByRole('link', { name: 'Crear orden', exact: true })).toBeVisible();

    // The live assignment notification resolves to its order (F4-D6). Prior
    // runs accumulate same-title notifications: the href pins this order's.
    const notification = page
      .locator(`a[href="/app/orders/${created.orderId}"]`)
      .filter({ hasText: 'Nuevo trabajo asignado' });
    await expect(notification).toBeVisible();
    await notification.click();
    await expect(page).toHaveURL(new RegExp(`/app/orders/${created.orderId}`));
  });

  test('6b. asignado externo ve acceso y sus trabajos; revoke → 404 API y pantalla (AC-F4.10)', async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const title = `Orden externa E2E ${suffix}`;
    const entryInstructions = 'Timbre 3B, dejar el casco en recepción.';

    // Ana bridges the spaces: she owns Gestión Demo and belongs to Taller
    // Carla, so she can propose bob's Gestión membership on a Taller Carla
    // order (the contract admits any active membership, §5.6).
    await login(page, 'ana@demo.test');
    await pickSpace(page, 'Gestión Demo');
    const gestionId = await companyIdOf(page, 'Gestión Demo');
    const tallerId = await companyIdOf(page, 'Taller Carla');
    const bobMembershipId = await memberMembershipId(page, gestionId, 'bob@demo.test');
    const property = await firstProperty(page, tallerId);
    const created = await createOrderApi(page, tallerId, {
      propertyId: property.id,
      title,
      description: 'Asignación cruzada del flujo de visibilidad de F4.',
      accessLockbox: '4321',
      accessCommunityCode: 'Torre Norte',
      accessEntryInstructions: entryInstructions,
    });
    const assignmentId = await assignJobApi(
      page,
      tallerId,
      created.orderId,
      created.jobId,
      bobMembershipId,
    );

    // bob sees it from his own space (cross-space assignment, §2.12).
    await login(page, 'bob@demo.test');
    await page.goto('/app/orders');
    const row = page.getByRole('link', { name: `Abrir orden: ${title}` });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/app/orders/${created.orderId}`));
    // Access + his job; the responsible decisions are never offered (§2.3).
    await expect(
      page.getByRole('region', { name: 'Datos de acceso de la visita', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(entryInstructions)).toBeVisible();
    await expect(page.getByText('Asignado a: Bob Contratista')).toBeVisible();
    await expect(
      page.getByRole('article', { name: `1. ${title}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar orden', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar trabajo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cerrar orden', exact: true })).toHaveCount(0);

    // API agrees while the assignment is active (pending counts, §2.1).
    const visible = await page.request.get(
      `${API}/companies/${gestionId}/orders/${created.orderId}`,
    );
    expect(visible.status()).toBe(200);

    // The responsible company revokes (ana, member of Taller Carla)…
    await login(page, 'ana@demo.test');
    const revoked = await page.request.post(
      `${API}/companies/${tallerId}/assignments/${assignmentId}/revoke`,
      { data: {} },
    );
    expect(revoked.ok()).toBe(true);

    // …and the order disappears from API and UI for bob (404 screen, no data).
    await login(page, 'bob@demo.test');
    const gone = await page.request.get(
      `${API}/companies/${gestionId}/orders/${created.orderId}`,
    );
    expect(gone.status()).toBe(404);
    await page.goto(`/app/orders/${created.orderId}`);
    await expect(page.getByRole('heading', { name: 'Orden no encontrada o sin acceso' })).toBeVisible();
    await expect(page.getByText(entryInstructions)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Volver a órdenes' })).toBeVisible();
  });
});
