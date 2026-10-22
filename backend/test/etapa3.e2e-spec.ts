/* eslint-disable @typescript-eslint/no-explicit-any -- e2e fixtures parse JSON responses loosely */
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

const suite = dockerAvailable ? describe : describe.skip;

const API = '/api/v1';
const PASSWORD = 'Password-Segura-1';

type Agent = ReturnType<typeof request.agent>;

interface EmailCapture {
  captured: Array<{ to: string; subject: string; text: string }>;
}

interface Account {
  id?: string;
  email: string;
  name: string;
}

interface OrderFixture {
  orderId: string;
  jobIds: string[];
  assignmentIds: string[];
}

/**
 * Etapa 3 (docs/especificacion/etapa-3.md §6): the 49-scenario permission
 * matrix as integration tests over Testcontainers PostgreSQL plus the
 * in-process `s3rver` mock for file scenarios. A failing scenario blocks the
 * stage (§6: "Si un escenario falla, no se pasa de etapa").
 */
suite('etapa 3: matriz de permisos y flujos (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let emailService: EmailCapture;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a3@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a3@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b3@example.com', name: 'Bruno Owner B' },
    profB: { email: 'prof.b3@example.com', name: 'Pablo Prof B' },
    ownerC: { email: 'owner.c3@example.com', name: 'Caro Owner C' },
    profC: { email: 'prof.c3@example.com', name: 'Cami Prof C' },
  };
  const companies: Record<string, string> = {};
  const props: Record<string, string> = {};
  const agents: Record<string, Agent> = {};
  const memberships: Record<string, string> = {};

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
  ) => {
    await agents[owner]
      .post(`${API}/companies/${companyId}/invitations`)
      .send({ email: account.email, role: 'member' })
      .expect(201);
    const mails = emailService.captured.filter(
      (m) => m.to === account.email && m.text.includes('/invitations/'),
    );
    const last = mails[mails.length - 1];
    if (!last) throw new Error(`No captured invitation for ${account.email}`);
    const match = /\/invitations\/([A-Za-z0-9_-]+)/.exec(last.text);
    if (!match) throw new Error('No token found in captured invitation');
    await agent.post(`${API}/invitations/${match[1]}/accept`).send({}).expect(204);
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

  /** Creates an order in A (auto first job) plus extra jobs, all assigned. */
  const buildOrder = async (
    propertyId: string,
    opts: {
      createdBy?: Agent;
      title?: string;
      extraJobs?: number;
      assign?: Array<{ jobIndex: number; membershipId: string; acceptBy?: Agent; acceptCompanyId?: string }>;
    } = {},
  ): Promise<OrderFixture> => {
    const creator = opts.createdBy ?? agents.memberA;
    const created = await creator
      .post(`${API}/companies/${companies.A}/orders`)
      .send({
        propertyId,
        title: opts.title ?? 'Orden de prueba',
        description: 'Orden creada por el fixture de la Etapa 3.',
      })
      .expect(201);
    const orderId = created.body.id as string;
    const jobIds: string[] = [(created.body.jobs as Array<{ id: string }>)[0].id];
    for (let i = 0; i < (opts.extraJobs ?? 0); i += 1) {
      const job = await creator
        .post(`${API}/companies/${companies.A}/orders/${orderId}/jobs`)
        .send({ title: `Trabajo extra ${i + 1}`, description: 'Segundo trabajo del fixture.' })
        .expect(201);
      jobIds.push(job.body.id as string);
    }
    const assignmentIds: string[] = [];
    for (const spec of opts.assign ?? []) {
      const assignment = await agents.memberA
        .post(`${API}/companies/${companies.A}/orders/${orderId}/assignments`)
        .send({ jobId: jobIds[spec.jobIndex], assigneeMembershipId: spec.membershipId })
        .expect(201);
      const assignmentId = assignment.body.id as string;
      assignmentIds.push(assignmentId);
      if (spec.acceptBy && spec.acceptCompanyId) {
        await spec.acceptBy
          .post(`${API}/companies/${spec.acceptCompanyId}/assignments/${assignmentId}/accept`)
          .send({})
          .expect(204);
      }
    }
    return { orderId, jobIds, assignmentIds };
  };

  const jobOf = async (
    agent: Agent,
    companyId: string,
    orderId: string,
    jobId: string,
  ): Promise<Record<string, any>> => {
    const res = await agent.get(`${API}/companies/${companyId}/orders/${orderId}`).expect(200);
    const job = (res.body.jobs as Array<Record<string, any>>).find((j) => j.id === jobId);
    if (!job) throw new Error(`Job ${jobId} not visible for ${companyId}`);
    return job;
  };

  const auditActions = async (
    companyId: string,
    action: string,
  ): Promise<Array<{ action: string; entityType: string; entityId: string; actorUserId: string | null; createdAt: string; payload: Record<string, unknown> }>> => {
    const res = await agents.ownerA
      .get(`${API}/companies/${companyId}/audit-log?action=${action}`)
      .expect(200);
    return res.body.data as Array<{
      action: string;
      entityType: string;
      entityId: string;
      actorUserId: string | null;
      createdAt: string;
      payload: Record<string, unknown>;
    }>;
  };

  const uploadTo = (
    agent: Agent,
    companyId: string,
    url: string,
    file: { buffer: Buffer; filename: string; contentType: string },
  ) => agent.post(url).attach('file', file.buffer, { filename: file.filename, contentType: file.contentType });

  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

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

    const superUrl = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/test`;

    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL = superUrl;
    process.env.APP_DATABASE_URL = `postgresql://app:app_dev@${container.getHost()}:${container.getMappedPort(5432)}/test`;
    process.env.EMAIL_TRANSPORT = 'console';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    // No STORAGE_ENDPOINT: the app boots the in-process s3rver mock (stack §1).

    execSync('npx prisma migrate deploy', {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: superUrl },
      stdio: 'ignore',
    });

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/app.setup');
    const { EmailService } = await import('../src/modules/email/email.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    emailService = app.get(EmailService) as EmailCapture;

    for (const account of Object.values(accounts)) {
      await registerUser(account);
    }
    agents.ownerA = await loginUser(accounts.ownerA!.email);
    agents.memberA = await loginUser(accounts.memberA!.email);
    agents.ownerB = await loginUser(accounts.ownerB!.email);
    agents.profB = await loginUser(accounts.profB!.email);
    agents.ownerC = await loginUser(accounts.ownerC!.email);
    agents.profC = await loginUser(accounts.profC!.email);

    companies.A = (
      await agents.ownerA
        .post(`${API}/companies`)
        .send({ name: 'Espacio A3', type: 'property_management' })
        .expect(201)
    ).body.id as string;
    companies.B = (
      await agents.ownerB
        .post(`${API}/companies`)
        .send({ name: 'Espacio B3', type: 'contractor' })
        .expect(201)
    ).body.id as string;
    companies.C = (
      await agents.ownerC
        .post(`${API}/companies`)
        .send({ name: 'Espacio C3', type: 'own_business' })
        .expect(201)
    ).body.id as string;

    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);
    await inviteAndAccept('ownerB', companies.B, accounts.profB, agents.profB);
    await inviteAndAccept('ownerC', companies.C, accounts.profC, agents.profC);

    memberships.memberA = await membershipIdOf(agents.ownerA, companies.A, accounts.memberA!.email);
    memberships.profB = await membershipIdOf(agents.ownerB, companies.B, accounts.profB!.email);
    memberships.profC = await membershipIdOf(agents.ownerC, companies.C, accounts.profC!.email);

    props.T1 = (
      await agents.memberA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '1 Tracking St', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.T2 = (
      await agents.memberA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '2 Files Ave', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.T3 = (
      await agents.memberA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '3 History Rd', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.PC = (
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/properties`)
        .send({ addressLine: '9 Pro Lane', city: 'Kendall', state: 'FL' })
        .expect(201)
    ).body.id as string;
  }, 300000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  // ---------------------------------------------------------------------
  // 1. Seguimiento del profesional (#1–#10, §4.1)
  // ---------------------------------------------------------------------

  it('#1 cualquier endpoint nuevo sin sesión responde 401', async () => {
    await http().post(`${API}/companies/x/jobs/y/start`).expect(401);
    await http().post(`${API}/companies/x/jobs/y/progress`).send({ message: 'hola' }).expect(401);
    await http().post(`${API}/companies/x/jobs/y/complete`).expect(401);
    await http().post(`${API}/companies/x/jobs/y/incomplete`).send({ reason: 'x' }).expect(401);
    await http().post(`${API}/companies/x/jobs/y/resume`).expect(401);
    await http().post(`${API}/companies/x/jobs/y/not-realized`).send({ reason: 'x' }).expect(401);
    await http().post(`${API}/companies/x/assignments/y/revoke`).expect(401);
    await http().post(`${API}/companies/x/orders/y/close`).expect(401);
    await http().post(`${API}/companies/x/orders/y/cancel`).send({ reason: 'x' }).expect(401);
    await http().post(`${API}/companies/x/orders/y/files`).expect(401);
    await http().get(`${API}/companies/x/files/y`).expect(401);
    await http().delete(`${API}/companies/x/files/y`).expect(401);
    await http().get(`${API}/companies/x/history/properties/y`).expect(401);
    await http().get(`${API}/companies/x/history/orders`).expect(401);
    await http().post(`${API}/companies/x/history/shares`).expect(401);
    await http().get(`${API}/me/job-history`).expect(401);
  });

  it('#2 asignado activo inicia su job accepted -> 204 con evento y audit (#48)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`)
      .expect(204);

    const job = await jobOf(agents.ownerA, companies.A, order.orderId, order.jobIds[0]);
    expect(job.status).toBe('in_progress');
    expect(job.startedAt).not.toBeNull();

    const detail = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .expect(200);
    expect(detail.body.status).toBe('in_progress'); // §20.1 Aceptada → En curso

    const entries = await auditActions(companies.A, 'job.started');
    const entry = entries.find((e) => e.entityId === order.jobIds[0]);
    expect(entry).toBeDefined();
    expect(entry!.actorUserId).toBe(accounts.profB!.id);
    expect(entry!.createdAt).toBeTruthy();
  });

  it('#3 miembro de la empresa dueña (no asignado) inicia un job -> 403', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.memberA
      .post(`${API}/companies/${companies.A}/jobs/${order.jobIds[0]}/start`)
      .expect(403);
  });

  it('#4 empresa sin relación intenta iniciar un job ajeno -> 404', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.ownerC.post(`${API}/companies/${companies.C}/jobs/${order.jobIds[0]}/start`).expect(404);
  });

  it('#5 asignación rechazada: start -> 404 (perdió acceso operativo, §16.6)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profC }],
    });
    await agents.profC
      .post(`${API}/companies/${companies.C}/assignments/${order.assignmentIds[0]}/reject`)
      .send({ reason: 'No puedo.' })
      .expect(204);
    await agents.profC.post(`${API}/companies/${companies.C}/jobs/${order.jobIds[0]}/start`).expect(404);
  });

  it('#6 asignado activo completa su job en curso -> 204 con evento y audit (#48)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/complete`)
      .send({ result: 'Trabajo terminado sin novedad.' })
      .expect(204);

    const job = await jobOf(agents.ownerA, companies.A, order.orderId, order.jobIds[0]);
    expect(job.status).toBe('done');
    expect(job.completedAt).not.toBeNull();

    const entries = await auditActions(companies.A, 'job.completed');
    const entry = entries.find((e) => e.entityId === order.jobIds[0]);
    expect(entry).toBeDefined();
    expect(entry!.payload.result).toBe('Trabajo terminado sin novedad.');
  });

  it('#7 complete sobre job done o accepted (sin iniciar) -> 409', async () => {
    // done:
    const first = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${first.jobIds[0]}/start`).expect(204);
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${first.jobIds[0]}/complete`).expect(204);
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${first.jobIds[0]}/complete`).expect(409);
    // accepted but never started (§20.2: solo En curso → Completado):
    const second = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${second.jobIds[0]}/complete`).expect(409);
  });

  it('#8 incomplete sin motivo -> 422 (§6.2)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/incomplete`).expect(422);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/incomplete`)
      .send({ reason: '' })
      .expect(422);
  });

  it('#9 incomplete con motivo -> 204 con evento y audit (#48)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/incomplete`)
      .send({ reason: 'Falta una pieza de repuesto.' })
      .expect(204);

    const job = await jobOf(agents.ownerA, companies.A, order.orderId, order.jobIds[0]);
    expect(job.status).toBe('incomplete');

    const entries = await auditActions(companies.A, 'job.incomplete');
    const entry = entries.find((e) => e.entityId === order.jobIds[0]);
    expect(entry).toBeDefined();
    expect(entry!.payload.reason).toBe('Falta una pieza de repuesto.');
  });

  it('#10 el job de otro profesional en la misma orden responde 404 (§16.3)', async () => {
    const order = await buildOrder(props.T1, {
      extraJobs: 1,
      assign: [
        { jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B },
        { jobIndex: 1, membershipId: memberships.profC, acceptBy: agents.profC, acceptCompanyId: companies.C },
      ],
    });
    // profC never sees profB's job — it is not in their scope.
    await agents.profC.post(`${API}/companies/${companies.C}/jobs/${order.jobIds[0]}/start`).expect(404);
    await agents.profC.post(`${API}/companies/${companies.C}/jobs/${order.jobIds[0]}/complete`).expect(404);
  });

  // ---------------------------------------------------------------------
  // 2. Decisiones del responsable (#11–#21, §4.2)
  // ---------------------------------------------------------------------

  it('#11 la empresa dueña reanuda un job incomplete con asignación activa -> 204', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/incomplete`)
      .send({ reason: 'Llaves del consorcio no disponibles.' })
      .expect(204);

    await agents.ownerA.post(`${API}/companies/${companies.A}/jobs/${order.jobIds[0]}/resume`).expect(204);
    const job = await jobOf(agents.ownerA, companies.A, order.orderId, order.jobIds[0]);
    expect(job.status).toBe('in_progress');
    // Same professional continues: the assignment is still the only active one.
    expect(job.assignments.filter((a: { status: string }) => a.status === 'accepted')).toHaveLength(1);

    const entries = await auditActions(companies.A, 'job.resumed');
    expect(entries.find((e) => e.entityId === order.jobIds[0])).toBeDefined();
  });

  it('#12 el profesional asignado (empresa no dueña) no puede reanudar -> 403', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/incomplete`)
      .send({ reason: 'Motivo.' })
      .expect(204);
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/resume`).expect(403);
  });

  it('#13 resume tras reasignación -> 409 (§20.2: el mismo profesional continúa)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/incomplete`)
      .send({ reason: 'Motivo original.' })
      .expect(204);
    // Reassign to profC while incomplete (allowed, §4.2).
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/assignments/${order.assignmentIds[0]}/reassign`)
      .send({ jobId: order.jobIds[0], assigneeMembershipId: memberships.profC })
      .expect(201);
    await agents.ownerA.post(`${API}/companies/${companies.A}/jobs/${order.jobIds[0]}/resume`).expect(409);
  });

  it('#14 not-realized con motivo -> 204, asignación activa revoked, evento y audit (#48)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB }],
    });
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/jobs/${order.jobIds[0]}/not-realized`)
      .send({ reason: 'El inquilino no autorizó el ingreso.' })
      .expect(204);

    const job = await jobOf(agents.ownerA, companies.A, order.orderId, order.jobIds[0]);
    expect(job.status).toBe('not_realized');
    expect(job.assignments[0].status).toBe('revoked');

    const entries = await auditActions(companies.A, 'job.not_realized');
    const entry = entries.find((e) => e.entityId === order.jobIds[0]);
    expect(entry).toBeDefined();
    expect(entry!.payload.reason).toBe('El inquilino no autorizó el ingreso.');
  });

  it('#15 not-realized sin motivo -> 422 (§6.3)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB }],
    });
    await agents.ownerA.post(`${API}/companies/${companies.A}/jobs/${order.jobIds[0]}/not-realized`).expect(422);
  });

  it('#16 not-realized sobre un job done -> 409 (estado final)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/complete`).expect(204);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/jobs/${order.jobIds[0]}/not-realized`)
      .send({ reason: 'Motivo tardío.' })
      .expect(409);
  });

  it('#17 el profesional asignado (empresa no dueña) no puede marcar not-realized -> 403', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/not-realized`)
      .send({ reason: 'No lo haré.' })
      .expect(403);
  });

  it('#18 revoke con job no iniciado -> 204, job vuelve a pending y hay audit (#48)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/assignments/${order.assignmentIds[0]}/revoke`)
      .expect(204);

    const job = await jobOf(agents.ownerA, companies.A, order.orderId, order.jobIds[0]);
    expect(job.assignments[0].status).toBe('revoked');
    expect(job.status).toBe('pending');

    const entries = await auditActions(companies.A, 'assignment.revoked');
    expect(entries.find((e) => e.entityId === order.assignmentIds[0])).toBeDefined();
  });

  it('#19 revoke con job in_progress -> 409 (primero incomplete, §6.2)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/assignments/${order.assignmentIds[0]}/revoke`)
      .expect(409);
  });

  it('#20 reassign tras aceptación -> 201 con anterior revoked y nueva pending (#48)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    const reassign = await agents.ownerA
      .post(`${API}/companies/${companies.A}/assignments/${order.assignmentIds[0]}/reassign`)
      .send({ jobId: order.jobIds[0], assigneeMembershipId: memberships.profC })
      .expect(201);
    expect(reassign.body.previousAssignmentId).toBe(order.assignmentIds[0]);
    expect(reassign.body.revokedAssignmentId).toBe(order.assignmentIds[0]);

    const job = await jobOf(agents.ownerA, companies.A, order.orderId, order.jobIds[0]);
    // Both rows are kept (§5.7): one revoked, one pending.
    expect(job.assignments).toHaveLength(2);
    const statuses = job.assignments.map((a: { status: string }) => a.status).sort();
    expect(statuses).toEqual(['pending', 'revoked']);

    const entries = await auditActions(companies.A, 'assignment.reassigned');
    const entry = entries.find((e) => e.entityId === reassign.body.id);
    expect(entry).toBeDefined();
    expect(entry!.payload.revokedAssignmentId).toBe(order.assignmentIds[0]);

    // Store for #21.
    lastRevokedAssignmentId = order.assignmentIds[0];
  });

  it('#21 intentar accept una asignación revoked -> 409 (§20.3)', async () => {
    expect(lastRevokedAssignmentId).toBeTruthy();
    await agents.profB
      .post(`${API}/companies/${companies.B}/assignments/${lastRevokedAssignmentId}/accept`)
      .send({})
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // 3. Cierre y cancelación (#22–#29, §4.3)
  // ---------------------------------------------------------------------

  it('#22 close con todos los jobs terminales -> 204 con closed_by separado y audit (#48)', async () => {
    // Created by ownerA and closed by memberA: closed_by ≠ originator_id.
    const order = await buildOrder(props.T1, {
      createdBy: agents.ownerA,
      extraJobs: 1,
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/complete`).expect(204);
    await agents.memberA
      .post(`${API}/companies/${companies.A}/jobs/${order.jobIds[1]}/not-realized`)
      .send({ reason: 'No hubo stock del material.' })
      .expect(204);

    await agents.memberA.post(`${API}/companies/${companies.A}/orders/${order.orderId}/close`).expect(204);

    const detail = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .expect(200);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.closedBy).toBe(accounts.memberA!.id);
    expect(detail.body.closedAt).not.toBeNull();

    const entries = await auditActions(companies.A, 'order.closed');
    const entry = entries.find((e) => e.entityId === order.orderId);
    expect(entry).toBeDefined();
    expect(entry!.payload.closedBy).toBe(accounts.memberA!.id);
    expect(entry!.payload.originatorId).toBe(accounts.ownerA!.id);
    expect(entry!.payload.companyId).toBe(companies.A);
  });

  it('#23 close con job incomplete/pending -> 409 (§6.4 explícito)', async () => {
    const order = await buildOrder(props.T1, {
      extraJobs: 1,
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/incomplete`)
      .send({ reason: 'Motivo.' })
      .expect(204);
    await agents.ownerA.post(`${API}/companies/${companies.A}/orders/${order.orderId}/close`).expect(409);
  });

  it('#24 close con asignación rechazada pero jobs terminales -> 204', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profC }],
    });
    await agents.profC
      .post(`${API}/companies/${companies.C}/assignments/${order.assignmentIds[0]}/reject`)
      .send({ reason: 'Fuera de mi zona.' })
      .expect(204);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/jobs/${order.jobIds[0]}/not-realized`)
      .send({ reason: 'Nadie pudo concretarlo.' })
      .expect(204);
    await agents.ownerA.post(`${API}/companies/${companies.A}/orders/${order.orderId}/close`).expect(204);
  });

  it('#25 empresa no dueña con asignación activa: close -> 403 (§6.4)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/orders/${order.orderId}/close`).expect(403);
  });

  it('#26 empresa sin relación: close y cancel -> 404 (§16.8)', async () => {
    const order = await buildOrder(props.T1, { title: 'Orden privada de A' });
    await agents.ownerC.post(`${API}/companies/${companies.C}/orders/${order.orderId}/close`).expect(404);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/orders/${order.orderId}/cancel`)
      .send({ reason: 'Intento de cancelación ajena.' })
      .expect(404);
  });

  it('#27 cancel con motivo y sin trabajo realizado -> 204 con asignaciones revoked (#48)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB }],
    });
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/cancel`)
      .send({ reason: 'El propietario revocó el trabajo.' })
      .expect(204);

    const detail = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .expect(200);
    expect(detail.body.status).toBe('cancelled');
    expect(detail.body.cancellationReason).toBe('El propietario revocó el trabajo.');
    const job = (detail.body.jobs as Array<Record<string, any>>)[0];
    expect(job.assignments[0].status).toBe('revoked');

    const entries = await auditActions(companies.A, 'order.cancelled');
    const entry = entries.find((e) => e.entityId === order.orderId);
    expect(entry).toBeDefined();
    expect(entry!.payload.reason).toBe('El propietario revocó el trabajo.');
  });

  it('#28 cancel con algún job ya comenzado -> 409 (§20.1)', async () => {
    const order = await buildOrder(props.T1, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B }],
    });
    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/cancel`)
      .send({ reason: 'Tarde para cancelar.' })
      .expect(409);
  });

  it('#29 cancel sin motivo -> 422 (§20.1)', async () => {
    const order = await buildOrder(props.T1);
    await agents.ownerA.post(`${API}/companies/${companies.A}/orders/${order.orderId}/cancel`).expect(422);
  });

  // ---------------------------------------------------------------------
  // 4. Archivos (#30–#38, §4.4, §7.6)
  // ---------------------------------------------------------------------

  // Shared fixture for the file scenarios: order on T2 with a job per
  // professional, both accepted.
  const filesOrder: OrderFixture = { orderId: '', jobIds: [], assignmentIds: [] };
  let orderLevelFileId = '';
  let jobBFileId = '';
  let lastRevokedAssignmentId = '';
  let lastShareId = '';

  const filesBytes = { order: PNG_1PX, jobB: Buffer.concat([PNG_1PX, Buffer.from('evidence')]) };

  it('#30 upload de miembro dueño -> 201 con fila, audit y bytes descargables (#48)', async () => {
    const order = await buildOrder(props.T2, {
      extraJobs: 1,
      assign: [
        { jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B },
        { jobIndex: 1, membershipId: memberships.profC, acceptBy: agents.profC, acceptCompanyId: companies.C },
      ],
    });
    filesOrder.orderId = order.orderId;
    filesOrder.jobIds = order.jobIds;
    filesOrder.assignmentIds = order.assignmentIds;

    const upload = await uploadTo(
      agents.memberA,
      companies.A,
      `${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`,
      { buffer: filesBytes.order, filename: 'medidor.png', contentType: 'image/png' },
    ).expect(201);
    orderLevelFileId = upload.body.id as string;
    expect(upload.body.filename).toBe('medidor.png');
    expect(upload.body.sizeBytes).toBe(filesBytes.order.length);
    expect(upload.body.targetType).toBe('order');

    const download = await agents.memberA
      .get(`${API}/companies/${companies.A}/files/${orderLevelFileId}`)
      .expect(200);
    expect(Buffer.compare(download.body as Buffer, filesBytes.order)).toBe(0);

    const entries = await auditActions(companies.A, 'file.uploaded');
    const entry = entries.find((e) => e.entityId === orderLevelFileId);
    expect(entry).toBeDefined();
    expect(entry!.payload.sizeBytes).toBe(filesBytes.order.length);
    // §16.4: the filename never reaches the audit payload.
    expect(JSON.stringify(entry!.payload)).not.toContain('medidor.png');
  });

  it('#34 asignado activo descarga los bytes de su alcance -> 200', async () => {
    // profB uploads evidence to their own job, then downloads it.
    const upload = await uploadTo(
      agents.profB,
      companies.B,
      `${API}/companies/${companies.B}/jobs/${filesOrder.jobIds[0]}/files`,
      { buffer: filesBytes.jobB, filename: 'evidencia.png', contentType: 'image/png' },
    ).expect(201);
    jobBFileId = upload.body.id as string;
    expect(upload.body.targetType).toBe('job');
    expect(upload.body.targetId).toBe(filesOrder.jobIds[0]);

    const download = await agents.profB
      .get(`${API}/companies/${companies.B}/files/${jobBFileId}`)
      .expect(200);
    expect(Buffer.compare(download.body as Buffer, filesBytes.jobB)).toBe(0);
  });

  it('#35 archivo del job A invisible para el asignado del job B -> 404 (§16.3)', async () => {
    await agents.profC.get(`${API}/companies/${companies.C}/files/${jobBFileId}`).expect(404);
    // And the order-level listing never shows other professionals' evidence.
    const list = await agents.profC
      .get(`${API}/companies/${companies.C}/orders/${filesOrder.orderId}/files`)
      .expect(200);
    const ids = (list.body.data as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(orderLevelFileId);
    expect(ids).not.toContain(jobBFileId);
  });

  it('#36 sin share, foto privada de otro pro en la misma propiedad -> 404 (§7.5)', async () => {
    // profC is an active assignee of the same order/property but not of job B.
    await agents.profC.get(`${API}/companies/${companies.C}/files/${jobBFileId}`).expect(404);
  });

  it('#37 con history_share activo -> 200 (§7.5)', async () => {
    await agents.memberA
      .post(`${API}/companies/${companies.A}/history/shares`)
      .send({ propertyId: props.T2, sharedWithMembershipId: memberships.profC, note: 'Coordinación de la visita.' })
      .expect(201);

    const download = await agents.profC
      .get(`${API}/companies/${companies.C}/files/${jobBFileId}`)
      .expect(200);
    expect(Buffer.compare(download.body as Buffer, filesBytes.jobB)).toBe(0);
  });

  it('#31 upload tras perder la asignación -> 403/404 sin crear fila (§16.6)', async () => {
    const listBefore = await agents.memberA
      .get(`${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`)
      .expect(200);

    await agents.ownerA
      .post(`${API}/companies/${companies.A}/assignments/${filesOrder.assignmentIds[1]}/revoke`)
      .expect(204);

    const attempt = await uploadTo(
      agents.profC,
      companies.C,
      `${API}/companies/${companies.C}/jobs/${filesOrder.jobIds[1]}/files`,
      { buffer: PNG_1PX, filename: 'tarde.png', contentType: 'image/png' },
    );
    expect([403, 404]).toContain(attempt.status);

    const listAfter = await agents.memberA
      .get(`${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`)
      .expect(200);
    expect((listAfter.body.data as unknown[]).length).toBe((listBefore.body.data as unknown[]).length);
  });

  it('#32 upload de empresa sin relación -> 404 (§16.8)', async () => {
    // A fresh order on T1 with no C relation at all (profC only ever held a
    // revoked assignment on the T2 order, which makes C "related" there → 403).
    const order = await buildOrder(props.T1, { title: 'Orden sin relación con C' });
    await uploadTo(
      agents.ownerC,
      companies.C,
      `${API}/companies/${companies.C}/orders/${order.orderId}/files`,
      { buffer: PNG_1PX, filename: 'ajeno.png', contentType: 'image/png' },
    ).expect(404);
    // When C *was* related (revoked assignment on that order) the answer is a
    // 403 — §16.8: a past assignee company is "related", never 404.
    const attempt = await uploadTo(
      agents.ownerC,
      companies.C,
      `${API}/companies/${companies.C}/orders/${filesOrder.orderId}/files`,
      { buffer: PNG_1PX, filename: 'ajeno2.png', contentType: 'image/png' },
    );
    expect(attempt.status).toBe(403);
  });

  it('#33 content type fuera de la allowlist o >10 MB -> 415 / 422 sin almacenar (§11)', async () => {
    const listBefore = await agents.memberA
      .get(`${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`)
      .expect(200);

    await uploadTo(
      agents.memberA,
      companies.A,
      `${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`,
      { buffer: Buffer.from('<html><body>no</body></html>'), filename: 'pagina.html', contentType: 'text/html' },
    ).expect(415);

    await uploadTo(
      agents.memberA,
      companies.A,
      `${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`,
      { buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x61), filename: 'enorme.txt', contentType: 'text/plain' },
    ).expect(422);

    const listAfter = await agents.memberA
      .get(`${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`)
      .expect(200);
    expect((listAfter.body.data as unknown[]).length).toBe((listBefore.body.data as unknown[]).length);
  });

  it('#38 delete lógico -> 204, la descarga posterior 404 y la fila permanece (#48)', async () => {
    await agents.memberA.delete(`${API}/companies/${companies.A}/files/${orderLevelFileId}`).expect(204);
    await agents.memberA.get(`${API}/companies/${companies.A}/files/${orderLevelFileId}`).expect(404);

    const list = await agents.memberA
      .get(`${API}/companies/${companies.A}/orders/${filesOrder.orderId}/files`)
      .expect(200);
    const row = (list.body.data as Array<{ id: string; deletedAt: string | null }>).find(
      (f) => f.id === orderLevelFileId,
    );
    expect(row).toBeDefined();
    expect(row!.deletedAt).not.toBeNull();

    const entries = await auditActions(companies.A, 'file.deleted');
    expect(entries.find((e) => e.entityId === orderLevelFileId)).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // 5. Historial (#39–#43) y shares (#44–#47, §4.5–§4.6)
  // ---------------------------------------------------------------------

  // Shared fixture: closed order on T3 with profB's completed job, profC's
  // not-realized job and a private file of profB.
  const historyOrder: OrderFixture = { orderId: '', jobIds: [], assignmentIds: [] };
  let historyFileId = '';

  it('fixture del historial: orden cerrada con jobs de dos profesionales', async () => {
    const order = await buildOrder(props.T3, {
      extraJobs: 1,
      assign: [
        { jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B },
        { jobIndex: 1, membershipId: memberships.profC, acceptBy: agents.profC, acceptCompanyId: companies.C },
      ],
    });
    historyOrder.orderId = order.orderId;
    historyOrder.jobIds = order.jobIds;
    historyOrder.assignmentIds = order.assignmentIds;

    await agents.profB.post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/start`).expect(204);
    await agents.profB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/complete`)
      .send({ result: 'Cambio de cerradura realizado.' })
      .expect(204);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/jobs/${order.jobIds[1]}/not-realized`)
      .send({ reason: 'La unidad estaba sellada.' })
      .expect(204);
    await agents.ownerA.post(`${API}/companies/${companies.A}/orders/${order.orderId}/close`).expect(204);

    const upload = await uploadTo(
      agents.profB,
      companies.B,
      `${API}/companies/${companies.B}/jobs/${order.jobIds[0]}/files`,
      { buffer: filesBytes.jobB, filename: 'antes-despues.png', contentType: 'image/png' },
    ).expect(201);
    historyFileId = upload.body.id as string;
  });

  it('#39 historial de propiedad para la empresa dueña -> 200 completo', async () => {
    const res = await agents.memberA
      .get(`${API}/companies/${companies.A}/history/properties/${props.T3}`)
      .expect(200);
    expect(res.body.property.id).toBe(props.T3);
    // F5-D2: the owner gets the resolved mode and the (empty) share list.
    expect(res.body.scope).toBe('full');
    expect(res.body.shares).toHaveLength(0);
    const closed = (res.body.orders as Array<Record<string, any>>).find(
      (o) => o.id === historyOrder.orderId,
    );
    expect(closed).toBeDefined();
    expect(closed!.status).toBe('completed');
    expect(closed!.jobs).toHaveLength(2); // both professionals' jobs (§7.2)
    const jobB = closed!.jobs.find((j: { id: string }) => j.id === historyOrder.jobIds[0]);
    expect(jobB.result).toBe('Cambio de cerradura realizado.');
    const jobC = closed!.jobs.find((j: { id: string }) => j.id === historyOrder.jobIds[1]);
    expect(jobC.reason).toBe('La unidad estaba sellada.');
  });

  it('#40 asignado activo sin share -> 200 solo con sus trabajos (§7.2)', async () => {
    const res = await agents.profB
      .get(`${API}/companies/${companies.B}/history/properties/${props.T3}`)
      .expect(200);
    const closed = (res.body.orders as Array<Record<string, any>>).find(
      (o) => o.id === historyOrder.orderId,
    );
    expect(closed).toBeDefined();
    expect(closed!.jobs).toHaveLength(1);
    expect(closed!.jobs[0].id).toBe(historyOrder.jobIds[0]);
    // F5-D2: assignee without a share is labelled `own_jobs`, never the shares.
    expect(res.body.scope).toBe('own_jobs');
    expect(res.body.shares).toHaveLength(0);
  });

  it('#41 con share -> 200 con los antecedentes completos, incl. otros profesionales (#48)', async () => {
    const share = await agents.memberA
      .post(`${API}/companies/${companies.A}/history/shares`)
      .send({ propertyId: props.T3, sharedWithMembershipId: memberships.profC, note: 'Peritaje de la unidad.' })
      .expect(201);
    expect(share.body.id).toBeTruthy();
    lastShareId = share.body.id as string;

    const entries = await auditActions(companies.A, 'history_share.created');
    const entry = entries.find((e) => e.entityId === share.body.id);
    expect(entry).toBeDefined();
    expect(entry!.payload.propertyId).toBe(props.T3);

    const res = await agents.profC
      .get(`${API}/companies/${companies.C}/history/properties/${props.T3}`)
      .expect(200);
    expect(res.body.scope).toBe('shared');
    expect(res.body.shares).toHaveLength(0); // owner-only rows (F5-D2)
    const closed = (res.body.orders as Array<Record<string, any>>).find(
      (o) => o.id === historyOrder.orderId,
    );
    expect(closed!.jobs).toHaveLength(2); // incl. profB's job (§7.5)

    // The owner sees the active share with its note (F5-D2).
    const ownerView = await agents.memberA
      .get(`${API}/companies/${companies.A}/history/properties/${props.T3}`)
      .expect(200);
    expect(ownerView.body.shares).toHaveLength(1);
    expect(ownerView.body.shares[0].sharedWithMembershipId).toBe(memberships.profC);
    expect(ownerView.body.shares[0].note).toBe('Peritaje de la unidad.');

    // The share also unlocks the download of the antecedent file (§4.4).
    const download = await agents.profC
      .get(`${API}/companies/${companies.C}/files/${historyFileId}`)
      .expect(200);
    expect(Buffer.compare(download.body as Buffer, filesBytes.jobB)).toBe(0);
  });

  it('#42 /me/job-history -> 200 solo con los trabajos propios históricos (§7.2)', async () => {
    const res = await agents.profB.get(`${API}/me/job-history`).expect(200);
    const jobIds = (res.body.data as Array<{ id: string }>).map((j) => j.id);
    expect(jobIds).toContain(historyOrder.jobIds[0]);
    expect(jobIds).not.toContain(historyOrder.jobIds[1]);

    const mine = (res.body.data as Array<Record<string, any>>).find(
      (j) => j.id === historyOrder.jobIds[0],
    );
    expect(mine).toBeDefined();
    expect(mine!.result).toBe('Cambio de cerradura realizado.');
    expect(mine!.order.id).toBe(historyOrder.orderId);
    expect(mine!.property.addressLine).toBe('3 History Rd');
    expect(mine!.property.id).toBeTruthy(); // F5-D3: navigates to the property history (§7.2)

    // profC's personal history keeps the not_realized reason.
    const resC = await agents.profC.get(`${API}/me/job-history`).expect(200);
    const jobC = (resC.body.data as Array<Record<string, any>>).find(
      (j) => j.id === historyOrder.jobIds[1],
    );
    expect(jobC).toBeDefined();
    expect(jobC!.reason).toBe('La unidad estaba sellada.');
    expect((resC.body.data as Array<{ id: string }>).map((j) => j.id)).not.toContain(
      historyOrder.jobIds[0],
    );
  });

  it('#43 history/orders incluye órdenes cerradas gestionadas y nunca ajenas (§7.3)', async () => {
    // An order of C on its own property must never show up in A's history.
    const orderC = await agents.ownerC
      .post(`${API}/companies/${companies.C}/orders`)
      .send({ propertyId: props.PC, title: 'Orden privada de C', description: 'No debe aparecer en A.' })
      .expect(201);

    const res = await agents.ownerA
      .get(`${API}/companies/${companies.A}/history/orders`)
      .expect(200);
    const ids = (res.body.data as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toContain(historyOrder.orderId); // closed but managed by A
    expect(ids).not.toContain(orderC.body.id as string);
  });

  it('#45 share de una propiedad que la empresa no posee -> 404 (§7.5)', async () => {
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/history/shares`)
      .send({ propertyId: props.T3, sharedWithMembershipId: memberships.profB })
      .expect(404);
  });

  it('#46 share duplicado activo (misma propiedad + membresía) -> 409', async () => {
    await agents.memberA
      .post(`${API}/companies/${companies.A}/history/shares`)
      .send({ propertyId: props.T3, sharedWithMembershipId: memberships.profC })
      .expect(409);
  });

  it('#47 revoke del share -> el ex-beneficiario pierde acceso con audit (#48)', async () => {
    expect(lastShareId).toBeTruthy();

    await agents.memberA
      .delete(`${API}/companies/${companies.A}/history/shares/${lastShareId}`)
      .expect(204);

    // The revoked share disappears from the owner's list (F5-D2).
    const ownerView = await agents.memberA
      .get(`${API}/companies/${companies.A}/history/properties/${props.T3}`)
      .expect(200);
    expect(ownerView.body.scope).toBe('full');
    expect(ownerView.body.shares).toHaveLength(0);

    // The former beneficiary loses the shared download (§16.6).
    await agents.profC.get(`${API}/companies/${companies.C}/files/${historyFileId}`).expect(404);
    // And the property history is out of scope again.
    await agents.profC
      .get(`${API}/companies/${companies.C}/history/properties/${props.T3}`)
      .expect(404);

    const entries = await auditActions(companies.A, 'history_share.revoked');
    expect(entries.find((e) => e.entityId === lastShareId)).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // 6. Integridad de la BD (#49, patrón etapa-1 #23)
  // ---------------------------------------------------------------------

  it('#49 el rol de la app no puede UPDATE/DELETE en job_events (grants de BD)', async () => {
    const pgApp = new PgClient({ connectionString: process.env.APP_DATABASE_URL });
    await pgApp.connect();
    try {
      await expect(
        pgApp.query("UPDATE job_events SET message = 'tampered'"),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(pgApp.query('DELETE FROM job_events')).rejects.toMatchObject({ code: '42501' });
      const readable = await pgApp.query('SELECT count(*) FROM job_events');
      expect(Number(readable.rows[0].count)).toBeGreaterThan(0);
    } finally {
      await pgApp.end();
    }
  });
});
