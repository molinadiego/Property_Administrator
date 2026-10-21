import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * F3 catalog + limited-portal flows (spec F3 §8) against the real API — the
 * UI never substitutes the server check (§16.1):
 * 1. property + tenant with limited link (Gestión Demo, ana) → portal of the
 *    housing: order list + work request → «Borrador» (BE-2 R5);
 * 2. ficha permissions: own_business space reads, PATCH via API → 403;
 * 3. own client end-to-end (carla): register → portal without properties
 *    shows guidance → an order for the relation exposes the property →
 *    the request produces 201 and a «Borrador» row;
 * 4. relations: unique-per-run counterparty space, created and closed by the
 *    owner; bob (member) sees no actions and his API POST → 403;
 * 5. portal invoices (§11.3): emitted invoice shows (section, detail, PDF
 *    download); a draft never lists; another tenant's invoice → 404;
 * 6. invalid token → the invalid-link screen, never a login redirect.
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
 * Picks the space when the picker shows (several memberships, F0-D1). With a
 * single membership `activeId` resolves without the picker — no waiting on
 * timers: the decision comes from `me`.
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

/** First property of the space, or one created via API (any member, §5.1). */
async function propertyIdOf(page: Page, companyId: string): Promise<string> {
  const res = await page.request.get(`${API}/companies/${companyId}/properties`);
  expect(res.ok()).toBe(true);
  const properties = (await res.json()) as Array<{ id: string }>;
  if (properties.length > 0) return properties[0].id;
  const created = await page.request.post(`${API}/companies/${companyId}/properties`, {
    data: { addressLine: `Calle E2E ${uniqueSuffix()}`, city: 'Madrid', state: 'ES' },
  });
  expect(created.ok()).toBe(true);
  return ((await created.json()) as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Limited-link mailbox (pattern F1 / account-flows): the console transport
// appends each email to EMAIL_OUTBOX_FILE (JSONL). Without the mailbox the
// token tests skip (F0-D5); the rest still run.
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

// ---------------------------------------------------------------------------
// API helpers (Etapa 5 client-invoice pattern, backend test/etapa5.e2e-spec.ts)
// ---------------------------------------------------------------------------

interface CreatedOrder {
  orderId: string;
  jobId: string;
}

/** Order on the client relation with one terminal job (assignment accepted). */
async function createTerminalClientOrder(
  page: Page,
  companyId: string,
  data: { propertyId: string; clientRelationshipId: string; title: string },
): Promise<CreatedOrder> {
  const me = await page.request.get(`${API}/auth/me`);
  const { memberships } = (await me.json()) as {
    memberships: Array<{ companyId: string; id: string }>;
  };
  const membershipId = memberships.find((m) => m.companyId === companyId)!.id;

  const created = await page.request.post(`${API}/companies/${companyId}/orders`, {
    data: { ...data, description: 'Orden terminal del flujo e2e de F3.' },
  });
  expect(created.ok()).toBe(true);
  const order = (await created.json()) as { id: string; jobs: Array<{ id: string }> };
  const jobId = order.jobs[0].id;

  const assignment = await page.request.post(
    `${API}/companies/${companyId}/orders/${order.id}/assignments`,
    { data: { jobId, assigneeMembershipId: membershipId } },
  );
  expect(assignment.ok()).toBe(true);
  const assignmentId = ((await assignment.json()) as { id: string }).id;

  expect(
    (
      await page.request.post(`${API}/companies/${companyId}/assignments/${assignmentId}/accept`, {
        data: {},
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await page.request.post(`${API}/companies/${companyId}/jobs/${jobId}/start`, { data: {} })).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`${API}/companies/${companyId}/jobs/${jobId}/complete`, { data: {} })
    ).ok(),
  ).toBe(true);
  return { orderId: order.id, jobId };
}

/** Draft invoice for the order (§11.4: needs a terminal job, D1b). */
async function draftInvoiceOf(page: Page, companyId: string, orderId: string): Promise<string> {
  const res = await page.request.post(`${API}/companies/${companyId}/invoices`, {
    data: { orderId },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Adds the single line and emits the invoice (Etapa 5 D2/D5). */
async function emitInvoice(
  page: Page,
  companyId: string,
  invoiceId: string,
  jobId: string,
): Promise<void> {
  const lines = await page.request.put(`${API}/companies/${companyId}/invoices/${invoiceId}/lines`, {
    data: {
      lines: [
        {
          jobId,
          kind: 'material',
          description: 'Material de prueba',
          amount: '120.00',
          // Not taxable: emission needs a rate for taxable lines (Etapa 7
          // 422) and F3 does not test taxes — works with or without a
          // company default rate (dev seed may predate Etapa 7).
          taxable: false,
        },
      ],
    },
  });
  expect(lines.ok()).toBe(true);
  const emit = await page.request.post(`${API}/companies/${companyId}/invoices/${invoiceId}/emit`, {
    data: {},
  });
  expect(emit.ok()).toBe(true);
}

// ---------------------------------------------------------------------------
// 1. Property + tenant + housing portal (AC-F3.1/AC-F3.6/AC-F3.8)
// ---------------------------------------------------------------------------

test('crea propiedad, agrega inquilino con enlace y usa el portal de su vivienda', async ({
  page,
}) => {
  test.skip(!outboxAvailable, noMailbox);
  const suffix = uniqueSuffix();
  const address = `Av. Portal E2E ${suffix}`;
  const tenantEmail = `inquilino-${suffix}@demo.test`;

  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');

  // Property via UI (AC-F3.1).
  await page.goto('/app/catalogs/properties');
  await page.getByRole('link', { name: 'Nueva propiedad' }).click();
  await page.locator('#property-address').fill(address);
  await page.locator('#property-city').fill('Springfield');
  await page.locator('#property-state').fill('IL');
  // Occupied: a vacant ficha only registers the owner (§4.1), so the tenant
  // step below needs `occupied` — the default is `vacant`.
  await page.locator('#property-occupancy').click();
  await page.getByRole('option', { name: 'Ocupada' }).click();
  await page.getByRole('button', { name: 'Crear propiedad' }).click();
  await expect(page).toHaveURL(/\/app\/catalogs\/properties\/[0-9a-f-]+$/);
  const propertyId = page.url().split('/').pop()!;

  // Tenant with email → the limited link is emailed (AC-F3.6).
  const offsetBeforeTenant = outboxSize();
  await page.getByRole('button', { name: 'Agregar inquilino' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre y apellido').fill(`Inquilino E2E ${suffix}`);
  await dialog.getByLabel(/Teléfonos/).fill('555-0001');
  await dialog.getByLabel(/Correo electrónico/).fill(tenantEmail);
  await dialog.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText(/Enlace de acceso enviado por correo/)).toBeVisible();

  // One order on the housing so the portal list is not empty (§4.3).
  const order = await page.request.post(`${API}/companies/${companyId}/orders`, {
    data: { propertyId, title: `Orden vivienda E2E ${suffix}`, description: 'Flujo F3.' },
  });
  expect(order.ok()).toBe(true);

  // Portal of the housing tenant.
  const token = await waitForOutboxToken(tenantEmail, offsetBeforeTenant);
  await page.goto(`/limited/${token}`);
  await expect(page.getByText(`Orden vivienda E2E ${suffix}`)).toBeVisible();

  // Work request → 201 → the row appears as «Borrador» (BE-2 R5, AC-F3.8).
  await page.getByRole('combobox', { name: 'Propiedad' }).click();
  await page.getByRole('option', { name: new RegExp(escapeRe(address)) }).click();
  await page.getByLabel('Título').fill(`Pedido vivienda E2E ${suffix}`);
  await page.getByLabel('Descripción').fill('Apenas sale agua, ya está mojando el piso.');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText(/Pedido registrado/)).toBeVisible();
  await expect(page.getByText(`Pedido vivienda E2E ${suffix}`)).toBeVisible();
  await expect(page.getByText('Borrador').first()).toBeVisible();
});

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 2. Ficha permissions (AC-F3.4): own_business reads, PATCH → 403 (§16.1)
// ---------------------------------------------------------------------------

test('fuera de property_management la ficha es de solo lectura y el PATCH responde 403', async ({
  page,
}) => {
  await login(page, 'carla@demo.test');
  await pickSpace(page, 'Taller Carla');
  const companyId = await companyIdOf(page, 'Taller Carla');
  const propertyId = await propertyIdOf(page, companyId);

  await page.goto(`/app/catalogs/properties/${propertyId}`);
  await expect(
    page.getByText('Solo la administradora de propiedades edita los datos oficiales de la ficha.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar ficha' })).toHaveCount(0);

  // The server is the authority (matriz #16/#18): the API rejects it too.
  const patch = await page.request.patch(
    `${API}/companies/${companyId}/properties/${propertyId}`,
    { data: { city: 'Sevilla' } },
  );
  expect(patch.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// 3. Own client end-to-end (AC-F3.7/AC-F3.8, F3-D2)
// ---------------------------------------------------------------------------

test('cliente propio: registro, aviso sin propiedades, pedido tras la orden', async ({
  page,
}) => {
  test.skip(!outboxAvailable, noMailbox);
  const suffix = uniqueSuffix();
  const clientEmail = `cliente-${suffix}@demo.test`;

  await login(page, 'carla@demo.test');
  await pickSpace(page, 'Taller Carla');
  const companyId = await companyIdOf(page, 'Taller Carla');

  // Register the client via UI (AC-F3.7).
  const offsetBeforeClient = outboxSize();
  await page.goto('/app/catalogs/clients');
  await page.getByRole('button', { name: 'Registrar cliente' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre y apellido').fill(`Cliente E2E ${suffix}`);
  await dialog.getByLabel(/Correo electrónico/).fill(clientEmail);
  await dialog.getByLabel(/Teléfonos/).fill('555-0200');
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(/Enlace de acceso enviado por correo/)).toBeVisible();
  await expect(page.getByText(`Cliente E2E ${suffix}`)).toBeVisible();

  // Portal without properties → guidance instead of the form (F3-D2, §4.3).
  const token = await waitForOutboxToken(clientEmail, offsetBeforeClient);
  await page.goto(`/limited/${token}`);
  await expect(page.getByText('Sin propiedades vinculadas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar pedido' })).toHaveCount(0);

  // The professional creates an order for that relation on her property:
  // the property now belongs to the client's own orders (F3-D2).
  const propertyId = await propertyIdOf(page, companyId);
  const list = await page.request.get(`${API}/companies/${companyId}/clients`);
  const rows = (await list.json()) as Array<{ name: string; relationshipId: string }>;
  const relation = rows.find((row) => row.name === `Cliente E2E ${suffix}`);
  expect(relation).toBeTruthy();
  const order = await page.request.post(`${API}/companies/${companyId}/orders`, {
    data: {
      propertyId,
      title: `Orden cliente E2E ${suffix}`,
      description: 'Flujo F3 cliente propio.',
      clientRelationshipId: relation!.relationshipId,
    },
  });
  expect(order.ok()).toBe(true);

  // Back to the portal: the property appears and the request lands (AC-F3.8).
  await page.reload();
  await page.getByRole('combobox', { name: 'Propiedad' }).click();
  await page.getByRole('option').first().click();
  await page.getByLabel('Título').fill(`Pedido cliente E2E ${suffix}`);
  await page.getByLabel('Descripción').fill('Trabajo solicitado desde el portal del cliente.');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText(/Pedido registrado/)).toBeVisible();
  await expect(page.getByText(`Pedido cliente E2E ${suffix}`)).toBeVisible();
  await expect(page.getByText('Borrador').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 4. Relations (AC-F3.9): owner creates/closes; member has no actions (§8.6)
// ---------------------------------------------------------------------------

test('relaciones: el propietario crea y cierra; el miembro solo lee', async ({ page }) => {
  const suffix = uniqueSuffix();
  const spaceName = `Contratas E2E ${suffix}`;
  const label = `Obra E2E ${suffix}`;

  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const gestionId = await companyIdOf(page, 'Gestión Demo');

  // Unique counterparty per run (the pair is unique per counterparty, §2.4):
  // a per-run space keeps the parallel viewport projects from colliding.
  const created = await page.request.post(`${API}/companies`, {
    data: { name: spaceName, type: 'contractor' },
  });
  expect(created.ok()).toBe(true);
  const counterpartyId = ((await created.json()) as { id: string }).id;

  await page.goto('/app/catalogs/relations');
  await page.getByRole('button', { name: 'Nueva relación' }).click();
  const dialog = page.getByRole('dialog');
  // The new space is now one of ana's memberships: pick it in the select
  // («Identificador de la empresa» — the policy select is the other combobox).
  await dialog.getByLabel('Identificador de la empresa').click();
  await page.getByRole('option', { name: spaceName }).click();
  await dialog.getByLabel('Nombre comercial (opcional)').fill(label);
  await dialog.getByRole('button', { name: 'Crear relación' }).click();
  await expect(page.getByText('Relación creada.')).toBeVisible();
  await expect(page.getByText(label)).toBeVisible();

  // Close with confirmation → «Cerrada»; a closed relation never reopens (§2.4).
  await page.getByRole('button', { name: `Cerrar relación: ${label}` }).click();
  const closeDialog = page.getByRole('dialog');
  await closeDialog.getByRole('button', { name: 'Cerrar relación' }).click();
  await expect(page.getByText('Relación cerrada.')).toBeVisible();
  const row = page.locator('li', { hasText: label });
  await expect(row.getByText('Cerrada')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Reabrir' })).toHaveCount(0);

  // Bob (member of Gestión Demo): list only; his API POST is rejected (§16.1).
  await login(page, 'bob@demo.test');
  await pickSpace(page, 'Gestión Demo');
  await page.goto('/app/catalogs/relations');
  await expect(
    page.getByText('Solo el propietario del espacio administra las relaciones.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva relación' })).toHaveCount(0);
  const post = await page.request.post(`${API}/companies/${gestionId}/commercial-relations`, {
    data: { counterpartyCompanyId: counterpartyId },
  });
  expect(post.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// 5. Portal invoices (§11.3, AC-F3.11): emitted lists, draft never, PDF,
//    another tenant's invoice → 404.
// ---------------------------------------------------------------------------

test('portal de facturas: emitida con detalle y PDF, borrador oculto, ajena 404', async ({
  page,
}) => {
  test.skip(!outboxAvailable, noMailbox);
  const suffix = uniqueSuffix();
  const clientEmail = `facturas-${suffix}@demo.test`;
  const otherEmail = `otro-${suffix}@demo.test`;

  await login(page, 'carla@demo.test');
  await pickSpace(page, 'Taller Carla');
  const companyId = await companyIdOf(page, 'Taller Carla');
  const propertyId = await propertyIdOf(page, companyId);

  // Client + relation (API: the UI registration is covered by flow 3).
  const offsetBeforeClients = outboxSize();
  const clientRes = await page.request.post(`${API}/companies/${companyId}/clients`, {
    data: { name: `Cliente Facturas E2E ${suffix}`, email: clientEmail, phones: [] },
  });
  expect(clientRes.ok()).toBe(true);
  const client = (await clientRes.json()) as { relationshipId: string };

  // Draft invoice (not emitted) → must never list in the portal (§11.3).
  const draftOrder = await createTerminalClientOrder(page, companyId, {
    propertyId,
    clientRelationshipId: client.relationshipId,
    title: `Orden borrador E2E ${suffix}`,
  });
  const draftId = await draftInvoiceOf(page, companyId, draftOrder.orderId);

  // Emitted invoice → the only one the portal shows.
  const emittedOrder = await createTerminalClientOrder(page, companyId, {
    propertyId,
    clientRelationshipId: client.relationshipId,
    title: `Orden facturada E2E ${suffix}`,
  });
  const emittedId = await draftInvoiceOf(page, companyId, emittedOrder.orderId);
  await emitInvoice(page, companyId, emittedId, emittedOrder.jobId);

  // A second client for the cross-tenant 404 (§11.3 isolation).
  const otherRes = await page.request.post(`${API}/companies/${companyId}/clients`, {
    data: { name: `Otro Cliente E2E ${suffix}`, email: otherEmail, phones: [] },
  });
  expect(otherRes.ok()).toBe(true);

  const token = await waitForOutboxToken(clientEmail, offsetBeforeClients);
  const otherToken = await waitForOutboxToken(otherEmail, offsetBeforeClients);

  await page.goto(`/limited/${token}`);
  const invoiceLink = page.getByRole('link', { name: /Ver factura/ });
  await expect(invoiceLink).toHaveCount(1); // the draft never lists (§11.3)

  // Asking for the draft directly confirms it never existed (404, no data).
  await page.goto(`/limited/${token}/invoices/${draftId}`);
  await expect(page.getByText('Factura no encontrada.')).toBeVisible();

  await page.goto(`/limited/${token}`);
  await page.getByRole('link', { name: /Ver factura/ }).click();

  // Detail: status, totals, the emitted line and the PDF download (AC-F3.11).
  await expect(page.getByRole('heading', { name: /Factura N/ })).toBeVisible();
  await expect(page.getByText('Material de prueba')).toBeVisible();
  await expect(page.getByText('USD 120.00').first()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  // Another tenant asking for this invoice gets 404, never data (§11.3).
  await page.goto(`/limited/${otherToken}/invoices/${emittedId}`);
  await expect(page.getByText('Factura no encontrada.')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. Invalid token → invalid-link screen (AC-F3.10), never /login
// ---------------------------------------------------------------------------

test('token inválido: pantalla de enlace inválido sin login', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/limited/no-existe-xxxxx');
  await expect(page.getByRole('heading', { name: 'Este enlace ya no es válido' })).toBeVisible();
  await expect(page).toHaveURL(/\/limited\/no-existe-xxxxx$/);
});
