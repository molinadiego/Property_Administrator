import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit/audit-actions';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { UpdateUrgencySettingsDto } from './dto/update-urgency-settings.dto';

interface SweepResult {
  reminders: number;
  escalations: number;
}

/**
 * Urgent orders: the company response window, its mid-window reminder and
 * the expiry escalation (spec etapa-6.md §4.2, §14.2, §18.4, decisions
 * D1/D2/D7).
 *
 * The window runs over the pending assignment of an urgent order — the
 * only "response" with state in the model (D1). Clock: the assignment's
 * `createdAt`. The reminder goes to the assignee (who must respond); the
 * escalation goes to the owners of the assignee's company (D2). Not
 * responding never authorizes work (§14.2). Idempotency: the marks on the
 * assignment; the sweep runs every 15 minutes (D7) and is also invoked
 * directly by the e2e tests.
 */
@Injectable()
export class UrgencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async getSettings(access: CompanyAccess) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
      select: { urgentResponseHours: true },
    });
    return { responseHours: company.urgentResponseHours };
  }

  /** Owner-only company setting (§5, rule 4). Audited as company.updated. */
  async updateSettings(access: CompanyAccess, auth: AuthContext, dto: UpdateUrgencySettingsDto) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: access.companyId },
        data: { urgentResponseHours: dto.responseHours },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.COMPANY_UPDATED,
          entityType: AUDIT_ENTITIES.COMPANY,
          entityId: access.companyId,
          payload: { urgentResponseHours: company.urgentResponseHours },
        },
        tx,
      );
      return company;
    });
    return { responseHours: updated.urgentResponseHours };
  }

  /** One sweep pass; invoked by the cron and directly by the e2e tests. */
  @Cron('*/15 * * * *', { disabled: process.env.NODE_ENV === 'test' })
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        status: 'pending',
        urgencyEscalatedAt: null,
        job: { order: { urgent: true, status: { notIn: ['completed', 'cancelled'] } } },
      },
      include: {
        job: { select: { id: true, title: true, order: { select: { id: true, title: true } } } },
        assigneeMembership: {
          select: {
            userId: true,
            user: { select: { email: true, name: true } },
            company: { select: { id: true, name: true, urgentResponseHours: true } },
          },
        },
      },
    });

    const result: SweepResult = { reminders: 0, escalations: 0 };
    for (const assignment of assignments) {
      try {
        const windowMs = assignment.assigneeMembership.company.urgentResponseHours * 3_600_000;
        const dueAt = assignment.createdAt.getTime() + windowMs;
        if (now.getTime() >= dueAt) {
          if (await this.escalate(assignment, now)) result.escalations += 1;
        } else if (now.getTime() >= assignment.createdAt.getTime() + windowMs / 2) {
          if (await this.remind(assignment, now)) result.reminders += 1;
        }
      } catch {
        // One failing assignment must not stop the pass (§11.5): it will be
        // retried on the next sweep because the marks are still null.
      }
    }
    return result;
  }

  /** Marks + in-app + email to the assignee, once (§18.4, D2). */
  private async remind(
    assignment: {
      id: string;
      assigneeMembership: {
        userId: string;
        user: { email: string; name: string };
        company: { id: string };
      };
      job: { title: string; order: { title: string } };
    },
    now: Date,
  ): Promise<boolean> {
    const assignee = assignment.assigneeMembership;
    const claimed = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.assignment.updateMany({
        where: { id: assignment.id, urgencyReminderAt: null },
        data: { urgencyReminderAt: now },
      });
      if (marked.count === 0) return false;
      await this.notifications.notify(
        {
          userId: assignee.userId,
          companyId: assignee.company.id,
          type: 'urgent_reminder',
          title: 'Recordatorio de respuesta urgente',
          body: `La orden "${assignment.job.order.title}" es urgente y aún no respondiste la asignación del trabajo "${assignment.job.title}".`,
          entityType: 'assignment',
          entityId: assignment.id,
        },
        tx,
      );
      return true;
    });
    if (!claimed) return false;

    const subject = `Recordatorio: respuesta pendiente en la orden urgente "${assignment.job.order.title}"`;
    const text =
      `La orden "${assignment.job.order.title}" fue marcada como urgente y la asignación del ` +
      `trabajo "${assignment.job.title}" sigue sin respuesta.\n\nRevisa y responde la asignación en la plataforma.\n`;
    const html =
      `<p>La orden <strong>${escapeHtml(assignment.job.order.title)}</strong> fue marcada como urgente ` +
      `y la asignación del trabajo <strong>${escapeHtml(assignment.job.title)}</strong> sigue sin respuesta.</p>` +
      `<p>Revisa y responde la asignación en la plataforma.</p>`;
    await this.dispatch.sendNoticeIfEnabled(assignee, 'urgent_reminder', {
      to: assignee.user.email,
      subject,
      text,
      html,
    });
    return true;
  }

  /** Marks + in-app + email to the assignee company's owners (§18.4, D2). */
  private async escalate(
    assignment: {
      id: string;
      urgencyReminderAt: Date | null;
      assigneeMembership: {
        company: { id: string; name: string };
      };
      job: { title: string; order: { title: string } };
    },
    now: Date,
  ): Promise<boolean> {
    const company = assignment.assigneeMembership.company;
    const claimed = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.assignment.updateMany({
        where: { id: assignment.id, urgencyEscalatedAt: null },
        data: { urgencyEscalatedAt: now },
      });
      if (marked.count === 0) return false;
      // A late sweep may reach expiry without the mid-window reminder: the
      // escalation covers it, so the reminder mark is closed too.
      if (!assignment.urgencyReminderAt) {
        await tx.assignment.updateMany({
          where: { id: assignment.id, urgencyReminderAt: null },
          data: { urgencyReminderAt: now },
        });
      }
      const owners = await tx.membership.findMany({
        where: { companyId: company.id, status: 'active', role: 'owner' },
        select: { userId: true },
      });
      for (const owner of owners) {
        await this.notifications.notify(
          {
            userId: owner.userId,
            companyId: company.id,
            type: 'urgent_escalated',
            title: 'Escalación de respuesta urgente',
            body: `Venció el plazo de respuesta de la orden urgente "${assignment.job.order.title}" (trabajo "${assignment.job.title}") sin que se aceptara ni rechazara la asignación.`,
            entityType: 'assignment',
            entityId: assignment.id,
          },
          tx,
        );
      }
      return owners;
    });
    if (!claimed) return false;

    const subject = `Escalación: orden urgente "${assignment.job.order.title}" sin respuesta`;
    const text =
      `Venció el plazo de respuesta de la orden urgente "${assignment.job.order.title}" ` +
      `(trabajo "${assignment.job.title}") sin aceptar ni rechazar la asignación.\n\n` +
      `La falta de respuesta no autoriza gastos ni trabajos (§14.2); contactá al asignado.\n`;
    const html =
      `<p>Venció el plazo de respuesta de la orden urgente <strong>${escapeHtml(assignment.job.order.title)}</strong> ` +
      `(trabajo <strong>${escapeHtml(assignment.job.title)}</strong>) sin aceptar ni rechazar la asignación.</p>` +
      `<p>La falta de respuesta no autoriza gastos ni trabajos (§14.2); contactá al asignado.</p>`;
    for (const owner of claimed) {
      const user = await this.prisma.user.findUnique({
        where: { id: owner.userId },
        select: { email: true, name: true },
      });
      if (!user) continue;
      await this.dispatch.sendNoticeIfEnabled({ userId: owner.userId }, 'urgent_escalated', {
        to: user.email,
        subject,
        text,
        html,
      });
    }
    return true;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
