/* eslint-disable @typescript-eslint/no-explicit-any -- e2e fixtures parse JSON responses loosely */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Client as PgClient } from 'pg';
import { Workbook } from 'exceljs';
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

const todayIso = (): string => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, days: number): string =>
  new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);

/**
 * Etapa 5 (docs/especificacion/etapa-5.md §6): the 54-scenario permission
 * matrix as integration tests over Testcontainers PostgreSQL. A failing
 * scenario blocks the stage (§9).
 */
suite('etapa 5: matriz de facturación y pagos (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let emailService: EmailCapture;
  let pg: PgClient;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a5@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a5@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b5@example.com', name: 'Bruno Owner B' },
    memberB: { email: 'member.b5@example.com', name: 'Milo Member B' },
    ownerC: { email: 'owner.c5@example.com', name: 'Caro Owner C' },
  };
  const companies: Record<string, string> = {};
  const props: Record<string, string> = {};
  const agents: Record<string, Agent> = {};
  const memberships: Record<string, string> = {};
  /** Relation ids shared across scenarios (client relationships, #48+). */
  const fixtures: Record<string, string> = {};
  /** Last emitted number per company, keyed by company id (D2: series). */
  const lastNumber: Record<string, number> = {};

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

  const latestTokenFor = (email: string, kind: '/invitations/' | '/limited/'): string => {
    const mails = emailService.captured.filter((m) => m.to === email && m.text.includes(kind));
    const last = mails[mails.length - 1];
    if (!last) throw new Error(`No captured ${kind} mail for ${email}`);
    const match = new RegExp(`/${kind.slice(1)}([A-Za-z0-9_-]+)`).exec(last.text);
    if (!match) throw new Error(`No token found in captured ${kind} mail`);
    return match[1];
  };

  /** Order of A whose first job is assigned to B and accepted (§11.1, D1a). */
  const orderWithB = async (extraJobs = 0): Promise<OrderFixture> => {
    const created = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({
        propertyId: props.propA,
        title: 'Orden de facturación',
        description: 'Orden creada por el fixture de la Etapa 5.',
      })
      .expect(201);
    const orderId = created.body.id as string;
    const jobIds: string[] = [(created.body.jobs as Array<{ id: string }>)[0].id];
    for (let i = 1; i < (extraJobs + 1); i += 1) {
      const job = await agents.ownerA
        .post(`${API}/companies/${companies.A}/orders/${orderId}/jobs`)
        .send({ title: `Trabajo extra ${i}`, description: 'Segundo trabajo del fixture.' })
        .expect(201);
      jobIds.push(job.body.id as string);
    }
    const assignmentIds: string[] = [];
    // Only the first job goes to B; extra jobs stay free for other fixtures.
    const assignment = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orderId}/assignments`)
      .send({ jobId: jobIds[0], assigneeMembershipId: memberships.profB })
      .expect(201);
    assignmentIds.push(assignment.body.id as string);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${assignment.body.id}/accept`)
      .send({})
      .expect(204);
    return { orderId, jobIds, assignmentIds };
  };

  /** Order of A with job0→B and job1→C, both accepted (line eligibility #9). */
  const orderMix = async (): Promise<OrderFixture> => {
    const order = await orderWithB(1);
    const assignment = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/assignments`)
      .send({ jobId: order.jobIds[1], assigneeMembershipId: memberships.ownerC })
      .expect(201);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/assignments/${assignment.body.id}/accept`)
      .send({})
      .expect(204);
    return { ...order, assignmentIds: [...order.assignmentIds, assignment.body.id as string] };
  };

  /** Own-client order of C (D1b); the job is terminal when asked (§11.4). */
  const clientOrder = async (relationshipId: string, terminal: boolean): Promise<OrderFixture> => {
    const created = await agents.ownerC
      .post(`${API}/companies/${companies.C}/orders`)
      .send({
        propertyId: props.propC,
        title: 'Orden para cliente propio',
        description: 'Trabajo para el cliente propio (fixture Etapa 5).',
        clientRelationshipId: relationshipId,
      })
      .expect(201);
    const orderId = created.body.id as string;
    const jobId = (created.body.jobs as Array<{ id: string }>)[0].id;
    const assignment = await agents.ownerC
      .post(`${API}/companies/${companies.C}/orders/${orderId}/assignments`)
      .send({ jobId, assigneeMembershipId: memberships.ownerC })
      .expect(201);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/assignments/${assignment.body.id}/accept`)
      .send({})
      .expect(204);
    if (terminal) {
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/jobs/${jobId}/start`)
        .send({})
        .expect(204);
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/jobs/${jobId}/complete`)
        .send({})
        .expect(204);
    }
    return { orderId, jobIds: [jobId], assignmentIds: [assignment.body.id as string] };
  };

  const draftOf = async (agent: Agent, companyId: string, orderId: string): Promise<string> => {
    const res = await agent
      .post(`${API}/companies/${companyId}/invoices`)
      .send({ orderId })
      .expect(201);
    return res.body.id as string;
  };

  const putLinesOf = (
    agent: Agent,
    companyId: string,
    invId: string,
    lines: unknown[],
  ) => agent.put(`${API}/companies/${companyId}/invoices/${invId}/lines`).send({ lines });

  const fullLine = (jobId: string, amount = '100.00') => ({
    jobId,
    kind: 'material',
    description: 'Material de prueba',
    amount,
  });

  const emitOf = async (
    agent: Agent,
    companyId: string,
    invId: string,
  ): Promise<{ number: number; dueDate: string; total: string }> => {
    await agent.post(`${API}/companies/${companyId}/invoices/${invId}/emit`).send({}).expect(204);
    const detail = (
      await agent.get(`${API}/companies/${companyId}/invoices/${invId}`).expect(200)
    ).body as { number: number; dueDate: string; total: string };
    lastNumber[companyId] = detail.number;
    return detail;
  };

  /** Fresh accepted order of A→B with one emitted invoice of 100.00. */
  const emittedInvoiceWithB = async (
    amount = '100.00',
  ): Promise<OrderFixture & { invId: string }> => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [fullLine(order.jobIds[0], amount)]).expect(200);
    await emitOf(agents.ownerB, companies.B, invId);
    return { ...order, invId };
  };

  const pay = (agent: Agent, companyId: string, invId: string, body: Record<string, unknown>) =>
    agent.post(`${API}/companies/${companyId}/invoices/${invId}/payments`).send(body);

  const invoiceUrl = (companyId: string, invId: string) =>
    `${API}/companies/${companyId}/invoices/${invId}`;

  /** Simulates the due date having passed (D4/P6: time travel via SQL). */
  const backdateDueDate = async (invId: string): Promise<void> => {
    await pg.query('UPDATE invoices SET due_date = (CURRENT_DATE - 1)::date WHERE id = $1', [
      invId,
    ]);
  };

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

  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  type Getter = { get: (url: string) => request.Test };

  const download = async (agent: Getter, url: string): Promise<Buffer> => {
    const res = await agent.get(url).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    return res.body as Buffer;
  };

  const worksheetRows = async (buffer: Buffer, sheet: string): Promise<any[]> => {
    const workbook = new Workbook();
    // exceljs expects its own Buffer typing; the value is the same bytes.
    await workbook.xlsx.load(buffer as never);
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet ${sheet} missing`);
    const rows: any[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(row.values as any[]);
    });
    return rows;
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
    pg = new PgClient({ connectionString: superUrl });
    await pg.connect();

    for (const account of Object.values(accounts)) {
      await registerUser(account);
    }
    agents.ownerA = await loginUser(accounts.ownerA!.email);
    agents.memberA = await loginUser(accounts.memberA!.email);
    agents.ownerB = await loginUser(accounts.ownerB!.email);
    agents.memberB = await loginUser(accounts.memberB!.email);
    agents.ownerC = await loginUser(accounts.ownerC!.email);

    companies.A = (
      await agents.ownerA
        .post(`${API}/companies`)
        .send({ name: 'Espacio A5', type: 'property_management' })
        .expect(201)
    ).body.id as string;
    companies.B = (
      await agents.ownerB
        .post(`${API}/companies`)
        .send({ name: 'Espacio B5', type: 'contractor' })
        .expect(201)
    ).body.id as string;
    companies.C = (
      await agents.ownerC
        .post(`${API}/companies`)
        .send({ name: 'Espacio C5', type: 'own_business' })
        .expect(201)
    ).body.id as string;

    // Etapa 7 (etapa-7.md D2): taxable lines without any configured rate
    // refuse to emit (422). These fixtures predate the fiscal profile, so
    // the emitters are marked tax-exempt — tax freezes at 0.00 and every
    // total of this approved matrix stays exactly as asserted.
    await agents.ownerB
      .patch(`${API}/companies/${companies.B}`)
      .send({ taxExempt: true })
      .expect(200);
    await agents.ownerC
      .patch(`${API}/companies/${companies.C}`)
      .send({ taxExempt: true })
      .expect(200);

    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);
    await inviteAndAccept('ownerB', companies.B, accounts.memberB, agents.memberB);

    memberships.memberA = await membershipIdOf(agents.ownerA, companies.A, accounts.memberA!.email);
    memberships.ownerC = await membershipIdOf(agents.ownerC, companies.C, accounts.ownerC!.email);
    memberships.profB = await membershipIdOf(agents.ownerB, companies.B, accounts.ownerB!.email);

    props.propA = (
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '1 Billing St', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.propC = (
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/properties`)
        .send({ addressLine: '9 Client Ave', city: 'Kendall', state: 'FL' })
        .expect(201)
    ).body.id as string;

    // Clients of C: one with email (limited token) and one without (D10).
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/clients`)
      .send({ name: 'Roberto Díaz', email: 'roberto.limited5@example.com' })
      .expect(201);
    fixtures.tokenRoberto = latestTokenFor('roberto.limited5@example.com', '/limited/');
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/clients`)
      .send({ name: 'Cliente Sin Correo' })
      .expect(201);
    const clients = await agents.ownerC.get(`${API}/companies/${companies.C}/clients`).expect(200);
    const clientList = clients.body as Array<{ relationshipId: string; name: string }>;
    fixtures.relRoberto = clientList.find((c) => c.name === 'Roberto Díaz')!.relationshipId;
    fixtures.relNoEmail = clientList.find((c) => c.name === 'Cliente Sin Correo')!
      .relationshipId;
  }, 300000);

  afterAll(async () => {
    await pg?.end();
    await app?.close();
    await container?.stop();
  });

  // ---------------------------------------------------------------------
  // 6.1 Acceso base, borradores y elegibilidad (#1–#12)
  // ---------------------------------------------------------------------

  it('#1 cualquier endpoint de facturación sin sesión responde 401', async () => {
    await http().get(`${API}/companies/x/invoices`).expect(401);
    await http().post(`${API}/companies/x/invoices`).send({ orderId: 'y' }).expect(401);
    await http().get(`${API}/companies/x/invoices/y`).expect(401);
    await http().patch(`${API}/companies/x/invoices/y`).send({ notes: 'x' }).expect(401);
    await http().put(`${API}/companies/x/invoices/y/lines`).send({ lines: [] }).expect(401);
    await http().post(`${API}/companies/x/invoices/y/emit`).send({}).expect(401);
    await http().get(`${API}/companies/x/invoices/y/pdf`).expect(401);
    await http().post(`${API}/companies/x/invoices/y/void`).send({ reason: 'x' }).expect(401);
    await http().post(`${API}/companies/x/invoices/y/payments`).send({}).expect(401);
    await http().post(`${API}/companies/x/payments/y/reconcile`).send({}).expect(401);
    await http().get(`${API}/companies/x/accounting-exports?format=pdf`).expect(401);
    await http().get(`${API}/limited/not-a-token/invoices`).expect(401);
  });

  it('#2 contratista con asignación accepted crea borrador -> 201 sin número ni total', async () => {
    const order = await orderWithB();
    const res = await agents.ownerB
      .post(`${API}/companies/${companies.B}/invoices`)
      .send({ orderId: order.orderId })
      .expect(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.number).toBeNull();
    expect(res.body.total).toBeNull();
    expect(res.body.recipient).toEqual({
      kind: 'company',
      companyId: companies.A,
      name: 'Espacio A5',
    });
  });

  it('#3 miembro (rol member) del emisor crea, edita y paga -> 201/200/201 (P4)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.memberB, companies.B, order.orderId);
    await agents.memberB
      .patch(invoiceUrl(companies.B, invId))
      .send({ notes: 'Notas del miembro' })
      .expect(200);
    await putLinesOf(agents.memberB, companies.B, invId, [fullLine(order.jobIds[0])]).expect(200);
    await emitOf(agents.memberB, companies.B, invId);
    const payment = await pay(agents.memberB, companies.B, invId, {
      amount: '40.00',
      paidAt: todayIso(),
    }).expect(201);
    expect(payment.body.status).toBe('recorded');
  });

  it('#4 empresa con asignación aún pending crea borrador -> 409 (§11.1)', async () => {
    const created = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({
        propertyId: props.propA,
        title: 'Orden pending',
        description: 'Asignación sin aceptar.',
      })
      .expect(201);
    const orderId = created.body.id as string;
    const jobId = (created.body.jobs as Array<{ id: string }>)[0].id;
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orderId}/assignments`)
      .send({ jobId, assigneeMembershipId: memberships.profB })
      .expect(201);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/invoices`)
      .send({ orderId })
      .expect(409);
  });

  it('#5 empresa con asignación rejected crea borrador -> 409', async () => {
    const created = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({
        propertyId: props.propA,
        title: 'Orden rejected',
        description: 'Asignación rechazada.',
      })
      .expect(201);
    const orderId = created.body.id as string;
    const jobId = (created.body.jobs as Array<{ id: string }>)[0].id;
    const assignment = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orderId}/assignments`)
      .send({ jobId, assigneeMembershipId: memberships.profB })
      .expect(201);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${assignment.body.id}/reject`)
      .send({})
      .expect(204);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/invoices`)
      .send({ orderId })
      .expect(409);
  });

  it('#6 profesional own_business con trabajo no terminado -> 409; terminado -> 201 (§11.4)', async () => {
    const order = await orderMix();
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${order.jobIds[1]}/start`)
      .send({})
      .expect(204);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/invoices`)
      .send({ orderId: order.orderId })
      .expect(409);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${order.jobIds[1]}/complete`)
      .send({})
      .expect(204);
    await draftOf(agents.ownerC, companies.C, order.orderId);
  });

  it('#7 empresa sin relación con la orden: crear o leer -> 404 (§16.8)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/invoices`)
      .send({ orderId: order.orderId })
      .expect(404);
    await agents.ownerC.get(invoiceUrl(companies.C, invId)).expect(404);
  });

  it('#8 emitir borrador sin renglones o con total 0 -> 422 (§11.1)', async () => {
    const order = await orderWithB();
    const empty = await draftOf(agents.ownerB, companies.B, order.orderId);
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, empty)}/emit`)
      .send({})
      .expect(422);
    const zero = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, zero, [fullLine(order.jobIds[0], '0.00')]).expect(200);
    await agents.ownerB.post(`${invoiceUrl(companies.B, zero)}/emit`).send({}).expect(422);
  });

  it('#9 renglón que referencia un trabajo no facturable por el emisor -> 422', async () => {
    const order = await orderMix();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [fullLine(order.jobIds[1])]).expect(422);
  });

  it('#10 PUT de renglones válidos y PATCH de notas/vencimiento -> 200', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    const lines = await putLinesOf(
      agents.ownerB,
      companies.B,
      invId,
      [fullLine(order.jobIds[0], '70.10'), fullLine(order.jobIds[0], '29.90')],
    ).expect(200);
    expect(lines.body.total).toBeNull();
    const patched = await agents.ownerB
      .patch(invoiceUrl(companies.B, invId))
      .send({ notes: 'Factura de octubre', dueDate: plusDays(todayIso(), 45) })
      .expect(200);
    expect(patched.body.notes).toBe('Factura de octubre');
    expect(patched.body.dueDate).toBe(plusDays(todayIso(), 45));
  });

  it('#11 el destinatario intenta editar el borrador -> 403 (§11.5)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await agents.memberA
      .patch(invoiceUrl(companies.A, invId))
      .send({ notes: 'Intento ajeno' })
      .expect(403);
    await putLinesOf(agents.memberA, companies.A, invId, [fullLine(order.jobIds[0])]).expect(403);
    await agents.memberA.post(`${invoiceUrl(companies.A, invId)}/emit`).send({}).expect(403);
  });

  it('#12 member del emisor no anula -> 403; owner del emisor -> 204 (P4)', async () => {
    const fixture = await emittedInvoiceWithB();
    await agents.memberB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/void`)
      .send({ reason: 'Sin permiso.' })
      .expect(403);
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/void`)
      .send({ reason: 'Emitida por error.' })
      .expect(204);
  });

  // ---------------------------------------------------------------------
  // 6.2 Emisión y PDF (#13–#20)
  // ---------------------------------------------------------------------

  it('#13 emitir asigna número correlativo, congela totales y vence en +30 días (D2, D5, D3)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [fullLine(order.jobIds[0], '80.25')]).expect(200);
    const previous = lastNumber[companies.B] ?? 0;
    const emitted = await emitOf(agents.ownerB, companies.B, invId);
    expect(emitted.number).toBe(previous + 1);
    expect(emitted.total).toBe('80.25');
    expect(emitted.dueDate).toBe(plusDays(todayIso(), 30));

    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, invId)).expect(200)
    ).body as any;
    expect(detail.status).toBe('issued');
    expect(detail.subtotal).toBe(detail.total);
    expect(detail.lines).toHaveLength(1);

    const entries = await auditActions(agents.ownerB, companies.B, 'invoice.emitted');
    const entry = entries.find((e) => e.entityId === invId);
    expect(entry).toBeDefined();
    expect(entry!.actorUserId).toBe(accounts.ownerB!.id);
  });

  it('#14 factura emitida inmutable: PATCH, PUT y reemitir -> 409 (§11.5)', async () => {
    const fixture = await emittedInvoiceWithB();
    await agents.ownerB
      .patch(invoiceUrl(companies.B, fixture.invId))
      .send({ notes: 'Intento de edición' })
      .expect(409);
    await putLinesOf(agents.ownerB, companies.B, fixture.invId, [fullLine(fixture.jobIds[0])]).expect(409);
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/emit`)
      .send({})
      .expect(409);
  });

  it('#15 PDF de emitida -> 200 %PDF; de borrador -> 409', async () => {
    const fixture = await emittedInvoiceWithB();
    const buffer = await download(agents.ownerB, invoiceUrl(companies.B, fixture.invId) + '/pdf');
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    const draft = await draftOf(agents.ownerB, companies.B, fixture.orderId);
    await agents.ownerB.get(`${invoiceUrl(companies.B, draft)}/pdf`).expect(409);
  });

  it('#16 cada empresa emite su propia serie sin entremezclarse (D2)', async () => {
    const order = await orderMix();
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${order.jobIds[1]}/start`)
      .send({})
      .expect(204);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${order.jobIds[1]}/complete`)
      .send({})
      .expect(204);
    const cInvoice = await draftOf(agents.ownerC, companies.C, order.orderId);
    await putLinesOf(agents.ownerC, companies.C, cInvoice, [fullLine(order.jobIds[1], '55.00')]).expect(200);
    const previousC = lastNumber[companies.C] ?? 0;
    const previousB = lastNumber[companies.B] ?? 0;
    const emittedC = await emitOf(agents.ownerC, companies.C, cInvoice);
    expect(emittedC.number).toBe(previousC + 1);

    const bInvoice = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, bInvoice, [fullLine(order.jobIds[0], '65.00')]).expect(200);
    const emittedB = await emitOf(agents.ownerB, companies.B, bInvoice);
    expect(emittedB.number).toBe(previousB + 1);
    expect(emittedB.number).not.toBe(emittedC.number);
  });

  it('#17 doble emisión concurrente del mismo borrador: un 204 y un 409', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [fullLine(order.jobIds[0])]).expect(200);
    const results = await Promise.all([
      agents.ownerB.post(`${invoiceUrl(companies.B, invId)}/emit`).send({}),
      agents.memberB.post(`${invoiceUrl(companies.B, invId)}/emit`).send({}),
    ]);
    const codes = results.map((r) => r.status).sort((a, b) => a - b);
    expect(codes).toEqual([204, 409]);
    const detail = (await agents.ownerB.get(invoiceUrl(companies.B, invId)).expect(200)).body as any;
    lastNumber[companies.B] = detail.number;
  });

  it('#18 anulación conserva factura y pagos; el PDF sigue disponible (§11.5)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '30.00',
      paidAt: todayIso(),
    }).expect(201);
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/void`)
      .send({ reason: 'Datos del cliente incorrectos.' })
      .expect(204);
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.status).toBe('voided');
    expect(detail.number).not.toBeNull();
    expect(detail.payments).toHaveLength(1);
    expect(detail.voidReason).toBe('Datos del cliente incorrectos.');
    const buffer = await download(agents.ownerB, invoiceUrl(companies.B, fixture.invId) + '/pdf');
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('#19 miembro de la receptora intenta anular -> 403', async () => {
    const fixture = await emittedInvoiceWithB();
    await agents.memberA
      .post(`${invoiceUrl(companies.A, fixture.invId)}/void`)
      .send({ reason: 'No corresponde.' })
      .expect(403);
  });

  it('#20 sobre factura anulada no hay pagos (409) pero la orden admite borradores nuevos', async () => {
    const fixture = await emittedInvoiceWithB();
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/void`)
      .send({ reason: 'Anulación de prueba.' })
      .expect(204);
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '10.00',
      paidAt: todayIso(),
    }).expect(409);
    await draftOf(agents.ownerB, companies.B, fixture.orderId);
  });

  // ---------------------------------------------------------------------
  // 6.3 Estados y anulación (#21–#27)
  // ---------------------------------------------------------------------

  it('#21 vencida: dueDate pasado marca overdue; emitida es inmutable (§11.2, D4)', async () => {
    const fixture = await emittedInvoiceWithB();
    await backdateDueDate(fixture.invId);
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.status).toBe('overdue');
    await agents.ownerB
      .patch(invoiceUrl(companies.B, fixture.invId))
      .send({ notes: 'x' })
      .expect(409);
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/emit`)
      .send({})
      .expect(409);
  });

  it('#22 P6: pago parcial sobre vencida queda overdue hasta saldar (§11.2 > §20.4)', async () => {
    const fixture = await emittedInvoiceWithB();
    await backdateDueDate(fixture.invId);
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '40.00',
      paidAt: todayIso(),
    }).expect(201);
    const partial = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(partial.status).toBe('overdue');
    expect(partial.paidNet).toBe('40.00');
    expect(partial.balance).toBe('60.00');

    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '60.00',
      paidAt: todayIso(),
      reference: 'SEGUNDO',
    }).expect(201);
    const settled = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(settled.status).toBe('paid');
    expect(settled.balance).toBe('0.00');
  });

  it('#23 pagos sobre borrador -> 409, sobre pagada -> 422 (§20.4, §11.2)', async () => {
    const order = await orderWithB();
    const draft = await draftOf(agents.ownerB, companies.B, order.orderId);
    await pay(agents.ownerB, companies.B, draft, { amount: '10.00', paidAt: todayIso() }).expect(409);
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '100.00',
      paidAt: todayIso(),
    }).expect(201);
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '1.00',
      paidAt: todayIso(),
      reference: 'OTRO',
    }).expect(422);
  });

  it('#24 no se anula una factura pagada (409) ni se registran pagos futuros (422)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '100.00',
      paidAt: todayIso(),
    }).expect(201);
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/void`)
      .send({ reason: 'Intento tardío.' })
      .expect(409);
    const another = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, another.invId, {
      amount: '10.00',
      paidAt: plusDays(todayIso(), 1),
    }).expect(422);
  });

  it('#25 orden cancelada: sin borradores nuevos; las emitidas conservan validez (§20.1)', async () => {
    const fixture = await emittedInvoiceWithB();
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${fixture.orderId}/cancel`)
      .send({ reason: 'El propietario canceló el trabajo.' })
      .expect(204);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/invoices`)
      .send({ orderId: fixture.orderId })
      .expect(409);
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.status).toBe('issued');
  });

  it('#26 pago sobre factura anulada -> 409 (§11.5)', async () => {
    const fixture = await emittedInvoiceWithB();
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/void`)
      .send({ reason: 'Se anula para la prueba.' })
      .expect(204);
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '10.00',
      paidAt: todayIso(),
    }).expect(409);
  });

  it('#27 asignación revocada tras emitir: la factura sigue válida (D1a)', async () => {
    const fixture = await emittedInvoiceWithB();
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/assignments/${fixture.assignmentIds[0]}/revoke`)
      .send({})
      .expect(204);
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.status).toBe('issued');
    expect(detail.total).toBe('100.00');
  });

  // ---------------------------------------------------------------------
  // 6.4 Pagos, duplicados y devoluciones (#28–#37)
  // ---------------------------------------------------------------------

  it('#28 pago total -> paid con balance 0 y audit payment.registered (§20.4)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '100.00',
      paidAt: todayIso(),
      method: 'transfer',
      reference: 'TRF-100',
    }).expect(201);
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.status).toBe('paid');
    expect(detail.paidNet).toBe('100.00');
    expect(detail.balance).toBe('0.00');
    const entries = await auditActions(agents.ownerB, companies.B, 'payment.registered');
    expect(entries.some((e) => e.payload.invoiceId === fixture.invId)).toBe(true);
  });

  it('#29 pago parcial -> partially_paid con saldo correcto (§20.4)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '25.50',
      paidAt: todayIso(),
    }).expect(201);
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.status).toBe('partially_paid');
    expect(detail.balance).toBe('74.50');
  });

  it('#30 cargo que supera el saldo -> 422 (D7)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '100.01',
      paidAt: todayIso(),
    }).expect(422);
  });

  it('#31 devoluciones: el pagado neto baja y el audit registra payment.refunded (P5)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '100.00',
      paidAt: todayIso(),
    }).expect(201);
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '100.00',
      paidAt: todayIso(),
      kind: 'refund',
      reference: 'REEMBOLSO',
    }).expect(201);
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.paidNet).toBe('0.00');
    expect(detail.status).toBe('issued');
    const entries = await auditActions(agents.ownerB, companies.B, 'payment.refunded');
    expect(entries.some((e) => e.payload.invoiceId === fixture.invId)).toBe(true);
  });

  it('#32 devolución mayor que lo pagado -> 422; el neto nunca baja de 0 (§12)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '20.00',
      paidAt: todayIso(),
    }).expect(201);
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '20.01',
      paidAt: todayIso(),
      kind: 'refund',
    }).expect(422);
  });

  it('#33 ambas partes registran el mismo pago: el segundo queda duplicate_suspect (§11.1, D6)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '50.00',
      paidAt: todayIso(),
      reference: 'TRF-DUP',
    }).expect(201);
    const duplicate = await pay(agents.memberA, companies.A, fixture.invId, {
      amount: '50.00',
      paidAt: todayIso(),
      reference: ' trf-dup ',
    }).expect(201);
    expect(duplicate.body.status).toBe('duplicate_suspect');
    expect(duplicate.body.duplicateOfId).toBeTruthy();
    const detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.paidNet).toBe('50.00');
    expect(detail.payments).toHaveLength(2);
  });

  it('#34 conciliación: same no suma y distinct sí, con audit payment.reconciled (D6)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '50.00',
      paidAt: todayIso(),
      reference: 'TRF-A',
    }).expect(201);
    const suspectSame = (
      await pay(agents.memberA, companies.A, fixture.invId, {
        amount: '50.00',
        paidAt: todayIso(),
        reference: 'TRF-A',
      }).expect(201)
    ).body as any;
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/payments/${suspectSame.id}/reconcile`)
      .send({ resolution: 'same' })
      .expect(204);
    let detail = (
      await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.paidNet).toBe('50.00');
    expect(detail.payments.find((p: any) => p.id === suspectSame.id).status).toBe(
      'duplicate_confirmed',
    );

    // A second look-alike of the recorded payment also lands in suspicion and
    // is then resolved as a distinct transfer (it does add up).
    const suspectDistinct = (
      await pay(agents.memberA, companies.A, fixture.invId, {
        amount: '50.00',
        paidAt: todayIso(),
        reference: 'TRF-A',
      }).expect(201)
    ).body as any;
    expect(suspectDistinct.status).toBe('duplicate_suspect');
    await agents.memberA
      .post(`${API}/companies/${companies.A}/payments/${suspectDistinct.id}/reconcile`)
      .send({ resolution: 'distinct' })
      .expect(204);
    detail = (await agents.ownerB.get(invoiceUrl(companies.B, fixture.invId)).expect(200)).body as any;
    expect(detail.paidNet).toBe('100.00');
    expect(detail.payments.find((p: any) => p.id === suspectDistinct.id).status).toBe('recorded');

    const entries = await auditActions(agents.ownerB, companies.B, 'payment.reconciled');
    expect(entries.some((e) => e.payload.resolution === 'same')).toBe(true);
    // The `distinct` resolution was performed by A's member: it lands in A's log.
    const entriesA = await auditActions(agents.memberA, companies.A, 'payment.reconciled');
    expect(entriesA.some((e) => e.payload.resolution === 'distinct')).toBe(true);
  });

  it('#35 conciliar un pago sin sospecha -> 409; una empresa ajena -> 404', async () => {
    const fixture = await emittedInvoiceWithB();
    const recorded = (
      await pay(agents.ownerB, companies.B, fixture.invId, {
        amount: '10.00',
        paidAt: todayIso(),
      }).expect(201)
    ).body as any;
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/payments/${recorded.id}/reconcile`)
      .send({ resolution: 'same' })
      .expect(409);
    const suspect = (
      await pay(agents.ownerB, companies.B, fixture.invId, {
        amount: '10.00',
        paidAt: todayIso(),
      }).expect(201)
    ).body as any;
    expect(suspect.status).toBe('duplicate_suspect');
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/payments/${suspect.id}/reconcile`)
      .send({ resolution: 'same' })
      .expect(404);
  });

  it('#36 pago total concurrente (distintas referencias): un 201 y un 422 (D7)', async () => {
    const fixture = await emittedInvoiceWithB();
    const results = await Promise.all([
      pay(agents.ownerB, companies.B, fixture.invId, {
        amount: '100.00',
        paidAt: todayIso(),
        reference: 'CARRERA-1',
      }),
      pay(agents.ownerB, companies.B, fixture.invId, {
        amount: '100.00',
        paidAt: todayIso(),
        reference: 'CARRERA-2',
      }),
    ]);
    const codes = results.map((r) => r.status).sort((a, b) => a - b);
    expect(codes).toEqual([201, 422]);
  });

  it('#37 doble conciliación concurrente del mismo pago: un 204 y un 409', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '15.00',
      paidAt: todayIso(),
      reference: 'TRF-RACE',
    }).expect(201);
    const suspect = (
      await pay(agents.memberA, companies.A, fixture.invId, {
        amount: '15.00',
        paidAt: todayIso(),
        reference: 'TRF-RACE',
      }).expect(201)
    ).body as any;
    const results = await Promise.all([
      agents.ownerB
        .post(`${API}/companies/${companies.B}/payments/${suspect.id}/reconcile`)
        .send({ resolution: 'same' }),
      agents.memberA
        .post(`${API}/companies/${companies.A}/payments/${suspect.id}/reconcile`)
        .send({ resolution: 'distinct' }),
    ]);
    const codes = results.map((r) => r.status).sort((a, b) => a - b);
    expect(codes).toEqual([204, 409]);
  });

  // ---------------------------------------------------------------------
  // 6.5 Visibilidad y descargas contables (#38–#47)
  // ---------------------------------------------------------------------

  it('#38 el emisor lista borradores y emitidas; la receptora solo ve emitidas (§11.3)', async () => {
    const order = await orderWithB();
    const draft = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, draft, [fullLine(order.jobIds[0])]).expect(200);
    const emitted = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, emitted, [fullLine(order.jobIds[0])]).expect(200);
    await emitOf(agents.ownerB, companies.B, emitted);

    const issuerList = await agents.ownerB
      .get(`${API}/companies/${companies.B}/invoices?order_id=${order.orderId}`)
      .expect(200);
    const issuerIds = (issuerList.body.data as Array<{ id: string }>).map((i) => i.id);
    expect(issuerIds).toContain(draft);
    expect(issuerIds).toContain(emitted);

    const recipientList = await agents.memberA
      .get(`${API}/companies/${companies.A}/invoices?order_id=${order.orderId}`)
      .expect(200);
    const recipientIds = (recipientList.body.data as Array<{ id: string }>).map((i) => i.id);
    expect(recipientIds).toContain(emitted);
    expect(recipientIds).not.toContain(draft);
    await agents.memberA.get(invoiceUrl(companies.A, draft)).expect(404);
  });

  it('#39 la receptora lee detalle con pagos y saldo, y baja su PDF (§16.10)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '30.00',
      paidAt: todayIso(),
    }).expect(201);
    const detail = (
      await agents.memberA.get(invoiceUrl(companies.A, fixture.invId)).expect(200)
    ).body as any;
    expect(detail.balance).toBe('70.00');
    expect(detail.payments).toHaveLength(1);
    const buffer = await download(agents.memberA, invoiceUrl(companies.A, fixture.invId) + '/pdf');
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('#40 una tercera empresa no ve ni encuentra facturas ajenas (§11.3, §16.8)', async () => {
    const fixture = await emittedInvoiceWithB();
    const list = await agents.ownerC
      .get(`${API}/companies/${companies.C}/invoices`)
      .expect(200);
    const ids = (list.body.data as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(fixture.invId);
    await agents.ownerC.get(invoiceUrl(companies.C, fixture.invId)).expect(404);
    const filtered = await agents.ownerC
      .get(`${API}/companies/${companies.C}/invoices?counterparty_company_id=${companies.B}`)
      .expect(200);
    expect((filtered.body.data as unknown[]).length).toBe(0);
  });

  it('#41 el audit trail cubre creadas, emitidas, pagos, devoluciones, conciliaciones y anulaciones (§12)', async () => {
    const fixture = await emittedInvoiceWithB();
    const recorded = (
      await pay(agents.ownerB, companies.B, fixture.invId, {
        amount: '20.00',
        paidAt: todayIso(),
        reference: 'AUDIT-1',
      }).expect(201)
    ).body as any;
    const suspect = (
      await pay(agents.memberA, companies.A, fixture.invId, {
        amount: '20.00',
        paidAt: todayIso(),
        reference: 'AUDIT-1',
      }).expect(201)
    ).body as any;
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/payments/${suspect.id}/reconcile`)
      .send({ resolution: 'same' })
      .expect(204);
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '5.00',
      paidAt: todayIso(),
      kind: 'refund',
    }).expect(201);
    await agents.ownerB
      .post(`${invoiceUrl(companies.B, fixture.invId)}/void`)
      .send({ reason: 'Cierre del audit trail.' })
      .expect(204);

    for (const action of [
      'invoice.created',
      'invoice.emitted',
      'invoice.voided',
      'payment.registered',
      'payment.refunded',
      'payment.reconciled',
    ]) {
      const entries = await auditActions(agents.ownerB, companies.B, action);
      const relevant = entries.find(
        (e) => e.entityId === fixture.invId || e.payload.invoiceId === fixture.invId,
      );
      // Fails with the missing action name in the assertion location.
      expect(relevant).toBeDefined();
      expect(relevant!.actorUserId).toBeTruthy();
      expect(relevant!.createdAt).toBeTruthy();
    }
    expect(recorded.id).toBeTruthy();
  });

  it('#42 export contable Excel y PDF con audit accounting.exported (§3.5, §16.10)', async () => {
    const fixture = await emittedInvoiceWithB();
    await pay(agents.ownerB, companies.B, fixture.invId, {
      amount: '10.00',
      paidAt: todayIso(),
    }).expect(201);

    const xlsx = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=excel`,
    );
    expect(xlsx.slice(0, 2).toString('hex')).toBe('504b'); // ZIP/xlsx magic
    const facturas = await worksheetRows(xlsx, 'Facturas');
    const pagos = await worksheetRows(xlsx, 'Pagos');
    expect(facturas.some((row) => String(row[5]).includes('Espacio A5'))).toBe(true);
    expect(pagos.some((row) => String(row[4]) === '10.00')).toBe(true);

    const pdfBuffer = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=pdf`,
    );
    expect(pdfBuffer.slice(0, 5).toString()).toBe('%PDF-');

    const entries = await auditActions(agents.ownerB, companies.B, 'accounting.exported');
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.payload.format === 'excel')).toBe(true);
    expect(entries.some((e) => e.payload.format === 'pdf')).toBe(true);
  });

  it('#43 el export sigue disponible tras finalizar la relación comercial (§3.5)', async () => {
    const relation = await agents.ownerA
      .post(`${API}/companies/${companies.A}/commercial-relations`)
      .send({ counterpartyCompanyId: companies.B, label: 'Relación de facturación' })
      .expect(201);
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/commercial-relations/${relation.body.id}`)
      .send({ ended: true })
      .expect(200);
    const buffer = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=excel`,
    );
    expect(buffer.slice(0, 2).toString('hex')).toBe('504b');
  });

  it('#44 el export solo incluye registros propios: nunca de terceras empresas (§16.10)', async () => {
    // C issues an invoice to A; it must never appear in B's export.
    const mix = await orderMix();
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${mix.jobIds[1]}/start`)
      .send({})
      .expect(204);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${mix.jobIds[1]}/complete`)
      .send({})
      .expect(204);
    const cInvoice = await draftOf(agents.ownerC, companies.C, mix.orderId);
    await putLinesOf(agents.ownerC, companies.C, cInvoice, [fullLine(mix.jobIds[1], '77.00')]).expect(200);
    await emitOf(agents.ownerC, companies.C, cInvoice);

    const xlsx = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=excel`,
    );
    const facturas = await worksheetRows(xlsx, 'Facturas');
    expect(facturas.some((row) => String(row[5]).includes('Espacio C5'))).toBe(false);
  });

  it('#45 los filtros del export (periodo, orden, contraparte) reducen el contenido (D11)', async () => {
    const fixture = await emittedInvoiceWithB();
    const empty = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=excel&from=${plusDays(todayIso(), 100)}&to=${plusDays(todayIso(), 200)}`,
    );
    expect((await worksheetRows(empty, 'Facturas')).length).toBe(0);

    const byOrder = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=excel&order_id=${fixture.orderId}`,
    );
    const rows = await worksheetRows(byOrder, 'Facturas');
    expect(rows.length).toBeGreaterThanOrEqual(1);

    const byCounterparty = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=excel&counterparty_company_id=${companies.C}`,
    );
    expect((await worksheetRows(byCounterparty, 'Facturas')).length).toBe(0);

    const entries = await auditActions(agents.ownerB, companies.B, 'accounting.exported');
    expect(entries.some((e) => e.payload.orderId === fixture.orderId)).toBe(true);
  });

  it('#46 el audit accounting.exported guarda formato, filtros y conteos (§16.10)', async () => {
    await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=pdf&from=${todayIso()}`,
    );
    const entries = await auditActions(agents.ownerB, companies.B, 'accounting.exported');
    const entry = entries.find((e) => e.payload.from === todayIso());
    expect(entry).toBeDefined();
    expect(entry!.payload.format).toBe('pdf');
    expect(typeof entry!.payload.invoices).toBe('number');
    expect(typeof entry!.payload.payments).toBe('number');
    expect(typeof entry!.payload.costs).toBe('number');
  });

  it('#47 el token de acceso limitado sigue sin llegar a rutas de empresa (Etapa 2 §5.1)', async () => {
    // There is no `/limited/:token/companies/...` surface at all.
    await http()
      .get(`${API}/limited/${fixtures.tokenRoberto}/companies/${companies.B}/invoices`)
      .expect(404);
    // A direct company route without a session is 401 regardless of any token.
    await http().get(`${API}/companies/${companies.B}/invoices`).expect(401);
    await http()
      .get(`${API}/companies/${companies.B}/accounting-exports?format=pdf`)
      .expect(401);
    expect(fixtures.tokenRoberto).toBeTruthy();
  });

  // ---------------------------------------------------------------------
  // 6.6 Facturación a cliente propio y cuentas limitadas (#48–#54, P3, D1b/D13)
  // ---------------------------------------------------------------------

  it('#48 originadora con trabajo terminal factura a su tenant cliente (D1b, §11.1, §11.4)', async () => {
    const order = await clientOrder(fixtures.relRoberto, true);
    const res = await agents.ownerC
      .post(`${API}/companies/${companies.C}/invoices`)
      .send({ orderId: order.orderId })
      .expect(201);
    expect(res.body.recipient.kind).toBe('tenant');
    expect(res.body.recipient.name).toBe('Roberto Díaz');
    fixtures.clientInvoiceDraft = res.body.id as string;
    fixtures.clientOrderTerminal = order.orderId;
    fixtures.clientOrderTerminalJob = order.jobIds[0];
  });

  it('#49 sin ningún trabajo terminado la factura al cliente -> 409 (§11.4, D1b)', async () => {
    const order = await clientOrder(fixtures.relRoberto, false);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/invoices`)
      .send({ orderId: order.orderId })
      .expect(409);
  });

  it('#50 renglón de la factura al cliente que referencia un trabajo no terminal -> 422', async () => {
    const pending = await clientOrder(fixtures.relRoberto, false);
    await putLinesOf(
      agents.ownerC,
      companies.C,
      fixtures.clientInvoiceDraft,
      [fullLine(pending.jobIds[0])],
    ).expect(422);
    // The invoice's own order job (terminal) is the only billable one (D1b).
    await putLinesOf(
      agents.ownerC,
      companies.C,
      fixtures.clientInvoiceDraft,
      [fullLine(fixtures.clientOrderTerminalJob, '120.00')],
    ).expect(200);
  });

  it('#51 la cuenta limitada del cliente lee solo SUS facturas; otras -> 404 (§11.3, D13)', async () => {
    // Emit the pending draft plus an invoice for the no-email client.
    await agents.ownerC
      .post(`${invoiceUrl(companies.C, fixtures.clientInvoiceDraft)}/emit`)
      .send({})
      .expect(204);
    const noEmailOrder = await clientOrder(fixtures.relNoEmail, true);
    const noEmailInvoice = await draftOf(agents.ownerC, companies.C, noEmailOrder.orderId);
    await putLinesOf(agents.ownerC, companies.C, noEmailInvoice, [
      fullLine(noEmailOrder.jobIds[0], '90.00'),
    ]).expect(200);
    await agents.ownerC
      .post(`${invoiceUrl(companies.C, noEmailInvoice)}/emit`)
      .send({})
      .expect(204);
    fixtures.noEmailInvoice = noEmailInvoice;

    const list = await http()
      .get(`${API}/limited/${fixtures.tokenRoberto}/invoices`)
      .expect(200);
    const ids = (list.body as Array<{ id: string; status: string }>).map((i) => i.id);
    expect(ids).toContain(fixtures.clientInvoiceDraft);
    expect(ids).not.toContain(noEmailInvoice);
    expect((list.body as Array<{ status: string }>).every((i) => i.status !== 'draft')).toBe(true);

    const detail = await http()
      .get(`${API}/limited/${fixtures.tokenRoberto}/invoices/${fixtures.clientInvoiceDraft}`)
      .expect(200);
    expect(detail.body.balance).toBe('120.00');
    expect(detail.body.lines).toHaveLength(1);
    await http()
      .get(`${API}/limited/${fixtures.tokenRoberto}/invoices/${noEmailInvoice}`)
      .expect(404);
    // The limited surface shows order status (Etapa 2 §4.3) but no cost data.
    const limitedOrders = await http()
      .get(`${API}/limited/${fixtures.tokenRoberto}/orders`)
      .expect(200);
    expect(
      (limitedOrders.body as Array<{ id: string }>).some((o) => o.id === fixtures.clientOrderTerminal),
    ).toBe(true);
  });

  it('#52 la cuenta limitada baja el PDF pero no paga, anula ni exporta (D13)', async () => {
    const buffer = await download(
      http(),
      `${API}/limited/${fixtures.tokenRoberto}/invoices/${fixtures.clientInvoiceDraft}/pdf`,
    );
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    await http()
      .post(`${API}/limited/${fixtures.tokenRoberto}/invoices/${fixtures.clientInvoiceDraft}/payments`)
      .send({ amount: '10.00', paidAt: todayIso() })
      .expect(404);
    await http()
      .post(`${API}/limited/${fixtures.tokenRoberto}/invoices/${fixtures.clientInvoiceDraft}/void`)
      .send({ reason: 'x' })
      .expect(404);
    await http()
      .get(`${API}/limited/${fixtures.tokenRoberto}/accounting-exports?format=pdf`)
      .expect(404);
  });

  it('#53 el correo invoice.issued llega al cliente con email y se omite sin email (D10, §14.1)', async () => {
    const before = emailService.captured.filter((m) => m.subject.includes('Factura N.º')).length;
    const order = await clientOrder(fixtures.relRoberto, true);
    const invId = await draftOf(agents.ownerC, companies.C, order.orderId);
    await putLinesOf(agents.ownerC, companies.C, invId, [fullLine(order.jobIds[0], '33.00')]).expect(200);
    await agents.ownerC.post(`${invoiceUrl(companies.C, invId)}/emit`).send({}).expect(204);
    const afterRoberto = emailService.captured.filter((m) => m.subject.includes('Factura N.º'));
    expect(afterRoberto.length).toBe(before + 1);
    expect(afterRoberto[afterRoberto.length - 1].to).toBe('roberto.limited5@example.com');

    const noEmailOrder = await clientOrder(fixtures.relNoEmail, true);
    const noEmailDraft = await draftOf(agents.ownerC, companies.C, noEmailOrder.orderId);
    await putLinesOf(agents.ownerC, companies.C, noEmailDraft, [
      fullLine(noEmailOrder.jobIds[0], '44.00'),
    ]).expect(200);
    await agents.ownerC.post(`${invoiceUrl(companies.C, noEmailDraft)}/emit`).send({}).expect(204);
    const afterNoEmail = emailService.captured.filter((m) => m.subject.includes('Factura N.º'));
    expect(afterNoEmail.length).toBe(afterRoberto.length);
  });

  it('#54 el export contable de la emisora incluye las facturas a clientes propios y sus pagos', async () => {
    await pay(agents.ownerC, companies.C, fixtures.clientInvoiceDraft, {
      amount: '20.00',
      paidAt: todayIso(),
      reference: 'CLIENTE-PAGO',
    }).expect(201);
    const xlsx = await download(
      agents.ownerC,
      `${API}/companies/${companies.C}/accounting-exports?format=excel`,
    );
    const facturas = await worksheetRows(xlsx, 'Facturas');
    const pagos = await worksheetRows(xlsx, 'Pagos');
    expect(facturas.some((row) => String(row[5]).includes('Roberto'))).toBe(true);
    expect(pagos.some((row) => String(row[5]) === 'CLIENTE-PAGO')).toBe(true);
  });
});
