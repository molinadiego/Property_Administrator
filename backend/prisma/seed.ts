// Development seed: loads a small, 100% fictitious dataset (reserved `.test`
// domain) so the app has something to show and the email flows can be exercised
// against real data. Covers etapas 1–6, including a billing demo (draft,
// issued, partial, refunded, paid and overdue invoices plus a suspected
// duplicate) and the Etapa 6 demo (three subscription plans, an open warranty
// claim over a completed job and an urgent order with a pending assignment).
// Never runs in production; there is no real user data here.
//
// Idempotent and non-destructive: every row uses a fixed UUID and is inserted
// with `skipDuplicates`, so re-running never duplicates. The limited-access
// token is upserted on each run and its raw value is printed (only the hash is
// stored) so it can be tested end-to-end.
import { createHash, randomBytes } from 'node:crypto';
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// --- Fixed UUIDs (keep stable across runs; children reference these) ---------
const U_ANA = '11111111-1111-4111-8111-111111111101';
const U_BOB = '11111111-1111-4111-8111-111111111102';
const U_CARLA = '11111111-1111-4111-8111-111111111103';

const C_GESTION = '22222222-2222-4222-8222-222222222201';
const C_TALLER = '22222222-2222-4222-8222-222222222202';

const M_ANA_G = '33333333-3333-4333-8333-333333333301'; // Ana → Gestión (owner)
const M_BOB_G = '33333333-3333-4333-8333-333333333302'; // Bob → Gestión (member)
const M_CARLA_T = '33333333-3333-4333-8333-333333333303'; // Carla → Taller (owner)
const M_ANA_T = '33333333-3333-4333-8333-333333333304'; // Ana → Taller (member)

const P_1 = '44444444-4444-4444-8444-444444444401'; // occupied
const P_2 = '44444444-4444-4444-8444-444444444402'; // vacant
const P_3 = '44444444-4444-4444-8444-444444444403'; // occupied

const T_1 = '55555555-5555-4555-8555-555555555501'; // María, email + limited access
const T_2 = '55555555-5555-4555-8555-555555555502'; // Carlos, email + client
const T_3 = '55555555-5555-4555-8555-555555555503'; // owner contact, no email

const PT_1 = '66666666-6666-4666-8666-666666666601'; // P_1 ↔ T_1 (tenant)
const PT_2 = '66666666-6666-4666-8666-666666666602'; // P_2 ↔ T_3 (owner)
const PT_3 = '66666666-6666-4666-8666-666666666603'; // P_3 ↔ T_2 (tenant)

const CR_1 = '77777777-7777-4777-8777-777777777701'; // Gestión ↔ T_2 (client)

const O_1 = '88888888-8888-4888-8888-888888888801'; // requested (by T_1)
const O_2 = '88888888-8888-4888-8888-888888888802'; // open
const O_3 = '88888888-8888-4888-8888-888888888803'; // assigned

const J_1 = '99999999-9999-4999-8999-999999999901'; // O_1 job 1
const J_2 = '99999999-9999-4999-8999-999999999902'; // O_2 job 1
const J_3 = '99999999-9999-4999-8999-999999999903'; // O_2 job 2 (pending assignment)
const J_4 = '99999999-9999-4999-8999-999999999904'; // O_3 job 1 (accepted assignment)

const A_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'; // J_4 accepted → Bob
const A_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'; // J_3 pending → Bob

const N_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'; // unread, to Ana
const N_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'; // read, to Bob

const LAT_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'; // limited-access token (T_1)

// Etapa 5 (billing) ---------------------------------------------------------
const O_4 = '88888888-8888-4888-8888-888888888804'; // completed, billed by Taller
const O_5 = '88888888-8888-4888-8888-888888888805'; // client order (CR_1 ↔ T_2)
const J_5 = '99999999-9999-4999-8999-999999999905'; // O_4 job, done
const J_6 = '99999999-9999-4999-8999-999999999906'; // O_5 job, done
const A_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03'; // J_5 accepted → Carla (Taller)
const A_4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04'; // J_6 accepted → Bob (Gestión)

