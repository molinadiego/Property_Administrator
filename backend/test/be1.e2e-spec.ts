/* eslint-disable @typescript-eslint/no-explicit-any -- e2e fixtures parse JSON responses loosely */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Agent } from 'supertest';
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

interface EmailCapture {
  captured: Array<{ to: string; subject: string; text: string }>;
}

interface Account {
  id?: string;
  email: string;
  name: string;
}

/**
 * BE-1 (docs/especificacion/be-1-filtros-ordenes.md §6): the 12-scenario
 * permission matrix plus the §11 exceptional cases as integration tests over
 * Testcontainers PostgreSQL. The filters only narrow the §2.12 visibility
 * clause; AC-BE1.6 is asserted by comparing the unfiltered list against the
 * full fixture set.
 */
suite('BE-1: filtros de órdenes (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let emailService: EmailCapture;
  let pg: PgClient;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a-be1@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a-be1@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b-be1@example.com', name: 'Bruno Owner B' },
    ownerC: { email: 'owner.c-be1@example.com', name: 'Caro Owner C' },
  };
  const companies: Record<string, string> = {};
  const props: Record<string, string> = {};
  const agents: Record<string, Agent> = {};
  const memberships: Record<string, string> = {};
  /** Fixture order ids by scenario name, asserted by presence/absence. */
  const orders: Record<string, string> = {};

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

  /** Order of `company` with a single pending job; titles are unique per fixture. */
  const createOrder = async (
    owner: string,
    companyId: string,
    propertyId: string,
    title: string,
  ): Promise<{ orderId: string; jobId: string }> => {
    const created = await agents[owner]
      .post(`${API}/companies/${companyId}/orders`)
      .send({ propertyId, title, description: `Fixture BE-1: ${title}` })
      .expect(201);
    return {
      orderId: created.body.id as string,
      jobId: (created.body.jobs as Array<{ id: string }>)[0].id,
    };
  };

  /** Assigns a job to B's owner (contractor with an assignment on A's order). */
  const assignToOwnerB = async (companyId: string, orderId: string, jobId: string) => {
    const res = await agents.ownerA
      .post(`${API}/companies/${companyId}/orders/${orderId}/assignments`)
      .send({ jobId, assigneeMembershipId: memberships.ownerB })
      .expect(201);
    return res.body.id as string;
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

    const superUrl = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/test`;

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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    emailService = app.get(EmailService) as EmailCapture;
    pg = new PgClient({ connectionString: superUrl });
    await pg.connect();

    for (const account of Object.values(accounts)) await registerUser(account);
    agents.ownerA = await loginUser(accounts.ownerA!.email);
    agents.memberA = await loginUser(accounts.memberA!.email);
    agents.ownerB = await loginUser(accounts.ownerB!.email);
    agents.ownerC = await loginUser(accounts.ownerC!.email);

    companies.A = (
      await agents.ownerA
        .post(`${API}/companies`)
        .send({ name: 'Espacio A BE1', type: 'property_management' })
        .expect(201)
    ).body.id as string;
    companies.B = (
      await agents.ownerB
        .post(`${API}/companies`)
        .send({ name: 'Espacio B BE1', type: 'contractor' })
        .expect(201)
    ).body.id as string;
    companies.C = (
      await agents.ownerC
        .post(`${API}/companies`)
        .send({ name: 'Espacio C BE1', type: 'own_business' })
        .expect(201)
    ).body.id as string;

    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);

    // B's owner membership is the assignee of every cross-company assignment.
    memberships.ownerB = await membershipIdOf(agents.ownerB, companies.B, accounts.ownerB!.email);

    props.propA = (
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '1 Filter St', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.propB = (
      await agents.ownerB
        .post(`${API}/companies/${companies.B}/properties`)
        .send({ addressLine: '2 Filter Ave', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.propC = (
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/properties`)
        .send({ addressLine: '3 Filter Rd', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;

    // ---- Fixture orders of company A (all six §20.1 states + assignments) ----
    const open = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden abierta');
    orders.openA = open.orderId;

    // `assigned` is unreachable through the API (state machine note in the
    // implementation report): the fixture sets it via direct SQL, as done in
    // the etapa-6 suite for its own tables.
    const assigned = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden assigned');
    orders.assignedA = assigned.orderId;
    await pg.query(`UPDATE orders SET status = 'assigned', updated_at = now() WHERE id = $1`, [
      orders.assignedA,
    ]);

    const inProgress = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden en curso');
    orders.inProgressA = inProgress.orderId;
    const inProgressAssignId = await assignToOwnerB(companies.A, inProgress.orderId, inProgress.jobId);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${inProgressAssignId}/accept`)
      .send({})
      .expect(204);
    await agents.ownerB.post(`${API}/companies/${companies.B}/jobs/${inProgress.jobId}/start`).send({}).expect(204);

    const completed = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden completada');
    orders.completedA = completed.orderId;
    const completedAssignId = await assignToOwnerB(companies.A, completed.orderId, completed.jobId);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${completedAssignId}/accept`)
      .send({})
      .expect(204);
    await agents.ownerB.post(`${API}/companies/${companies.B}/jobs/${completed.jobId}/start`).send({}).expect(204);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/jobs/${completed.jobId}/complete`)
      .send({})
      .expect(204);
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${completed.orderId}/close`)
      .send({})
      .expect(204);

    const cancelled = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden cancelada');
    orders.cancelledA = cancelled.orderId;
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${cancelled.orderId}/cancel`)
      .send({ reason: 'Se cancela la prueba BE-1.' })
      .expect(204);

    // Assignment-status fixtures visible to ownerB through §2.12 (company B list).
    const pending = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden pending B');
    orders.pendingA = pending.orderId;
    await assignToOwnerB(companies.A, pending.orderId, pending.jobId);

    const accepted = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden accepted B');
    orders.acceptedA = accepted.orderId;
    const acceptedAssignId = await assignToOwnerB(companies.A, accepted.orderId, accepted.jobId);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${acceptedAssignId}/accept`)
      .send({})
      .expect(204);

    // Pending assignment on a non-open order: proves the AND narrows by status.
    const assignedPending = await createOrder(
      'ownerA',
      companies.A,
      props.propA,
      'BE1 orden assigned pending B',
    );
    orders.assignedPendingA = assignedPending.orderId;
    await assignToOwnerB(companies.A, assignedPending.orderId, assignedPending.jobId);
    await pg.query(`UPDATE orders SET status = 'assigned', updated_at = now() WHERE id = $1`, [
      orders.assignedPendingA,
    ]);

    // §11: one order, two jobs, mixed assignments of the same caller.
    const mixed = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden mixta B');
    orders.mixedA = mixed.orderId;
    await assignToOwnerB(companies.A, mixed.orderId, mixed.jobId);
    const secondJob = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${mixed.orderId}/jobs`)
      .send({ title: 'BE1 trabajo extra', description: 'Segundo trabajo de la orden mixta BE-1.' })
      .expect(201);
    const secondAssignId = await assignToOwnerB(
      companies.A,
      mixed.orderId,
      (secondJob.body as { id: string }).id,
    );
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${secondAssignId}/accept`)
      .send({})
      .expect(204);

    // Rejected assignment: invisible to ownerB with or without filters (§2.12).
    const rejected = await createOrder('ownerA', companies.A, props.propA, 'BE1 orden rechazada B');
    orders.rejectedA = rejected.orderId;
    const rejectedAssignId = await assignToOwnerB(companies.A, rejected.orderId, rejected.jobId);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${rejectedAssignId}/reject`)
      .send({ reason: 'No puedo tomar este trabajo BE-1.' })
      .expect(204);

    // Own-space order of B with no assignment of its owner (B3 / scenario 11).
    const ownB = await createOrder('ownerB', companies.B, props.propB, 'BE1 orden propia B');
    orders.ownB = ownB.orderId;

    // Foreign company C: its orders must never appear in anyone else's list.
    const ownC = await createOrder('ownerC', companies.C, props.propC, 'BE1 orden propia C');
    orders.ownC = ownC.orderId;
  });

  afterAll(async () => {
    await pg?.end();
    await app?.close();
    await container?.stop();
  });

  const idsOf = (body: any): string[] => (body as Array<{ id: string }>).map((o) => o.id);
  const statusesOf = (body: any): string[] =>
    (body as Array<{ status: string }>).map((o) => o.status);

  describe('§6 matriz de permisos', () => {
    it('#1 sin sesión, con cualquier filtro, → 401', async () => {
      await http().get(`${API}/companies/${companies.A}/orders?status=open`).expect(401);
      await http()
        .get(`${API}/companies/${companies.A}/orders?assignment_status=pending`)
        .expect(401);
    });

    it('#2 espacio de otra empresa con filtro válido → 404 (el guard ni llega a los filtros)', async () => {
      await agents.ownerB.get(`${API}/companies/${companies.A}/orders?status=open`).expect(404);
      await agents.memberA
        .get(`${API}/companies/${companies.B}/orders?assignment_status=pending`)
        .expect(404);
    });

    it('#3 status=foo → 422 con detail que lista los valores válidos', async () => {
      const res = await agents.ownerA.get(`${API}/companies/${companies.A}/orders?status=foo`).expect(422);
      const detail = String((res.body as { detail?: string }).detail ?? '');
      expect(detail).toContain('status');
      expect(detail).toContain('requested');
      expect(detail).toContain('in_progress');
      expect(detail).toContain('cancelled');
    });

    it('#4 status= (vacío) → 422, nunca un filtro ignorado', async () => {
      await agents.ownerA.get(`${API}/companies/${companies.A}/orders?status=`).expect(422);
    });

    it('#5 assignment_status fuera de pending|accepted → 422', async () => {
      await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=rejected`)
        .expect(422);
      await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=revoked`)
        .expect(422);
      await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=`)
        .expect(422);
    });

    it('#6 status=open,assigned,in_progress → 200 solo con esos estados (AC-BE1.1)', async () => {
      const res = await agents.memberA
        .get(`${API}/companies/${companies.A}/orders?status=open,assigned,in_progress`)
        .expect(200);
      const ids = idsOf(res.body);
      expect(ids).toContain(orders.openA);
      expect(ids).toContain(orders.assignedA);
      expect(ids).toContain(orders.assignedPendingA);
      expect(ids).toContain(orders.inProgressA);
      expect(ids).not.toContain(orders.completedA);
      expect(ids).not.toContain(orders.cancelledA);
      for (const status of statusesOf(res.body)) {
        expect(['open', 'assigned', 'in_progress']).toContain(status);
      }
    });

    it('#7 assignment_status=pending → solo órdenes con asignación pending del llamador (AC-BE1.2)', async () => {
      const res = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=pending`)
        .expect(200);
      const ids = idsOf(res.body);
      expect(ids).toContain(orders.pendingA);
      expect(ids).toContain(orders.assignedPendingA);
      expect(ids).toContain(orders.mixedA);
      // Only-accepted, no-assignment and rejected stay out.
      expect(ids).not.toContain(orders.acceptedA);
      expect(ids).not.toContain(orders.inProgressA);
      expect(ids).not.toContain(orders.ownB);
      expect(ids).not.toContain(orders.rejectedA);
    });

    it('#8 status=open + assignment_status=pending → intersección AND (AC-BE1.3)', async () => {
      const res = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?status=open&assignment_status=pending`)
        .expect(200);
      const ids = idsOf(res.body);
      expect(ids).toContain(orders.pendingA);
      expect(ids).toContain(orders.mixedA);
      // Narrowed by each side: pending but not open / open but not pending.
      expect(ids).not.toContain(orders.assignedPendingA);
      expect(ids).not.toContain(orders.acceptedA);
      expect(ids).not.toContain(orders.ownB);
      for (const status of statusesOf(res.body)) expect(status).toBe('open');
    });

    it('#9 asignación en orden de otra empresa: la ve; las ajenas jamás aparecen (AC-BE1.7)', async () => {
      const res = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=pending`)
        .expect(200);
      // The foreign company A order comes through the caller's assignment…
      expect(idsOf(res.body)).toContain(orders.pendingA);
      // …but nothing of company C (no membership, no assignment) ever leaks.
      expect(idsOf(res.body)).not.toContain(orders.ownC);
      for (const order of res.body as Array<{ companyId: string }>) {
        expect(order.companyId).not.toBe(companies.C);
      }
    });

    it('#10 espacio propio sin filtros responde el listado completo, sin regresión (AC-BE1.6)', async () => {
      const res = await agents.ownerA.get(`${API}/companies/${companies.A}/orders`).expect(200);
      const ids = idsOf(res.body);
      for (const key of [
        'openA',
        'assignedA',
        'assignedPendingA',
        'inProgressA',
        'completedA',
        'cancelledA',
        'pendingA',
        'acceptedA',
        'mixedA',
        'rejectedA',
      ]) {
        expect(ids).toContain(orders[key]);
      }
      // Same permissions with a filter: only narrows, never widens.
      const filtered = await agents.ownerA
        .get(`${API}/companies/${companies.A}/orders?status=open`)
        .expect(200);
      const filteredIds = idsOf(filtered.body);
      expect(filteredIds).toContain(orders.openA);
      expect(filteredIds).not.toContain(orders.completedA);
      expect(filteredIds.every((id) => ids.includes(id))).toBe(true);
    });

    it('#11 orden propia sin asignación propia: excluida con assignment_status, incluida con solo status (B3)', async () => {
      // Owner of A holds no assignments at all: own space narrows to empty, never 500.
      const ownerAList = await agents.ownerA
        .get(`${API}/companies/${companies.A}/orders?assignment_status=pending`)
        .expect(200);
      expect(idsOf(ownerAList.body)).toEqual([]);
      const ownerAOpen = await agents.ownerA
        .get(`${API}/companies/${companies.A}/orders?status=open&assignment_status=pending`)
        .expect(200);
      expect(idsOf(ownerAOpen.body)).toEqual([]);
      // Same rule inside ownerB's own space: own order without assignment out.
      const ownerBList = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?status=open&assignment_status=pending`)
        .expect(200);
      expect(idsOf(ownerBList.body)).not.toContain(orders.ownB);
      const ownerBWithoutFilter = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?status=open`)
        .expect(200);
      expect(idsOf(ownerBWithoutFilter.body)).toContain(orders.ownB);
    });

    it('#12 asignación rechazada: invisible con o sin filtro (§2.12)', async () => {
      const withoutFilters = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders`)
        .expect(200);
      expect(idsOf(withoutFilters.body)).not.toContain(orders.rejectedA);
      const byStatus = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?status=open`)
        .expect(200);
      expect(idsOf(byStatus.body)).not.toContain(orders.rejectedA);
      const byAssignment = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=pending`)
        .expect(200);
      expect(idsOf(byAssignment.body)).not.toContain(orders.rejectedA);
    });
  });

  describe('§11 casos excepcionales', () => {
    it('orden con asignaciones mixtas del llamador cumple pending y accepted (B3)', async () => {
      const pending = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=pending`)
        .expect(200);
      expect(idsOf(pending.body)).toContain(orders.mixedA);
      const accepted = await agents.ownerB
        .get(`${API}/companies/${companies.B}/orders?assignment_status=accepted`)
        .expect(200);
      expect(idsOf(accepted.body)).toContain(orders.mixedA);
    });

    it('status con espacios alrededor de los valores se recorta antes de validar', async () => {
      const res = await agents.ownerA
        .get(`${API}/companies/${companies.A}/orders`)
        .query({ status: 'open, assigned' })
        .expect(200);
      const ids = idsOf(res.body);
      expect(ids).toContain(orders.openA);
      expect(ids).toContain(orders.assignedA);
      expect(ids).not.toContain(orders.inProgressA);
      expect(ids).not.toContain(orders.completedA);
    });

    it('parámetro no declarado (foo=1) → 422 (forbidNonWhitelisted global)', async () => {
      await agents.ownerA.get(`${API}/companies/${companies.A}/orders?foo=1`).expect(422);
    });
  });
});
