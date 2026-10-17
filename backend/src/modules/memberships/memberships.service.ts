import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { isLastOwnerBlocked, LAST_OWNER_DETAIL } from './membership-rules';

export interface MembershipView {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

/** Extracts Prisma's unique-constraint error (code P2002). */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/**
 * Memberships: user ↔ company ↔ role (spec §2.3). Revocation never deletes
 * rows (§3.3): it flips status to `revoked`; re-invitation reactivates the
 * same row, preserving its original created_at (§11).
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active members of a company with their account data (spec §4.2). */
  async listActive(companyId: string): Promise<MembershipView[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, status: 'active' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Changes a member's role (owner only, checked by the guard). The row is
   * locked FOR UPDATE so two concurrent owner actions serialize (spec §11).
   */
  async changeRole(
    companyId: string,
    membershipId: string,
    newRole: 'owner' | 'member',
    actorUserId: string,
  ): Promise<{ membershipId: string; role: 'owner' | 'member' }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockRow(tx, companyId, membershipId);
      const membership = await this.getActiveMembership(tx, companyId, membershipId);

      if (
        isLastOwnerBlocked(
          await this.countActiveOwners(tx, companyId),
          membership.role === 'owner',
        ) &&
        newRole === 'member'
      ) {
        throw new ConflictException(LAST_OWNER_DETAIL);
      }

      await tx.membership.update({ where: { id: membership.id }, data: { role: newRole } });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          action: AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
          entityType: AUDIT_ENTITIES.MEMBERSHIP,
          entityId: membership.id,
          payload: { before: { role: membership.role }, after: { role: newRole } },
        },
        tx,
      );
      return { membershipId: membership.id, role: newRole };
    });
  }

  /** Revokes access (spec §3.3): status → revoked, never a physical delete. */
  async revoke(
    companyId: string,
    membershipId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockRow(tx, companyId, membershipId);
      const membership = await this.getActiveMembership(tx, companyId, membershipId);

      if (
        membership.role === 'owner' &&
        isLastOwnerBlocked(await this.countActiveOwners(tx, companyId), true)
      ) {
        throw new ConflictException(LAST_OWNER_DETAIL);
      }

      await tx.membership.update({
        where: { id: membership.id },
        data: { status: 'revoked', revokedAt: new Date() },
      });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          action: AUDIT_ACTIONS.MEMBER_ACCESS_REVOKED,
          entityType: AUDIT_ENTITIES.MEMBERSHIP,
          entityId: membership.id,
          payload: { before: { role: membership.role }, userId: membership.userId },
        },
        tx,
      );
    });
  }

  /**
   * Membership created or reactivated by accepting an invitation (spec §2.3,
   * §11): a previously revoked row is reactivated in place, keeping created_at.
   * Throws 409 when the account is already an active member.
   */
  async upsertFromInvitation(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    role: 'owner' | 'member',
    invitedBy: string,
  ): Promise<void> {
    const existing = await tx.membership.findUnique({
      where: { companyId_userId: { companyId, userId } },
    });
    if (existing && existing.status === 'active') {
      throw new ConflictException('Esta cuenta ya es miembro del espacio.');
    }

    if (existing) {
      await tx.membership.update({
        where: { id: existing.id },
        data: { status: 'active', role, revokedAt: null },
      });
      return;
    }

    try {
      await tx.membership.create({
        data: { companyId, userId, role, invitedBy },
      });
    } catch (error) {
      // Parallel acceptance race (spec §11): the unique (company_id, user_id)
      // constraint lets exactly one winner; the loser gets 409.
      if (isUniqueViolation(error)) {
        throw new ConflictException('Esta cuenta ya es miembro del espacio.');
      }
      throw error;
    }
  }

  private async lockRow(
    tx: Prisma.TransactionClient,
    companyId: string,
    membershipId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${membershipId} AND company_id = ${companyId} FOR UPDATE`;
  }

  private async getActiveMembership(
    tx: Prisma.TransactionClient,
    companyId: string,
    membershipId: string,
  ) {
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, companyId, status: 'active' },
    });
    if (!membership) {
      throw new NotFoundException('Miembro no encontrado.');
    }
    return membership;
  }

  private async countActiveOwners(tx: Prisma.TransactionClient, companyId: string) {
    return tx.membership.count({
      where: { companyId, role: 'owner', status: 'active' },
    });
  }
}
