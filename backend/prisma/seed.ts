// Development seed: loads a small, 100% fictitious dataset (reserved `.test`
// domain) so the app has something to show and the email flows can be exercised
// against real data. Never runs in production; there is no real user data here.
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

const DEV_PASSWORD = 'DevDemo123!';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed falló:', error);
  process.exitCode = 1;
});