const INV_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'; // draft (Taller → Gestión)
const INV_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'; // issued #1 + duplicate suspect
const INV_3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd03'; // #2 partially paid
const INV_4 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd04'; // #3 paid, then refunded
const INV_5 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd05'; // #4 paid in full
const INV_6 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd06'; // #5 overdue
const INV_7 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd07'; // Gestión #1 → client T_2
const INV_8 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd08'; // Taller #6, with tax (etapa 7)

const LINE = (n: number): string =>
  `eeeeeeee-eeee-4eee-8eee-eeeeeeeeee${String(n).padStart(2, '0')}`;
const PMT = (n: number): string =>
  `ffffffff-ffff-4fff-8fff-ffffffffff${String(n).padStart(2, '0')}`;

// Etapa 6 (suscripciones, garantías, urgencias) ------------------------------
const PLAN_PRO = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01'; // profesional, USD 33
const PLAN_CONTR = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02'; // contractor, USD 66
const PLAN_PM = 'cccccccc-cccc-4ccc-8ccc-cccccccccc03'; // property_management, USD 99
const WC_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc11'; // J_5 warranty claim, open

const DEV_PASSWORD = 'DevDemo123!';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Relative date for billing demo rows (never the future for paidAt). */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

// Same helpers as src/common/tokens.ts (kept inline so the seed is standalone).
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definida (revisá backend/.env).');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const passwordHash = await argon2.hash(DEV_PASSWORD);
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);

  try {
    await prisma.$transaction([
      // Identity ------------------------------------------------------------
      prisma.user.createMany({
        skipDuplicates: true,
        data: [
          { id: U_ANA, email: 'ana@demo.test', passwordHash, name: 'Ana Admin' },
          { id: U_BOB, email: 'bob@demo.test', passwordHash, name: 'Bob Contratista' },
          { id: U_CARLA, email: 'carla@demo.test', passwordHash, name: 'Carla Dueña' },
        ],
      }),
      prisma.company.createMany({
        skipDuplicates: true,
        data: [
          { id: C_GESTION, name: 'Gestión Demo', type: 'property_management', createdBy: U_ANA },
          { id: C_TALLER, name: 'Taller Carla', type: 'own_business', createdBy: U_CARLA },
        ],
      }),
      // Etapa 7 (spec etapa-7.md D8): fictitious Nevada fiscal profiles
      // (§11.6). Filled only when absent so a re-seed never overwrites an
      // owner's real configuration.
      prisma.company.updateMany({
        where: { id: C_GESTION, defaultTaxRate: null, taxId: null },
        data: {
          taxId: 'NV-DEMO-0001',
          taxAddress: '1 Demo Blvd, Las Vegas, NV 89101',
          defaultTaxRate: '8.375', // Clark County combined rate
        },
      }),
      prisma.company.updateMany({
        where: { id: C_TALLER, defaultTaxRate: null, taxId: null },
        data: {
          taxId: 'NV-DEMO-0002',
          taxAddress: '22 Demo Way, Reno, NV 89501',
          defaultTaxRate: '8.265', // Washoe County combined rate
        },
      }),
      prisma.membership.createMany({
        skipDuplicates: true,
        data: [
          { id: M_ANA_G, companyId: C_GESTION, userId: U_ANA, role: 'owner' },
          { id: M_BOB_G, companyId: C_GESTION, userId: U_BOB, role: 'member' },
          { id: M_CARLA_T, companyId: C_TALLER, userId: U_CARLA, role: 'owner' },
          { id: M_ANA_T, companyId: C_TALLER, userId: U_ANA, role: 'member' },
        ],
      }),

      // Etapa 2: properties & tenants ---------------------------------------
      prisma.property.createMany({
        skipDuplicates: true,
        data: [
          {
            id: P_1,
            companyId: C_GESTION,
            createdBy: U_ANA,
            addressLine: '123 Calle Demo',
            city: 'Miami',
            state: 'FL',
            postalCode: '33101',
            occupancy: 'occupied',
            ownerName: 'Dueño Propiedad Uno',
            ownerEmail: 'dueno1@demo.test',
            communityName: 'Residencial Demo',
            communityAccessCode: '1234',
            entryInstructions: 'Llamar al portero antes de entrar.',
            allowUnattendedEntry: true,
            petsInfo: 'Perro pequeño en casa.',
          },
          {
            id: P_2,
            companyId: C_GESTION,
            createdBy: U_ANA,
            addressLine: '456 Avenida Test',
            city: 'Orlando',
            state: 'FL',
            postalCode: '32801',
            occupancy: 'vacant',
            ownerName: 'Dueña Propiedad Dos',
            ownerPhone: '+1 555 0202',
            entryInstructions: 'Llave en caja de seguridad 5678.',
          },
          {
            id: P_3,
            companyId: C_GESTION,
            createdBy: U_ANA,
            addressLine: '789 Boulevard Ejemplo',
            city: 'Tampa',
            state: 'FL',
            postalCode: '33602',
            occupancy: 'occupied',
            ownerName: 'Dueño Propiedad Tres',
            ownerEmail: 'dueno3@demo.test',
          },
        ],
      }),
      prisma.tenant.createMany({
        skipDuplicates: true,
        data: [
          { id: T_1, name: 'María Inquilina', email: 'maria@demo.test', phones: ['+1 555 0101'] },
          { id: T_2, name: 'Carlos Cliente', email: 'carlos@demo.test', phones: [] },
          { id: T_3, name: 'Dueño Contacto', phones: [], address: '123 Calle Demo, Miami, FL' },
        ],
      }),
      prisma.propertyTenant.createMany({
        skipDuplicates: true,
        data: [
          { id: PT_1, propertyId: P_1, tenantId: T_1, kind: 'tenant', createdBy: U_ANA },
          { id: PT_2, propertyId: P_2, tenantId: T_3, kind: 'owner', createdBy: U_ANA },
          { id: PT_3, propertyId: P_3, tenantId: T_2, kind: 'tenant', createdBy: U_ANA },
        ],
      }),
      prisma.clientRelationship.createMany({
        skipDuplicates: true,
        data: [{ id: CR_1, companyId: C_GESTION, tenantId: T_2, createdBy: U_ANA }],
      }),

      // Orders, jobs, assignments -------------------------------------------
      prisma.order.createMany({
        skipDuplicates: true,
        data: [
          {
            id: O_1,
            companyId: C_GESTION,
            propertyId: P_1,
            title: 'Fuga de agua en cocina',
            description: 'El inquilino reportó una fuga bajo el fregadero.',
            origin: 'management',
            originatorId: null,
            requestedByTenantId: T_1,
            status: 'requested',
          },
          {
            id: O_2,
            companyId: C_GESTION,
            propertyId: P_2,
            title: 'Pintar sala antes del alquiler',
            description: 'Preparar la propiedad para nuevos inquilinos.',
            origin: 'management',
            originatorId: U_ANA,
            status: 'open',
          },
          {
            id: O_3,
            companyId: C_GESTION,
            propertyId: P_3,
            title: 'Reparar aire acondicionado',
            description: 'El A/C de la sala no enfría.',
            origin: 'management',
            originatorId: U_ANA,
            status: 'assigned',
          },
        ],
      }),
      prisma.job.createMany({
        skipDuplicates: true,
        data: [
          { id: J_1, orderId: O_1, companyId: C_GESTION, title: 'Revisar fuga', description: 'Localizar y sellar la fuga.', sortOrder: 1, status: 'pending' },
          { id: J_2, orderId: O_2, companyId: C_GESTION, title: 'Pintar sala', description: 'Una mano de pintura lavable.', sortOrder: 1, status: 'pending' },
          { id: J_3, orderId: O_2, companyId: C_GESTION, title: 'Cambiar lámparas', description: 'Reemplazar 3 lámparas.', sortOrder: 2, status: 'pending' },
          { id: J_4, orderId: O_3, companyId: C_GESTION, title: 'Diagnóstico del A/C', description: 'Revisar el equipo de la sala.', sortOrder: 1, status: 'in_progress' },
        ],
      }),
      prisma.assignment.createMany({
        skipDuplicates: true,
        data: [
          { id: A_1, jobId: J_4, companyId: C_GESTION, assigneeMembershipId: M_BOB_G, assignedBy: U_ANA, status: 'accepted', respondedAt: new Date() },
          { id: A_2, jobId: J_3, companyId: C_GESTION, assigneeMembershipId: M_BOB_G, assignedBy: U_ANA, status: 'pending' },
        ],
      }),

      // Notifications & limited access --------------------------------------
      prisma.notification.createMany({
        skipDuplicates: true,
        data: [
          { id: N_1, userId: U_ANA, companyId: C_GESTION, type: 'order_created', title: 'Nueva solicitud de trabajo', body: 'María Inquilina solicitó: Fuga de agua en cocina.', entityType: 'order', entityId: O_1 },
          { id: N_2, userId: U_BOB, companyId: C_GESTION, type: 'assignment_requested', title: 'Te asignaron un trabajo', body: 'Ana te asignó: Diagnóstico del A/C.', entityType: 'job', entityId: J_4, readAt: new Date() },
        ],
      }),
      prisma.limitedAccessToken.upsert({
        where: { id: LAT_1 },
        create: { id: LAT_1, tenantId: T_1, tokenHash, status: 'active', expiresAt },
        update: { tokenHash, status: 'active', expiresAt, revokedAt: null },
      }),

      // Etapa 5: billing demo (fictitious invoices & payments) --------------
      // Taller Carla (own_business) bills Gestión for a finished job (D1a,
      // §11.4), and Gestión bills its own client Carlos (D1b, P3). Persisted
      // statuses are the base ones (`draft`/`issued`); paid, partially_paid
      // and overdue are derived at read time (§20.4, D4).
      prisma.order.createMany({
        skipDuplicates: true,
        data: [
          {
            id: O_4,
            companyId: C_GESTION,
            propertyId: P_1,
            title: 'Instalación de ventilador de techo',
            description: 'Trabajo terminado y facturado por Taller Carla.',
            origin: 'management',
            originatorId: U_ANA,
            status: 'completed',
          },
          {
            id: O_5,
            companyId: C_GESTION,
            propertyId: P_3,
            title: 'Revisión eléctrica para el cliente Carlos',
            description: 'Orden del cliente propio (client_relationship CR_1).',
            origin: 'own_business',
            originatorId: U_ANA,
            clientRelationshipId: CR_1,
            status: 'completed',
          },
        ],
      }),
      prisma.job.createMany({
        skipDuplicates: true,
        data: [
          { id: J_5, orderId: O_4, companyId: C_GESTION, title: 'Instalar ventilador', description: 'Montaje y prueba del ventilador.', sortOrder: 1, status: 'done' },
          { id: J_6, orderId: O_5, companyId: C_GESTION, title: 'Revisión eléctrica', description: 'Inspección completa del tablero.', sortOrder: 1, status: 'done' },
        ],
      }),
      prisma.assignment.createMany({
        skipDuplicates: true,
        data: [
          { id: A_3, jobId: J_5, companyId: C_GESTION, assigneeMembershipId: M_CARLA_T, assignedBy: U_ANA, status: 'accepted', respondedAt: daysFromNow(-25) },
          { id: A_4, jobId: J_6, companyId: C_GESTION, assigneeMembershipId: M_BOB_G, assignedBy: U_ANA, status: 'accepted', respondedAt: daysFromNow(-12) },
        ],
      }),
      prisma.invoice.createMany({
        skipDuplicates: true,
        data: [
          // Draft: no number, no totals (D2/D5).
          {
            id: INV_1,
            companyId: C_TALLER,
            recipientCompanyId: C_GESTION,
            orderId: O_4,
            status: 'draft',
            dueDate: daysFromNow(30),
            notes: 'Borrador: falta confirmar los materiales con el cliente.',
            createdById: U_CARLA,
          },
          // #1 issued: partial charge plus a suspected duplicate (D6).
          {
            id: INV_2,
            companyId: C_TALLER,
            recipientCompanyId: C_GESTION,
            orderId: O_4,
            status: 'issued',
            number: 1,
            issueDate: daysFromNow(-10),
            dueDate: daysFromNow(20),
            subtotal: '450.00',
            taxTotal: '0.00',
            total: '450.00',
            notes: 'Emitida tras la visita de emergencia.',
            createdById: U_CARLA,
          },
          // #2 issued: partially paid (120 of 300).
          {
            id: INV_3,
            companyId: C_TALLER,
            recipientCompanyId: C_GESTION,
            orderId: O_4,
            status: 'issued',
            number: 2,
            issueDate: daysFromNow(-12),
            dueDate: daysFromNow(18),
            subtotal: '300.00',
            taxTotal: '0.00',
            total: '300.00',
            createdById: U_CARLA,
          },
          // #3 issued: paid in full, then partially refunded (P5).
          {
            id: INV_4,
            companyId: C_TALLER,
            recipientCompanyId: C_GESTION,
            orderId: O_4,
            status: 'issued',
            number: 3,
            issueDate: daysFromNow(-15),
            dueDate: daysFromNow(15),
            subtotal: '250.00',
            taxTotal: '0.00',
            total: '250.00',
            createdById: U_CARLA,
          },
          // #4 issued: paid in full.
          {
            id: INV_5,
            companyId: C_TALLER,
            recipientCompanyId: C_GESTION,
            orderId: O_4,
            status: 'issued',
            number: 4,
            issueDate: daysFromNow(-20),
            dueDate: daysFromNow(10),
            subtotal: '140.00',
            taxTotal: '0.00',
            total: '140.00',
            createdById: U_CARLA,
          },
          // #5 issued: due date in the past -> derived overdue (D4, P6).
          {
            id: INV_6,
            companyId: C_TALLER,
            recipientCompanyId: C_GESTION,
            orderId: O_4,
            status: 'issued',
            number: 5,
            issueDate: daysFromNow(-45),
            dueDate: daysFromNow(-15),
            subtotal: '90.00',
            taxTotal: '0.00',
            total: '90.00',
            notes: 'Vencida: Gestión pidió una prórroga que nunca llegó.',
            createdById: U_CARLA,
          },
          // Gestión #1: invoice to its own client (D1b, P3) — visible in the
          // limited-access account of Carlos (T_2).
          {
            id: INV_7,
            companyId: C_GESTION,
            recipientTenantId: T_2,
            orderId: O_5,
            status: 'issued',
            number: 1,
            issueDate: daysFromNow(-8),
            dueDate: daysFromNow(22),
            subtotal: '220.00',
            taxTotal: '0.00',
            total: '220.00',
            createdById: U_ANA,
          },
          // Etapa 7 demo (etapa-7.md D8): Taller #6 with Nevada tax — the
          // labor line is not taxable, so the base is 100.00 and 8.265%
          // freezes tax_total 8.27 (half-up of 8.265).
          {
            id: INV_8,
            companyId: C_TALLER,
            recipientCompanyId: C_GESTION,
            orderId: O_4,
            status: 'issued',
            number: 6,
            issueDate: daysFromNow(-2),
            dueDate: daysFromNow(28),
            subtotal: '300.00',
            taxRate: '8.265',
            taxTotal: '8.27',
            total: '308.27',
            notes: 'Factura con impuesto de Nevada (etapa 7).',
            createdById: U_CARLA,
          },
        ],
      }),
      prisma.invoiceLine.createMany({
        skipDuplicates: true,
        data: [
          { id: LINE(1), invoiceId: INV_1, jobId: J_5, kind: 'material', description: 'Ventilador de techo', amount: '180.00' },
          // Etapa 7 T4: labor is not taxable in this draft (issuer's call).
          { id: LINE(2), invoiceId: INV_1, jobId: J_5, kind: 'labor', description: 'Instalación', amount: '120.00', taxable: false },
          { id: LINE(3), invoiceId: INV_2, jobId: J_5, kind: 'labor', description: 'Servicio de emergencia', amount: '450.00' },
          { id: LINE(4), invoiceId: INV_3, jobId: J_5, kind: 'material', description: 'Filtros y refrigerante', amount: '300.00' },
          { id: LINE(5), invoiceId: INV_4, jobId: J_5, kind: 'labor', description: 'Instalación completa', amount: '250.00' },
          { id: LINE(6), invoiceId: INV_5, jobId: J_5, kind: 'labor', description: 'Visita técnica', amount: '140.00' },
          { id: LINE(7), invoiceId: INV_6, jobId: J_5, kind: 'other', description: 'Reposición de tornillería', amount: '90.00' },
          { id: LINE(8), invoiceId: INV_7, jobId: J_6, kind: 'labor', description: 'Revisión eléctrica completa', amount: '220.00', taxable: false },
          // Etapa 7 demo: taxable materials + non-taxable labor (base 100.00).
          { id: LINE(9), invoiceId: INV_8, jobId: J_5, kind: 'material', description: 'Panel eléctrico', amount: '100.00' },
          { id: LINE(10), invoiceId: INV_8, jobId: J_5, kind: 'labor', description: 'Instalación del panel', amount: '200.00', taxable: false },
        ],
      }),
      prisma.payment.createMany({
        skipDuplicates: true,
        data: [
          // INV_2: canonical charge + look-alike flagged as possible duplicate.
          { id: PMT(5), companyId: C_GESTION, invoiceId: INV_2, kind: 'charge', status: 'recorded', amount: '200.00', paidAt: daysFromNow(-1), method: 'transfer', reference: 'TRF-DEMO-5', createdById: U_BOB },
          { id: PMT(6), companyId: C_TALLER, invoiceId: INV_2, kind: 'charge', status: 'duplicate_suspect', duplicateOfId: PMT(5), amount: '200.00', paidAt: daysFromNow(-1), method: 'transfer', reference: 'TRF-DEMO-5', notes: 'Posible duplicado: una de las partes debe conciliarla (D6).', createdById: U_CARLA },
          // INV_3: partial payment.
          { id: PMT(1), companyId: C_GESTION, invoiceId: INV_3, kind: 'charge', status: 'recorded', amount: '120.00', paidAt: daysFromNow(-5), method: 'transfer', reference: 'TRF-DEMO-1', createdById: U_BOB },
          // INV_4: full payment followed by a partial refund (net 200 of 250).
          { id: PMT(2), companyId: C_GESTION, invoiceId: INV_4, kind: 'charge', status: 'recorded', amount: '250.00', paidAt: daysFromNow(-7), method: 'transfer', reference: 'TRF-DEMO-2', createdById: U_BOB },
          { id: PMT(3), companyId: C_TALLER, invoiceId: INV_4, kind: 'refund', status: 'recorded', amount: '50.00', paidAt: daysFromNow(-2), method: 'transfer', reference: 'REEMBOLSO-DEMO', notes: 'Devolución parcial por material faltante.', createdById: U_CARLA },
          // INV_5: full payment.
          { id: PMT(4), companyId: C_GESTION, invoiceId: INV_5, kind: 'charge', status: 'recorded', amount: '140.00', paidAt: daysFromNow(-3), method: 'transfer', reference: 'TRF-DEMO-4', createdById: U_BOB },
          // INV_7: partial payment on the client invoice.
          { id: PMT(7), companyId: C_GESTION, invoiceId: INV_7, kind: 'charge', status: 'recorded', amount: '100.00', paidAt: daysFromNow(-4), method: 'transfer', reference: 'TRF-DEMO-7', createdById: U_ANA },
        ],
      }),
      // Gapless per-company series (D2): Taller is at 6, Gestión at 1.
      prisma.invoiceCounter.createMany({
        skipDuplicates: true,
        data: [
          { companyId: C_TALLER, lastNumber: 6 },
          { companyId: C_GESTION, lastNumber: 1 },
        ],
      }),
      // --- Etapa 6: planes, garantías y urgencias (spec etapa-6.md) --------
      // Los precios son de ejemplo (33/66/99 USD, §18.3) y la semilla no los
      // sobrescribe: un ajuste hecho por despliegue se conserva (D4, §11.9).
      prisma.plan.upsert({
        where: { category: 'profesional' },
        create: { id: PLAN_PRO, name: 'Profesional independiente', category: 'profesional', price: '33.00' },
        update: { name: 'Profesional independiente' },
      }),
      prisma.plan.upsert({
        where: { category: 'contractor' },
        create: { id: PLAN_CONTR, name: 'Contratista', category: 'contractor', price: '66.00' },
        update: { name: 'Contratista' },
      }),
      prisma.plan.upsert({
        where: { category: 'property_management' },
        create: { id: PLAN_PM, name: 'Administradora de propiedades', category: 'property_management', price: '99.00' },
        update: { name: 'Administradora de propiedades' },
      }),
      // Plan explícito para Gestión; Taller queda sin plan_id para demostrar
      // el plan por categoría (own_business → profesional, D3).
      prisma.company.update({ where: { id: C_GESTION }, data: { planId: PLAN_PM } }),
      // Reclamo de garantía abierto sobre el trabajo Completado J_5 (§13).
      prisma.warrantyClaim.createMany({
        skipDuplicates: true,
        data: [
          {
            id: WC_1,
            companyId: C_GESTION,
            orderId: O_4,
            jobId: J_5,
            description: 'El ventilador hace ruido tras la instalación; se pide revisión en garantía.',
            createdBy: U_ANA,
          },
        ],
      }),
      // Orden urgente con la asignación A_2 todavía pendiente: el barrido
      // recuerda a Bob y, al vencer el plazo de la empresa asignada (24h),
      // escala a sus owners (§18.4, D1/D2).
      prisma.order.update({ where: { id: O_2 }, data: { urgent: true } }),
    ]);

    console.log('Seed completado (datos ficticios de desarrollo).');
    console.log('Usuarios (password: ' + DEV_PASSWORD + '):');
    console.log('  ana@demo.test   → Gestión Demo (owner), Taller Carla (member)');
    console.log('  bob@demo.test   → Gestión Demo (member)');
    console.log('  carla@demo.test → Taller Carla (owner)');
    console.log('');
    console.log('Token de acceso limitado (María / T_1) — solo se guardó su hash:');
    console.log('  ' + token);
    console.log('  Vence: ' + expiresAt.toISOString());
    console.log('');
    console.log('Facturas de demo (Etapa 5): Taller Carla → Gestión (N.º 1–5: borrador,');
    console.log('  parcial, devuelta, pagada y vencida) y Gestión → Carlos Cliente (N.º 1,');
    console.log('  visible en la cuenta limitada de Carlos cuando tenga token).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed falló:', error);
  process.exitCode = 1;
});
