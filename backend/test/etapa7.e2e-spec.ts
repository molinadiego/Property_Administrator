/* eslint-disable @typescript-eslint/no-explicit-any -- e2e fixtures parse JSON responses loosely */
import { execSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
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
}

/**
 * Etapa 7 (docs/especificacion/etapa-7.md §6): the 20-scenario permission
 * and tax matrix over Testcontainers PostgreSQL. A failing scenario blocks
 * the stage (§9). Nevada rates are configuration, never hardcoded (§11.6).
 */
suite('etapa 7: matriz de impuestos de Nevada (e2e)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let emailService: EmailCapture;
  let pg: PgClient;

  const http = () => request(app.getHttpServer());

  const accounts: Record<string, Account> = {
    ownerA: { email: 'owner.a7@example.com', name: 'Olga Owner A' },
    memberA: { email: 'member.a7@example.com', name: 'Marta Member A' },
    ownerB: { email: 'owner.b7@example.com', name: 'Bruno Owner B' },
    ownerC: { email: 'owner.c7@example.com', name: 'Carla Owner C' },
    ownerD: { email: 'owner.d7@example.com', name: 'Diego Owner D' },
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

  const latestTokenFor = (email: string, kind: '/invitations/' | '/limited/'): string => {
    const mails = emailService.captured.filter((m) => m.to === email && m.text.includes(kind));
    const last = mails[mails.length - 1];
    if (!last) throw new Error(`No captured ${kind} mail for ${email}`);
    const match = new RegExp(`/${kind.slice(1)}([A-Za-z0-9_-]+)`).exec(last.text);
    if (!match) throw new Error(`No token found in captured ${kind} mail`);
    return match[1];
  };

  /**
   * Order of A whose only job is assigned to `membership` and accepted; the
   * assignee accepts under its own company (etapa-5 fixture pattern).
   */
  const orderAccepted = async (
    assigneeCompanyId: string,
    membership: string,
    acceptor: Agent,
  ): Promise<OrderFixture> => {
    const created = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders`)
      .send({
        propertyId: props.propA,
        title: 'Orden fiscal',
        description: 'Orden creada por el fixture de la Etapa 7.',
      })
      .expect(201);
    const orderId = created.body.id as string;
    const jobId = (created.body.jobs as Array<{ id: string }>)[0].id;
    const assignment = await agents.ownerA
      .post(`${API}/companies/${companies.A}/orders/${orderId}/assignments`)
      .send({ jobId, assigneeMembershipId: membership })
      .expect(201);
    await acceptor
      .post(`${API}/companies/${assigneeCompanyId}/assignments/${(assignment.body as { id: string }).id}/accept`)
      .send({})
      .expect(204);
    return { orderId, jobIds: [jobId] };
  };

  /** A→B fixture for the contractor with a default rate. */
  const orderWithB = () => orderAccepted(companies.B, memberships.ownerB, agents.ownerB);

  /**
   * A→C fixture for the own-business without a rate: the job is completed so
   * a professional may bill finished work (§11.4, etapa-5 D1a).
   */
  const orderWithC = async (): Promise<OrderFixture> => {
    const order = await orderAccepted(companies.C, memberships.ownerC, agents.ownerC);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${order.jobIds[0]}/start`)
      .send({})
      .expect(204);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/jobs/${order.jobIds[0]}/complete`)
      .send({})
      .expect(204);
    return order;
  };

  const draftOf = async (agent: Agent, companyId: string, orderId: string): Promise<string> => {
    const res = await agent
      .post(`${API}/companies/${companyId}/invoices`)
      .send({ orderId })
      .expect(201);
    return res.body.id as string;
  };

  const fullLine = (jobId: string, amount = '100.00', extra: Record<string, unknown> = {}) => ({
    jobId,
    kind: 'material',
    description: 'Material de prueba',
    amount,
    ...extra,
  });

  const putLinesOf = (
    agent: Agent,
    companyId: string,
    invId: string,
    lines: unknown[],
  ) => agent.put(`${API}/companies/${companyId}/invoices/${invId}/lines`).send({ lines });

  const emitOf = (agent: Agent, companyId: string, invId: string) =>
    agent.post(`${API}/companies/${companyId}/invoices/${invId}/emit`).send({});

  const detailOf = async (agent: Agent, companyId: string, invId: string) =>
    (await agent.get(`${API}/companies/${companyId}/invoices/${invId}`).expect(200)).body as {
      status: string;
      subtotal: string | null;
      taxRate: string | null;
      taxTotal: string | null;
      total: string | null;
      lines: Array<{ taxable: boolean }>;
    };

  const invoiceUrl = (companyId: string, invId: string) =>
    `${API}/companies/${companyId}/invoices/${invId}`;

  const auditActions = async (agent: Agent, companyId: string, action: string) => {
    const res = await agent
      .get(`${API}/companies/${companyId}/audit-log?action=${action}`)
      .expect(200);
    return res.body.data as Array<{
      action: string;
      entityType: string;
      entityId: string;
      actorUserId: string | null;
      createdAt: string;
      payload: Record<string, any>;
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

  /**
   * Text extraction for pdfmake output (etapa-7.md §8): subset fonts write
   * 2-byte glyph codes, so content streams hold no ASCII. Each font's
   * ToUnicode CMap (resolved through the font objects) maps codes back to
   * unicode — ligature glyphs can spell several units, e.g. `<0066 0069>` =
   * "fi" — and runs sharing a Tm line are concatenated as-is, because
   * pdfmake bakes the inter-word spaces into trailing space glyphs.
   */
  const pdfText = (buffer: Buffer): string => {
    const raw = buffer.toString('latin1');
    const objects = new Map<number, { dict: string; stream?: string }>();
    const objRe = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
    let objMatch: RegExpExecArray | null;
    while ((objMatch = objRe.exec(raw)) !== null) {
      const body = objMatch[2]!;
      let dict = body;
      let stream: string | undefined;
      const streamMatch = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body);
      if (streamMatch) {
        dict = body.slice(0, streamMatch.index);
        const bytes = Buffer.from(streamMatch[1]!, 'latin1');
        try {
          stream = inflateSync(bytes).toString('latin1');
        } catch {
          // Not Flate-compressed: font program or already-plain content.
          stream = bytes.toString('latin1');
        }
      }
      objects.set(Number(objMatch[1]), { dict, stream });
    }

    const parseCMap = (cmapText: string): Map<number, string> => {
      const map = new Map<number, string>();
      const unicodeOf = (hex: string): string =>
        (hex.replace(/\s+/g, '').match(/.{4}/g) ?? [])
          .map((unit) => String.fromCodePoint(parseInt(unit, 16)))
          .join('');
      const rangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
      let rangeMatch: RegExpExecArray | null;
      while ((rangeMatch = rangeRe.exec(cmapText)) !== null) {
        // One entry: <src1> <src2> plus either an array (one item per glyph,
        // possibly several code units) or a single delta destination.
        const entryRe =
          /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:\[([\s\S]*?)\]|<([0-9a-fA-F]+)>)/g;
        let entry: RegExpExecArray | null;
        while ((entry = entryRe.exec(rangeMatch[1])) !== null) {
          const from = parseInt(entry[1]!, 16);
          if (entry[3] !== undefined) {
            [...entry[3]!.matchAll(/<([0-9a-fA-F\s]+)>/g)].forEach((item, index) => {
              map.set(from + index, unicodeOf(item[1]!));
            });
          } else {
            const to = parseInt(entry[2]!, 16);
            const dst = parseInt(entry[4]!, 16);
            for (let code = from; code <= to; code += 1) {
              map.set(code, String.fromCodePoint(dst + (code - from)));
            }
          }
        }
      }
      const charRe = /beginbfchar([\s\S]*?)endbfchar/g;
      let charMatch: RegExpExecArray | null;
      while ((charMatch = charRe.exec(cmapText)) !== null) {
        const entryRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]+)>/g;
        let entry: RegExpExecArray | null;
        while ((entry = entryRe.exec(charMatch[1])) !== null) {
          map.set(parseInt(entry[1]!, 16), unicodeOf(entry[2]!));
        }
      }
      return map;
    };

    // /Font << /F1 <obj> /F2 <obj> >> → font obj → ToUnicode CMap.
    const fontNameToCMap = new Map<string, Map<number, string>>();
    const fontDictRe = /\/Font\s*<<([\s\S]*?)>>/g;
    let fontDict: RegExpExecArray | null;
    while ((fontDict = fontDictRe.exec(raw)) !== null) {
      const pairRe = /\/(F\d+)\s+(\d+)\s+0\s+R/g;
      let pair: RegExpExecArray | null;
      while ((pair = pairRe.exec(fontDict[1])) !== null) {
        const fontObject = objects.get(Number(pair[2]));
        if (!fontObject) continue;
        const toUnicode = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(fontObject.dict);
        if (!toUnicode) continue;
        const cmapObject = objects.get(Number(toUnicode[1]));
        if (!cmapObject?.stream) continue;
        fontNameToCMap.set(pair[1]!, parseCMap(cmapObject.stream));
      }
    }

    const lines: Array<{ y: number; text: string }> = [];
    for (const { stream } of objects.values()) {
      if (!stream || !stream.includes('BT')) continue;
      let currentLine: { y: number; text: string } | null = null;
      const btRe = /BT([\s\S]*?)ET/g;
      let btMatch: RegExpExecArray | null;
      while ((btMatch = btRe.exec(stream)) !== null) {
        const block = btMatch[1]!;
        const fontMatch = /\/(F\d+)\s+[\d.]+\s+Tf/.exec(block);
        if (!fontMatch) continue;
        const cmap = fontNameToCMap.get(fontMatch[1]!);
        if (!cmap) continue;
        const tmMatch = /([-.\d]+)\s+([-.\d]+)\s+Tm/.exec(block);
        const y = tmMatch ? Number.parseFloat(tmMatch[2]!) : Number.NaN;
        let decoded = '';
        let ok = true;
        const consume = (bytes: Buffer): boolean => {
          if (bytes.length % 2 !== 0) return false;
          for (let i = 0; i < bytes.length; i += 2) {
            const char = cmap.get(bytes.readUInt16BE(i));
            if (char === undefined) return false;
            decoded += char;
          }
          return true;
        };
        // Subset fonts write hex runs (one glyph = one 2-byte code = 4 chars).
        for (const run of block.matchAll(/<([0-9a-fA-F\s]*)>/g)) {
          const hex = run[1]!.replace(/\s+/g, '');
          if (hex.length % 4 !== 0 || !consume(Buffer.from(hex, 'hex'))) {
            ok = false;
            break;
          }
        }
        // Fallback: literal binary runs, unescaping the delimiters.
        if (!ok || !decoded) {
          decoded = '';
          ok = true;
          for (const run of block.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) {
            const unescaped = run[1]!.replace(/\\([()\\])/g, '$1');
            if (!consume(Buffer.from(unescaped, 'latin1'))) {
              ok = false;
              break;
            }
          }
        }
        if (!ok || !decoded) continue;
        // Words of one line share their Tm y; concatenate without separator.
        if (!currentLine || Number.isNaN(y) || Math.abs(currentLine.y - y) > 1.0) {
          currentLine = { y, text: decoded };
          lines.push(currentLine);
        } else {
          currentLine.text += decoded;
        }
      }
    }
    return lines.map((line) => line.text).join('\n');
  };

  const worksheetRows = async (buffer: Buffer, sheet: string): Promise<any[]> => {
    const workbook = new Workbook();
    // exceljs expects its own Buffer typing; the value is the same bytes.
    await workbook.xlsx.load(buffer as never);
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet ${sheet} missing`);
    const rows: any[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) rows.push(row.values as any[]);
      else rows.push(row.values as any[]);
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
    agents.ownerC = await loginUser(accounts.ownerC!.email);
    agents.ownerD = await loginUser(accounts.ownerD!.email);

    companies.A = (
      await agents.ownerA
        .post(`${API}/companies`)
        .send({ name: 'Espacio A7', type: 'property_management' })
        .expect(201)
    ).body.id as string;
    companies.B = (
      await agents.ownerB
        .post(`${API}/companies`)
        .send({ name: 'Espacio B7', type: 'contractor' })
        .expect(201)
    ).body.id as string;
    companies.C = (
      await agents.ownerC
        .post(`${API}/companies`)
        .send({ name: 'Espacio C7', type: 'own_business' })
        .expect(201)
    ).body.id as string;
    companies.D = (
      await agents.ownerD
        .post(`${API}/companies`)
        .send({ name: 'Espacio D7', type: 'contractor' })
        .expect(201)
    ).body.id as string;

    await inviteAndAccept('ownerA', companies.A, accounts.memberA, agents.memberA);

    memberships.ownerB = await membershipIdOf(agents.ownerB, companies.B, accounts.ownerB!.email);
    memberships.ownerC = await membershipIdOf(agents.ownerC, companies.C, accounts.ownerC!.email);

    props.propA = (
      await agents.ownerA
        .post(`${API}/companies/${companies.A}/properties`)
        .send({ addressLine: '1 Tax St', city: 'Las Vegas', state: 'NV', occupancy: 'vacant' })
        .expect(201)
    ).body.id as string;
    props.propC = (
      await agents.ownerC
        .post(`${API}/companies/${companies.C}/properties`)
        .send({ addressLine: '9 Client Ave', city: 'Reno', state: 'NV' })
        .expect(201)
    ).body.id as string;

    // Fiscal profiles (etapa-7.md D5): B has Clark's 8.375% default; C is
    // intentionally left without any rate for the 422 scenarios.
    await agents.ownerB
      .patch(`${API}/companies/${companies.B}`)
      .send({
        taxId: 'NV-TEST-BBB',
        taxAddress: '200 Industrial Way, Las Vegas, NV',
        defaultTaxRate: '8.375',
      })
      .expect(200);
    await agents.ownerC.patch(`${API}/companies/${companies.C}`).send({}).expect(400);
  }, 300000);

  afterAll(async () => {
    await pg?.end();
    await app?.close();
    await container?.stop();
  });

  // ---------------------------------------------------------------------
  // 6.1 Perfil fiscal (#1–#5)
  // ---------------------------------------------------------------------

  it('#1 sin sesión el perfil fiscal y la facturación responden 401', async () => {
    await http().patch(`${API}/companies/x`).send({ taxId: 'NV1' }).expect(401);
    await http().get(`${API}/companies/x`).expect(401);
    await http().patch(`${API}/companies/x/invoices/y`).send({ taxRate: '8.375' }).expect(401);
    await http().put(`${API}/companies/x/invoices/y/lines`).send({ lines: [] }).expect(401);
    await http().post(`${API}/companies/x/invoices/y/emit`).send({}).expect(401);
    await http().get(`${API}/companies/x/invoices/y/pdf`).expect(401);
    await http().get(`${API}/companies/x/accounting-exports?format=excel`).expect(401);
  });

  it('#2 member no edita el perfil fiscal (403); owner sí y audita before/after', async () => {
    await agents.memberA
      .patch(`${API}/companies/${companies.A}`)
      .send({ defaultTaxRate: '9.000' })
      .expect(403);

    const res = await agents.ownerA
      .patch(`${API}/companies/${companies.A}`)
      .send({
        taxId: 'NV-TEST-AAA',
        taxAddress: '100 Main St, Las Vegas, NV',
        defaultTaxRate: '8.375',
      })
      .expect(200);
    expect(res.body.taxProfile).toEqual({
      taxId: 'NV-TEST-AAA',
      taxAddress: '100 Main St, Las Vegas, NV',
      defaultTaxRate: '8.375',
      taxExempt: false,
    });

    const entries = await auditActions(
      agents.ownerA,
      companies.A,
      'company.tax_profile_updated',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.entityType).toBe('company');
    expect(entries[0]!.actorUserId).toBe(accounts.ownerA!.id);
    expect(entries[0]!.payload.before.defaultTaxRate).toBeNull();
    expect(entries[0]!.payload.after.defaultTaxRate).toBe('8.375');
    expect(entries[0]!.payload.after.taxId).toBe('NV-TEST-AAA');
  });

  it('#3 cualquier miembro activo lee el perfil fiscal (§11.6: no es dato sensible)', async () => {
    const res = await agents.memberA.get(`${API}/companies/${companies.A}`).expect(200);
    expect(res.body.taxProfile).toEqual({
      taxId: 'NV-TEST-AAA',
      taxAddress: '100 Main St, Las Vegas, NV',
      defaultTaxRate: '8.375',
      taxExempt: false,
    });
  });

  it('#4 el perfil fiscal de otra empresa responde 404 (no filtra)', async () => {
    await agents.ownerB
      .patch(`${API}/companies/${companies.A}`)
      .send({ taxId: 'HACK' })
      .expect(404);
    const res = await agents.ownerB.get(`${API}/companies/${companies.A}`).expect(404);
    expect(res.body.detail).not.toContain('NV-TEST-AAA');
  });

  it('#5 tasas y datos fiscales inválidos responden 422 sin persistir', async () => {
    for (const defaultTaxRate of ['-1', '100.001', 'abc', '8.3756']) {
      await agents.ownerA
        .patch(`${API}/companies/${companies.A}`)
        .send({ defaultTaxRate })
        .expect(422);
    }
    await agents.ownerA
      .patch(`${API}/companies/${companies.A}`)
      .send({ taxId: 'X'.repeat(65) })
      .expect(422);
    const res = await agents.ownerA.get(`${API}/companies/${companies.A}`).expect(200);
    expect(res.body.taxProfile.defaultTaxRate).toBe('8.375');
    expect(res.body.taxProfile.taxId).toBe('NV-TEST-AAA');
  });

  // ---------------------------------------------------------------------
  // 6.2 Renglones y tasa del borrador (#6–#9)
  // ---------------------------------------------------------------------

  it('#6 renglones sin taxable nacen imponibles (T4)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '50.00'),
    ]).expect(200);
    const detail = await detailOf(agents.ownerB, companies.B, invId);
    expect(detail.lines.map((line) => line.taxable)).toEqual([true]);
    expect(detail.taxTotal).toBeNull();
  });

  it('#7 la marca de imponibilidad se persiste línea por línea (§11.6)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '60.00'),
      fullLine(order.jobIds[0], '40.00', {
        kind: 'labor',
        description: 'Mano de obra no imponible',
        taxable: false,
      }),
    ]).expect(200);
    const detail = await detailOf(agents.ownerB, companies.B, invId);
    expect(detail.lines.map((line) => line.taxable)).toEqual([true, false]);
  });

  it('#8 el borrador acepta un override de tasa y null lo limpia (T5)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    const patched = await agents.ownerB
      .patch(invoiceUrl(companies.B, invId))
      .send({ taxRate: '8.265' })
      .expect(200);
    expect(patched.body.taxRate).toBe('8.265');
    const cleared = await agents.ownerB
      .patch(invoiceUrl(companies.B, invId))
      .send({ taxRate: null })
      .expect(200);
    expect(cleared.body.taxRate).toBeNull();
  });

  it('#9 tasa inválida -> 422; cambiar la tasa de una emitida -> 409 (§11.5)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '70.00'),
    ]).expect(200);
    await agents.ownerB.patch(invoiceUrl(companies.B, invId)).send({ taxRate: '101' }).expect(422);
    await agents.ownerB
      .patch(invoiceUrl(companies.B, invId))
      .send({ taxRate: '8.3756' })
      .expect(422);
    await emitOf(agents.ownerB, companies.B, invId).expect(204);
    await agents.ownerB
      .patch(invoiceUrl(companies.B, invId))
      .send({ taxRate: '8.265' })
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // 6.3 Emisión e impuesto (#10–#15)
  // ---------------------------------------------------------------------

  it('#10 emitir congela tasa e impuesto del perfil y audita (§11.6, D4)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '100.00'),
    ]).expect(200);
    await emitOf(agents.ownerB, companies.B, invId).expect(204);
    const detail = await detailOf(agents.ownerB, companies.B, invId);
    expect(detail.subtotal).toBe('100.00');
    expect(detail.taxRate).toBe('8.375');
    expect(detail.taxTotal).toBe('8.38');
    expect(detail.total).toBe('108.38');

    const entries = await auditActions(agents.ownerB, companies.B, 'invoice.emitted');
    const entry = entries.find((e) => e.entityId === invId);
    expect(entry).toBeDefined();
    expect(entry!.payload.taxRate).toBe('8.375');
    expect(entry!.payload.taxTotal).toBe('8.38');
    expect(entry!.payload.total).toBe('108.38');
  });

  it('#11 la tasa del borrador gana a la del perfil (destination-based)', async () => {
    const order = await orderWithC();
    const invId = await draftOf(agents.ownerC, companies.C, order.orderId);
    await putLinesOf(agents.ownerC, companies.C, invId, [
      fullLine(order.jobIds[0], '100.00'),
    ]).expect(200);
    await agents.ownerC.patch(invoiceUrl(companies.C, invId)).send({ taxRate: '8.265' }).expect(200);
    await emitOf(agents.ownerC, companies.C, invId).expect(204);
    const detail = await detailOf(agents.ownerC, companies.C, invId);
    expect(detail.taxRate).toBe('8.265');
    expect(detail.taxTotal).toBe('8.27');
    expect(detail.total).toBe('108.27');
  });

  it('#12 empresa exenta congela 0.00 aunque haya renglones imponibles', async () => {
    await agents.ownerB.patch(`${API}/companies/${companies.B}`).send({ taxExempt: true }).expect(200);
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '100.00'),
    ]).expect(200);
    await emitOf(agents.ownerB, companies.B, invId).expect(204);
    const detail = await detailOf(agents.ownerB, companies.B, invId);
    expect(detail.taxTotal).toBe('0.00');
    expect(detail.taxRate).toBe('8.375');
    expect(detail.total).toBe('100.00');
    await agents.ownerB.patch(`${API}/companies/${companies.B}`).send({ taxExempt: false }).expect(200);
  });

  it('#13 renglones imponibles sin ninguna tasa -> 422 accionable, sigue en borrador (D2)', async () => {
    const order = await orderWithC();
    const invId = await draftOf(agents.ownerC, companies.C, order.orderId);
    await putLinesOf(agents.ownerC, companies.C, invId, [
      fullLine(order.jobIds[0], '100.00'),
    ]).expect(200);
    const res = await emitOf(agents.ownerC, companies.C, invId).expect(422);
    expect(res.body.detail).toContain('tasa');
    expect(res.body.detail).toContain('exenta');
    const detail = await detailOf(agents.ownerC, companies.C, invId);
    expect(detail.status).toBe('draft');
    expect(detail.taxTotal).toBeNull();
  });

  it('#14 sin líneas imponibles no hace falta tasa: congela 0.00 con tasa null', async () => {
    const order = await orderWithC();
    const invId = await draftOf(agents.ownerC, companies.C, order.orderId);
    await putLinesOf(agents.ownerC, companies.C, invId, [
      fullLine(order.jobIds[0], '100.00', { taxable: false }),
    ]).expect(200);
    await emitOf(agents.ownerC, companies.C, invId).expect(204);
    const detail = await detailOf(agents.ownerC, companies.C, invId);
    expect(detail.taxTotal).toBe('0.00');
    expect(detail.taxRate).toBeNull();
    expect(detail.total).toBe('100.00');
  });

  it('#15 factura anterior a la etapa: impuesto 0.00, PDF sin fila y 409 al editar', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '45.00'),
    ]).expect(200);
    await emitOf(agents.ownerB, companies.B, invId).expect(204);
    // Simulates the migration backfill of a pre-etapa-7 invoice (§11.6).
    await pg.query(
      'UPDATE invoices SET tax_rate = NULL, tax_total = 0.00, total = subtotal WHERE id = $1',
      [invId],
    );
    const detail = await detailOf(agents.ownerB, companies.B, invId);
    expect(detail.subtotal).toBe('45.00');
    expect(detail.taxTotal).toBe('0.00');
    expect(detail.taxRate).toBeNull();
    expect(detail.total).toBe('45.00');

    const text = pdfText(await download(agents.ownerB, invoiceUrl(companies.B, invId) + '/pdf'));
    expect(text).not.toContain('Impuesto');
    expect(text).toContain('Subtotal');

    await agents.ownerB.patch(invoiceUrl(companies.B, invId)).send({ notes: 'x' }).expect(409);
  });

  // ---------------------------------------------------------------------
  // 6.4 PDF, export y cuenta limitada (#16–#20)
  // ---------------------------------------------------------------------

  it('#16 el PDF de una factura con impuesto la muestra completa (§18.2)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '100.00'),
    ]).expect(200);
    await emitOf(agents.ownerB, companies.B, invId).expect(204);

    // Both parties download the PDF — each under its own company in the URL
    // (the access guard resolves the tenant from the route).
    for (const [viewer, companyId] of [
      [agents.ownerB, companies.B],
      [agents.memberA, companies.A],
    ] as const) {
      const buffer = await download(viewer, invoiceUrl(companyId, invId) + '/pdf');
      expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
      const text = pdfText(buffer);
      expect(text).toContain('Impuesto');
      expect(text).toContain('8.375');
      expect(text).toContain('ID fiscal: NV-TEST-BBB');
      expect(text).toContain('Total');
      expect(text).not.toContain('sin impuestos');
    }
  });

  it('#17 el Excel contable incluye Subtotal, Tasa (%) e Impuesto (D7)', async () => {
    const buffer = await download(
      agents.ownerB,
      `${API}/companies/${companies.B}/accounting-exports?format=excel`,
    );
    const [header, ...rows] = await worksheetRows(buffer, 'Facturas');
    expect(header).toEqual(
      expect.arrayContaining(['Subtotal (USD)', 'Tasa (%)', 'Impuesto (USD)']),
    );
    // #10 froze 8.38 of tax over a 100.00 subtotal at 8.375%.
    const taxed = rows.find((row) => row.includes('108.38'));
    expect(taxed).toBeDefined();
    expect(taxed).toEqual(expect.arrayContaining(['100.00', '8.375', '8.38']));

    const entries = await auditActions(agents.ownerB, companies.B, 'accounting.exported');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('#18 la cuenta limitada del cliente ve el impuesto en detalle y PDF (D13)', async () => {
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/clients`)
      .send({ name: 'Rosa Cliente', email: 'rosa.limited7@example.com' })
      .expect(201);
    await agents.ownerC
      .post(`${API}/companies/${companies.C}/clients`)
      .send({ name: 'Pedro Cliente', email: 'pedro.limited7@example.com' })
      .expect(201);
    const tokenRosa = latestTokenFor('rosa.limited7@example.com', '/limited/');
    const tokenPedro = latestTokenFor('pedro.limited7@example.com', '/limited/');
    const clients = await agents.ownerC.get(`${API}/companies/${companies.C}/clients`).expect(200);
    const relRosa = (clients.body as Array<{ relationshipId: string; name: string }>).find(
      (c) => c.name === 'Rosa Cliente',
    )!.relationshipId;

    // Own-client order with a terminal job (§11.4, etapa-5 D1b).
    const created = await agents.ownerC
      .post(`${API}/companies/${companies.C}/orders`)
      .send({
        propertyId: props.propC,
        title: 'Orden con impuesto para cliente',
        description: 'Cliente propio, factura con impuesto (Etapa 7).',
        clientRelationshipId: relRosa,
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
    await agents.ownerC.post(`${API}/companies/${companies.C}/jobs/${jobId}/start`).send({}).expect(204);
    await agents.ownerC.post(`${API}/companies/${companies.C}/jobs/${jobId}/complete`).send({}).expect(204);

    const invId = await draftOf(agents.ownerC, companies.C, orderId);
    await putLinesOf(agents.ownerC, companies.C, invId, [fullLine(jobId, '100.00')]).expect(200);
    await agents.ownerC.patch(invoiceUrl(companies.C, invId)).send({ taxRate: '8.265' }).expect(200);
    await emitOf(agents.ownerC, companies.C, invId).expect(204);

    const list = await http().get(`${API}/limited/${tokenRosa}/invoices`).expect(200);
    expect((list.body as Array<{ id: string }>).some((invoice) => invoice.id === invId)).toBe(true);

    const detail = await http()
      .get(`${API}/limited/${tokenRosa}/invoices/${invId}`)
      .expect(200);
    expect(detail.body.taxTotal).toBe('8.27');
    expect(detail.body.taxRate).toBe('8.265');
    expect(detail.body.total).toBe('108.27');

    const buffer = await download(
      http(),
      `${API}/limited/${tokenRosa}/invoices/${invId}/pdf`,
    );
    expect(pdfText(buffer)).toContain('Impuesto');

    // Another tenant's token never reaches this invoice (§11.3).
    await http().get(`${API}/limited/${tokenPedro}/invoices/${invId}`).expect(404);
  });

  it('#19 una tercera empresa recibe 404 en detalle y PDF (§16.8, §11.3)', async () => {
    const order = await orderWithB();
    const invId = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invId, [
      fullLine(order.jobIds[0], '33.00'),
    ]).expect(200);
    await emitOf(agents.ownerB, companies.B, invId).expect(204);
    await agents.ownerD.get(invoiceUrl(companies.B, invId)).expect(404);
    await agents.ownerD.get(invoiceUrl(companies.B, invId) + '/pdf').expect(404);
    await agents.ownerD
      .get(`${API}/companies/${companies.D}/accounting-exports?format=excel`)
      .expect(200);
  });

  it('#20 el redondeo half-up se aplica en centavos (100.10→8.38 y 0.05→0.00)', async () => {
    const order = await orderWithB();
    const invA = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invA, [
      fullLine(order.jobIds[0], '100.10'),
    ]).expect(200);
    await emitOf(agents.ownerB, companies.B, invA).expect(204);
    const detailA = await detailOf(agents.ownerB, companies.B, invA);
    expect(detailA.taxTotal).toBe('8.38');
    expect(detailA.total).toBe('108.48');

    const invB = await draftOf(agents.ownerB, companies.B, order.orderId);
    await putLinesOf(agents.ownerB, companies.B, invB, [
      fullLine(order.jobIds[0], '0.05'),
    ]).expect(200);
    await emitOf(agents.ownerB, companies.B, invB).expect(204);
    const detailB = await detailOf(agents.ownerB, companies.B, invB);
    expect(detailB.taxTotal).toBe('0.00');
    expect(detailB.total).toBe('0.05');
  });
});
