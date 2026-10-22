import { expect, test, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';

/**
 * F5 files/history flows (spec F5 §8) against the real API — storage is the
 * dev backend's in-process s3rver (no env extra), the UI never substitutes
 * the server check (§16.1):
 * 1. desktop upload (ana): JPG + PDF to the order → rows → «Descargar» fires
 *    the `download` event with the right name (F5-D7);
 * 2. job evidence (bob): accept/start (F4 pattern) → photo to his job → the
 *    owner sees it; carla (another space) requesting the same fileId → 404;
 * 3. local validation: non-allowlisted type → error without a network
 *    request; the input keeps the `accept` allowlist (F5 §6);
 * 4. owner history: property detail (F3) → «Ver historial» → «Historial
 *    completo» → share with bob (note) → row + filtered Select → revoke;
 * 5. beneficiary: a Taller Carla property shared to bob (cross-space) →
 *    «Compartido contigo» → download; carla revokes → bob's next load shows
 *    the «sin acceso» screen (server scope, §7.2);
 * 6. own_jobs: the same cross-space property with an active assignment and
 *    no share → «Solo tus trabajos» and the foreign jobs absent;
 * 7. mine tab: closed jobs listed → property link → history (server scope:
 *    bob belongs to the owning company → «Historial completo»);
 * 8. space tab: ana → own orders linked (detail + history); no horizontal
 *    scroll and the six-item nav fits;
 * 9. no delete action exists in the order detail nor in the history (DOM).
 *
 * Every flow creates its own property/orders with a unique suffix: the two
 * viewport projects and CI retries run in parallel and never mutate seed.
 */

const API = '/api/v1';

/** Unique per run: parallel projects + CI retries must not share state. */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** RegExp for the `·`-joined address links (addressLine is unique per run). */
function addressRe(addressLine: string): RegExp {
  return new RegExp(addressLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

async function login(page: Page, email: string, password = 'DevDemo123!') {
  // Multi-user flows reuse the page: a lingering session would bounce /login
  // to the active space (F1-D6 guest routes), so always start clean.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  // The session cookie must exist before any API helper runs (`page.request`
  // shares the context cookies): wait until the app leaves /login.
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')),
    page.getByRole('button', { name: 'Iniciar sesión' }).click(),
  ]);
}

/**
 * Picks the space when the picker shows (ana, two memberships, F0-D1). With a
 * single membership `activeId` resolves without the picker — no waiting on
 * timers: the decision comes from `me`.
 */
async function pickSpace(page: Page, companyName: string) {
  const me = await page.request.get(`${API}/auth/me`);
  expect(me.ok(), 'login must leave an authenticated session').toBe(true);
  const { memberships } = (await me.json()) as { memberships: unknown[] };
  if (memberships.length < 2) return;
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

/** Membership id of a member of the space (assign picker, §5.6). */
async function memberMembershipId(page: Page, companyId: string, email: string): Promise<string> {
  const res = await page.request.get(`${API}/companies/${companyId}/members`);
  expect(res.ok()).toBe(true);
  const members = (await res.json()) as Array<{ membershipId: string; email: string }>;
  const member = members.find((m) => m.email === email);
  expect(member).toBeTruthy();
  return member!.membershipId;
}

/** Always a fresh property: shares/orders of one flow never leak into others. */
async function newPropertyApi(page: Page, companyId: string): Promise<{ id: string; addressLine: string }> {
  const res = await page.request.post(`${API}/companies/${companyId}/properties`, {
    data: { addressLine: `Calle F5 E2E ${uniqueSuffix()}`, city: 'Madrid', state: 'ES' },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string; addressLine: string };
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

/** Extra job on an order (§5.3): returns the new job id. */
async function addJobApi(page: Page, companyId: string, orderId: string, title: string): Promise<string> {
  const res = await page.request.post(`${API}/companies/${companyId}/orders/${orderId}/jobs`, {
    data: { title, description: 'E2E F5' },
  });
  expect(res.ok()).toBe(true);
  const job = (await res.json()) as { id: string };
  return job.id;
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

/** Assignee life-cycle over the API (accept → start → complete). */
async function transitionApi(
  page: Page,
  companyId: string,
  path: string,
): Promise<void> {
  const res = await page.request.post(`${API}/companies/${companyId}/${path}`, { data: {} });
  expect(res.ok()).toBe(true);
}

interface E2EFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Multipart upload (etapa-3 §11): `file` + `kind` (F5 §4). */
async function uploadFileApi(
  page: Page,
  companyId: string,
  target: { orderId: string } | { jobId: string },
  file: E2EFile,
): Promise<{ id: string; filename: string }> {
  const url =
    'orderId' in target
      ? `${API}/companies/${companyId}/orders/${target.orderId}/files`
      : `${API}/companies/${companyId}/jobs/${target.jobId}/files`;
  const res = await page.request.post(url, { multipart: { file, kind: 'document' } });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string; filename: string };
}

/** Shares the property to a membership (§7.5): returns the share id. */
async function shareHistoryApi(
  page: Page,
  companyId: string,
  propertyId: string,
  sharedWithMembershipId: string,
): Promise<string> {
  const res = await page.request.post(`${API}/companies/${companyId}/history/shares`, {
    data: { propertyId, sharedWithMembershipId },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

// ---------------------------------------------------------------------------
// 1. Upload + download in the order detail (ana, desktop ≈ PC per §8).
// ---------------------------------------------------------------------------

test('owner uploads a JPG and a PDF to the order and downloads them by name', async ({ page }) => {
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');
  const property = await newPropertyApi(page, companyId);
  const { orderId } = await createOrderApi(page, companyId, {
    propertyId: property.id,
    title: `Orden F5 subida ${uniqueSuffix()}`,
    description: 'E2E F5',
  });
  await page.goto(`/app/orders/${orderId}`);
  const filesCard = page.getByRole('region', { name: 'Archivos' });

  const sfx = uniqueSuffix();
  const jpg = `fachada-${sfx}.jpg`;
  const pdf = `acta-${sfx}.pdf`;
  // One file per pick (the control is single-file, spec F5 §6).
  await filesCard
    .getByLabel('Subir archivo')
    .setInputFiles({ name: jpg, mimeType: 'image/jpeg', buffer: Buffer.from('fake-jpeg') });
  await expect(filesCard.getByText(jpg)).toBeVisible();
  await filesCard
    .getByLabel('Subir archivo')
    .setInputFiles({ name: pdf, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') });
  await expect(filesCard.getByText(pdf)).toBeVisible();

  // F5-D7: blob + a[download] fires the browser download event with the name.
  const downloadPromise = page.waitForEvent('download');
  await filesCard.getByRole('button', { name: `Descargar ${jpg}` }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(jpg);
});

// ---------------------------------------------------------------------------
// 2. Job evidence (bob) + foreign member 404 (server manda, §16.1).
// ---------------------------------------------------------------------------

test('job evidence: the assignee uploads it, the owner sees it, a foreign member gets 404', async ({
  page,
}) => {
  // Heavier than the rest: a full job life-cycle plus three logins — the
  // default 30 s budget is too tight on a loaded machine (local and CI).
  test.setTimeout(60_000);
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');
  const property = await newPropertyApi(page, companyId);
  const bobMembershipId = await memberMembershipId(page, companyId, 'bob@demo.test');
  const { orderId, jobId } = await createOrderApi(page, companyId, {
    propertyId: property.id,
    title: `Orden F5 evidencia ${uniqueSuffix()}`,
    description: 'E2E F5',
  });
  const assignId = await assignJobApi(page, companyId, orderId, jobId, bobMembershipId);

  // Bob accepts + starts (F4 life-cycle) and uploads a photo to his job.
  await login(page, 'bob@demo.test');
  await page.goto(`/app/orders/${orderId}`);
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aceptar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();

  const evidence = page.getByRole('region', { name: 'Evidencias' });
  const photo = `trabajo-${uniqueSuffix()}.jpg`;
  const uploadPromise = page.waitForResponse(
    (res) => res.request().method() === 'POST' && /\/jobs\/[^/]+\/files$/.test(res.url()),
  );
  await evidence
    .getByLabel('Subir archivo')
    .setInputFiles({ name: photo, mimeType: 'image/jpeg', buffer: Buffer.from('fake-jpeg') });
  await expect(evidence.getByText(photo)).toBeVisible();
  const fileId = ((await (await uploadPromise).json()) as { id: string }).id;
  expect(assignId).toBeTruthy();

  // The owner (screen) sees the evidence on her order (F5-D5 grouping).
  await login(page, 'ana@demo.test');
  await page.goto(`/app/orders/${orderId}`);
  await expect(page.getByRole('region', { name: 'Evidencias' }).getByText(photo)).toBeVisible();

  // A member of another space gets 404 on the same fileId (server decides).
  await login(page, 'carla@demo.test');
  const res = await page.request.get(`${API}/companies/${companyId}/files/${fileId}`);
  expect(res.status()).toBe(404);
});

// ---------------------------------------------------------------------------
// 3. Local validation: non-allowlisted type, no request (≈ mobile camera).
// ---------------------------------------------------------------------------

test('a non-allowlisted type fails locally without a network request', async ({ page }) => {
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');
  const property = await newPropertyApi(page, companyId);
  const { orderId } = await createOrderApi(page, companyId, {
    propertyId: property.id,
    title: `Orden F5 validación ${uniqueSuffix()}`,
    description: 'E2E F5',
  });
  await page.goto(`/app/orders/${orderId}`);
  const filesCard = page.getByRole('region', { name: 'Archivos' });
  const input = filesCard.getByLabel('Subir archivo');

  // The input advertises the backend allowlist (F5 §6).
  const accept = await input.getAttribute('accept');
  expect(accept).toContain('image/jpeg');
  expect(accept).toContain('application/pdf');

  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/files$/.test(request.url())) uploads.push(request.url());
  });
  await input.setInputFiles({
    name: `payload-${uniqueSuffix()}.sh`,
    mimeType: 'application/x-sh',
    buffer: Buffer.from('echo hi'),
  });
  await expect(filesCard.getByText('Tipo de archivo no permitido.')).toBeVisible();
  expect(uploads).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 4. Owner history: share with note, filtered Select, revoke (AC-F5.7/8).
// ---------------------------------------------------------------------------

test('owner shares the history with a note, the Select filters, revoke drops the row', async ({
  page,
}) => {
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');
  const property = await newPropertyApi(page, companyId);

  // F3 entry point: property detail → «Ver historial» (AC-F5.15).
  await page.goto(`/app/catalogs/properties/${property.id}`);
  await page.getByRole('link', { name: 'Ver historial' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/history/properties/${property.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: property.addressLine })).toBeVisible();
  await expect(page.getByText('Historial completo', { exact: true })).toBeVisible();

  // Share with bob + note: validation blocks the empty submit (no request).
  const note = `Antecedentes de la visita ${uniqueSuffix()}`;
  await page.getByRole('button', { name: 'Compartir historial' }).click();
  const dialog = page.getByRole('dialog', { name: 'Compartir historial' });
  await dialog.getByRole('button', { name: 'Compartir', exact: true }).click();
  await expect(dialog.getByText('Selecciona una membresía.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Membresía' }).click();
  await page.getByRole('option', { name: 'Bob Contratista', exact: true }).click();
  await dialog.getByLabel('Motivo (opcional)').fill(note);
  await dialog.getByRole('button', { name: 'Compartir', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Bob Contratista')).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();

  // The Select now filters the already-shared membership out (§7.5).
  await page.getByRole('button', { name: 'Compartir historial' }).click();
  await dialog.getByRole('combobox', { name: 'Membresía' }).click();
  await expect(page.getByRole('option', { name: 'Bob Contratista', exact: true })).toHaveCount(0);
  // Radix layers: the first Escape closes the Select popup…
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  // …and only the second one closes the dialog itself.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Revoke through the confirmation: the invalidated refetch drops the row.
  await page.getByRole('button', { name: 'Revocar', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Revocar acceso' });
  await expect(confirm.getByText(/Bob Contratista/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Revocar', exact: true }).click();
  await expect(page.getByText('Bob Contratista')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 5. Beneficiary: shared scope + download; after revoke → «sin acceso».
// ---------------------------------------------------------------------------

test('beneficiary downloads a shared file; after revoke the next load has no access', async ({
  page,
}) => {
  // Four session switches (ana → carla → bob → carla → bob): widen the time
  // budget so a slow runner fails on assertions, never on the clock.
  test.setTimeout(60_000);
  // Cross-space by design: the property belongs to Taller Carla and bob only
  // belongs to Gestión Demo, so the server resolves `shared` (§7.2). Inside
  // the owning company every member gets `full` and the rule could not show.
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const gestionId = await companyIdOf(page, 'Gestión Demo');
  const tallerId = await companyIdOf(page, 'Taller Carla');
  const bobMembershipId = await memberMembershipId(page, gestionId, 'bob@demo.test');

  await login(page, 'carla@demo.test');
  const property = await newPropertyApi(page, tallerId);
  const { orderId } = await createOrderApi(page, tallerId, {
    propertyId: property.id,
    title: `Orden F5 share ${uniqueSuffix()}`,
    description: 'E2E F5',
  });
  const photo = `compartido-${uniqueSuffix()}.pdf`;
  await uploadFileApi(
    page,
    tallerId,
    { orderId },
    { name: photo, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 share') },
  );
  // Carla shares to bob's Gestión membership (any active membership, §5.6).
  const shareId = await shareHistoryApi(page, tallerId, property.id, bobMembershipId);

  // Bob consults the shared history and downloads the file (F5-D7).
  await login(page, 'bob@demo.test');
  await page.goto(`/app/history/properties/${property.id}`);
  await expect(page.getByText('Compartido contigo', { exact: true })).toBeVisible();
  await expect(page.getByText(photo)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: `Descargar ${photo}` }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(photo);

  // Carla revokes (API) → bob's next load resolves scope none (§7.2).
  await login(page, 'carla@demo.test');
  const revoked = await page.request.delete(
    `${API}/companies/${tallerId}/history/shares/${shareId}`,
  );
  expect(revoked.status()).toBe(204);
  await login(page, 'bob@demo.test');
  await page.goto(`/app/history/properties/${property.id}`);
  await expect(page.getByRole('heading', { name: 'Historial no disponible' })).toBeVisible();
  await expect(
    page.getByText('Esta dirección no existe o no tienes acceso a su historial.'),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. own_jobs scope: only his jobs, foreign jobs absent (F5-D2).
// ---------------------------------------------------------------------------

test('own_jobs lists only the member jobs and labels the mode', async ({ page }) => {
  // Cross-space (§7.2): the property belongs to Taller Carla and bob only
  // belongs to Gestión Demo, so an active assignment resolves `own_jobs`.
  // Inside the owning company every member gets `full` instead.
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const gestionId = await companyIdOf(page, 'Gestión Demo');
  const tallerId = await companyIdOf(page, 'Taller Carla');
  const bobMembershipId = await memberMembershipId(page, gestionId, 'bob@demo.test');

  await login(page, 'carla@demo.test');
  const property = await newPropertyApi(page, tallerId);
  const sfx = uniqueSuffix();
  const { orderId } = await createOrderApi(page, tallerId, {
    propertyId: property.id,
    title: `Orden F5 propio ${sfx}`,
    description: 'E2E F5',
  });
  // Job A mirrors the order title (unassigned), B is foreign, C goes to bob.
  const foreignJobTitle = `Trabajo ajeno ${sfx}`;
  const ownJobTitle = `Trabajo propio ${sfx}`;
  await addJobApi(page, tallerId, orderId, foreignJobTitle);
  const ownJobId = await addJobApi(page, tallerId, orderId, ownJobTitle);

  // Ana bridges the spaces (F4 6b): she belongs to Taller Carla and can
  // propose bob's Gestión membership — any active membership, §5.6.
  await login(page, 'ana@demo.test');
  await assignJobApi(page, tallerId, orderId, ownJobId, bobMembershipId);

  // Bob: no share + active assignment → the server resolves own_jobs.
  await login(page, 'bob@demo.test');
  await page.goto(`/app/history/properties/${property.id}`);
  await expect(page.getByText('Solo tus trabajos', { exact: true })).toBeVisible();
  await expect(page.getByText(ownJobTitle)).toBeVisible();
  await expect(page.getByText(foreignJobTitle)).toHaveCount(0);
  // Share management is owner-only (server-driven, F5-D2).
  await expect(page.getByRole('button', { name: 'Compartir historial' })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 7. Mine tab: closed jobs → property link → history (F5-D3, scope del server).
// ---------------------------------------------------------------------------

test('mine tab lists closed jobs and links to the server-scoped history', async ({ page }) => {
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');
  const property = await newPropertyApi(page, companyId);
  const sfx = uniqueSuffix();
  // Order X: closed job (accept → start → complete as bob).
  const x = await createOrderApi(page, companyId, {
    propertyId: property.id,
    title: `Orden F5 cerrada ${sfx}`,
    description: 'E2E F5',
  });
  const assignX = await assignJobApi(page, companyId, x.orderId, x.jobId,
    await memberMembershipId(page, companyId, 'bob@demo.test'));
  // Order Y: active assignment keeps the property inside bob's scope (§7.2).
  const y = await createOrderApi(page, companyId, {
    propertyId: property.id,
    title: `Orden F5 activa ${sfx}`,
    description: 'E2E F5',
  });
  const assignY = await assignJobApi(page, companyId, y.orderId, y.jobId,
    await memberMembershipId(page, companyId, 'bob@demo.test'));

  await login(page, 'bob@demo.test');
  await transitionApi(page, companyId, `assignments/${assignX}/accept`);
  await transitionApi(page, companyId, `jobs/${x.jobId}/start`);
  await transitionApi(page, companyId, `jobs/${x.jobId}/complete`);
  await transitionApi(page, companyId, `assignments/${assignY}/accept`);

  await page.goto('/app/history');
  await page.getByRole('link', { name: 'Mis trabajos' }).click();
  await expect(page.getByRole('link', { name: 'Mis trabajos' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // The seeded space carries many closed jobs: scope to this run's row (the
  // job title mirrors the order title, unique per run).
  const closedRow = page.locator('li').filter({ hasText: `Orden F5 cerrada ${sfx}` });
  await expect(closedRow).toBeVisible();
  await expect(closedRow.getByText('Completado', { exact: true })).toBeVisible();

  // F5-D3: the row links to the property; the server resolves the scope (bob
  // belongs to the owning company → §3 grants the full history).
  await closedRow.getByRole('link', { name: addressRe(property.addressLine) }).click();
  await expect(page).toHaveURL(new RegExp(`/app/history/properties/${property.id}$`));
  await expect(page.getByText('Historial completo', { exact: true })).toBeVisible();
  await expect(page.getByText(`Orden F5 cerrada ${sfx}`).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 8. Space tab: linked own orders + responsive shell (six-item nav).
// ---------------------------------------------------------------------------

test('space tab links the own orders and the six-item nav fits without overflow', async ({ page }) => {
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');
  const property = await newPropertyApi(page, companyId);
  const title = `Orden F5 espacio ${uniqueSuffix()}`;
  const { orderId } = await createOrderApi(page, companyId, {
    propertyId: property.id,
    title,
    description: 'E2E F5',
  });

  await page.goto('/app/history');
  // Default tab, links not buttons (F5-D4: query-string state).
  await expect(page.getByRole('link', { name: 'Del espacio' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('link', { name: title })).toHaveAttribute(
    'href',
    `/app/orders/${orderId}`,
  );
  await expect(page.getByRole('link', { name: addressRe(property.addressLine) })).toHaveAttribute(
    'href',
    `/app/history/properties/${property.id}`,
  );

  // Responsive: the six-item bottom nav renders and nothing overflows (§9).
  const bottomNav = page.locator('nav[class*="md:hidden"]');
  await expect(bottomNav.locator('a')).toHaveCount(6);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});

// ---------------------------------------------------------------------------
// 9. No delete action anywhere (AC-F5.6, §1.1.8 — DOM negative assertion).
// ---------------------------------------------------------------------------

test('neither the order detail nor the history expose a delete action', async ({ page }) => {
  await login(page, 'ana@demo.test');
  await pickSpace(page, 'Gestión Demo');
  const companyId = await companyIdOf(page, 'Gestión Demo');
  const property = await newPropertyApi(page, companyId);
  const { orderId } = await createOrderApi(page, companyId, {
    propertyId: property.id,
    title: `Orden F5 sin-borrado ${uniqueSuffix()}`,
    description: 'E2E F5',
  });
  await uploadFileApi(
    page,
    companyId,
    { orderId },
    {
      name: `archivo-${uniqueSuffix()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    },
  );

  const forbidden = /borrar|eliminar|quitar/i;
  await page.goto(`/app/orders/${orderId}`);
  await expect(page.getByRole('region', { name: 'Archivos' })).toBeVisible();
  await expect(page.getByRole('button', { name: forbidden })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: forbidden })).toHaveCount(0);

  await page.goto(`/app/history/properties/${property.id}`);
  await expect(page.getByText('Historial completo', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: forbidden })).toHaveCount(0);
  await expect(page.getByRole('link', { name: forbidden })).toHaveCount(0);
});
