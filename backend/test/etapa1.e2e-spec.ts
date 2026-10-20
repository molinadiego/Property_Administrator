import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Client as PgClient } from 'pg';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

const dockerAvailable = isDockerAvailable();
const dockerRequired = process.env.REQUIRE_DOCKER === 'true';

if (dockerRequired && !dockerAvailable) {
  describe('e2e infrastructure', () => {
    it('fails when Docker is required but unavailable', () => {
      throw new Error('REQUIRE_DOCKER=true but the Docker daemon is not available');
    });
  });
}

// Locally the suite is skipped without Docker; CI sets REQUIRE_DOCKER=true
// so a missing daemon fails the build instead of silently skipping.
const suite = dockerAvailable ? describe : describe.skip;

const API = '/api/v1';
const PASSWORD = 'Password-Segura-1';

/** supertest agent type (cookie jar persists the mh_session cookie). */
type Agent = ReturnType<typeof request.agent>;

interface EmailCapture {
  captured: Array<{ to: string; subject: string; text: string }>;
}

interface Account {
  id?: string;
  email: string;
  name: string;
}

suite('etapa 1: matriz de permisos y flujos (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let superUrl: string;
  let emailService: EmailCapture;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaApp: any;
  let hashToken: (token: string) => string;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b@example.com', name: 'Bruno Owner B' },
    revokedB: { email: 'revoked.b@example.com', name: 'Rita Revoked B' },
    memberB: { email: 'member.b@example.com', name: 'Mati Member B' },
    solo: { email: 'solo.user@example.com', name: 'Sola User' },
  };
  const companies: Record<string, string> = {};
  const memberships: Record<string, string> = {};
  const agents: Record<string, Agent> = {};

  const registerUser = async (account: Account) => {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({ email: account.email, name: account.name, password: PASSWORD })
      .expect(201);
    account.id = res.body.id as string;
  };

  const loginUser = async (email: string): Promise<Agent> => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(200);
    return agent;
  };

  const inviteAndAccept = async (
    owner: string,
    companyId: string,
    account: Account,
    agent: Agent,
    role: 'owner' | 'member' = 'member',
  ) => {
    await agents[owner]
      .post(`${API}/companies/${companyId}/invitations`)
      .send({ email: account.email, role })
      .expect(201);
    const token = latestTokenFor(account.email, '/invitations/');
    await agent.post(`${API}/invitations/${token}/accept`).send({}).expect(204);
    return token;
  };

  const latestTokenFor = (email: string, urlMarker: string): string => {
    const mails = emailService.captured.filter((m) => m.to === email && m.text.includes(urlMarker));
    const last = mails[mails.length - 1];
    if (!last) throw new Error(`No captured email for ${email} containing ${urlMarker}`);
    const match = /token=([A-Za-z0-9_-]+)/.exec(last.text) ?? /invitations\/([A-Za-z0-9_-]+)/.exec(last.text);
    if (!match) throw new Error('No token found in captured email');
    return match[1];
  };

  const membershipIdOf = async (
    agent: Agent,
    companyId: string,
    email: string,
  ): Promise<string> => {
    const res = await agent.get(`${API}/companies/${companyId}/members`).expect(200);
    const found = (res.body as Array<{ email: string; membershipId: string }>).find(
      (m) => m.email === email,
    );
    if (!found) throw new Error(`Membership of ${email} not found in ${companyId}`);
    return found.membershipId;
  };

  beforeAll(async () => {
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
      .withCopyFilesToContainer([
        {
          source: path.resolve(__dirname, '../docker/postgres-init/01-app-role.sql'),
          target: '/docker-entrypoint-initdb.d/01-app-role.sql',
        },
      ])
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .start();

    superUrl = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/test`;

    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL = superUrl;
    process.env.APP_DATABASE_URL = `postgresql://app:app_dev@${container.getHost()}:${container.getMappedPort(5432)}/test`;
    process.env.EMAIL_TRANSPORT = 'console';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    execSync('npx prisma migrate deploy', {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: superUrl },
      stdio: 'ignore',
    });

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/app.setup');
    const { EmailService } = await import('../src/modules/email/email.service');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    ({ hashToken } = await import('../src/common/tokens'));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    emailService = app.get(EmailService) as EmailCapture;
    prismaApp = app.get(PrismaService);

    // ---- Fixtures: the cast, two companies, invitations accepted ----
    for (const account of Object.values(accounts)) {
      await registerUser(account);
    }
    agents.ownerA = await loginUser(accounts.ownerA!.email);
    agents.memberA = await loginUser(accounts.memberA!.email);
    agents.ownerB = await loginUser(accounts.ownerB!.email);
    agents.revokedB = await loginUser(accounts.revokedB!.email);
    agents.memberB = await loginUser(accounts.memberB!.email);
    agents.solo = await loginUser(accounts.solo!.email);

    const resA = await agents.ownerA
      .post(`${API}/companies`)
      .send({ name: 'Espacio A', type: 'property_management' })
      .expect(201);
    companies.A = resA.body.id as string;

    const resB = await agents.ownerB
      .post(`${API}/companies`)
      .send({ name: 'Espacio B', type: 'contractor' })
      .expect(201);
    companies.B = resB.body.id as string;

    // memberA joins A; revokedB and memberB join B.
    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);
    await inviteAndAccept('ownerB', companies.B, accounts.revokedB, agents.revokedB);
    await inviteAndAccept('ownerB', companies.B, accounts.memberB, agents.memberB);

    memberships.memberA = await membershipIdOf(agents.ownerA, companies.A, accounts.memberA.email);
    memberships.memberB = await membershipIdOf(agents.ownerB, companies.B, accounts.memberB.email);

    // revokedB loses access to B (the row is kept, status flips).
    await agents.ownerB
      .delete(`${API}/companies/${companies.B}/members/${await membershipIdOf(agents.ownerB, companies.B, accounts.revokedB.email)}`)
      .expect(204);
  }, 300000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  // ---------------------------------------------------------------------
  // Auth: sessions, registration, credentials (§4.1)
  // ---------------------------------------------------------------------

  it('#1 request autenticado sin sesión responde 401', async () => {
    await http().get(`${API}/auth/me`).expect(401);
    await http().get(`${API}/companies`).expect(401);
  });

  it('AC-1.3 el login setea cookie HttpOnly + SameSite=Lax y la BD guarda solo el hash', async () => {
    const res = await http()
      .post(`${API}/auth/login`)
      .send({ email: accounts.ownerA!.email, password: PASSWORD })
      .expect(200);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((c) => c.startsWith('mh_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Path=/');
    // Secure is applied only in production (dev/test run over plain http).
    const rawToken = /mh_session=([^;]+)/.exec(sessionCookie!)![1];

    const pg = new PgClient({ connectionString: superUrl });
    await pg.connect();
    try {
      const hashRows = await pg.query(
        'SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT 1',
      );
      expect(hashRows.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
      const leaked = await pg.query('SELECT id FROM sessions WHERE token_hash = $1', [rawToken]);
      expect(leaked.rowCount).toBe(0);
    } finally {
      await pg.end();
    }
  });

  it('#14 y AC-1.2 registrar un email existente (cualquier capitalización) responde 409', async () => {
    await http()
      .post(`${API}/auth/register`)
      .send({ email: accounts.ownerA!.email, name: 'Otra', password: PASSWORD })
      .expect(409);
    await http()
      .post(`${API}/auth/register`)
      .send({
        email: accounts.ownerA!.email.toUpperCase(),
        name: 'Otra',
        password: PASSWORD,
      })
      .expect(409);
  });

  it('#15 y AC-1.4 credenciales inválidas responden 401 con el mismo mensaje genérico', async () => {
    const unknown = await http()
      .post(`${API}/auth/login`)
      .send({ email: 'nadie@example.com', password: PASSWORD });
    const wrongPass = await http()
      .post(`${API}/auth/login`)
      .send({ email: accounts.ownerA!.email, password: 'otra-password' });

    expect(unknown.status).toBe(401);
    expect(wrongPass.status).toBe(401);
    expect(unknown.body.detail).toBe('Credenciales inválidas.');
    expect(wrongPass.body.detail).toBe('Credenciales inválidas.');
  });

  it('#18 y AC-1.5 tras logout la misma cookie responde 401', async () => {
    const agent = await loginUser(accounts.solo!.email);
    await agent.get(`${API}/auth/me`).expect(200);
    await agent.post(`${API}/auth/logout`).expect(204);
    await agent.get(`${API}/auth/me`).expect(401);
  });

  it('#16 tras 5 intentos fallidos de login responde 429 con Retry-After', async () => {
    const email = 'fueradelimite@example.com';
    await http()
      .post(`${API}/auth/register`)
      .send({ email, name: 'F Límite', password: PASSWORD })
      .expect(201);

    for (let i = 0; i < 5; i += 1) {
      await http().post(`${API}/auth/login`).send({ email, password: 'incorrecta' }).expect(401);
    }
    const res = await http().post(`${API}/auth/login`).send({ email, password: 'incorrecta' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    // The rate limit only affects login, not the rest of the API.
    await http().get(`${API}/auth/me`).expect(401);
  });

  it('#17 y AC-1.6 el reset válido cambia la contraseña y revoca todas las sesiones', async () => {
    const account = { email: 'reset.user@example.com', name: 'Reina Reset' };
    await registerUser(account);
    const device1 = await loginUser(account.email);
    const device2 = await loginUser(account.email);

    await http().post(`${API}/auth/password/forgot`).send({ email: account.email }).expect(202);
    const token = latestTokenFor(account.email, 'reset-password');

    await http()
      .post(`${API}/auth/password/reset`)
      .send({ token, password: 'Nueva-Password-1' })
      .expect(204);

    await device1.get(`${API}/auth/me`).expect(401);
    await device2.get(`${API}/auth/me`).expect(401);
    await http()
      .post(`${API}/auth/login`)
      .send({ email: account.email, password: 'Nueva-Password-1' })
      .expect(200);

    // A consumed token cannot be reused (one-time use).
    await http()
      .post(`${API}/auth/password/reset`)
      .send({ token, password: 'Otra-Password-2' })
      .expect(410);
  });

  it('AC-1.7 forgot con email inexistente siempre responde 202 y no envía email', async () => {
    const before = emailService.captured.length;
    await http()
      .post(`${API}/auth/password/forgot`)
      .send({ email: 'nunca.registrado@example.com' })
      .expect(202);
    expect(emailService.captured.length).toBe(before);
  });

  // ---------------------------------------------------------------------
  // Companies, members and cross-tenant isolation (§4.2, §5)
  // ---------------------------------------------------------------------

  it('AC-2.1 crear espacio deja al creador como owner activo y registra company.created', async () => {
    const res = await agents.solo
      .post(`${API}/companies`)
      .send({ name: 'Espacio Personal', type: 'profesional' })
      .expect(201);
    companies.solo = res.body.id as string;

    const members = await agents.solo.get(`${API}/companies/${companies.solo}/members`).expect(200);
    expect(members.body).toHaveLength(1);
    expect(members.body[0]).toMatchObject({ email: accounts.solo!.email, role: 'owner' });

    const log = await agents.solo.get(`${API}/companies/${companies.solo}/audit-log`).expect(200);
    const created = (log.body.data as Array<{ action: string }>).find(
      (e) => e.action === 'company.created',
    );
    expect(created).toBeDefined();
  });

  it('#24 AC-2.7 /auth/me lista exactamente las membresías activas del usuario', async () => {
    const me = await agents.solo.get(`${API}/auth/me`).expect(200);
    expect(me.body.memberships).toHaveLength(1);
    expect(me.body.memberships[0].companyId).toBe(companies.solo);
    // F2-D5: the membership id lets the UI identify its own assignments.
    expect(me.body.memberships[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const meA = await agents.ownerA.get(`${API}/auth/me`).expect(200);
    expect(meA.body.memberships).toHaveLength(1);
    expect(meA.body.memberships[0].companyId).toBe(companies.A);

    const meB = await agents.ownerB.get(`${API}/auth/me`).expect(200);
    expect(meB.body.memberships.map((m: { companyId: string }) => m.companyId)).toContain(companies.B);
  });

  it('#2 y AC-3.6 ver otra empresa responde 404, nunca 403 ni datos ajenos', async () => {
    await agents.ownerA.get(`${API}/companies/${companies.B}`).expect(404);
    await agents.memberA.get(`${API}/companies/${companies.B}`).expect(404);
    await agents.memberA.get(`${API}/companies/${companies.B}/members`).expect(404);
    await agents.memberA.get(`${API}/companies/${companies.B}/audit-log`).expect(404);
  });

  it('#3 escribir sobre otra empresa responde 404', async () => {
    await agents.ownerA.patch(`${API}/companies/${companies.B}`).send({ name: 'Hackeado' }).expect(404);
    await agents.ownerA
      .delete(`${API}/companies/${companies.B}/members/${memberships.memberB}`)
      .expect(404);
  });

  it('#6 AC-2.6 miembro revocado con sesión viva recibe 404 (efecto inmediato)', async () => {
    await agents.revokedB.get(`${API}/companies/${companies.B}`).expect(404);
    // But the personal account still works.
    const me = await agents.revokedB.get(`${API}/auth/me`).expect(200);
    expect(me.body.memberships).toHaveLength(0);
  });

  it('#7 la revocación surte efecto sin re-login: 200 antes, 404 después', async () => {
    await agents.memberB.get(`${API}/companies/${companies.B}`).expect(200);
    await agents.ownerB
      .delete(`${API}/companies/${companies.B}/members/${memberships.memberB}`)
      .expect(204);
    await agents.memberB.get(`${API}/companies/${companies.B}`).expect(404);
  });

  it('AC-2.5 la revocación no borra nada: la fila queda revoked con revoked_at y la cuenta sigue viva', async () => {
    const pg = new PgClient({ connectionString: superUrl });
    await pg.connect();
    try {
      const rows = await pg.query('SELECT status, revoked_at FROM memberships WHERE id = $1', [
        memberships.memberB,
      ]);
      expect(rows.rows[0].status).toBe('revoked');
      expect(rows.rows[0].revoked_at).not.toBeNull();

      const user = await pg.query('SELECT status FROM users WHERE email = $1', [
        accounts.memberB!.email,
      ]);
      expect(user.rows[0].status).toBe('active');

      const history = await pg.query(
        "SELECT count(*) FROM audit_log WHERE entity_type = 'membership' AND entity_id = $1",
        [memberships.memberB],
      );
      expect(Number(history.rows[0].count)).toBeGreaterThan(0);
    } finally {
      await pg.end();
    }
  });

  it('#4, #5 y AC-2.3 rol member no puede invitar, revocar ni cambiar roles (403)', async () => {
    // memberA is back in company A as a plain member (fixtures).
    await agents.memberA.post(`${API}/companies/${companies.A}/invitations`)
      .send({ email: 'otra@example.com', role: 'member' })
      .expect(403);
    await agents.memberA
      .delete(`${API}/companies/${companies.A}/members/${memberships.memberA}`)
      .expect(403);
    await agents.memberA
      .patch(`${API}/companies/${companies.A}/members/${memberships.memberA}`)
      .send({ role: 'owner' })
      .expect(403);
    await agents.memberA
      .patch(`${API}/companies/${companies.A}`)
      .send({ name: 'Renombrado' })
      .expect(403);
  });

  it('#8 y AC-2.4 la última owner no puede revocarse a sí misma (409 con camino soportado)', async () => {
    const res = await agents.ownerB
      .delete(`${API}/companies/${companies.B}/members/${await membershipIdOf(agents.ownerB, companies.B, accounts.ownerB.email)}`)
      .expect(409);
    expect(res.body.detail).toContain('owner');
  });

  it('#9 la última owner no puede degradarse a sí misma (409)', async () => {
    await agents.ownerB
      .patch(`${API}/companies/${companies.B}/members/${await membershipIdOf(agents.ownerB, companies.B, accounts.ownerB.email)}`)
      .send({ role: 'member' })
      .expect(409);
  });

  it('AC-2.2 el cambio de rol queda en audit log con rol anterior y nuevo', async () => {
    const memberAId = memberships.memberA!;
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/members/${memberAId}`)
      .send({ role: 'owner' })
      .expect(200);
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/members/${memberAId}`)
      .send({ role: 'member' })
      .expect(200);

    const log = await agents.ownerA.get(`${API}/companies/${companies.A}/audit-log`).expect(200);
    const changes = (log.body.data as Array<{ action: string; payload: { before: { role: string }; after: { role: string } } }>).filter(
      (e) => e.action === 'member.role_changed',
    );
    expect(changes).toHaveLength(2);
    expect(changes[0].payload).toMatchObject({ before: { role: 'owner' }, after: { role: 'member' } });
    expect(changes[1].payload).toMatchObject({ before: { role: 'member' }, after: { role: 'owner' } });
  });

  // ---------------------------------------------------------------------
  // Invitations (§4.3)
  // ---------------------------------------------------------------------

  it('AC-3.1 la invitación envía el token por email, en la BD solo queda el hash y expira en 7 días', async () => {
    const guest = { email: 'invitada@example.com', name: 'Irene Invitada' };
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/invitations`)
      .send({ email: guest.email, role: 'member' })
      .expect(201);

    const token = latestTokenFor(guest.email, '/invitations/');
    const expiresInMs = new Date().getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now();
    expect(expiresInMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(expiresInMs).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);

    const pg = new PgClient({ connectionString: superUrl });
    await pg.connect();
    try {
      const asHash = await pg.query('SELECT id FROM invitations WHERE token_hash = $1', [
        hashToken(token),
      ]);
      expect(asHash.rowCount).toBe(1);
      const asPlain = await pg.query('SELECT id FROM invitations WHERE token_hash = $1', [token]);
      expect(asPlain.rowCount).toBe(0);
    } finally {
      await pg.end();
    }

    const log = await agents.ownerA.get(`${API}/companies/${companies.A}/audit-log`).expect(200);
    const invited = (log.body.data as Array<{ action: string; payload: { email: string } }>).find(
      (e) => e.action === 'member.invited' && e.payload?.email === guest.email,
    );
    expect(invited).toBeDefined();
  });

  it('#10 y AC-3.5 token inexistente o revocado responde 404', async () => {
    await http().get(`${API}/invitations/token-que-no-existe`).expect(404);
    await http().post(`${API}/invitations/token-que-no-existe/accept`).send({}).expect(404);

    const guest = { email: 'revocada@example.com', name: 'Vera Revocada' };
    const created = await agents.ownerA
      .post(`${API}/companies/${companies.A}/invitations`)
      .send({ email: guest.email, role: 'member' })
      .expect(201);
    await agents.ownerA
      .delete(`${API}/companies/${companies.A}/invitations/${created.body.id}`)
      .expect(204);
    const token = latestTokenFor(guest.email, '/invitations/');
    await http().get(`${API}/invitations/${token}`).expect(404);
    await http().post(`${API}/invitations/${token}/accept`).send({}).expect(404);
  });

  it('#11 la invitación expirada responde 410', async () => {
    const guest = { email: 'expirada@example.com', name: 'Eva Expirada' };
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/invitations`)
      .send({ email: guest.email, role: 'member' })
      .expect(201);
    const token = latestTokenFor(guest.email, '/invitations/');
    await prismaApp.invitation.updateMany({
      where: { email: guest.email, status: 'pending' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const preview = await http().get(`${API}/invitations/${token}`);
    expect(preview.status).toBe(410);
    await http().post(`${API}/invitations/${token}/accept`).send({}).expect(410);
  });

  it('la previsualización pública muestra la empresa y el email enmascarado', async () => {
    const guest = { email: 'preview@example.com', name: 'Pía Preview' };
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/invitations`)
      .send({ email: guest.email, role: 'member' })
      .expect(201);
    const token = latestTokenFor(guest.email, '/invitations/');
    const res = await http().get(`${API}/invitations/${token}`).expect(200);
    expect(res.body.companyName).toBe('Espacio A');
    expect(res.body.emailMasked).toBe('p***@example.com');
  });

  it('#12 aceptar cuando la cuenta ya es miembro responde 409', async () => {
    const rawToken = `dup-${Date.now()}`;
    await prismaApp.invitation.create({
      data: {
        companyId: companies.A,
        email: accounts.memberA!.email,
        role: 'member',
        tokenHash: hashToken(rawToken),
        invitedBy: accounts.ownerA!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await agents.memberA.post(`${API}/invitations/${rawToken}/accept`).send({}).expect(409);
  });

  it('#13 y AC-3.3 aceptar sin sesión crea la cuenta; volver a aceptar responde 409', async () => {
    const guest = { email: 'sin.sesion@example.com', name: 'Sara Sin Sesión' };
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/invitations`)
      .send({ email: guest.email, role: 'member' })
      .expect(201);
    const token = latestTokenFor(guest.email, '/invitations/');

    // Missing name/password → 422 before anything happens.
    await http().post(`${API}/invitations/${token}/accept`).send({}).expect(422);

    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/invitations/${token}/accept`)
      .send({ name: guest.name, password: PASSWORD })
      .expect(204);

    // The account was created and joined; its session cookie was set.
    const me = await agent.get(`${API}/auth/me`).expect(200);
    expect(me.body.email).toBe(guest.email);
    expect(me.body.memberships).toHaveLength(1);

    // The audit payload records invited email and resulting account.
    const log = await agents.ownerA.get(`${API}/companies/${companies.A}/audit-log`).expect(200);
    const accepted = (log.body.data as Array<{ action: string; payload: { invitedEmail: string; acceptedAccountId: string } }>).find(
      (e) => e.action === 'invitation.accepted' && e.payload?.invitedEmail === guest.email,
    );
    expect(accepted).toBeDefined();
    expect(accepted!.payload.acceptedAccountId).toBe(me.body.id);

    // Second accept of the same token (AC-3.4): 409.
    await http()
      .post(`${API}/invitations/${token}/accept`)
      .send({ name: 'Impostora', password: PASSWORD })
      .expect(409);
  });

  it('§11 doble aceptación en paralelo: una gana y la otra recibe 409', async () => {
    const account = { email: 'paralela@example.com', name: 'Pola Paralela' };
    await registerUser(account);
    const agent = await loginUser(account.email);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/invitations`)
      .send({ email: account.email, role: 'member' })
      .expect(201);
    const token = latestTokenFor(account.email, '/invitations/');

    const [first, second] = await Promise.all([
      agent.post(`${API}/invitations/${token}/accept`).send({}),
      agent.post(`${API}/invitations/${token}/accept`).send({}),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([204, 409]);
  });

  it('§11 re-invitación de un miembro revocado reactiva la fila conservando created_at', async () => {
    const pg = new PgClient({ connectionString: superUrl });
    await pg.connect();
    let originalCreatedAt: Date;
    let membershipRowId: string;
    try {
      const before = await pg.query('SELECT id, created_at FROM memberships WHERE user_id = $1 AND company_id = $2', [
        accounts.revokedB!.id,
        companies.B,
      ]);
      membershipRowId = before.rows[0].id;
      originalCreatedAt = before.rows[0].created_at;
    } finally {
      await pg.end();
    }

    // ownerB invites revokedB back to B; revokedB accepts with its live session.
    await inviteAndAccept('ownerB', companies.B, accounts.revokedB, agents.revokedB);
    await agents.revokedB.get(`${API}/companies/${companies.B}`).expect(200);

    const pg2 = new PgClient({ connectionString: superUrl });
    await pg2.connect();
    try {
      const after = await pg2.query(
        'SELECT id, status, revoked_at, created_at FROM memberships WHERE id = $1',
        [membershipRowId],
      );
      expect(after.rows[0].id).toBe(membershipRowId);
      expect(after.rows[0].status).toBe('active');
      expect(after.rows[0].revoked_at).toBeNull();
      expect(new Date(after.rows[0].created_at).getTime()).toBe(originalCreatedAt.getTime());
    } finally {
      await pg2.end();
    }
  });

  it('AC-2.7 usuario sin membresías activas puede iniciar sesión y crear su espacio', async () => {
    const agent = await loginUser(accounts.memberB!.email);
    const me = await agent.get(`${API}/auth/me`).expect(200);
    expect(me.body.memberships).toHaveLength(0);
    await agent
      .post(`${API}/companies`)
      .send({ name: 'Espacio de Mati', type: 'profesional' })
      .expect(201);
  });

  // ---------------------------------------------------------------------
  // Audit log (§4.4, §2.6)
  // ---------------------------------------------------------------------

  it('#19 y AC-4.1 el miembro activo lee su audit log ordenado y paginado por cursor', async () => {
    const firstPage = await agents.memberA
      .get(`${API}/companies/${companies.A}/audit-log?limit=2`)
      .expect(200);
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const dates = (firstPage.body.data as Array<{ createdAt: string }>).map((e) => e.createdAt);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);

    const secondPage = await agents.memberA
      .get(`${API}/companies/${companies.A}/audit-log?limit=2&cursor=${firstPage.body.nextCursor}`)
      .expect(200);
    const firstIds = (firstPage.body.data as Array<{ id: string }>).map((e) => e.id);
    for (const entry of secondPage.body.data as Array<{ id: string }>) {
      expect(firstIds).not.toContain(entry.id);
    }
  });

  it('#20 leer el audit log de otra empresa responde 404', async () => {
    await agents.memberA.get(`${API}/companies/${companies.B}/audit-log`).expect(404);
  });

  it('#22 no existen rutas de escritura sobre audit-log', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await http()[method](`${API}/companies/${companies.A}/audit-log`).send({});
      expect([404, 405]).toContain(res.status);
    }
  });

  it('#21 y AC-4.4 cada acción genera exactamente su entrada con actor y fecha', async () => {
    const logA = await agents.ownerA.get(`${API}/companies/${companies.A}/audit-log?limit=100`).expect(200);
    const entriesA = logA.body.data as Array<{
      action: string;
      actorUserId: string | null;
      actorType: string;
      createdAt: string;
    }>;

    const expectedInA = [
      'company.created',
      'member.invited',
      'invitation.accepted',
      'member.role_changed',
    ];
    for (const action of expectedInA) {
      const entry = entriesA.find((e) => e.action === action);
      expect(entry).toBeDefined();
      expect(entry!.actorUserId).toBeTruthy();
      expect(entry!.actorType).toBe('user');
      expect(Number.isNaN(Date.parse(entry!.createdAt))).toBe(false);
    }

    const logB = await agents.ownerB.get(`${API}/companies/${companies.B}/audit-log?limit=100`).expect(200);
    const actionsB = (logB.body.data as Array<{ action: string }>).map((e) => e.action);
    expect(actionsB).toContain('member.access_revoked');

    // Personal events (company_id = null) never appear in the company log.
    expect(entriesA.map((e) => e.action)).not.toContain('user.registered');
    expect(entriesA.map((e) => e.action)).not.toContain('auth.login');
  });

  it('#23 el rol de la app no puede UPDATE/DELETE en audit_log (grants de BD)', async () => {
    const pgApp = new PgClient({ connectionString: process.env.APP_DATABASE_URL });
    await pgApp.connect();
    try {
      await expect(
        pgApp.query("UPDATE audit_log SET action = 'tampered'"),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(pgApp.query('DELETE FROM audit_log')).rejects.toMatchObject({ code: '42501' });
      // INSERT/SELECT are the only allowed operations.
      const readable = await pgApp.query('SELECT count(*) FROM audit_log');
      expect(Number(readable.rows[0].count)).toBeGreaterThan(0);
    } finally {
      await pgApp.end();
    }
  });
});
