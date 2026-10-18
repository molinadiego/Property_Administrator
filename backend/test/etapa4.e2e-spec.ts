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
 * Etapa 4 (docs/especificacion/etapa-4.md §6): the 52-scenario permission
 * matrix as integration tests over Testcontainers PostgreSQL (no storage
 * required). A failing scenario blocks the stage (§8).
 */
suite('etapa 4: matriz de permisos y flujos (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let emailService: EmailCapture;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a4@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a4@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b4@example.com', name: 'Bruno Owner B' },
    profB: { email: 'prof.b4@example.com', name: 'Pablo Prof B' },
    ownerC: { email: 'owner.c4@example.com', name: 'Caro Owner C' },
    profC: { email: 'prof.c4@example.com', name: 'Cami Prof C' },
  };
  const companies: Record<string, string> = {};
  const props: Record<string, string> = {};
  const agents: Record<string, Agent> = {};
  const memberships: Record<string, string> = {};
  /** Relation/order ids shared across scenarios (#45, #47, #50, #52). */
  const fixtures: Record<string, string> = {};

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

  /** Creates an order (auto first job) plus extra jobs, all assigned. */
  const buildOrder = async (
    propertyId: string,
    opts: {
      companyId?: string;
      createdBy?: Agent;
      title?: string;
      extraJobs?: number;
      economic?: Record<string, unknown>;
      assign?: Array<{
        jobIndex: number;
        membershipId: string;
        acceptBy?: Agent;
        acceptCompanyId?: string;
      }>;
    } = {},
  ): Promise<OrderFixture> => {
    const companyId = opts.companyId ?? companies.A;
    const creator = opts.createdBy ?? agents.memberA;
    const created = await creator
      .post(`${API}/companies/${companyId}/orders`)
      .send({
        propertyId,
        title: opts.title ?? 'Orden de prueba',
        description: 'Orden creada por el fixture de la Etapa 4.',
        ...(opts.economic ?? {}),
      })
      .expect(201);
    const orderId = created.body.id as string;
    const jobIds: string[] = [(created.body.jobs as Array<{ id: string }>)[0].id];
    for (let i = 0; i < (opts.extraJobs ?? 0); i += 1) {
      const job = await creator
        .post(`${API}/companies/${companyId}/orders/${orderId}/jobs`)
        .send({ title: `Trabajo extra ${i + 1}`, description: 'Segundo trabajo del fixture.' })
        .expect(201);
      jobIds.push(job.body.id as string);
    }
    const assignmentIds: string[] = [];
    for (const spec of opts.assign ?? []) {
      const assignment = await creator
        .post(`${API}/companies/${companyId}/orders/${orderId}/assignments`)
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

  /** Accepted assignment of profB (company B) on a fresh order of A. */
  const orderWithB = async (): Promise<OrderFixture> =>
    buildOrder(props.propA, {
      assign: [
        { jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B },
      ],
    });

  const costUrl = (companyId: string, assignId: string) =>
    `${API}/companies/${companyId}/assignments/${assignId}/cost-report`;

  const putItems = (agent: Agent, companyId: string, assignId: string, items: unknown[], notes?: string) =>
    agent
      .put(`${costUrl(companyId, assignId)}/items`)
      .send({ items, ...(notes !== undefined ? { notes } : {}) });

  const submitCosts = (agent: Agent, companyId: string, assignId: string, notes?: string) =>
    agent
      .post(`${costUrl(companyId, assignId)}/submit`)
      .send(notes !== undefined ? { notes } : {});

  const auditActions = async (
    agent: Agent,
    companyId: string,
    action: string,
  ): Promise<
    Array<{
      action: string;
      entityType: string;
      entityId: string;
      actorUserId: string | null;
      createdAt: string;
      payload: Record<string, unknown>;
    }>
  > => {
    const res = await agent
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

  const summary = async (agent: Agent, companyId: string, orderId: string) =>
    (await agent.get(`${API}/companies/${companyId}/orders/${orderId}/economic-summary`).expect(200))
      .body;

  const policyOf = async (agent: Agent, companyId: string, orderId: string) =>
    (await agent.get(`${API}/companies/${companyId}/orders/${orderId}/economic-policy`).expect(200))
      .body;

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
        .send({ name: 'Espacio A4', type: 'property_management' })
        .expect(201)
    ).body.id as string;
    companies.B = (
      await agents.ownerB
        .post(`${API}/companies`)
        .send({ name: 'Espacio B4', type: 'contractor' })
        .expect(201)
    ).body.id as string;
    companies.C = (
      await agents.ownerC
        .post(`${API}/companies`)
        .send({ name: 'Espacio C4', type: 'own_business' })
        .expect(201)
    ).body.id as string;

    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);
    await inviteAndAccept('ownerB', companies.B, accounts.profB, agents.profB);
    await inviteAndAccept('ownerC', companies.C, accounts.profC, agents.profC);

    memberships.memberA = await membershipIdOf(agents.ownerA, companies.A, accounts.memberA!.email);
    memberships.profB = await membershipIdOf(agents.ownerB, companies.B, accounts.profB!.email);
    memberships.profC = await membershipIdOf(agents.ownerC, companies.C, accounts.profC!.email);

    props.propA = (
      await agents.memberA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '1 Costs St', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.propC = (
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/properties`)
        .send({ addressLine: '9 Relations Ave', city: 'Kendall', state: 'FL' })
        .expect(201)
    ).body.id as string;
  }, 300000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  // ---------------------------------------------------------------------
  // 6.1 Política de empresa y de orden (#1–#8)
  // ---------------------------------------------------------------------

  it('#1 cualquier endpoint nuevo sin sesión responde 401', async () => {
    await http().get(`${API}/companies/x/economic-settings`).expect(401);
    await http().patch(`${API}/companies/x/economic-settings`).send({}).expect(401);
    await http().get(`${API}/companies/x/commercial-relations`).expect(401);
    await http().post(`${API}/companies/x/commercial-relations`).send({}).expect(401);
    await http().patch(`${API}/companies/x/commercial-relations/y`).send({}).expect(401);
    await http().get(`${API}/companies/x/orders/y/economic-policy`).expect(401);
    await http().patch(`${API}/companies/x/orders/y/economic-policy`).send({}).expect(401);
    await http().get(`${API}/companies/x/assignments/y/cost-report`).expect(401);
    await http().put(`${API}/companies/x/assignments/y/cost-report/items`).send({ items: [] }).expect(401);
    await http().post(`${API}/companies/x/assignments/y/cost-report/submit`).send({}).expect(401);
    await http().post(`${API}/companies/x/assignments/y/cost-report/correct`).send({}).expect(401);
    await http().get(`${API}/companies/x/orders/y/authorization-requests`).expect(401);
    await http().post(`${API}/companies/x/orders/y/authorization-requests`).send({}).expect(401);
    await http().post(`${API}/companies/x/authorization-requests/y/approve`).send({}).expect(401);
    await http().post(`${API}/companies/x/authorization-requests/y/reject`).send({}).expect(401);
    await http().get(`${API}/companies/x/orders/y/authorizations`).expect(401);
    await http().post(`${API}/companies/x/orders/y/authorizations`).send({}).expect(401);
    await http().get(`${API}/companies/x/orders/y/economic-summary`).expect(401);
  });

  it('#2 owner de A actualiza la política general -> 200 con audit', async () => {
    const res = await agents.ownerA
      .patch(`${API}/companies/${companies.A}/economic-settings`)
      .send({ defaultSpendingLimit: '250', emergencyPolicy: 'prior_authorization' })
      .expect(200);
    expect(res.body.defaultSpendingLimit).toBe('250.00');
    expect(res.body.emergencyPolicy).toBe('prior_authorization');
    expect(res.body.emergencyExtraAmount).toBeNull();

    const entries = await auditActions(agents.ownerA, companies.A, 'company.economic_settings_changed');
    const entry = entries.find((e) => Number(e.payload.defaultSpendingLimit) === 250);
    expect(entry).toBeDefined();
    expect(entry!.actorUserId).toBe(accounts.ownerA!.id);
    expect(entry!.payload.emergencyPolicy).toBe('prior_authorization');
    expect(entry!.createdAt).toBeTruthy();
  });

  it('#3 member de A (sin rol owner) actualiza la política general -> 403', async () => {
    await agents.memberA
      .patch(`${API}/companies/${companies.A}/economic-settings`)
      .send({ defaultSpendingLimit: '100' })
      .expect(403);
  });

  it('#4 owner de B actualiza la política de A -> 404 (tenant, §16.8)', async () => {
    await agents.ownerB
      .patch(`${API}/companies/${companies.A}/economic-settings`)
      .send({ defaultSpendingLimit: '100' })
      .expect(404);
    await agents.ownerB.get(`${API}/companies/${companies.A}/economic-settings`).expect(404);
  });

  it('#5 miembro dueño actualiza límite/margen de su orden -> 200 con actor y fecha', async () => {
    const order = await buildOrder(props.propA, {});
    const res = await agents.memberA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ spendingLimit: '100', marginEnabled: true, marginPercent: '20' })
      .expect(200);
    expect(res.body.spendingLimit).toBe('100.00');
    expect(res.body.marginEnabled).toBe(true);
    expect(res.body.marginPercent).toBe('20.00');
    expect(res.body.commercialRelationId).toBeNull();

    const limitEntries = await auditActions(agents.ownerA, companies.A, 'order.spending_limit_changed');
    const limitEntry = limitEntries.find((e) => e.entityId === order.orderId);
    expect(limitEntry).toBeDefined();
    expect(limitEntry!.actorUserId).toBe(accounts.memberA!.id);
    expect(limitEntry!.payload.previousLimit).toBe('250.00'); // heredado del default
    expect(limitEntry!.payload.newLimit).toBe('100.00');
    expect(limitEntry!.payload.setBy).toBe(accounts.memberA!.id);
    expect(limitEntry!.createdAt).toBeTruthy();

    const marginEntries = await auditActions(agents.ownerA, companies.A, 'order.margin_changed');
    expect(marginEntries.find((e) => e.entityId === order.orderId)).toBeDefined();
  });

  it('#6 miembro de la empresa asignada actualiza la política de la orden -> 403', async () => {
    const order = await orderWithB();
    await agents.profB
      .patch(`${API}/companies/${companies.B}/orders/${order.orderId}/economic-policy`)
      .send({ spendingLimit: '999' })
      .expect(403);
  });

  it('#7 empresa sin relación toca la política de una orden ajena -> 404', async () => {
    const order = await buildOrder(props.propA, {});
    await agents.ownerC
      .patch(`${API}/companies/${companies.C}/orders/${order.orderId}/economic-policy`)
      .send({ spendingLimit: '999' })
      .expect(404);
    await agents.ownerC.get(`${API}/companies/${companies.C}/orders/${order.orderId}/economic-policy`).expect(404);
  });

  it('#8 margin_percent > 20 o importe negativo -> 422', async () => {
    const order = await buildOrder(props.propA, {});
    const url = `${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`;
    await agents.ownerA.patch(url).send({ marginEnabled: true, marginPercent: '21' }).expect(422);
    await agents.ownerA.patch(url).send({ marginPercent: '-1' }).expect(422);
    await agents.ownerA.patch(url).send({ spendingLimit: '-10' }).expect(422);
    await agents.ownerA.patch(url).send({ spendingLimit: '12.345' }).expect(422);
    // Nada persistió:
    const policy = await policyOf(agents.ownerA, companies.A, order.orderId);
    expect(policy.spendingLimit).toBe('250.00');
    expect(policy.marginEnabled).toBe(false);
  });

  // ---------------------------------------------------------------------
  // 6.2 Costos (#9–#20)
  // ---------------------------------------------------------------------

  it('#9 el emisor crea/modifica ítems en el borrador: invisible para la dueña hasta enviar', async () => {
    const order = await orderWithB();
    const put = await putItems(
      agents.profB,
      companies.B,
      order.assignmentIds[0],
      [{ category: 'material', description: 'Filtro de agua', amount: '50.00' }],
      'Borrador inicial.',
    ).expect(200);
    expect(put.body.status).toBe('draft');
    expect(put.body.version).toBe(1);
    expect(put.body.total).toBeNull();

    const emitterView = (
      await agents.profB.get(costUrl(companies.B, order.assignmentIds[0])).expect(200)
    ).body;
    expect(emitterView.current.status).toBe('draft');
    expect(emitterView.current.items).toHaveLength(1);

    // AC-4.1: la dueña no ve el borrador hasta que se envía.
    const ownerView = (
      await agents.ownerA.get(costUrl(companies.A, order.assignmentIds[0])).expect(200)
    ).body;
    expect(ownerView.current).toBeNull();
    expect(ownerView.versions).toHaveLength(0);
  });

  it('#10 envío explícito -> 204 con total, correo al destinatario y audit', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Filtro de agua', amount: '50.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0], 'Envío inicial.').expect(204);

    const view = (
      await agents.profB.get(costUrl(companies.B, order.assignmentIds[0])).expect(200)
    ).body;
    expect(view.current.status).toBe('submitted');
    expect(view.current.total).toBe('50.00');
    expect(view.current.submittedAt).toBeTruthy();
    expect(view.versions).toHaveLength(1);

    const entries = await auditActions(agents.ownerB, companies.B, 'cost_report.submitted');
    const entry = entries.find((e) => e.entityId === view.current.id);
    expect(entry).toBeDefined();
    expect(entry!.payload).toMatchObject({
      assignmentId: order.assignmentIds[0],
      orderId: order.orderId,
      version: 1,
      total: '50.00',
      itemCount: 1,
    });

    const mails = emailService.captured.filter(
      (m) => m.to === accounts.memberA!.email && m.subject.includes('Costos enviados'),
    );
    expect(mails.length).toBeGreaterThan(0);
    expect(mails[mails.length - 1].text).toContain('total USD 50.00');
  });

  it('#11 segundo submit o PUT de ítems sobre un reporte enviado -> 409', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'labor', description: 'Mano de obra', amount: '40.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);

    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(409);
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Otro ítem', amount: '10.00' },
    ]).expect(409);
  });

  it('#12 corrección tras un envío -> 201 versión enlazada, anterior intacta, correo y audit', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Pulgadas de tubería de cobre', amount: '50.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);
    const before = (
      await agents.profB.get(costUrl(companies.B, order.assignmentIds[0])).expect(200)
    ).body;
    const v1 = before.current;

    const corrected = await agents.profB
      .post(`${costUrl(companies.B, order.assignmentIds[0])}/correct`)
      .send({})
      .expect(201);
    expect(corrected.body.status).toBe('draft');
    expect(corrected.body.version).toBe(2);
    expect(corrected.body.previousReportId).toBe(v1.id);
    expect(corrected.body.items).toHaveLength(1);
    expect(corrected.body.items[0].amount).toBe('50.00'); // copiado

    // La versión 1 permanece intacta (§8.2):
    const mid = (
      await agents.profB.get(costUrl(companies.B, order.assignmentIds[0])).expect(200)
    ).body;
    const keptV1 = mid.versions.find((r: any) => r.version === 1);
    expect(keptV1.status).toBe('submitted');
    expect(keptV1.total).toBe('50.00');
    expect(mid.current.id).toBe(corrected.body.id);

    // Corrige los importes y envía la versión 2:
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Pulgadas de tubería de cobre', amount: '60.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);

    const after = (
      await agents.profB.get(costUrl(companies.B, order.assignmentIds[0])).expect(200)
    ).body;
    expect(after.versions).toHaveLength(2);
    expect(after.versions.find((r: any) => r.version === 1).total).toBe('50.00');
    expect(after.versions.find((r: any) => r.version === 2).total).toBe('60.00');

    const correctedAudits = await auditActions(agents.ownerB, companies.B, 'cost_report.corrected');
    const entry = correctedAudits.find((e) => e.entityId === after.versions[1].id);
    expect(entry).toBeDefined();
    expect(entry!.payload).toMatchObject({ previousVersion: 1, newVersion: 2 });

    const mails = emailService.captured.filter(
      (m) => m.to === accounts.memberA!.email && m.subject.includes('Corrección de costos'),
    );
    expect(mails.length).toBeGreaterThan(0);
    expect(mails[mails.length - 1].text).toContain('nueva versión 2');
  });

  it('#13 correct sin ninguna versión enviada -> 409', async () => {
    const empty = await orderWithB();
    await agents.profB
      .post(`${costUrl(companies.B, empty.assignmentIds[0])}/correct`)
      .send({})
      .expect(409);

    const draftOnly = await orderWithB();
    await putItems(agents.profB, companies.B, draftOnly.assignmentIds[0], [
      { category: 'other', description: 'Traslado', amount: '15.00' },
    ]).expect(200);
    await agents.profB
      .post(`${costUrl(companies.B, draftOnly.assignmentIds[0])}/correct`)
      .send({})
      .expect(409);
  });

  it('#14 la dueña de la orden lee el reporte de su asignado -> 200 con ítems y versiones', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Codo de PVC', amount: '25.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);

    const ownerView = (
      await agents.ownerA.get(costUrl(companies.A, order.assignmentIds[0])).expect(200)
    ).body;
    expect(ownerView.current.status).toBe('submitted');
    expect(ownerView.current.total).toBe('25.00');
    expect(ownerView.current.items).toHaveLength(1);
    expect(ownerView.versions).toHaveLength(1);
  });

  it('#15 el reporte de la asignación de otro profesional en la misma orden -> 404', async () => {
    const order = await buildOrder(props.propA, {
      extraJobs: 1,
      assign: [
        { jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B },
        { jobIndex: 1, membershipId: memberships.profC, acceptBy: agents.profC, acceptCompanyId: companies.C },
      ],
    });
    const [assignB, assignC] = order.assignmentIds;

    // profB no ve ni toca el reporte de profC (misma orden, §8.3/§16.9):
    await agents.profB.get(costUrl(companies.B, assignC)).expect(404);
    await putItems(agents.profB, companies.B, assignC, [
      { category: 'material', description: 'Ajenos', amount: '1.00' },
    ]).expect(404);
    await submitCosts(agents.profB, companies.B, assignC).expect(404);

    // Simétrico: profC no ve el de profB.
    await agents.profC.get(costUrl(companies.C, assignB)).expect(404);

    // Cada emisor sí ve el suyo:
    const own = await agents.profC.get(costUrl(companies.C, assignC)).expect(200);
    expect((own.body as any).assignmentId).toBe(assignC);
  });

  it('#16 miembro de empresa sin relación toca una asignación ajena -> 404', async () => {
    const order = await orderWithB();
    await agents.ownerC.get(costUrl(companies.C, order.assignmentIds[0])).expect(404);
    await putItems(agents.ownerC, companies.C, order.assignmentIds[0], []).expect(404);
    await submitCosts(agents.ownerC, companies.C, order.assignmentIds[0]).expect(404);
    await agents.ownerC
      .post(`${costUrl(companies.C, order.assignmentIds[0])}/correct`)
      .send({})
      .expect(404);
  });

  it('#17 asignación revocada tras haber aceptado: el emisor aún puede enviar -> 204', async () => {
    const order = await orderWithB();
    await agents.memberA
      .post(`${API}/companies/${companies.A}/assignments/${order.assignmentIds[0]}/revoke`)
      .send({})
      .expect(204);

    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'labor', description: 'Horas ya trabajadas', amount: '75.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);
  });

  it('#18 asignación pending o rejected intenta enviar -> 403', async () => {
    // pending (nunca aceptó):
    const pending = await buildOrder(props.propA, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB }],
    });
    await putItems(agents.profB, companies.B, pending.assignmentIds[0], [
      { category: 'material', description: 'Aunque no acepté', amount: '10.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, pending.assignmentIds[0]).expect(403);

    // rejected:
    const rejected = await buildOrder(props.propA, {
      assign: [{ jobIndex: 0, membershipId: memberships.profB }],
    });
    await agents.profB
      .post(`${API}/companies/${companies.B}/assignments/${rejected.assignmentIds[0]}/reject`)
      .send({ reason: 'No puedo asumirlo.' })
      .expect(204);
    await putItems(agents.profB, companies.B, rejected.assignmentIds[0], [
      { category: 'material', description: 'Rechazado igual', amount: '10.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, rejected.assignmentIds[0]).expect(403);
  });

  it('#19 ítem con importe negativo, > 2 decimales o sin descripción -> 422', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Negativo', amount: '-10' },
    ]).expect(422);
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Fracción larga', amount: '12.345' },
    ]).expect(422);
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: '', amount: '10' },
    ]).expect(422);
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'fuel', description: 'Categoría desconocida', amount: '10' },
    ]).expect(422);

    // Nada persistió: el reporte sigue sin ítems (o sin reporte).
    const view = (
      await agents.profB.get(costUrl(companies.B, order.assignmentIds[0])).expect(200)
    ).body;
    expect(view.current === null || view.current.items.length === 0).toBe(true);
  });

  it('#20 envío concurrente del mismo reporte: un 204 y un 409 (carrera)', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Carrera de envíos', amount: '33.00' },
    ]).expect(200);

    const results = await Promise.all([
      submitCosts(agents.profB, companies.B, order.assignmentIds[0]),
      submitCosts(agents.profB, companies.B, order.assignmentIds[0]),
    ]);
    const codes = results.map((r) => r.status).sort((a, b) => a - b);
    expect(codes).toEqual([204, 409]);
  });

  // ---------------------------------------------------------------------
  // 6.3 Solicitudes y autorizaciones (#21–#34)
  // ---------------------------------------------------------------------

  it('#21 asignado propone exceder límite con importe -> 201 + audit y correo', async () => {
    const order = await orderWithB();
    const res = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({
        type: 'exceed_spending_limit',
        description: 'El repuesto importado cuesta USD 80 adicionales.',
        requestedAmount: '80',
      })
      .expect(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.requestedAmount).toBe('80.00');

    const entries = await auditActions(agents.ownerB, companies.B, 'authorization.requested');
    const entry = entries.find((e) => e.entityId === res.body.id);
    expect(entry).toBeDefined();
    expect(entry!.payload).toMatchObject({
      orderId: order.orderId,
      type: 'exceed_spending_limit',
      requestingCompanyId: companies.B,
    });
    expect(entry!.payload.requestedAmount).toBe('80');

    const mails = emailService.captured.filter(
      (m) => m.to === accounts.memberA!.email && m.subject.includes('Solicitud de autorización'),
    );
    expect(mails.length).toBeGreaterThan(0);
  });

  it('#22 asignado propone trabajo adicional -> 201 y aún no crea job', async () => {
    const order = await orderWithB();
    const before = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .expect(200);
    const jobsBefore = (before.body.jobs as any[]).length;

    const res = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({
        type: 'additional_work',
        description: 'Habría que ampliar la tubería hasta la azotea.',
        requestedAmount: '120',
      })
      .expect(201);
    expect(res.body.status).toBe('pending');

    const after = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .expect(200);
    expect((after.body.jobs as any[]).length).toBe(jobsBefore);
  });

  it('#23 aprobación de exceder límite -> 204 con constancia y techo crece', async () => {
    const order = await orderWithB();
    const before = await summary(agents.ownerA, companies.A, order.orderId);
    expect(before.authorizedCeiling).toBe('250.00');

    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({
        type: 'exceed_spending_limit',
        description: 'Reparación mayor que el presupuesto.',
        requestedAmount: '80',
      })
      .expect(201);

    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/approve`)
      .send({})
      .expect(204);

    const auths = (
      await agents.ownerA.get(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`).expect(200)
    ).body as any[];
    const constancia = auths.find((a) => a.type === 'exceed_spending_limit');
    expect(constancia).toBeDefined();
    expect(constancia.source).toBe('platform_request');
    expect(constancia.amountCap).toBe('80.00');
    expect(constancia.grantedByUserId).toBe(accounts.ownerA!.id);
    expect(constancia.authorizedByUserId).toBe(accounts.ownerA!.id);
    expect(constancia.authorizationRequestId).toBe(request.body.id);

    const after = await summary(agents.ownerA, companies.A, order.orderId);
    expect(after.authorizedCeiling).toBe('330.00'); // 250 + 80 (AC-4.8)
    expect(after.authorizedExtra).toBe('80.00');
  });

  it('#24 aprobación de trabajo adicional -> 204 + job en la misma orden enlazado', async () => {
    const order = await orderWithB();
    const before = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .expect(200);
    const jobsBefore = (before.body.jobs as Array<{ id: string }>).map((j) => j.id);

    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'additional_work', description: 'Ampliar hasta la azotea.' })
      .expect(201);

    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/approve`)
      .send({})
      .expect(204);

    const after = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .expect(200);
    const jobsAfter = after.body.jobs as Array<{ id: string; status: string; assignments: any[] }>;
    expect(jobsAfter).toHaveLength(jobsBefore.length + 1);
    const newJob = jobsAfter.find((j) => !jobsBefore.includes(j.id));
    expect(newJob).toBeDefined();
    expect(newJob!.status).toBe('pending'); // nace pendiente y sin asignar (§20.2)
    expect(newJob!.assignments).toHaveLength(0);

    const auths = (
      await agents.ownerA.get(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`).expect(200)
    ).body as any[];
    const constancia = auths.find((a) => a.jobId === newJob!.id);
    expect(constancia).toBeDefined();
    expect(constancia.authorizationRequestId).toBe(request.body.id);

    const entries = await auditActions(agents.ownerA, companies.A, 'authorization.approved');
    const entry = entries.find((e) => e.entityId === request.body.id);
    expect(entry).toBeDefined();
    expect(entry!.payload.jobId).toBe(newJob!.id);
  });

  it('#25 rechazo con nota -> 204, solicitud cerrada, audit y correo al solicitante', async () => {
    const order = await orderWithB();
    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'exceed_spending_limit', description: 'Piso nuevo.', requestedAmount: '200' })
      .expect(201);

    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/reject`)
      .send({ note: 'Fuera de presupuesto este mes.' })
      .expect(204);

    const ownerList = (
      await agents.ownerA
        .get(`${API}/companies/${companies.A}/orders/${order.orderId}/authorization-requests`)
        .expect(200)
    ).body as any[];
    const resolved = ownerList.find((r) => r.id === request.body.id);
    expect(resolved.status).toBe('rejected');
    expect(resolved.resolutionNote).toBe('Fuera de presupuesto este mes.');
    expect(resolved.resolvedAt).toBeTruthy();

    // El solicitante (asignada) ve sus solicitudes, incluida la nota de rechazo (§11).
    const myList = (
      await agents.profB
        .get(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
        .expect(200)
    ).body as any[];
    expect(myList).toHaveLength(1);
    expect(myList[0].resolutionNote).toBe('Fuera de presupuesto este mes.');

    const entries = await auditActions(agents.ownerA, companies.A, 'authorization.rejected');
    const entry = entries.find((e) => e.entityId === request.body.id);
    expect(entry).toBeDefined();
    expect(entry!.payload).toMatchObject({ orderId: order.orderId, type: 'exceed_spending_limit' });
    expect(entry!.payload).not.toHaveProperty('resolutionNote');

    const mails = emailService.captured.filter(
      (m) => m.to === accounts.profB!.email && m.subject.includes('rechazada'),
    );
    expect(mails.length).toBeGreaterThan(0);
    expect(mails[mails.length - 1].text).toContain('Fuera de presupuesto este mes.');
  });

  it('#26 rechazo sin nota -> 422', async () => {
    const order = await orderWithB();
    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'additional_work', description: 'Trabajo extra.' })
      .expect(201);

    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/reject`)
      .send({})
      .expect(422);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/reject`)
      .send({ note: '' })
      .expect(422);

    // Sigue pendiente: el 422 no resolvió nada.
    const list = (
      await agents.ownerA
        .get(`${API}/companies/${companies.A}/orders/${order.orderId}/authorization-requests`)
        .expect(200)
    ).body as any[];
    expect(list.find((r) => r.id === request.body.id).status).toBe('pending');
  });

  it('#27 aprobación/rechazo por la asignada (no originadora) -> 403', async () => {
    const order = await orderWithB();
    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'exceed_spending_limit', description: 'Intento propio.', requestedAmount: '50' })
      .expect(201);

    await agents.profB
      .post(`${API}/companies/${companies.B}/authorization-requests/${request.body.id}/approve`)
      .send({})
      .expect(403);
    await agents.profB
      .post(`${API}/companies/${companies.B}/authorization-requests/${request.body.id}/reject`)
      .send({ note: 'Me rechazo yo.' })
      .expect(403);
  });

  it('#28 aprobar/rechazar solicitud ya resuelta -> 409', async () => {
    const order = await orderWithB();
    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'exceed_spending_limit', description: 'Doble resolución.', requestedAmount: '30' })
      .expect(201);

    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/approve`)
      .send({})
      .expect(204);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/approve`)
      .send({})
      .expect(409);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/reject`)
      .send({ note: 'Ya resuelta.' })
      .expect(409);
  });

  it('#29 empresa sin relación aprueba o propone -> 404', async () => {
    const order = await orderWithB();
    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'additional_work', description: 'Propuesta aislada.' })
      .expect(201);

    await agents.ownerC
      .post(`${API}/companies/${companies.C}/authorization-requests/${request.body.id}/approve`)
      .send({})
      .expect(404);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'exceed_spending_limit', description: 'Ajena.' })
      .expect(404);
    await agents.ownerC
      .get(`${API}/companies/${companies.C}/orders/${order.orderId}/authorization-requests`)
      .expect(404);
  });

  it('#30 constancia offline correcta -> 201 + audit (§18.1)', async () => {
    const order = await orderWithB();
    const grantedAt = '2026-10-17T15:30:00.000Z';
    const res = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`)
      .send({
        type: 'exceed_spending_limit',
        grantedByDescription: 'María López, dueña',
        grantedAt,
        description: 'Autorizó por teléfono el repuesto adicional.',
        amountCap: '60',
      })
      .expect(201);

    expect(res.body.source).toBe('offline');
    expect(res.body.grantedByUserId).toBeNull();
    expect(res.body.grantedByDescription).toBe('María López, dueña');
    expect(res.body.grantedAt).toBe(grantedAt);
    expect(res.body.authorizedByUserId).toBe(accounts.ownerA!.id);
    expect(res.body.amountCap).toBe('60.00');
    expect(res.body.description).toBe('Autorizó por teléfono el repuesto adicional.');

    const entries = await auditActions(agents.ownerA, companies.A, 'order_authorization.recorded');
    const entry = entries.find((e) => e.entityId === res.body.id);
    expect(entry).toBeDefined();
    expect(entry!.payload).toMatchObject({ orderId: order.orderId, type: 'exceed_spending_limit' });
    expect(entry!.payload.grantedAt).toBe(grantedAt);
  });

  it('#31 constancia sin grantedByDescription o con grantedAt futuro -> 422', async () => {
    const order = await orderWithB();
    const base = {
      type: 'exceed_spending_limit',
      grantedAt: '2026-10-17T15:30:00.000Z',
      description: 'Autorización telefónica.',
    };
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`)
      .send(base)
      .expect(422);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`)
      .send({ ...base, grantedByDescription: '' })
      .expect(422);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`)
      .send({
        ...base,
        grantedByDescription: 'Dueño',
        grantedAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .expect(422);
    // amount_cap de una exceed_spending_limit = 0 autoriza nada (§11):
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`)
      .send({ ...base, grantedByDescription: 'Dueño', amountCap: '0' })
      .expect(422);
  });

  it('#32 constancia offline registrada por la asignada -> 403 (solo originadora, §8.4)', async () => {
    const order = await orderWithB();
    await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorizations`)
      .send({
        type: 'exceed_spending_limit',
        grantedByDescription: 'Falso testigo',
        grantedAt: '2026-10-17T15:30:00.000Z',
        description: 'No debería registrarse.',
      })
      .expect(403);
  });

  it('#33 la asignada lee authorizations -> 200 sin notas internas de la originadora', async () => {
    const order = await orderWithB();
    // Una constancia offline de cada tipo registrada por la originadora:
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`)
      .send({
        type: 'exceed_spending_limit',
        grantedByDescription: 'María López, dueña',
        grantedAt: '2026-10-17T15:30:00.000Z',
        description: 'Autorizó tope extra.',
        amountCap: '60',
      })
      .expect(201);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`)
      .send({
        type: 'additional_work',
        grantedByDescription: 'María López, dueña',
        grantedAt: '2026-10-17T15:40:00.000Z',
        description: 'Nota interna sobre el trabajo adicional.',
      })
      .expect(201);

    // La dueña ve todas con sus notas:
    const ownerList = (
      await agents.ownerA.get(`${API}/companies/${companies.A}/orders/${order.orderId}/authorizations`).expect(200)
    ).body as any[];
    expect(ownerList).toHaveLength(2);
    expect(ownerList.map((a) => a.type).sort()).toEqual(['additional_work', 'exceed_spending_limit']);
    expect(ownerList.every((a) => typeof a.description === 'string')).toBe(true);

    // La asignada solo ve las que afectan su límite, sin notas internas (§16.9, decisión 9):
    const assigneeList = (
      await agents.profB.get(`${API}/companies/${companies.B}/orders/${order.orderId}/authorizations`).expect(200)
    ).body as any[];
    expect(assigneeList).toHaveLength(1);
    expect(assigneeList[0].type).toBe('exceed_spending_limit');
    expect(assigneeList[0].amountCap).toBe('60.00');
    expect(assigneeList[0]).not.toHaveProperty('description');
    expect(assigneeList[0]).not.toHaveProperty('grantedByDescription');
    expect(assigneeList[0]).not.toHaveProperty('grantedByUserId');
    expect(assigneeList[0]).not.toHaveProperty('authorizedByUserId');
  });

  it('#34 doble resolución concurrente de la misma solicitud: un 204 y un 409', async () => {
    const order = await orderWithB();
    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'exceed_spending_limit', description: 'Carrera de resolución.', requestedAmount: '40' })
      .expect(201);

    const results = await Promise.all([
      agents.ownerA
        .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/approve`)
        .send({}),
      agents.ownerA
        .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/approve`)
        .send({}),
    ]);
    const codes = results.map((r) => r.status).sort((a, b) => a - b);
    expect(codes).toEqual([204, 409]);
  });

  // ---------------------------------------------------------------------
  // 6.4 Resumen, límites, margen y emergencias (#35–#46)
  // ---------------------------------------------------------------------

  it('#35 orden con default de empresa y sin relación: límite efectivo = default (§8.4)', async () => {
    const order = await buildOrder(props.propA, {});
    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.effectiveLimit).toBe('250.00');
    expect(body.authorizedCeiling).toBe('250.00');
    expect(body.authorizedExtra).toBe('0.00');
    expect(body.exceedsLimit).toBe(false);
    expect(body.emergencyPolicy).toMatchObject({ policy: 'prior_authorization', source: 'company' });
  });

  it('#36 orden creada con applyCompanyDefault: false -> «sin límite» (null)', async () => {
    const order = await buildOrder(props.propA, {
      economic: { applyCompanyDefault: false },
    });
    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.effectiveLimit).toBeNull();
    expect(body.authorizedCeiling).toBeNull();
    expect(body.exceedsLimit).toBe(false);
  });

  it('#37 costos enviados superan el límite: exceedsLimit true y el registro no se bloquea', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Suministros', amount: '180.00' },
      { category: 'labor', description: 'Jornada extra', amount: '120.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204); // §8.5: nunca bloquea

    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.effectiveLimit).toBe('250.00');
    expect(body.submittedTotal).toBe('300.00');
    expect(body.exceedsLimit).toBe(true); // AC-4.7
  });

  it('#38 autorización exceed aprobada: el techo sube y exceedsLimit vuelve a false', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Suministros', amount: '300.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);
    expect((await summary(agents.ownerA, companies.A, order.orderId)).exceedsLimit).toBe(true);

    const request = await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'exceed_spending_limit', description: 'Cubrir el exceso.', requestedAmount: '100' })
      .expect(201);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/authorization-requests/${request.body.id}/approve`)
      .send({})
      .expect(204);

    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.authorizedCeiling).toBe('350.00'); // AC-4.8
    expect(body.submittedTotal).toBe('300.00'); // el gasto real se conserva
    expect(body.exceedsLimit).toBe(false);
  });

  it('#39 la asignada lee el resumen: su total y el límite, sin margin ni costos ajenos', async () => {
    const order = await buildOrder(props.propA, {
      extraJobs: 1,
      assign: [
        { jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B },
        { jobIndex: 1, membershipId: memberships.profC, acceptBy: agents.profC, acceptCompanyId: companies.C },
      ],
    });
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ marginEnabled: true, marginPercent: '15' })
      .expect(200);

    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'De B', amount: '50.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);
    await putItems(agents.profC, companies.C, order.assignmentIds[1], [
      { category: 'material', description: 'De C', amount: '70.00' },
    ]).expect(200);
    await submitCosts(agents.profC, companies.C, order.assignmentIds[1]).expect(204);

    const body = await summary(agents.profB, companies.B, order.orderId);
    expect(body.effectiveLimit).toBe('250.00'); // límite visible (decisión 9)
    expect(body.authorizedCeiling).toBe('250.00'); // techo visible
    expect(body.submittedTotal).toBe('50.00'); // solo lo suyo (§16.9)
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].assignmentId).toBe(order.assignmentIds[0]);
    expect(body).not.toHaveProperty('margin'); // el margen es privado (AC-4.10)
  });

  it('#40 la dueña lee el resumen: con margen y todos los reportes', async () => {
    const order = await buildOrder(props.propA, {
      extraJobs: 1,
      assign: [
        { jobIndex: 0, membershipId: memberships.profB, acceptBy: agents.profB, acceptCompanyId: companies.B },
        { jobIndex: 1, membershipId: memberships.profC, acceptBy: agents.profC, acceptCompanyId: companies.C },
      ],
    });
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ marginEnabled: true, marginPercent: '15' })
      .expect(200);
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'De B', amount: '50.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);
    await putItems(agents.profC, companies.C, order.assignmentIds[1], [
      { category: 'material', description: 'De C', amount: '70.00' },
    ]).expect(200);
    await submitCosts(agents.profC, companies.C, order.assignmentIds[1]).expect(204);

    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.margin).toEqual({ enabled: true, percent: '15.00' });
    expect(body.submittedTotal).toBe('120.00');
    expect(body.reports).toHaveLength(2);
  });

  it('#41 margen activado: el techo autorizado no cambia (§8.5)', async () => {
    const order = await orderWithB();
    const before = await summary(agents.ownerA, companies.A, order.orderId);
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ marginEnabled: true, marginPercent: '20' })
      .expect(200);
    const after = await summary(agents.ownerA, companies.A, order.orderId);
    expect(after.authorizedCeiling).toBe(before.authorizedCeiling);
    expect(after.margin).toEqual({ enabled: true, percent: '20.00' });
  });

  it('#42 desactivar el margen: flag en false, historial e importes conservados', async () => {
    const order = await orderWithB();
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ marginEnabled: true, marginPercent: '20' })
      .expect(200);
    const res = await agents.ownerA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ marginEnabled: false })
      .expect(200);
    expect(res.body.marginEnabled).toBe(false);
    expect(res.body.marginPercent).toBe('20.00'); // el importe se conserva (§12)

    const entries = await auditActions(agents.ownerA, companies.A, 'order.margin_changed');
    const entry = entries.find(
      (e) => e.entityId === order.orderId && e.payload.marginEnabled === false,
    );
    expect(entry).toBeDefined();

    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.margin.enabled).toBe(false);
    expect(body.effectiveLimit).toBe('250.00');
  });

  it('#43 política resolve_without_authorization: costos de emergencia sin autorización previa', async () => {
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/economic-settings`)
      .send({ emergencyPolicy: 'resolve_without_authorization' })
      .expect(200);
    const order = await orderWithB();

    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Reparación de urgencia', amount: '40.00', isEmergency: true },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204); // sin pedir autorización

    const report = (
      await agents.profB.get(costUrl(companies.B, order.assignmentIds[0])).expect(200)
    ).body;
    expect(report.current.items[0].isEmergency).toBe(true);

    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.emergencyPolicy).toMatchObject({
      policy: 'resolve_without_authorization',
      source: 'company',
    });
    expect(body.emergencySubmitted).toBe('40.00');
    expect(body.emergencyExceeds).toBe(false);
  });

  it('#44 política emergency_amount con exceso emergency: el resumen lo señala y se propone autorización', async () => {
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/economic-settings`)
      .send({ emergencyPolicy: 'emergency_amount', emergencyExtraAmount: '150' })
      .expect(200);
    const order = await orderWithB();

    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Emergencia mayor', amount: '200.00', isEmergency: true },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);

    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.emergencyPolicy).toMatchObject({ policy: 'emergency_amount', source: 'company' });
    expect(body.emergencyPolicy.extraAmount).toBe('150.00');
    expect(body.emergencySubmitted).toBe('200.00');
    expect(body.emergencyExceeds).toBe(true); // AC-4.17: exceso de 50

    // Flujo #21: se propone autorización para cubrir el exceso.
    await agents.profB
      .post(`${API}/companies/${companies.B}/orders/${order.orderId}/authorization-requests`)
      .send({ type: 'exceed_spending_limit', description: 'Cubrir exceso de emergencia.', requestedAmount: '50' })
      .expect(201);
  });

  it('#45 la relación vinculada gobierna la política de emergencia (§8.6, AC-4.21)', async () => {
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/economic-settings`)
      .send({ emergencyPolicy: 'prior_authorization', emergencyExtraAmount: null })
      .expect(200);

    const relation = await agents.ownerA
      .post(`${API}/companies/${companies.A}/commercial-relations`)
      .send({
        counterpartyCompanyId: companies.B,
        label: 'Contratista Norte',
        emergencyPolicy: 'resolve_without_authorization',
      })
      .expect(201);
    fixtures.relationAB = relation.body.id as string;

    const order = await buildOrder(props.propA, {});
    fixtures.order45 = order.orderId;
    await agents.memberA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ commercialRelationId: fixtures.relationAB })
      .expect(200);

    const policy = await policyOf(agents.ownerA, companies.A, order.orderId);
    expect(policy.commercialRelationId).toBe(fixtures.relationAB);
    expect(policy.effectiveEmergencyPolicy).toMatchObject({
      policy: 'resolve_without_authorization',
      source: 'relation',
    });

    const body = await summary(agents.ownerA, companies.A, order.orderId);
    expect(body.emergencyPolicy).toMatchObject({
      policy: 'resolve_without_authorization',
      source: 'relation',
    });
    // Sin relación manda la de la empresa (AC-4.18):
    const other = await buildOrder(props.propA, {});
    const otherPolicy = await policyOf(agents.ownerA, companies.A, other.orderId);
    expect(otherPolicy.effectiveEmergencyPolicy).toMatchObject({
      policy: 'prior_authorization',
      source: 'company',
    });
  });

  it('#46 empresa sin relación lee resumen/historial de costos ajeno -> 404', async () => {
    const order = await orderWithB();
    await putItems(agents.profB, companies.B, order.assignmentIds[0], [
      { category: 'material', description: 'Privado', amount: '10.00' },
    ]).expect(200);
    await submitCosts(agents.profB, companies.B, order.assignmentIds[0]).expect(204);

    await agents.ownerC.get(`${API}/companies/${companies.C}/orders/${order.orderId}/economic-summary`).expect(404);
    await agents.ownerC.get(costUrl(companies.C, order.assignmentIds[0])).expect(404);
    await agents.ownerC
      .get(`${API}/companies/${companies.C}/orders/${order.orderId}/authorizations`)
      .expect(404);
  });

  // ---------------------------------------------------------------------
  // 6.5 Relaciones comerciales (#47–#52)
  // ---------------------------------------------------------------------

  it('#47 owner crea relación con contraparte y override -> 201 + audit (+ duplicada 409)', async () => {
    const res = await agents.ownerA
      .post(`${API}/companies/${companies.A}/commercial-relations`)
      .send({
        counterpartyCompanyId: companies.C,
        label: 'Comercial C4',
        emergencyPolicy: 'emergency_amount',
        emergencyExtraAmount: '300',
      })
      .expect(201);
    fixtures.relationAC = res.body.id as string;
    expect(res.body.counterpartyCompanyId).toBe(companies.C);
    expect(res.body.counterpartyCompanyName).toBe('Espacio C4');
    expect(res.body.emergencyPolicy).toBe('emergency_amount');
    expect(res.body.emergencyExtraAmount).toBe('300.00');
    expect(res.body.endedAt).toBeNull();

    const entries = await auditActions(agents.ownerA, companies.A, 'commercial_relation.created');
    const entry = entries.find((e) => e.entityId === fixtures.relationAC);
    expect(entry).toBeDefined();
    expect(entry!.actorUserId).toBe(accounts.ownerA!.id);
    expect(entry!.payload.counterpartyCompanyId).toBe(companies.C);
    expect(entry!.payload.emergencyPolicy).toBe('emergency_amount');
    expect(Number(entry!.payload.emergencyExtraAmount)).toBe(300);

    // Misma pareja empresa↔empresa -> 409 (AC-4.22):
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/commercial-relations`)
      .send({ counterpartyCompanyId: companies.C })
      .expect(409);
  });

  it('#48 member (sin owner) crea o modifica una relación -> 403 (decisión 7)', async () => {
    await agents.memberA
      .post(`${API}/companies/${companies.A}/commercial-relations`)
      .send({ counterpartyCompanyId: companies.B })
      .expect(403);
    await agents.memberA
      .patch(`${API}/companies/${companies.A}/commercial-relations/${fixtures.relationAC}`)
      .send({ label: 'Nuevo nombre' })
      .expect(403);
    // Leer sí puede (miembro activo):
    await agents.memberA.get(`${API}/companies/${companies.A}/commercial-relations`).expect(200);
  });

  it('#49 owner de otra empresa parchea una relación ajena -> 404', async () => {
    await agents.ownerB
      .patch(`${API}/companies/${companies.B}/commercial-relations/${fixtures.relationAC}`)
      .send({ label: 'Intruso' })
      .expect(404);
    await agents.ownerB
      .get(`${API}/companies/${companies.B}/commercial-relations`)
      .expect(200)
      .then((r) => {
        expect((r.body as any[]).find((rel) => rel.id === fixtures.relationAC)).toBeUndefined();
      });

    // §11: la contraparte es inmutable -> 422 (whitelist del DTO).
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/commercial-relations/${fixtures.relationAC}`)
      .send({ counterpartyCompanyId: companies.B })
      .expect(422);
  });

  it('#50 adjuntar una relación ajena o finalizada -> 404/422 sin crear vínculo', async () => {
    // (a) Relación de la que la empresa dueña de la orden no es parte:
    const foreign = await agents.ownerB
      .post(`${API}/companies/${companies.B}/commercial-relations`)
      .send({ counterpartyCompanyId: companies.C })
      .expect(201);
    const order = await buildOrder(props.propA, {});
    await agents.memberA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ commercialRelationId: foreign.body.id })
      .expect(404);

    // (b) Relación finalizada no admite órdenes nuevas (§2.4):
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/commercial-relations/${fixtures.relationAC}`)
      .send({ ended: true })
      .expect(200);
    await agents.memberA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}/economic-policy`)
      .send({ commercialRelationId: fixtures.relationAC })
      .expect(422);

    // En ambos casos la orden queda sin vínculo y gobierna la empresa (§8.6):
    const policy = await policyOf(agents.ownerA, companies.A, order.orderId);
    expect(policy.commercialRelationId).toBeNull();
    expect(policy.effectiveEmergencyPolicy.source).toBe('company');
  });

  it('#51 relación que no define política: manda la general de la empresa (§8.6)', async () => {
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/clients`)
      .send({ name: 'Roberto Díaz', email: 'roberto.e4@example.com' })
      .expect(201);
    await agents.ownerC
      .patch(`${API}/companies/${companies.C}/economic-settings`)
      .send({ emergencyPolicy: 'resolve_without_authorization' })
      .expect(200);

    const clients = (
      await agents.ownerC.get(`${API}/companies/${companies.C}/clients`).expect(200)
    ).body as Array<{ relationshipId: string }>;
    const relation = await agents.ownerC
      .post(`${API}/companies/${companies.C}/commercial-relations`)
      .send({ clientRelationshipId: clients[0].relationshipId })
      .expect(201);
    expect(relation.body.clientRelationshipId).toBe(clients[0].relationshipId);
    expect(relation.body.emergencyPolicy).toBeNull(); // no define override

    const order = await buildOrder(props.propC, {
      companyId: companies.C,
      createdBy: agents.ownerC,
    });
    await agents.ownerC
      .patch(`${API}/companies/${companies.C}/orders/${order.orderId}/economic-policy`)
      .send({ commercialRelationId: relation.body.id })
      .expect(200);

    const policy = await policyOf(agents.ownerC, companies.C, order.orderId);
    expect(policy.commercialRelationId).toBe(relation.body.id);
    expect(policy.effectiveEmergencyPolicy).toMatchObject({
      policy: 'resolve_without_authorization',
      source: 'company', // la relación no define nada: gobierna la empresa
    });

    const body = await summary(agents.ownerC, companies.C, order.orderId);
    expect(body.emergencyPolicy.source).toBe('company');
  });

  it('#52 finalizar una relación: ended_at seteado y las órdenes conservan referencia y política', async () => {
    const first = await agents.ownerA
      .patch(`${API}/companies/${companies.A}/commercial-relations/${fixtures.relationAB}`)
      .send({ ended: true })
      .expect(200);
    expect(first.body.endedAt).toBeTruthy();

    const list = (
      await agents.ownerA.get(`${API}/companies/${companies.A}/commercial-relations`).expect(200)
    ).body as Array<{ id: string; endedAt: string | null }>;
    expect(list.find((r) => r.id === fixtures.relationAB)!.endedAt).toBeTruthy();

    // Las órdenes existentes conservan la referencia y su política (§2.4, AC-4.19):
    const policy = await policyOf(agents.ownerA, companies.A, fixtures.order45);
    expect(policy.commercialRelationId).toBe(fixtures.relationAB);
    expect(policy.effectiveEmergencyPolicy).toMatchObject({
      policy: 'resolve_without_authorization',
      source: 'relation',
    });

    // Finalizar dos veces -> 200 idempotente, ended_at sin alterarse (§11):
    const second = await agents.ownerA
      .patch(`${API}/companies/${companies.A}/commercial-relations/${fixtures.relationAB}`)
      .send({ ended: true })
      .expect(200);
    expect(second.body.endedAt).toBe(first.body.endedAt);
    // Y no se reabre:
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/commercial-relations/${fixtures.relationAB}`)
      .send({ ended: false })
      .expect(422);

    const endedAudits = await auditActions(agents.ownerA, companies.A, 'commercial_relation.ended');
    expect(endedAudits.find((e) => e.entityId === fixtures.relationAB)).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // Integridad de la BD (§7: order_authorizations append-only)
  // ---------------------------------------------------------------------

  it('el rol de la app no puede UPDATE/DELETE en order_authorizations (grants de BD)', async () => {
    const pgApp = new PgClient({ connectionString: process.env.APP_DATABASE_URL });
    await pgApp.connect();
    try {
      await expect(
        pgApp.query("UPDATE order_authorizations SET description = 'tampered'"),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(pgApp.query('DELETE FROM order_authorizations')).rejects.toMatchObject({ code: '42501' });
      const readable = await pgApp.query('SELECT count(*) FROM order_authorizations');
      expect(Number(readable.rows[0].count)).toBeGreaterThan(0);
    } finally {
      await pgApp.end();
    }
  });
});
