import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { EmailService } from '../email/email.service';
import { MembershipsService } from '../memberships/memberships.service';
import { AuthContext } from '../../common/request-context';
import { generateToken, hashToken, maskEmail, normalizeEmail } from '../../common/tokens';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import { ListInvitationsQueryDto } from './dto/create-invitation.dto';

const INVITATION_TTL_DAYS = 7;

export interface AcceptResult {
  userId: string;
  /** True when the accept created the account (no session was present). */
  createdAccount: boolean;
}

/**
 * Invitations by email (spec etapa-1.md §4.3): the token travels by email and
 * only its hash is stored (§2.5); an invitation grants only its space and
 * role (§3.2); previously revoked members are reactivated in place (§11).
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly membershipsService: MembershipsService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  }

  async create(
    companyId: string,
    auth: AuthContext,
    dto: { email: string; role: 'owner' | 'member' },
  ) {
    const email = normalizeEmail(dto.email);

    const invitee = await this.prisma.user.findUnique({ where: { email } });
    if (invitee) {
      const membership = await this.prisma.membership.findUnique({
        where: { companyId_userId: { companyId, userId: invitee.id } },
      });
      if (membership && membership.status === 'active') {
        throw new ConflictException('Ese email ya es miembro del espacio.');
      }
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { companyId, email, status: 'pending', expiresAt: { gt: new Date() } },
    });
    if (pending) {
      throw new ConflictException(
        'Ya existe una invitación pendiente para ese email. Revócala para crear una nueva.',
      );
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          companyId,
          email,
          role: dto.role,
          tokenHash: hashToken(token),
          invitedBy: auth.userId,
          expiresAt,
        },
      });
      await this.audit.record(
        {
          companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.MEMBER_INVITED,
          entityType: AUDIT_ENTITIES.INVITATION,
          entityId: created.id,
          payload: { email, role: dto.role },
        },
        tx,
      );
      return created;
    });

    const [company, inviter] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }),
    ]);
    try {
      await this.email.sendInvitation(email, {
        companyName: company.name,
        inviterName: inviter.name,
        acceptUrl: `${this.frontendUrl}/invitations/${token}`,
        expiresAt,
      });
    } catch (error) {
      // The invitation stays pending; a failed send is logged, not exposed.
      this.logger.error(
        `No se pudo enviar la invitación a ${email}: ${(error as Error).message}`,
      );
    }

    return this.toView(invitation);
  }

  /** Pending/accepted/… list, newest first, cursor-paginated (spec §3). */
  async list(companyId: string, query: ListInvitationsQueryDto) {
    const limit = query.limit ?? 50;
    const filters: Prisma.InvitationWhereInput[] = [{ companyId }];
    if (query.status) filters.push({ status: query.status });
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) {
        throw new UnprocessableEntityException('Cursor de paginación inválido.');
      }
      filters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.invitation.findMany({
      where: { AND: filters },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map((row) => this.toView(row)),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async revoke(companyId: string, invitationId: string, auth: AuthContext): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, companyId },
    });
    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException('Invitación no encontrada o no está pendiente.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'revoked' },
      });
      await this.audit.record(
        {
          companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.INVITATION_REVOKED,
          entityType: AUDIT_ENTITIES.INVITATION,
          entityId: invitation.id,
          payload: { email: invitation.email },
        },
        tx,
      );
    });
  }

  /** Public preview: company name + masked email, never the raw token (§4.3). */
  async preview(token: string) {
    const invitation = await this.findValidByToken(token, { markExpired: true });
    return {
      companyName: invitation.company.name,
      emailMasked: maskEmail(invitation.email),
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Accepts the invitation (spec §4.3): with a session the current account
   * joins; without one, `{name, password}` creates the account first. All
   * writes happen in one transaction (AC-3.2, AC-3.3, §11).
   */
  async accept(
    token: string,
    auth: AuthContext | null,
    dto: { name?: string; password?: string } | null,
  ): Promise<AcceptResult> {
    if (!auth && (!dto?.name || !dto?.password)) {
      throw new UnprocessableEntityException(
        'Se requieren nombre y contraseña para crear la cuenta.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const invitation = await this.findValidByTokenInTx(tx, token);
      const now = new Date();

      let userId: string;
      let createdAccount = false;
      if (auth) {
        userId = auth.userId;
      } else {
        const existing = await tx.user.findUnique({ where: { email: invitation.email } });
        if (existing) {
          throw new ConflictException(
            'Ya existe una cuenta con ese email. Inicia sesión para aceptar la invitación.',
          );
        }
        const passwordHash = await argon2.hash(dto!.password!);
        const created = await tx.user.create({
          data: { email: invitation.email, name: dto!.name!.trim(), passwordHash },
        });
        userId = created.id;
        createdAccount = true;
      }

      await this.membershipsService.upsertFromInvitation(
        tx,
        invitation.companyId,
        userId,
        invitation.role,
        invitation.invitedBy,
      );

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: now, acceptedBy: userId },
      });
      await this.audit.record(
        {
          companyId: invitation.companyId,
          actorUserId: userId,
          action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
          entityType: AUDIT_ENTITIES.INVITATION,
          entityId: invitation.id,
          // Records both emails in case they differ (spec §4.3).
          payload: { invitedEmail: invitation.email, acceptedAccountId: userId },
        },
        tx,
      );

      return { userId, createdAccount };
    });
  }

  private async findValidByToken(token: string, opts: { markExpired: boolean }) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { company: true },
    });
    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada.');
    }
    this.assertUsable(invitation, opts.markExpired);
    return invitation;
  }

  private async findValidByTokenInTx(
    tx: import('../../generated/prisma/client').Prisma.TransactionClient,
    token: string,
  ) {
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada.');
    }
    this.assertUsable(invitation, true);
    return invitation;
  }

  /** Revoked/unknown → 404, expired → 410, accepted → 409 (AC-3.4, AC-3.5). */
  private assertUsable(
    invitation: { id: string; status: string; expiresAt: Date },
    markExpired: boolean,
  ): void {
    if (invitation.status === 'revoked') {
      throw new NotFoundException('Invitación no encontrada.');
    }
    if (invitation.status === 'accepted') {
      throw new ConflictException('La invitación ya fue aceptada.');
    }
    const expired = invitation.status === 'expired' || invitation.expiresAt <= new Date();
    if (expired) {
      if (markExpired && invitation.status === 'pending') {
        void this.prisma.invitation
          .updateMany({
            where: { id: invitation.id, status: 'pending' },
            data: { status: 'expired' },
          })
          .catch(() => undefined);
      }
      throw new GoneException('La invitación expiró. Pide una nueva.');
    }
  }

  private toView(invitation: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };
  }
}
