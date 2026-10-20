import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * F1 account/invitation flows (spec F1 §8, F1-D4/§12).
 *
 * Token flows (invite accept + password reset) read the emailed links from
 * the backend's test mailbox: the console transport appends each email in
 * full to EMAIL_OUTBOX_FILE (JSONL, repo root by default). Every test uses a
 * unique email per run, so the two viewport projects and CI retries never
 * collide. Locally, without that mailbox (e.g. the real Resend transport),
 * the token tests skip; the rest still run (pattern F0-D5).
 */

const OUTBOX_FILE =
  process.env.E2E_OUTBOX_FILE ?? path.resolve(process.cwd(), '..', 'e2e-outbox.jsonl');
/**
 * An explicit E2E_OUTBOX_FILE means the runner guarantees a backend with the
 * test mailbox (CI always does): token flows must then run, never skip. The
 * default is detected from a previous backend run (the JSONL file is created
 * on the first email sent).
 */
const outboxAvailable =
  process.env.E2E_OUTBOX_FILE !== undefined || existsSync(OUTBOX_FILE);
const noMailbox = 'backend test mailbox (EMAIL_OUTBOX_FILE) not available; run the e2e backend with EMAIL_TRANSPORT=console to enable';

const INVITATION_LINK = /https?:\/\/\S*\/invitations\/[A-Za-z0-9_-]+/;
const RESET_LINK = /https?:\/\/\S*\/reset-password\?token=[A-Za-z0-9_-]+/;

