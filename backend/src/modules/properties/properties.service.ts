import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS_ETAPA2, AUDIT_ENTITIES_ETAPA2 } from '../audit/audit-actions';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { generateToken, hashToken, normalizeEmail } from '../../common/tokens';
import { EmailService } from '../email/email.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CreatePropertyTenantDto } from './dto/create-property-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

export const LIMITED_TOKEN_TTL_DAYS = 30;

function serializeProperty(p: {
  id: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerAddress: string | null;
  ownerCity: string | null;
  ownerState: string | null;
  ownerPostalCode: string | null;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string | null;
  occupancy: string;
  communityName: string | null;
  communityAccessCode: string | null;
  entryInstructions: string | null;
  allowUnattendedEntry: boolean;
  petsInfo: string | null;
  otherInstructions: string | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    owner: {
      name: p.ownerName,
      phone: p.ownerPhone,
      email: p.ownerEmail,
      address: p.ownerAddress,
      city: p.ownerCity,
      state: p.ownerState,
      postalCode: p.ownerPostalCode,
    },
    addressLine: p.addressLine,
    city: p.city,
    state: p.state,
    postalCode: p.postalCode,
    occupancy: p.occupancy,
    community: {
      name: p.communityName,
      accessCode: p.communityAccessCode,
    },
    entryInstructions: p.entryInstructions,
    allowUnattendedEntry: p.allowUnattendedEntry,
    petsInfo: p.petsInfo,
    otherInstructions: p.otherInstructions,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Properties and their tenants (spec etapa-2.md §2.2–§2.4, §4.1–§4.5).
 *
 * Permission rules (§4.4, spec §5): any active member can create a ficha
 * (§5.1 requires a property before any order); only a property_management
 * company edits official data — a contractor or professional gets 403 (matrix
 * #16/#18); tenants are operational data any active member maintains.
 */
@Injectable()
export class PropertiesService {
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  }

  async create(access: CompanyAccess, auth: AuthContext, dto: CreatePropertyDto) {
    const property = await this.prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          companyId: access.companyId,
          createdBy: auth.userId,
          addressLine: dto.addressLine.trim(),
          city: dto.city.trim(),
          state: dto.state.trim(),
          postalCode: dto.postalCode?.trim() || null,
          occupancy: dto.occupancy ?? 'vacant',
          ownerName: dto.ownerName?.trim() || null,
          ownerPhone: dto.ownerPhone?.trim() || null,
          ownerEmail: dto.ownerEmail?.trim() || null,
          ownerAddress: dto.ownerAddress?.trim() || null,
          ownerCity: dto.ownerCity?.trim() || null,
          ownerState: dto.ownerState?.trim() || null,
          ownerPostalCode: dto.ownerPostalCode?.trim() || null,
          communityName: dto.communityName?.trim() || null,
          communityAccessCode: dto.communityAccessCode?.trim() || null,
          entryInstructions: dto.entryInstructions?.trim() || null,
          allowUnattendedEntry: dto.allowUnattendedEntry ?? false,
          petsInfo: dto.petsInfo?.trim() || null,
          otherInstructions: dto.otherInstructions?.trim() || null,
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.PROPERTY_CREATED,
          entityType: AUDIT_ENTITIES_ETAPA2.PROPERTY,
          entityId: created.id,
          // Never include community_access_code or other secrets (§4.5).
          payload: { addressLine: created.addressLine, city: created.city },
        },
        tx,
      );
      return created;
    });

    return serializeProperty(property);
  }

  async list(access: CompanyAccess) {
    const rows = await this.prisma.property.findMany({
      where: { companyId: access.companyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return rows.map(serializeProperty);
  }

  async getDetail(access: CompanyAccess, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, companyId: access.companyId },
    });
    if (!property) throw new NotFoundException('Propiedad no encontrada.');
    const tenants = await this.prisma.propertyTenant.findMany({
      where: { propertyId: property.id },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...serializeProperty(property),
      tenants: tenants.map((pt) => ({
        id: pt.tenant.id,
        linkId: pt.id,
        kind: pt.kind,
        name: pt.tenant.name,
        phones: pt.tenant.phones,
        address: pt.tenant.address,
        availability: pt.tenant.availability,
      })),
    };
  }

  /** Official data edit (§4.4): property_management companies only. */
  async update(access: CompanyAccess, auth: AuthContext, propertyId: string, dto: UpdatePropertyDto) {
    await this.requirePropertyManagement(access);
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, companyId: access.companyId },
    });
    if (!property) throw new NotFoundException('Propiedad no encontrada.');

    const data: Prisma.PropertyUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const scalar: Array<keyof typeof dto> = [
      'addressLine',
      'city',
      'state',
      'postalCode',
      'occupancy',
      'ownerName',
      'ownerPhone',
      'ownerEmail',
      'ownerAddress',
      'ownerCity',
      'ownerState',
      'ownerPostalCode',
      'communityName',
      'communityAccessCode',
      'entryInstructions',
      'allowUnattendedEntry',
      'petsInfo',
      'otherInstructions',
    ];
    for (const field of scalar) {
      const value = dto[field];
      if (value === undefined) continue;
      const normalized = typeof value === 'string' ? value.trim() || null : value;
      (data as Record<string, unknown>)[field] = normalized;
      before[field] = property[field as keyof typeof property];
      after[field] = normalized;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.property.update({ where: { id: property.id }, data });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.PROPERTY_UPDATED,
          entityType: AUDIT_ENTITIES_ETAPA2.PROPERTY,
          entityId: property.id,
          payload: { before, after } as Prisma.InputJsonValue,
        },
        tx,
      );
      return result;
    });

    return serializeProperty(updated);
  }

  /** Registers a tenant and links it to the property (§4.3). */
  async addTenant(
    access: CompanyAccess,
    auth: AuthContext,
    propertyId: string,
    dto: CreatePropertyTenantDto,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, companyId: access.companyId },
    });
    if (!property) throw new NotFoundException('Propiedad no encontrada.');

    // §4.3: no occupant data is required (or allowed) on a vacant property.
    if (property.occupancy === 'vacant' && dto.kind === 'tenant') {
      throw new UnprocessableEntityException(
        'La propiedad está vacante: solo se registra el propietario, no inquilinos.',
      );
    }

    const email = dto.email ? normalizeEmail(dto.email) : null;
    if (email) {
      const existing = await this.prisma.tenant.findUnique({ where: { email } });
      if (existing) throw new ConflictException('Ya existe una cuenta con ese email.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          email,
          phones: (dto.phones ?? []) as Prisma.InputJsonValue,
          address: dto.address?.trim() || null,
          availability: dto.availability?.trim() || null,
        },
      });
      await tx.propertyTenant.create({
        data: { propertyId, tenantId: tenant.id, kind: dto.kind, createdBy: auth.userId },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.PROPERTY_TENANT_ADDED,
          entityType: AUDIT_ENTITIES_ETAPA2.PROPERTY_TENANT,
          entityId: tenant.id,
          payload: { propertyId, kind: dto.kind, name: tenant.name },
        },
        tx,
      );
      return tenant;
    });

    // Limited-access token (approved decision, spec §3): only when the tenant
    // has an email; the token itself is delivered by email, never returned.
    let accessIssued = false;
    if (email) {
      await this.issueLimitedAccess(result.id, email, result.name);
      accessIssued = true;
    }

    return { id: result.id, name: result.name, email, accessIssued };
  }

  /** Operational tenant data (§4.4): any active member of the company. */
  async updateTenant(access: CompanyAccess, auth: AuthContext, tenantId: string, dto: UpdateTenantDto) {
    const link = await this.prisma.propertyTenant.findFirst({
      where: { tenantId, property: { companyId: access.companyId } },
    });
    if (!link) throw new NotFoundException('Inquilino no encontrado.');

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.phones !== undefined ? { phones: dto.phones as Prisma.InputJsonValue } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
          ...(dto.availability !== undefined ? { availability: dto.availability.trim() || null } : {}),
        },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA2.TENANT_UPDATED,
          entityType: AUDIT_ENTITIES_ETAPA2.TENANT,
          entityId: tenantId,
          payload: {
            before: { name: tenant.name, phones: tenant.phones },
            after: { name: result.name, phones: result.phones },
          },
        },
        tx,
      );
      return result;
    });
    return { id: updated.id, name: updated.name, phones: updated.phones };
  }

  /** Creates the opaque limited-access token and emails it (spec §3, AC-4.x). */
  async issueLimitedAccess(tenantId: string, email: string, tenantName: string): Promise<void> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + LIMITED_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.limitedAccessToken.create({
      data: { tenantId, tokenHash: hashToken(token), expiresAt },
    });
    await this.email.sendLimitedAccess(email, {
      name: tenantName,
      accessUrl: `${this.frontendUrl}/limited/${token}`,
      expiresAt,
    });
  }

  private async requirePropertyManagement(access: CompanyAccess): Promise<void> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
    });
    if (company.type !== 'property_management') {
      throw new ForbiddenException(
        'Solo la administradora puede modificar los datos oficiales de la propiedad.',
      );
    }
  }
}
