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

interface SweepService {
  sweep: (now?: Date) => Promise<{ reminders: number; escalations: number }>;
}

/**
 * Etapa 6 (docs/especificacion/etapa-6.md §6): the 34-scenario permission
 * matrix as integration tests over Testcontainers PostgreSQL. The urgency
 * sweep is invoked directly as a service with a controlled clock (no real
 * timers, §8); a failing scenario blocks the stage (§9).
 */
suite('etapa 6: matriz de garantías, urgencias, preferencias y suscripciones (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let emailService: EmailCapture;
  let pg: PgClient;
  let urgencyService: SweepService;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a6@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a6@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b6@example.com', name: 'Bruno Owner B' },
    memberB: { email: 'member.b6@example.com', name: 'Milo Member B' },
    ownerC: { email: 'owner.c6@example.com', name: 'Caro Owner C' },
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

  /** Order of A with one pending job (no assignment). Titles are unique so
   * scenario assertions (email capture) never match a previous fixture. */
  let orderSeq = 0;
  const activeOrderA = async (): Promise<{ orderId: string; jobId: string; title: string }> => {
    orderSeq += 1;
    const title = `Orden activa E6-${orderSeq}`;
    const created = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({
        propertyId: props.propA,
        title,
        description: 'Fixture activo de la Etapa 6.',
      })
      .expect(201);
    return {
      orderId: created.body.id as string,
      jobId: (created.body.jobs as Array<{ id: string }>)[0].id,
      title,
    };
  };

  /** Order of A whose job is assigned to B, accepted and completed. The job
   * lifecycle belongs to the assignee company (B), as in stages 2–5. */
  const completedOrderA = async (): Promise<{ orderId: string; jobId: string; title: string }> => {
    const order = await activeOrderA();
    const assignment = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/assignments`)
      .send({ jobId: order.jobId, assigneeMembershipId: memberships.profB })
      .expect(201);
    const assignmentId = assignment.body.id as string;
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/assignments/${assignmentId}/accept`)
      .send({})
      .expect(204);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobId}/start`)
      .send({})
      .expect(204);
    await agents.ownerB
      .post(`${API}/companies/${companies.B}/jobs/${order.jobId}/complete`)
      .send({})
      .expect(204);
    return order;
  };

  /**
   * Active urgent order of A with a *pending* assignment to B's owner.
   * The caller marks it urgent; the assignee company window is B's (D1/D2).
   */
  const urgentPendingOrderA = async (): Promise<{ orderId: string; jobId: string; assignmentId: string; title: string }> => {
    const order = await activeOrderA();
    const assignment = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${order.orderId}/assignments`)
      .send({ jobId: order.jobId, assigneeMembershipId: memberships.profB })
      .expect(201);
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}/orders/${order.orderId}`)
      .send({ urgent: true })
      .expect(200);
    return { ...order, assignmentId: assignment.body.id as string };
  };

  /** Sweep with a controlled clock: `offsetHours` after "now". */
  const sweepAt = (offsetHours: number) =>
    urgencyService.sweep(new Date(Date.now() + offsetHours * 3_600_000));

  const noticesFor = async (entityId: string, type: string): Promise<number> => {
    const res = await pg.query(
      'SELECT count(*)::int AS n FROM notifications WHERE entity_id = $1 AND type = $2',
      [entityId, type],
    );
    return res.rows[0].n as number;
  };

  const emailsMatching = (to: string, subjectPrefix: string, needle: string) =>
    emailService.captured.filter(
      (m) => m.to === to && m.subject.includes(subjectPrefix) && m.text.includes(needle),
    );

  const auditActions = async (
    agent: Agent,
    companyId: string,
    action: string,
  ): Promise<Array<{ entityId: string; actorUserId: string | null; payload: Record<string, unknown> }>> => {
    const res = await agent
      .get(`${API}/companies/${companyId}/audit-log?action=${action}`)
      .expect(200);
    return res.body.data as Array<{
      entityId: string;
      actorUserId: string | null;
      payload: Record<string, unknown>;
    }>;
  };

  const prefsUrl = `${API}/me/notification-preferences`;

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
    const { UrgencyService } = await import('../src/modules/urgency/urgency.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    emailService = app.get(EmailService) as EmailCapture;
    urgencyService = app.get(UrgencyService) as SweepService;
    pg = new PgClient({ connectionString: superUrl });
    await pg.connect();

    // The three subscription plans (the e2e DB is migrated, not seeded).
    await pg.query(
      `INSERT INTO plans (id, name, category, price, currency, created_at, updated_at) VALUES
        ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'Profesional independiente', 'profesional', 33.00, 'USD', now(), now()),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 'Contratista', 'contractor', 66.00, 'USD', now(), now()),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccc03', 'Administradora de propiedades', 'property_management', 99.00, 'USD', now(), now())
      ON CONFLICT DO NOTHING`,
    );

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
        .send({ name: 'Espacio A6', type: 'property_management' })
        .expect(201)
    ).body.id as string;
    companies.B = (
      await agents.ownerB
        .post(`${API}/companies`)
        .send({ name: 'Espacio B6', type: 'contractor' })
        .expect(201)
    ).body.id as string;
    companies.C = (
      await agents.ownerC
        .post(`${API}/companies`)
        .send({ name: 'Espacio C6', type: 'own_business' })
        .expect(201)
    ).body.id as string;

    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);
    await inviteAndAccept('ownerB', companies.B, accounts.memberB, agents.memberB);

    memberships.memberA = await membershipIdOf(agents.ownerA, companies.A, accounts.memberA!.email);
    memberships.profB = await membershipIdOf(agents.ownerB, companies.B, accounts.ownerB!.email);

    props.propA = (
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '1 Warranty St', city: 'Miami', state: 'FL', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await pg?.end();
    await app?.close();
    await container?.stop();
  });

  // =========================================================================
  // §6.1 Garantías (§13) — escenarios 1–11
  // =========================================================================

  let completed: { orderId: string; jobId: string };
  let claimId: string;

  describe('garantías (§13): la empresa originadora gestiona su reclamo', () => {
    it('1. POST claim sin sesión → 401', async () => {
      await http()
        .post(`${API}/companies/${companies.A}/orders/${companies.A}/warranty-claims`)
        .send({ jobId: companies.A, description: 'x' })
        .expect(401);
    });

    it('2. member de la originadora crea claim sobre trabajo done → 201 open (+ audit)', async () => {
      completed = await completedOrderA();
      const res = await agents.memberA
        .post(`${API}/companies/${companies.A}/orders/${completed.orderId}/warranty-claims`)
        .send({
          jobId: completed.jobId,
          description: 'El trabajo reparado volvió a fallar tras la entrega.',
        })
        .expect(201);
      expect(res.body.status).toBe('open');
      expect(res.body.resolution).toBeNull();
      claimId = res.body.id as string;

      const created = await auditActions(agents.ownerA, companies.A, 'warranty_claim.created');
      const row = created.find((r) => r.entityId === claimId);
      expect(row).toBeDefined();
      expect(row!.actorUserId).toBe(accounts.memberA!.id);

      // AC-6.5: the detail keeps the repair context linked, never copied.
      const detail = await agents.ownerA
        .get(`${API}/companies/${companies.A}/warranty-claims/${claimId}`)
        .expect(200);
      const body = detail.body as {
        order: { id: string };
        job: { id: string; professionalName: string | null; fileCount: number };
      };
      expect(body.order.id).toBe(completed.orderId);
      expect(body.job.id).toBe(completed.jobId);
      expect(body.job.professionalName).toBe(accounts.ownerB!.name);
      expect(body.job.fileCount).toBe(0);
    });

    it('3. owner de la originadora crea claim sobre trabajo no done → 422', async () => {
      const order = await activeOrderA();
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/orders/${order.orderId}/warranty-claims`)
        .send({ jobId: order.jobId, description: 'Reclamo sobre trabajo sin completar.' })
        .expect(422);
    });

    it('4. member de la destinataria intenta crear claim en la orden → 404', async () => {
      await agents.memberB
        .post(`${API}/companies/${companies.B}/orders/${completed.orderId}/warranty-claims`)
        .send({ jobId: completed.jobId, description: 'Intento de la empresa del trabajo.' })
        .expect(404);
    });

    it('5. member de una tercera empresa intenta leer el claim → 404', async () => {
      await agents.ownerC
        .get(`${API}/companies/${companies.C}/warranty-claims/${claimId}`)
        .expect(404);
    });

    it('6. GET lista: solo la originadora ve los reclamos de su orden', async () => {
      const mine = await agents.ownerA
        .get(`${API}/companies/${companies.A}/orders/${completed.orderId}/warranty-claims`)
        .expect(200);
      const data = mine.body.data as Array<{ id: string }>;
      expect(data.some((c) => c.id === claimId)).toBe(true);

      await agents.ownerC
        .get(`${API}/companies/${companies.C}/orders/${completed.orderId}/warranty-claims`)
        .expect(404);
    });

    it('7. owner de la originadora resuelve con resolution → 200 resolved con resolvedAt', async () => {
      const res = await agents.ownerA
        .post(`${API}/companies/${companies.A}/warranty-claims/${claimId}/resolve`)
        .send({ resolution: 'Cobertura reconocida; se emitió orden de revisión.' })
        .expect(200);
      expect(res.body.status).toBe('resolved');
      expect(res.body.resolvedAt).not.toBeNull();
      expect(res.body.resolvedByUserId).toBe(accounts.ownerA!.id);

      const resolved = await auditActions(agents.ownerA, companies.A, 'warranty_claim.resolved');
      expect(resolved.some((r) => r.entityId === claimId)).toBe(true);
    });

    it('8. resolver un claim ya resuelto → 409', async () => {
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/warranty-claims/${claimId}/resolve`)
        .send({ resolution: 'Segunda resolución intentada.' })
        .expect(409);
    });

    it('9. resolver con resolution vacía → 422', async () => {
      const open = await agents.memberA
        .post(`${API}/companies/${companies.A}/orders/${completed.orderId}/warranty-claims`)
        .send({ jobId: completed.jobId, description: 'Segundo reclamo para probar validación.' })
        .expect(201);
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/warranty-claims/${open.body.id as string}/resolve`)
        .send({ resolution: '' })
        .expect(422);
    });

    it('10. claim sobre orden inexistente → 404', async () => {
      await agents.ownerA
        .post(
          `${API}/companies/${companies.A}/orders/11111111-1111-4111-8111-111111111111/warranty-claims`,
        )
        .send({ jobId: '22222222-2222-4222-8222-222222222222', description: 'Orden fantasma.' })
        .expect(404);
    });

    it('11. crear un claim no genera orden ni autorización nuevas (§13)', async () => {
      const before = await pg.query(
        'SELECT (SELECT count(*) FROM orders WHERE company_id = $1)::int AS orders, (SELECT count(*) FROM order_authorizations oa JOIN orders o ON o.id = oa.order_id WHERE o.company_id = $1)::int AS auths',
        [companies.A],
      );
      await agents.memberA
        .post(`${API}/companies/${companies.A}/orders/${completed.orderId}/warranty-claims`)
        .send({ jobId: completed.jobId, description: 'Tercer reclamo; no debe crear nada más.' })
        .expect(201);
      const after = await pg.query(
        'SELECT (SELECT count(*) FROM orders WHERE company_id = $1)::int AS orders, (SELECT count(*) FROM order_authorizations oa JOIN orders o ON o.id = oa.order_id WHERE o.company_id = $1)::int AS auths',
        [companies.A],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  });

  // =========================================================================
  // §6.2 Urgencias (§14.2, §18.4) — escenarios 12–24
  // =========================================================================

  describe('urgencias (§14.2): ventana, recordatorio y escalación', () => {
    it('12. member de la empresa de la orden marca urgent → 200 + audit', async () => {
      const order = await activeOrderA();
      const res = await agents.memberA
        .patch(`${API}/companies/${companies.A}/orders/${order.orderId}`)
        .send({ urgent: true })
        .expect(200);
      expect(res.body.urgent).toBe(true);

      const rows = await auditActions(agents.memberA, companies.A, 'order.urgency_set');
      const row = rows.find((r) => r.entityId === order.orderId);
      expect(row).toBeDefined();
      expect(row!.payload.urgent).toBe(true);
      expect(row!.actorUserId).toBe(accounts.memberA!.id);
    });

    it('13. marcar urgente una orden completed o cancelled → 409', async () => {
      const completedOrder = await completedOrderA();
      // All jobs are done (stage 3 rule): the originator closes the order.
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/orders/${completedOrder.orderId}/close`)
        .send({})
        .expect(204);
      await agents.ownerA
        .patch(`${API}/companies/${companies.A}/orders/${completedOrder.orderId}`)
        .send({ urgent: true })
        .expect(409);

      const order = await activeOrderA();
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/orders/${order.orderId}/cancel`)
        .send({ reason: 'Cancelada para el test de urgencias.' })
        .expect(204);
      await agents.ownerA
        .patch(`${API}/companies/${companies.A}/orders/${order.orderId}`)
        .send({ urgent: true })
        .expect(409);
    });

    it('14. miembro de otra empresa marca urgente → 404', async () => {
      const order = await activeOrderA();
      await agents.ownerC
        .patch(`${API}/companies/${companies.C}/orders/${order.orderId}`)
        .send({ urgent: true })
        .expect(404);
    });

    it('15. sin sesión marca urgente → 401', async () => {
      const order = await activeOrderA();
      await http()
        .patch(`${API}/companies/${companies.A}/orders/${order.orderId}`)
        .send({ urgent: true })
        .expect(401);
    });

    it('16. owner configura responseHours: 12 → 200', async () => {
      const res = await agents.ownerA
        .patch(`${API}/companies/${companies.A}/urgency-settings`)
        .send({ responseHours: 12 })
        .expect(200);
      expect(res.body.responseHours).toBe(12);
      const get = await agents.ownerA
        .get(`${API}/companies/${companies.A}/urgency-settings`)
        .expect(200);
      expect(get.body.responseHours).toBe(12);
    });

    it('17. member configura responseHours → 403', async () => {
      await agents.memberA
        .patch(`${API}/companies/${companies.A}/urgency-settings`)
        .send({ responseHours: 6 })
        .expect(403);
    });

    it('18. responseHours 0 o 10000 → 422', async () => {
      await agents.ownerA
        .patch(`${API}/companies/${companies.A}/urgency-settings`)
        .send({ responseHours: 0 })
        .expect(422);
      await agents.ownerA
        .patch(`${API}/companies/${companies.A}/urgency-settings`)
        .send({ responseHours: 10000 })
        .expect(422);
    });

    it('19. barrido a mitad de ventana → recordatorio in-app y correo, sin duplicar', async () => {
      // The window belongs to the assignee's company (D1/D2): 8h for B.
      await agents.ownerB
        .patch(`${API}/companies/${companies.B}/urgency-settings`)
        .send({ responseHours: 8 })
        .expect(200);
      const fixture = await urgentPendingOrderA();

      const mid = await sweepAt(5);
      expect(mid.reminders).toBe(1);
      expect(await noticesFor(fixture.assignmentId, 'urgent_reminder')).toBe(1);
      expect(emailsMatching(accounts.ownerB!.email, 'Recordatorio', fixture.title).length).toBe(1);
      const mark = await pg.query('SELECT urgency_reminder_at FROM assignments WHERE id = $1', [
        fixture.assignmentId,
      ]);
      expect(mark.rows[0].urgency_reminder_at).not.toBeNull();

      // Idempotent: a second pass changes nothing (mark, §2.3).
      const again = await sweepAt(5);
      expect(again.reminders).toBe(0);
      expect(await noticesFor(fixture.assignmentId, 'urgent_reminder')).toBe(1);
      expect(emailsMatching(accounts.ownerB!.email, 'Recordatorio', fixture.title).length).toBe(1);

      await agents.ownerB
        .post(`${API}/companies/${companies.B}/assignments/${fixture.assignmentId}/accept`)
        .send({})
        .expect(204);
    });

    it('20. barrido con ventana vencida → escalación a los owners de la empresa del asignado', async () => {
      const fixture = await urgentPendingOrderA();

      const expired = await sweepAt(9);
      expect(expired.escalations).toBe(1);
      expect(await noticesFor(fixture.assignmentId, 'urgent_escalated')).toBe(1);
      expect(emailsMatching(accounts.ownerB!.email, 'Escalación', fixture.title).length).toBe(1);
      const mark = await pg.query('SELECT urgency_escalated_at FROM assignments WHERE id = $1', [
        fixture.assignmentId,
      ]);
      expect(mark.rows[0].urgency_escalated_at).not.toBeNull();

      const again = await sweepAt(9);
      expect(again.escalations).toBe(0);
      expect(await noticesFor(fixture.assignmentId, 'urgent_escalated')).toBe(1);

      await agents.ownerB
        .post(`${API}/companies/${companies.B}/assignments/${fixture.assignmentId}/accept`)
        .send({})
        .expect(204);
    });

    it('21. orden no urgente con asignación pendiente vieja → ningún aviso', async () => {
      const order = await activeOrderA();
      const assignment = await agents.ownerA
        .post(`${API}/companies/${companies.A}/orders/${order.orderId}/assignments`)
        .send({ jobId: order.jobId, assigneeMembershipId: memberships.profB })
        .expect(201);
      const assignmentId = assignment.body.id as string;

      const result = await sweepAt(48);
      expect(result.reminders).toBe(0);
      expect(result.escalations).toBe(0);
      expect(await noticesFor(assignmentId, 'urgent_reminder')).toBe(0);
      expect(await noticesFor(assignmentId, 'urgent_escalated')).toBe(0);
      const mark = await pg.query(
        'SELECT urgency_reminder_at, urgency_escalated_at FROM assignments WHERE id = $1',
        [assignmentId],
      );
      expect(mark.rows[0].urgency_reminder_at).toBeNull();
      expect(mark.rows[0].urgency_escalated_at).toBeNull();

      await agents.ownerB
        .post(`${API}/companies/${companies.B}/assignments/${assignmentId}/accept`)
        .send({})
        .expect(204);
    });

    it('22. asignación respondida tras el recordatorio → sin escalación posterior', async () => {
      const fixture = await urgentPendingOrderA();
      const mid = await sweepAt(5);
      expect(mid.reminders).toBe(1);
      await agents.ownerB
        .post(`${API}/companies/${companies.B}/assignments/${fixture.assignmentId}/accept`)
        .send({})
        .expect(204);

      const expired = await sweepAt(48);
      expect(expired.escalations).toBe(0);
      expect(await noticesFor(fixture.assignmentId, 'urgent_escalated')).toBe(0);
      const mark = await pg.query('SELECT urgency_escalated_at FROM assignments WHERE id = $1', [
        fixture.assignmentId,
      ]);
      expect(mark.rows[0].urgency_escalated_at).toBeNull();
    });

    it('23/26. correo desactivado en preferencias → in-app sí, correo no', async () => {
      await agents.ownerB
        .put(prefsUrl)
        .send({
          preferences: [
            { type: 'urgent_reminder', emailEnabled: false },
            { type: 'urgent_escalated', emailEnabled: false },
          ],
        })
        .expect(200);
      const fixture = await urgentPendingOrderA();

      const mid = await sweepAt(5);
      expect(mid.reminders).toBe(1);
      expect(await noticesFor(fixture.assignmentId, 'urgent_reminder')).toBe(1);
      expect(emailsMatching(accounts.ownerB!.email, 'Recordatorio', fixture.title).length).toBe(0);

      const expired = await sweepAt(9);
      expect(expired.escalations).toBe(1);
      expect(await noticesFor(fixture.assignmentId, 'urgent_escalated')).toBe(1);
      expect(emailsMatching(accounts.ownerB!.email, 'Escalación', fixture.title).length).toBe(0);

      await agents.ownerB
        .put(prefsUrl)
        .send({
          preferences: [
            { type: 'urgent_reminder', emailEnabled: true },
            { type: 'urgent_escalated', emailEnabled: true },
          ],
        })
        .expect(200);

      // The assignment from this fixture stays pending for scenario 24.
      (globalThis as any).__etapa6Escalated = fixture.assignmentId;
    });

    it('24. escalar no autoriza trabajo: el envío de costos sigue exigiendo la aceptación (§14.2)', async () => {
      const assignmentId = (globalThis as any).__etapa6Escalated as string;
      // Etapa 4 rule intact (decision 8): an assignment that never accepted
      // cannot submit costs — escalation does not authorize work (§14.2).
      await agents.ownerB
        .post(`${API}/companies/${companies.B}/assignments/${assignmentId}/cost-report/submit`)
        .send({})
        .expect(403);
    });
  });

  // =========================================================================
  // §6.3 Preferencias, planes y auditoría (§18.4, §15, §12) — 25–34
  // =========================================================================

  describe('preferencias, suscripciones y datos maestros', () => {
    it('25. GET preferencias sin sesión → 401; con sesión → 200 con todos los tipos en true', async () => {
      await http().get(prefsUrl).expect(401);
      const res = await agents.ownerA.get(prefsUrl).expect(200);
      const data = res.body.data as Array<{ type: string; emailEnabled: boolean }>;
      expect(data.length).toBeGreaterThanOrEqual(8);
      expect(data.every((p) => p.emailEnabled)).toBe(true);
    });

    it('27. PUT con tipo inexistente → 422', async () => {
      await agents.ownerA
        .put(prefsUrl)
        .send({ preferences: [{ type: 'no_such_notice', emailEnabled: false }] })
        .expect(422);
    });

    it('28. las preferencias son personales: afectan solo al usuario en sesión', async () => {
      await agents.ownerA
        .put(prefsUrl)
        .send({ preferences: [{ type: 'order_created', emailEnabled: false }] })
        .expect(200);
      const mine = await agents.ownerA.get(prefsUrl).expect(200);
      const orderCreated = (mine.body.data as Array<{ type: string; emailEnabled: boolean }>).find(
        (p) => p.type === 'order_created',
      );
      expect(orderCreated?.emailEnabled).toBe(false);

      const others = await agents.ownerB.get(prefsUrl).expect(200);
      const stillOn = (others.body.data as Array<{ type: string; emailEnabled: boolean }>).find(
        (p) => p.type === 'order_created',
      );
      expect(stillOn?.emailEnabled).toBe(true);

      await agents.ownerA
        .put(prefsUrl)
        .send({ preferences: [{ type: 'order_created', emailEnabled: true }] })
        .expect(200);
    });

    it('29. GET /plans autenticado → 200 con 3 planes y precios 33/66/99', async () => {
      const res = await agents.ownerA.get(`${API}/plans`).expect(200);
      const data = res.body.data as Array<{ category: string; price: string; currency: string }>;
      expect(data.map((p) => p.price)).toEqual(['33.00', '66.00', '99.00']);
      expect(data.map((p) => p.category)).toEqual(['profesional', 'contractor', 'property_management']);
      expect(data.every((p) => p.currency === 'USD')).toBe(true);
    });

    it('30. GET /companies/:id/subscription de otra empresa → 404', async () => {
      await agents.ownerC
        .get(`${API}/companies/${companies.A}/subscription`)
        .expect(404);
    });

    it('31. plan por categoría (D3) y coalescencia con plan_id explícito', async () => {
      const a = await agents.ownerA
        .get(`${API}/companies/${companies.A}/subscription`)
        .expect(200);
      expect((a.body as { price: string; source: string }).price).toBe('99.00');
      expect((a.body as { source: string }).source).toBe('category');

      const b = await agents.ownerB
        .get(`${API}/companies/${companies.B}/subscription`)
        .expect(200);
      expect((b.body as { price: string }).price).toBe('66.00');

      // own_business maps to the professional plan (§15, D3).
      const c = await agents.ownerC
        .get(`${API}/companies/${companies.C}/subscription`)
        .expect(200);
      expect((c.body as { price: string; source: string }).price).toBe('33.00');
      expect((c.body as { source: string }).source).toBe('category');

      await pg.query(
        `UPDATE companies SET plan_id = (SELECT id FROM plans WHERE category = 'profesional') WHERE id = $1`,
        [companies.A],
      );
      const explicit = await agents.ownerA
        .get(`${API}/companies/${companies.A}/subscription`)
        .expect(200);
      expect((explicit.body as { price: string; source: string }).price).toBe('33.00');
      expect((explicit.body as { source: string }).source).toBe('explicit');
    });

    it('32. PATCH propiedad (dato maestro) → 200 y audit property.updated con el actor (§18.4)', async () => {
      await agents.ownerA
        .patch(`${API}/companies/${companies.A}/properties/${props.propA}`)
        .send({ city: 'Coral Gables' })
        .expect(200);
      const rows = await auditActions(agents.ownerA, companies.A, 'property.updated');
      const row = rows.find((r) => r.entityId === props.propA);
      expect(row).toBeDefined();
      expect(row!.actorUserId).toBe(accounts.ownerA!.id);
    });

    it('33. PATCH inquilino → 200 y audit tenant.updated con el actor (§18.4)', async () => {
      const tenant = await agents.ownerA
        .post(`${API}/companies/${companies.A}/properties/${props.propA}/tenants`)
        // propA is vacant: only an 'owner' tenant is allowed (§4.3).
        .send({ kind: 'owner', name: 'Inquilina E6', email: 'ina6@example.com' })
        .expect(201);
      const tenantId = tenant.body.id as string;
      await agents.ownerA
        .patch(`${API}/companies/${companies.A}/tenants/${tenantId}`)
        .send({ name: 'Inquilina E6 Actualizada' })
        .expect(200);
      const rows = await auditActions(agents.ownerA, companies.A, 'tenant.updated');
      const row = rows.find((r) => r.entityId === tenantId);
      expect(row).toBeDefined();
      expect(row!.actorUserId).toBe(accounts.ownerA!.id);
    });

    it('34. el correo de reset de contraseña se envía aunque no sea un tipo apagable (D6)', async () => {
      // The account mechanism is not part of the toggle set: unknown type (422).
      await agents.ownerA
        .put(prefsUrl)
        .send({ preferences: [{ type: 'password_reset', emailEnabled: false }] })
        .expect(422);

      const before = emailService.captured.filter((m) => m.to === accounts.ownerA!.email).length;
      await http()
        .post(`${API}/auth/password/forgot`)
        .send({ email: accounts.ownerA!.email })
        .expect(202);
      const after = emailService.captured.filter((m) => m.to === accounts.ownerA!.email);
      expect(after.length).toBe(before + 1);
    });
  });
});