interface OutboxEntry {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

function outboxSize(): number {
  return existsSync(OUTBOX_FILE) ? statSync(OUTBOX_FILE).size : 0;
}

/** Polls the mailbox until the email addressed to `to` contains `pattern`. */
async function waitForOutboxLink(to: string, pattern: RegExp, fromOffset: number) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (existsSync(OUTBOX_FILE)) {
      // Slice by BYTES (offsets come from statSync), then decode: the emails
      // contain accents, so slicing the decoded string would drift and tear.
      const chunk = readFileSync(OUTBOX_FILE).subarray(fromOffset).toString('utf8');
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        let entry: OutboxEntry;
        try {
          entry = JSON.parse(line) as OutboxEntry;
        } catch {
          // Torn line (e.g. backend writing right now): keep polling.
          continue;
        }
        if (entry.to !== to) continue;
        const match = entry.text.match(pattern);
        if (match) return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email for ${to} found in ${OUTBOX_FILE}`);
}

/** Unique per run: parallel projects + CI retries must not share state. */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Owner login (seed user with 2 memberships) → Gestión Demo → members. */
async function openMembersAsOwner(page: Page) {
  await login(page, 'ana@demo.test', 'DevDemo123!');
  await expect(page.getByRole('heading', { name: 'Elige un espacio' })).toBeVisible();
  await page.getByRole('button', { name: 'Gestión Demo' }).click();
  await page.goto('/app/settings/members');
  await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible();
}

test('register → login → create the first space (AC-F1.1 / AC-F1.7)', async ({ page }) => {
  const email = `registro-${uniqueSuffix()}@demo.test`;

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Registro E2E');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('E2eDemo123!');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // No session is created on 201 (F1-D5): success lands on /login with a notice.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Cuenta creada. Inicia sesión para continuar.')).toBeVisible();

  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('E2eDemo123!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  // Brand-new account → the no-spaces screen offers space creation (F1 §2).
  await expect(page.getByRole('heading', { name: 'Sin espacios disponibles' })).toBeVisible();
  await page.getByRole('button', { name: 'Crear espacio' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del espacio').fill(`Espacio ${email}`);
  await dialog.getByLabel('Tipo de espacio').click();
  await page.getByRole('option', { name: 'Contratista' }).click();
  await dialog.getByRole('button', { name: 'Crear espacio' }).click();

  // Single membership → F0-D1 auto-enters the shell.
  await expect(page).toHaveURL(/\/app$/);
});

test('invite by email → accept creating the account → both see the space', async ({
  browser,
}) => {
  test.skip(!outboxAvailable, noMailbox);
  test.setTimeout(90_000);

  const suffix = uniqueSuffix();
  const inviteeEmail = `invitado-${suffix}@demo.test`;
  const inviteeName = `Invitada ${suffix}`;

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await openMembersAsOwner(owner);

  const offset = outboxSize();
  await owner.getByRole('button', { name: 'Invitar miembro' }).click();
  const inviteDialog = owner.getByRole('dialog');
  await inviteDialog.getByLabel('Correo electrónico').fill(inviteeEmail);
  await inviteDialog.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(
    owner.getByText(`Invitación enviada a ${inviteeEmail}`),
  ).toBeVisible();
  // The pending list shows the invitation row (exact match: the success
  // message also embeds the email).
  await expect(owner.getByText(inviteeEmail, { exact: true })).toBeVisible();

  const link = await waitForOutboxLink(inviteeEmail, INVITATION_LINK, offset);

  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();
  await invitee.goto(link);
  await expect(
    invitee.getByRole('heading', { name: 'Te invitaron a unirte a Gestión Demo' }),
  ).toBeVisible();
  await invitee.getByLabel('Nombre').fill(inviteeName);
  await invitee.getByLabel('Contraseña').fill('E2eDemo123!');
  await invitee.getByRole('button', { name: 'Crear cuenta y unirme' }).click();

  // Accept without session creates the account AND its session (F1-D5).
  await expect(invitee).toHaveURL(/\/app$/);

  await owner.reload();
  await expect(owner.getByText(inviteeName)).toBeVisible();

  await inviteeContext.close();
  await ownerContext.close();
});

test('password reset from the emailed link invalidates the old password (AC-F1.3)', async ({
  page,
}) => {
  test.skip(!outboxAvailable, noMailbox);
  test.setTimeout(90_000);

  const email = `reset-${uniqueSuffix()}@demo.test`;
  const register = await page.request.post('/api/v1/auth/register', {
    data: { email, name: 'Reset E2E', password: 'E2eDemo123!' },
  });
  expect(register.status()).toBe(201);

  const offset = outboxSize();
  await page.goto('/forgot-password');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  // Same message whether the account exists or not (AC-1.7).
  await expect(page.getByText('Si existe una cuenta con ese correo')).toBeVisible();

  const link = await waitForOutboxLink(email, RESET_LINK, offset);
  await page.goto(link);
  await page.getByLabel('Nueva contraseña').fill('NuevaClave123!');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();

  // Old password rejected…
  await login(page, email, 'E2eDemo123!');
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();
  // …new password works.
  await page.getByLabel('Contraseña').fill('NuevaClave123!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Sin espacios disponibles' })).toBeVisible();
});

test('revoking a member removes their access (AC-F1.10)', async ({ browser }) => {
  test.skip(!outboxAvailable, noMailbox);
  test.setTimeout(90_000);

  const suffix = uniqueSuffix();
  const inviteeEmail = `retirado-${suffix}@demo.test`;
  const inviteeName = `Retirado ${suffix}`;

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await openMembersAsOwner(owner);

  const offset = outboxSize();
  await owner.getByRole('button', { name: 'Invitar miembro' }).click();
  const inviteDialog = owner.getByRole('dialog');
  await inviteDialog.getByLabel('Correo electrónico').fill(inviteeEmail);
  await inviteDialog.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(owner.getByText(`Invitación enviada a ${inviteeEmail}`)).toBeVisible();

  const link = await waitForOutboxLink(inviteeEmail, INVITATION_LINK, offset);
  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();
  await invitee.goto(link);
  await invitee.getByLabel('Nombre').fill(inviteeName);
  await invitee.getByLabel('Contraseña').fill('E2eDemo123!');
  await invitee.getByRole('button', { name: 'Crear cuenta y unirme' }).click();
  await expect(invitee).toHaveURL(/\/app$/);

  // The owner revokes the freshly created member behind the confirmation.
  await owner.reload();
  await owner.getByRole('button', { name: `Retirar el acceso de ${inviteeName}` }).click();
  const confirmDialog = owner.getByRole('dialog');
  await expect(
    confirmDialog.getByText(
      'Dejará de tener acceso a este espacio de inmediato. Su cuenta personal y su historial se conservan.',
    ),
  ).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Retirar acceso' }).click();
  await expect(owner.getByText(inviteeName)).toHaveCount(0);

  // The revoked member keeps their account but loses the space (F1 §5).
  await invitee.reload();
  await expect(invitee.getByRole('heading', { name: 'Sin espacios disponibles' })).toBeVisible();

  await inviteeContext.close();
  await ownerContext.close();
});
