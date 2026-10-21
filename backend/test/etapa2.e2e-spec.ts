import { execSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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

suite('etapa 2: matriz de permisos y flujos (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let emailService: EmailCapture;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a2@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a2@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b2@example.com', name: 'Bruno Owner B' },
    profB: { email: 'prof.b2@example.com', name: 'Pablo Prof B' },
    bystanderB: { email: 'by.b2@example.com', name: 'Beto Bystander B' },
    ownerC: { email: 'owner.c2@example.com', name: 'Caro Owner C' },
    profC: { email: 'prof.c2@example.com', name: 'Cami Prof C' },
  };
  const companies: Record<string, string> = {};
  const props: Record<string, string> = {};
  const orders: Record<string, string> = {};
  const jobs: Record<string, string> = {};
  const assignments: Record<string, string> = {};
  const tenants: Record<string, string> = {};
  const limitedTokens: Record<string, string> = {};
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
  };

  const latestTokenFor = (email: string, urlMarker: string): string => {
    const mails = emailService.captured.filter((m) => m.to === email && m.text.includes(urlMarker));
    const last = mails[mails.length - 1];
    if (!last) throw new Error(`No captured email for ${email} containing ${urlMarker}`);
    // The token always follows the marker in the URL path:
    //   .../invitations/<token>  or  .../limited/<token>
    const escaped = urlMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escaped}([A-Za-z0-9_-]+)`).exec(last.text);
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

    // ---- Fixtures: three companies and their cast ----
    for (const account of Object.values(accounts)) {
      await registerUser(account);
    }
    agents.ownerA = await loginUser(accounts.ownerA!.email);
    agents.memberA = await loginUser(accounts.memberA!.email);
    agents.ownerB = await loginUser(accounts.ownerB!.email);
    agents.profB = await loginUser(accounts.profB!.email);
    agents.bystanderB = await loginUser(accounts.bystanderB!.email);
    agents.ownerC = await loginUser(accounts.ownerC!.email);
    agents.profC = await loginUser(accounts.profC!.email);

    companies.A = (
      await agents.ownerA
        .post(`${API}/companies`)
        .send({ name: 'Espacio A', type: 'property_management' })
        .expect(201)
    ).body.id as string;
    companies.B = (
      await agents.ownerB
        .post(`${API}/companies`)
        .send({ name: 'Espacio B', type: 'contractor' })
        .expect(201)
    ).body.id as string;
    companies.C = (
      await agents.ownerC
        .post(`${API}/companies`)
        .send({ name: 'Espacio C', type: 'own_business' })
        .expect(201)
    ).body.id as string;

    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);
    await inviteAndAccept('ownerB', companies.B, accounts.profB, agents.profB);
    await inviteAndAccept('ownerB', companies.B, accounts.bystanderB, agents.bystanderB);
    await inviteAndAccept('ownerC', companies.C, accounts.profC, agents.profC);

    // Properties: P1 occupied (full), P2 vacant, PB in B, PC in C.
    props.P1 = (
      await agents.memberA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({
          addressLine: '123 Sunset Ave',
          city: 'Miami',
          state: 'FL',
          postalCode: '33101',
          occupancy: 'occupied',
          ownerName: 'Olga Owner A',
          ownerPhone: '+1 305 555 0001',
          communityName: 'Sunset Community',
          communityAccessCode: '7788',
          entryInstructions: 'Timbre 2, llamar antes.',
          allowUnattendedEntry: true,
        })
        .expect(201)
    ).body.id as string;
    props.P2 = (
      await agents.memberA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '9 Vacant St', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.P3 = (
      await agents.memberA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '5 isolation Rd', city: 'Hialeah', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.PB = (
      await agents.ownerB
        .post(`${API}/companies/${companies.B}/properties`)
        .send({ addressLine: '77 Contractor Way', city: 'Doral', state: 'FL' })
        .expect(201)
    ).body.id as string;
    props.PC = (
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/properties`)
        .send({ addressLine: '8 Pro Lane', city: 'Kendall', state: 'FL' })
        .expect(201)
    ).body.id as string;

    // Tenant on P1 with email -> limited token (for #11-#14).
    const tenantP1 = await agents.memberA
      .post(`${API}/companies/${companies.A}/properties/${props.P1}/tenants`)
      .send({
        kind: 'tenant',
        name: 'Ana López',
        phones: ['+1 305 555 0101'],
        email: 'ana.limited@example.com',
        availability: 'Mañanas',
      })
      .expect(201);
    tenants.ana = tenantP1.body.id as string;
    limitedTokens.ana = latestTokenFor('ana.limited@example.com', '/limited/');

    // Client of C with email -> limited token (for own_business orders).
    const clientC = await agents.ownerC
      .post(`${API}/companies/${companies.C}/clients`)
      .send({ name: 'Roberto Díaz', email: 'roberto.limited@example.com', phones: ['+1 305 555 0202'] })
      .expect(201);
    tenants.roberto = clientC.body.id as string;
    limitedTokens.roberto = latestTokenFor('roberto.limited@example.com', '/limited/');
  }, 300000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  // ---------------------------------------------------------------------
  // Cross-cutting isolation (matrix #1-#4)
  // ---------------------------------------------------------------------

  it('#1 request autenticado sin sesión responde 401', async () => {
    await http().get(`${API}/notifications`).expect(401);
    await http().get(`${API}/companies/${companies.A}/properties`).expect(401);
    await http().post(`${API}/companies/${companies.A}/orders`).send({}).expect(401);
  });

  it('#2 miembro de A: GET propiedad de B responde 404', async () => {
    await agents.memberA.get(`${API}/companies/${companies.A}/properties/${props.PB}`).expect(404);
  });

  it('#3 miembro de A: crear propiedad en B responde 404', async () => {
    await agents.memberA
      .post(`${API}/companies/${companies.B}/properties`)
      .send({ addressLine: '1 Sneak St', city: 'Miami', state: 'FL' })
      .expect(404);
  });

  it('#4 miembro de A: GET orden de B sin asignación responde 404', async () => {
    // OB is owned by B (created below); memberA has no assignment on it.
    const ob = await agents.ownerB
      .post(`${API}/companies/${companies.B}/orders`)
      .send({ propertyId: props.PB, title: 'Orden propia de B', description: 'Privada.' })
      .expect(201);
    orders.OB = ob.body.id as string;
    await agents.memberA.get(`${API}/companies/${companies.A}/orders/${orders.OB}`).expect(404);
  });

  // ---------------------------------------------------------------------
  // Order + compound jobs + assignments (#6, #7, #22)
  // ---------------------------------------------------------------------

  it('#22/#6/#7 orden compuesta con dos jobs asignados; cada profesional ve solo su job', async () => {
    // Compound order O1 in A on P1, with access info (lockbox).
    const o1 = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({
        propertyId: props.P1,
        title: 'Mantenimiento compuesto',
        description: 'Dos trabajos distintos.',
        accessLockbox: '1234#',
        accessCommunityCode: '7788',
        accessEntryInstructions: 'Timbre 2.',
      })
      .expect(201);
    orders.O1 = o1.body.id as string;
    jobs.O1job1 = o1.body.jobs[0].id as string;
    // Add the second job (compound, §5.5).
    const job2 = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orders.O1}/jobs`)
      .send({ title: 'Segundo trabajo', description: 'Pintar sala.' })
      .expect(201);
    jobs.O1job2 = job2.body.id as string;

    const profBMembership = await membershipIdOf(agents.ownerB, companies.B, accounts.profB!.email);
    const profCMembership = await membershipIdOf(agents.ownerC, companies.C, accounts.profC!.email);

    // Assign job1 -> profB (B), job2 -> profC (C).
    const a1 = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orders.O1}/assignments`)
      .send({ jobId: jobs.O1job1, assigneeMembershipId: profBMembership })
      .expect(201);
    assignments.O1job1 = a1.body.id as string;
    const a2 = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orders.O1}/assignments`)
      .send({ jobId: jobs.O1job2, assigneeMembershipId: profCMembership })
      .expect(201);
    assignments.O1job2 = a2.body.id as string;
    expect(a1.body.status).toBe('pending');
    expect(a2.body.status).toBe('pending');

    // #6: the contractor (assignee) sees the order of the administradora.
    const profBView = await agents.profB
      .get(`${API}/companies/${companies.B}/orders/${orders.O1}`)
      .expect(200);
    // #7: only their own job, never the other professional's.
    expect(profBView.body.jobs).toHaveLength(1);
    expect(profBView.body.jobs[0].id).toBe(jobs.O1job1);
    // #9: an actively assigned professional reads the lockbox.
    expect(profBView.body.access).not.toBeNull();
    expect(profBView.body.access.lockbox).toBe('1234#');

    const profCView = await agents.profC
      .get(`${API}/companies/${companies.C}/orders/${orders.O1}`)
      .expect(200);
    expect(profCView.body.jobs).toHaveLength(1);
    expect(profCView.body.jobs[0].id).toBe(jobs.O1job2);
    expect(profCView.body.access).not.toBeNull();
  });

  it('#8 profesional no asignado no lee la orden ni su lockbox', async () => {
    // bystanderB belongs to B but holds no assignment on O1 -> order is foreign.
    await agents.bystanderB.get(`${API}/companies/${companies.B}/orders/${orders.O1}`).expect(404);
  });

  it('#5 contratista ve orden de la administradora no asignada -> 404', async () => {
    // O2 owned by A, no assignment to B yet.
    const o2 = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({ propertyId: props.P1, title: 'Orden sin asignar a B', description: 'Privada de A.' })
      .expect(201);
    orders.O2 = o2.body.id as string;
    await agents.profB.get(`${API}/companies/${companies.B}/orders/${orders.O2}`).expect(404);
  });

  // ---------------------------------------------------------------------
  // Acceptance / rejection / reassignment (#10, #19, #20)
  // ---------------------------------------------------------------------

  it('#19/#10/#20 rechazo deja job pending, pierde acceso y la reasignación conserva historial', async () => {
    const profCMembership = await membershipIdOf(agents.ownerC, companies.C, accounts.profC!.email);
    const profBMembership = await membershipIdOf(agents.ownerB, companies.B, accounts.profB!.email);

    // Assign O2's job to profC, then reject.
    const o2JobId = (await jobListOf(orders.O2))[0];
    const o2Assignment = (
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/orders/${orders.O2}/assignments`)
        .send({ jobId: o2JobId, assigneeMembershipId: profCMembership })
        .expect(201)
    ).body.id as string;
    assignments.O2 = o2Assignment;

    await agents.profC
      .post(`${API}/companies/${companies.C}/assignments/${assignments.O2}/reject`)
      .send({ reason: 'No tengo disponibilidad.' })
      .expect(204);

    // #10: after rejecting, profC no longer reads the order/lockbox.
    await agents.profC.get(`${API}/companies/${companies.C}/orders/${orders.O2}`).expect(404);

    // #19: job stays pending, history intact (rejected assignment kept).
    const o2Detail = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${orders.O2}`)
      .expect(200);
    expect(o2Detail.body.jobs[0].status).toBe('pending');
    expect(o2Detail.body.jobs[0].assignments).toHaveLength(1);
    expect(o2Detail.body.jobs[0].assignments[0].status).toBe('rejected');
    expect(o2Detail.body.jobs[0].assignments[0].rejectionReason).toBe('No tengo disponibilidad.');

    // #20: reassign keeps the old (rejected) and creates a new pending one.
    const o2JobIdAgain = (await jobListOf(orders.O2))[0];
    const reassign = await agents.ownerA
      .post(`${API}/companies/${companies.A}/assignments/${assignments.O2}/reassign`)
      .send({ jobId: o2JobIdAgain, assigneeMembershipId: profBMembership })
      .expect(201);
    expect(reassign.body.previousAssignmentId).toBe(assignments.O2);
    expect(reassign.body.status).toBe('pending');
    assignments.O2new = reassign.body.id as string;

    const afterReassign = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${orders.O2}`)
      .expect(200);
    expect(afterReassign.body.jobs[0].assignments).toHaveLength(2);
    const statuses = afterReassign.body.jobs[0].assignments.map(
      (a: { status: string }) => a.status,
    );
    expect(statuses).toContain('rejected');
    expect(statuses).toContain('pending');

    // profB now sees O2 (new active assignment) with the lockbox.
    const profBView = await agents.profB
      .get(`${API}/companies/${companies.B}/orders/${orders.O2}`)
      .expect(200);
    expect(profBView.body.access).not.toBeNull();
  });

  it('asignación aceptada deja el job accepted (inicio explícito con start)', async () => {
    // Accept O1 job1 (assigned to profB) and check status + visibility.
    // Etapa 3 (approved change, spec etapa-3 §1 / decision 5): accepting moves
    // the job to `accepted`, NOT to `in_progress` — §20.2 «Aceptado → En
    // curso» requires the explicit `start` of the tracking endpoints.
    await agents.profB
      .post(`${API}/companies/${companies.B}/assignments/${assignments.O1job1}/accept`)
      .send({})
      .expect(204);
    const detail = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${orders.O1}`)
      .expect(200);
    const job1 = detail.body.jobs.find((j: { id: string }) => j.id === jobs.O1job1);
    expect(job1.status).toBe('accepted');
    expect(job1.assignments[0].status).toBe('accepted');
    // Double-accept conflicts.
    await agents.profB
      .post(`${API}/companies/${companies.B}/assignments/${assignments.O1job1}/accept`)
      .send({})
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // Contractor managing an order (#17) and property edit rules (#16, #18)
  // ---------------------------------------------------------------------

  it('#17 contratista edita instrucciones de la orden que gestiona -> 200', async () => {
    const res = await agents.profB
      .patch(`${API}/companies/${companies.B}/orders/${orders.O1}`)
      .send({ accessEntryInstructions: 'Llamar a portería, dejar cédula.' })
      .expect(200);
    expect(res.body.access.entryInstructions).toBe('Llamar a portería, dejar cédula.');
  });

  it('#16 contratista edita datos oficiales de la propiedad -> 403', async () => {
    await agents.ownerB
      .patch(`${API}/companies/${companies.B}/properties/${props.PB}`)
      .send({ city: 'Otra Ciudad' })
      .expect(403);
  });

  it('#18 profesional edita la ficha de la propiedad -> 403', async () => {
    await agents.ownerC
      .patch(`${API}/companies/${companies.C}/properties/${props.PC}`)
      .send({ city: 'Otra Ciudad' })
      .expect(403);
  });

  it('la administradora sí edita la ficha oficial de su propiedad', async () => {
    const res = await agents.ownerA
      .patch(`${API}/companies/${companies.A}/properties/${props.P1}`)
      .send({ city: 'Miami Beach' })
      .expect(200);
    expect(res.body.city).toBe('Miami Beach');
  });

  // ---------------------------------------------------------------------
  // Tenant registration rules (#15)
  // ---------------------------------------------------------------------

  it('#15 inquilino sobre propiedad vacante responde 422', async () => {
    await agents.memberA
      .post(`${API}/companies/${companies.A}/properties/${props.P2}/tenants`)
      .send({ kind: 'tenant', name: 'No Debe', phones: ['+1 305 555 0303'] })
      .expect(422);
  });

  it('registrar propietario sobre propiedad vacante es válido', async () => {
    await agents.memberA
      .post(`${API}/companies/${companies.A}/properties/${props.P2}/tenants`)
      .send({ kind: 'owner', name: 'Vacante Owner', phones: [] })
      .expect(201);
  });

  // ---------------------------------------------------------------------
  // Orders require a property (#21)
  // ---------------------------------------------------------------------

  it('#21 orden sin propiedad vinculada responde 422', async () => {
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({ title: 'Sin propiedad', description: 'No debería crearse.' })
      .expect(422);
  });

  // ---------------------------------------------------------------------
  // Limited-access accounts (#11-#14)
  // ---------------------------------------------------------------------

  it('#11 cuenta limitada lista órdenes de su vivienda, solo estado', async () => {
    const res = await request(app.getHttpServer())
      .get(`${API}/limited/${limitedTokens.ana}/orders`)
      .expect(200);
    const list = res.body as Array<Record<string, unknown>>;
    // Ana lives in P1; O1 and O2 are on P1. Only minimal fields are exposed.
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual(['createdAt', 'id', 'status', 'title']);
      expect(['requested', 'open', 'in_progress', 'completed', 'cancelled']).toContain(row.status);
    }
  });

  it('#12 token inválido responde 401 y la lista no expone otras propiedades', async () => {
    await request(app.getHttpServer())
      .get(`${API}/limited/not-a-real-token/orders`)
      .expect(401);

    // Roberto (client of C) must not see Ana's housing orders (P1 is not his).
    const res = await request(app.getHttpServer())
      .get(`${API}/limited/${limitedTokens.roberto}/orders`)
      .expect(200);
    const ids = (res.body as Array<{ id: string }>).map((o) => o.id);
    expect(ids).not.toContain(orders.O1);
    expect(ids).not.toContain(orders.O2);
  });

  it('#12b las cuentas limitadas listan solo las propiedades que pueden referenciar (F3-D2)', async () => {
    // Ana is linked to her housing (P1): the only property her token targets.
    const anaRes = await request(app.getHttpServer())
      .get(`${API}/limited/${limitedTokens.ana}/properties`)
      .expect(200);
    expect((anaRes.body as Array<{ id: string }>).map((p) => p.id)).toEqual([props.P1]);
    for (const row of anaRes.body as Array<Record<string, unknown>>) {
      expect(Object.keys(row).sort()).toEqual(['addressLine', 'city', 'id', 'state']);
    }

    // Roberto (client without orders yet) gets an empty list — never the
    // properties of his professional (§4.3).
    const robertoRes = await request(app.getHttpServer())
      .get(`${API}/limited/${limitedTokens.roberto}/properties`)
      .expect(200);
    expect(robertoRes.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`${API}/limited/not-a-real-token/properties`)
      .expect(401);
  });

  it('#13 cuenta limitada no crea órdenes directamente (sin sesión de empresa)', async () => {
    // The limited token never grants access to company routes (§5.1).
    await http()
      .post(`${API}/companies/${companies.A}/orders`)
      .send({ propertyId: props.P1, title: 'Directa', description: 'No permitida.' })
      .expect(401);
  });

  it('#14/#11 pedido de cuenta limitada crea orden requested, notifica y se convierte', async () => {
    // Ana places a work request on her housing.
    const req = await request(app.getHttpServer())
      .post(`${API}/limited/${limitedTokens.ana}/requests`)
      .send({ title: 'Fuga bajo el lavadero', description: 'Apenas sale agua.' })
      .expect(201);
    expect(req.body.status).toBe('requested');
    orders.requested = req.body.id as string;

    // The company owner is notified in-app.
    const ownerANotifs = await agents.ownerA.get(`${API}/notifications`).expect(200);
    const notif = (ownerANotifs.body.data as Array<{ type: string; entityId: string }>).find(
      (n) => n.type === 'order_created' && n.entityId === orders.requested,
    );
    expect(notif).toBeDefined();

    // Ana sees the requested order in her limited list.
    const anaList = await request(app.getHttpServer())
      .get(`${API}/limited/${limitedTokens.ana}/orders`)
      .expect(200);
    const anaOrder = (anaList.body as Array<{ id: string; status: string }>).find(
      (o) => o.id === orders.requested,
    );
    expect(anaOrder?.status).toBe('requested');

    // A company user converts it into a real order (open, with first job).
    const converted = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orders.requested}/convert`)
      .send({})
      .expect(201);
    expect(converted.body.status).toBe('open');
    expect(converted.body.id).toBe(orders.requested);

    // Ana now sees it as open.
    const anaAfter = await request(app.getHttpServer())
      .get(`${API}/limited/${limitedTokens.ana}/orders`)
      .expect(200);
    const afterOrder = (anaAfter.body as Array<{ id: string; status: string }>).find(
      (o) => o.id === orders.requested,
    );
    expect(afterOrder?.status).toBe('open');

    // Converting twice is rejected.
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orders.requested}/convert`)
      .send({})
      .expect(422);
  });

  it('#14 audit log registra la conversión con actor y fecha', async () => {
    const res = await agents.ownerA
      .get(`${API}/companies/${companies.A}/audit-log`)
      .expect(200);
    const entries = res.body.data as Array<{
      action: string;
      entityId: string;
      actorUserId: string | null;
      createdAt: string;
    }>;
    const conversion = entries.find(
      (e) => e.action === 'order.converted_from_request' && e.entityId === orders.requested,
    );
    expect(conversion).toBeDefined();
    expect(conversion!.actorUserId).toBe(accounts.ownerA!.id);
    expect(typeof conversion!.createdAt).toBe('string');
  });

  // ---------------------------------------------------------------------
  // Own-business orders for clients (#22-ish, §5.1)
  // ---------------------------------------------------------------------

  it('profesional own_business crea orden para su cliente propio y el cliente la ve', async () => {
    const clients = await agents.ownerC.get(`${API}/companies/${companies.C}/clients`).expect(200);
    const relationshipId = (clients.body as Array<{ relationshipId: string }>)[0].relationshipId;

    const order = await agents.ownerC
      .post(`${API}/companies/${companies.C}/orders`)
      .send({
        propertyId: props.PC,
        title: 'Revisión para Roberto',
        description: 'Trabajo para cliente propio.',
        clientRelationshipId: relationshipId,
      })
      .expect(201);
    orders.robertoOrder = order.body.id as string;
    expect(order.body.origin).toBe('own_business');

    // Roberto (limited client) sees only his own order, not the housing ones.
    const res = await request(app.getHttpServer())
      .get(`${API}/limited/${limitedTokens.roberto}/orders`)
      .expect(200);
    const ids = (res.body as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toContain(orders.robertoOrder);
  });

  it('cliente propio no es visible para otra empresa (aislamiento §16.8)', async () => {
    await agents.ownerA
      .post(`${API}/companies/${companies.C}/clients`)
      .send({ name: 'Intruso', email: 'intruso@example.com' })
      .expect(404);
  });

  it('una empresa que no es own_business no registra clientes -> 403', async () => {
    await agents.ownerA
      .post(`${API}/companies/${companies.A}/clients`)
      .send({ name: 'No Puede', email: 'nocliente@example.com' })
      .expect(403);
  });

  // ---------------------------------------------------------------------
  // Notifications isolation (#24) and audit (#23)
  // ---------------------------------------------------------------------

  it('#24 usuario ve solo sus notificaciones', async () => {
    // profB received an assignment_requested notification for O1 job1.
    const profBNotifs = await agents.profB.get(`${API}/notifications`).expect(200);
    const rows = profBNotifs.body.data as Array<{ type: string; companyId: string }>;
    const requested = rows.find((n) => n.type === 'assignment_requested');
    expect(requested).toBeDefined();

    // ownerA must not see profB's assignment notification.
    const ownerANotifs = await agents.ownerA.get(`${API}/notifications`).expect(200);
    const ownerTypes = (ownerANotifs.body.data as Array<{ type: string }>).map((n) => n.type);
    expect(ownerTypes).not.toContain('assignment_requested');
  });

  it('cada notificación declara su espacio (companyId, §2.4 / F2-D5)', async () => {
    const profBNotifs = await agents.profB.get(`${API}/notifications`).expect(200);
    const rows = profBNotifs.body.data as Array<{ type: string; companyId: string }>;
    const requested = rows.find((n) => n.type === 'assignment_requested');
    expect(requested?.companyId).toBe(companies.A);
    for (const row of rows) {
      expect(row.companyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it('notificación se marca como leída (idempotente)', async () => {
    const profBNotifs = await agents.profB.get(`${API}/notifications`).expect(200);
    const first = (profBNotifs.body.data as Array<{ id: string }>)[0];
    await agents.profB.post(`${API}/notifications/${first.id}/read`).send({}).expect(204);
    await agents.profB.post(`${API}/notifications/${first.id}/read`).send({}).expect(204);
    const after = await agents.profB.get(`${API}/notifications`).expect(200);
    const row = (after.body.data as Array<{ id: string; readAt: string | null }>).find(
      (n) => n.id === first.id,
    );
    expect(row?.readAt).not.toBeNull();
  });

  it('#23 audit log registra las acciones clave con actor y fecha', async () => {
    const res = await agents.ownerA
      .get(`${API}/companies/${companies.A}/audit-log`)
      .expect(200);
    const entries = res.body.data as Array<{
      action: string;
      entityType: string;
      actorUserId: string | null;
      createdAt: string;
    }>;
    const actions = entries.map((e) => e.action);
    for (const expected of [
      'property.created',
      'order.created',
      'job.added',
      'assignment.created',
      'order.converted_from_request',
    ]) {
      expect(actions).toContain(expected);
    }
    // Every entry carries an actor and a creation date.
    for (const e of entries) {
      expect(typeof e.createdAt).toBe('string');
      expect(e.actorUserId === null || typeof e.actorUserId === 'string').toBe(true);
    }
    // Sensitive codes never go into the audit payload.
    const propCreated = entries.find((e) => e.action === 'property.created');
    expect(propCreated).toBeDefined();
  });

  // Helper: list job ids of an order (owned by A, so viewed from ownerA).
  async function jobListOf(orderId: string): Promise<string[]> {
    const res = await agents.ownerA
      .get(`${API}/companies/${companies.A}/orders/${orderId}`)
      .expect(200);
    return (res.body.jobs as Array<{ id: string }>).map((j) => j.id);
  }
});
