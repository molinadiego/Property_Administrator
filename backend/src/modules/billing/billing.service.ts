import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { InvoiceStatus as InvoiceStatusValue } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { AUDIT_ACTIONS_ETAPA5, AUDIT_ENTITIES_ETAPA5 } from '../audit/audit-actions';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import { fromCents, toCents } from '../economic-settings/spending-rules';
import { canSubmitCostReport } from '../costs/cost-rules';
import { isTerminalJobStatus } from '../orders/job-rules';
import { PdfService } from './pdf.service';
import { ExcelService } from './excel.service';
import { AccountingExportQueryDto } from './dto/accounting-export.query.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoicesQueryDto } from './dto/invoices.query.dto';
import { PatchInvoiceDto } from './dto/patch-invoice.dto';
import { PutInvoiceLinesDto } from './dto/put-lines.dto';
import { ReconcilePaymentDto } from './dto/reconcile-payment.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import {
  DuplicateComparison,
  JobBillingFact,
  defaultDueDate,
  deriveInvoiceStatus,
  evaluateInvoiceEligibility,
  isPossibleDuplicate,
  isVoidableStatus,
  lineTotalCents,
  paidNetCents,
  paymentAmountError,
  statusAfterPayment,
  todayIso,
} from './invoice-rules';
import { AccountingExportData, InvoicePdfData } from './types';

type InvoiceInclude = {
  lines: { include: { job: true } };
  payments: true;
  order: true;
  company: true;
  recipientCompany: true;
  recipientTenant: true;
};

type InvoiceFull = Prisma.InvoiceGetPayload<{ include: InvoiceInclude }>;

type InvoicePartyRole = 'issuer' | 'recipient';

const isoDate = (date: Date | null): string | null =>
  date ? date.toISOString().slice(0, 10) : null;

const centsOf = (decimal: Prisma.Decimal): number => toCents(decimal.toFixed(2));

/** `fromCents` with a non-null guarantee for known-cents callers (§12). */
const money = (cents: number): string => fromCents(cents) ?? '0.00';

/**
 * Invoices, payments and accounting downloads (spec etapa-5.md, proyect.md
 * §11, §12, §3.5, §16.10). Emitted invoices are immutable except for payment
 * transitions and voiding (§11.5); the runtime never deletes a financial
 * record (§1.1.8). The stored base status plus the derived `overdue` follow
 * D4/P6; money only ever moves in integer cents (§12).
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly pdf: PdfService,
    private readonly excel: ExcelService,
  ) {}

  // =========================================================================
  // §4.1 Invoices
  // =========================================================================

  /** Creates an editable draft for an order the company may bill (D1a/D1b). */
  async createDraft(access: CompanyAccess, auth: AuthContext, dto: CreateInvoiceDto) {
    const context = await this.eligibilityContext(dto.orderId, access.companyId);
    if (!context.involved) {
      throw new NotFoundException('Orden no encontrada.');
    }
    const eligibility = evaluateInvoiceEligibility({
      orderStatus: context.order.status,
      orderCompanyId: context.order.companyId,
      clientTenantId: context.clientTenantId,
      emitterCompanyId: access.companyId,
      emitterType: context.emitterType,
      facts: context.facts,
    });
    if (!eligibility.ok || !eligibility.recipient) {
      throw new ConflictException(eligibility.reason ?? 'La empresa no puede facturar esta orden.');
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        companyId: access.companyId,
        ...(eligibility.recipient.kind === 'company'
          ? { recipientCompanyId: eligibility.recipient.companyId }
          : { recipientTenantId: eligibility.recipient.tenantId }),
        orderId: context.order.id,
        notes: dto.notes?.trim() || null,
        createdById: auth.userId,
      },
      include: this.invoiceInclude(),
    });

    await this.audit.record({
      companyId: access.companyId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS_ETAPA5.INVOICE_CREATED,
      entityType: AUDIT_ENTITIES_ETAPA5.INVOICE,
      entityId: invoice.id,
      payload: {
        orderId: context.order.id,
        recipientKind: eligibility.recipient.kind,
      } as Prisma.InputJsonValue,
    });

    return this.serializeInvoice(invoice, { includeLines: false });
  }

  /** Emitted + received invoices of the company (§11.3). */
  async listInvoices(access: CompanyAccess, query: InvoicesQueryDto) {
    const limit = query.limit ?? 50;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    if (query.cursor && !cursor) {
      throw new UnprocessableEntityException('Cursor inválido.');
    }

    const filters: Prisma.InvoiceWhereInput[] = [
      { OR: [{ companyId: access.companyId }, { recipientCompanyId: access.companyId, status: { not: 'draft' } }] },
    ];
    if (query.order_id) filters.push({ orderId: query.order_id });
    if (query.counterparty_company_id) {
      filters.push({
        OR: [
          { companyId: query.counterparty_company_id },
          { recipientCompanyId: query.counterparty_company_id },
        ],
      });
    }
    if (query.status) filters.push(this.statusFilter(query.status));

    const rows = await this.prisma.invoice.findMany({
      where: { AND: filters },
      include: this.invoiceInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { createdAt: cursor.createdAt, id: cursor.id }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit && page.length > 0
        ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
        : null;

    return {
      data: page.map((invoice) => this.serializeInvoice(invoice, { includeLines: false })),
      nextCursor,
    };
  }

  /** Invoice detail: lines, payments, net paid and balance. */
  async getInvoice(access: CompanyAccess, invoiceId: string) {
    const { invoice, role } = await this.loadInvoice(invoiceId, access);
    this.assertRecipientCanRead(invoice, role);
    return this.serializeInvoice(invoice, { includeLines: true });
  }

  /** Edits the mutable fields of a draft (§11.5). */
  async updateDraft(access: CompanyAccess, auth: AuthContext, invoiceId: string, dto: PatchInvoiceDto) {
    if (dto.notes === undefined && dto.dueDate === undefined) {
      throw new UnprocessableEntityException('Envía al menos notes o dueDate (422).');
    }
    const { invoice, role } = await this.loadInvoice(invoiceId, access);
    if (role !== 'issuer') {
      throw new ForbiddenException('Solo el emisor edita la factura (§11.5).');
    }
    if (invoice.status !== 'draft') {
      throw new ConflictException('La factura emitida es inmutable: anula y vuelve a emitir (§11.5).');
    }

    const notes = dto.notes !== undefined ? dto.notes.trim() || null : invoice.notes;
    const dueDate = dto.dueDate !== undefined ? new Date(`${dto.dueDate.slice(0, 10)}T00:00:00.000Z`) : invoice.dueDate;
    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { notes, dueDate },
      include: this.invoiceInclude(),
    });

    await this.audit.record({
      companyId: access.companyId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS_ETAPA5.INVOICE_UPDATED,
      entityType: AUDIT_ENTITIES_ETAPA5.INVOICE,
      entityId: invoice.id,
      payload: {
        notes: dto.notes !== undefined ? 'changed' : 'unchanged',
        dueDate: dto.dueDate ?? null,
      } as Prisma.InputJsonValue,
    });

    return this.serializeInvoice(updated, { includeLines: true });
  }

  /** Replaces the draft's lines; every line must reference a billable job. */
  async putLines(access: CompanyAccess, auth: AuthContext, invoiceId: string, dto: PutInvoiceLinesDto) {
    const { invoice, role } = await this.loadInvoice(invoiceId, access);
    if (role !== 'issuer') {
      throw new ForbiddenException('Solo el emisor edita la factura (§11.5).');
    }
    if (invoice.status !== 'draft') {
      throw new ConflictException('La factura emitida es inmutable: anula y vuelve a emitir (§11.5).');
    }

    const context = await this.eligibilityContext(invoice.orderId, invoice.companyId);
    const eligibility = evaluateInvoiceEligibility({
      orderStatus: context.order.status,
      orderCompanyId: context.order.companyId,
      clientTenantId: context.clientTenantId,
      emitterCompanyId: invoice.companyId,
      emitterType: context.emitterType,
      facts: context.facts,
    });
    if (!eligibility.ok) {
      throw new ConflictException(eligibility.reason ?? 'La empresa ya no puede facturar esta orden.');
    }
    const billable = new Set(eligibility.billableJobIds);
    for (const line of dto.lines) {
      if (!billable.has(line.jobId)) {
        throw new UnprocessableEntityException(
          `El trabajo ${line.jobId} no es facturable por esta empresa (§11.1, §11.4).`,
        );
      }
    }

    const totalCents = lineTotalCents(dto.lines);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoice.id} FOR UPDATE`;
      await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceLine.createMany({
        data: dto.lines.map((line) => ({
          invoiceId: invoice.id,
          jobId: line.jobId,
          kind: line.kind,
          description: line.description,
          amount: line.amount,
        })),
      });
    });

    await this.audit.record({
      companyId: access.companyId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS_ETAPA5.INVOICE_UPDATED,
      entityType: AUDIT_ENTITIES_ETAPA5.INVOICE,
      entityId: invoice.id,
      payload: { lines: dto.lines.length, total: money(totalCents) } as Prisma.InputJsonValue,
    });

    const reloaded = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: this.invoiceInclude(),
    });
    return this.serializeInvoice(reloaded, { includeLines: true });
  }

  /**
   * Emits a draft: assigns the per-company sequential number under a row lock
   * (D2), freezes the totals (D5), notifies the recipient and audits (§12).
   */
  async emit(access: CompanyAccess, auth: AuthContext, invoiceId: string): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: this.invoiceInclude(),
      });
      if (invoice.companyId !== access.companyId) {
        throw new ForbiddenException('Solo el emisor emite la factura (§11.5).');
      }
      if (invoice.status !== 'draft') {
        throw new ConflictException('La factura ya fue emitida (§20.4).');
      }
      if (invoice.lines.length === 0) {
        throw new UnprocessableEntityException('La factura necesita al menos un renglón (§11.1).');
      }
      const totalCents = lineTotalCents(
        invoice.lines.map((line) => ({ amount: line.amount.toFixed(2) })),
      );
      if (totalCents <= 0) {
        throw new UnprocessableEntityException('El total de la factura debe ser mayor que cero (§11.1).');
      }

      // The order must still be billable at emission time (§20.1, D1).
      const context = await this.eligibilityContext(invoice.orderId, invoice.companyId, tx);
      const eligibility = evaluateInvoiceEligibility({
        orderStatus: context.order.status,
        orderCompanyId: context.order.companyId,
        clientTenantId: context.clientTenantId,
        emitterCompanyId: invoice.companyId,
        emitterType: context.emitterType,
        facts: context.facts,
      });
      if (!eligibility.ok) {
        throw new ConflictException(eligibility.reason ?? 'La empresa ya no puede facturar esta orden.');
      }

      const issueDate = todayIso();
      const dueDate = invoice.dueDate ? isoDate(invoice.dueDate)! : defaultDueDate(issueDate);
      if (dueDate < issueDate) {
        throw new UnprocessableEntityException('El vencimiento no puede ser anterior a la emisión (D3).');
      }

      // D2: gapless per-company series, serialized with a counter row lock.
      await tx.$executeRaw`INSERT INTO invoice_counters (company_id, last_number) VALUES (${access.companyId}, 0) ON CONFLICT (company_id) DO NOTHING`;
      const counters = await tx.$queryRaw<Array<{ last_number: number }>>`
        SELECT last_number FROM invoice_counters WHERE company_id = ${access.companyId} FOR UPDATE`;
      const number = counters[0].last_number + 1;
      await tx.invoiceCounter.update({
        where: { companyId: access.companyId },
        data: { lastNumber: number },
      });

      const issued = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'issued',
          number,
          issueDate: new Date(`${issueDate}T00:00:00.000Z`),
          dueDate: new Date(`${dueDate}T00:00:00.000Z`),
          subtotal: (totalCents / 100).toFixed(2),
          total: (totalCents / 100).toFixed(2),
        },
        include: this.invoiceInclude(),
      });

      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA5.INVOICE_EMITTED,
          entityType: AUDIT_ENTITIES_ETAPA5.INVOICE,
          entityId: invoice.id,
          payload: { number, total: money(totalCents), dueDate } as Prisma.InputJsonValue,
        },
        tx,
      );

      return { issued, totalCents };
    });

    const { issued, totalCents } = result;
    const recipientEmail = await this.invoiceContactEmail(issued, 'recipient');
    if (recipientEmail) {
      await this.email.sendInvoiceIssued(recipientEmail, {
        invoiceNumber: issued.number!,
        orderTitle: issued.order.title,
        total: money(totalCents),
        issuerName: issued.company.name,
        recipientName: issued.recipientCompany?.name ?? issued.recipientTenant?.name ?? '—',
      });
    }
  }

  /** PDF download of an emitted or voided invoice (§11.1, §11.6). */
  async getPdf(access: CompanyAccess, invoiceId: string) {
    const { invoice, role } = await this.loadInvoice(invoiceId, access);
    this.assertRecipientCanRead(invoice, role);
    return this.invoicePdfOf(invoice);
  }

  /**
   * Voids an emitted invoice with a mandatory reason, keeping the record and
   * its payments intact (§11.5, §20.4). Only an `owner` of the issuer (P4).
   */
  async voidInvoice(access: CompanyAccess, auth: AuthContext, invoiceId: string, dto: VoidInvoiceDto) {
    const voided = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: this.invoiceInclude(),
      });
      if (invoice.companyId !== access.companyId) {
        throw new ForbiddenException('Solo el emisor anula la factura (§11.5).');
      }
      const derived = this.derivedStatusOf(invoice);
      if (!isVoidableStatus(derived)) {
        throw new ConflictException(
          'Solo las facturas emitidas con saldo pendiente se anulan (§20.4).',
        );
      }
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidReason: dto.reason,
          voidedById: auth.userId,
        },
        include: this.invoiceInclude(),
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA5.INVOICE_VOIDED,
          entityType: AUDIT_ENTITIES_ETAPA5.INVOICE,
          entityId: invoice.id,
          payload: { reason: dto.reason, number: invoice.number } as Prisma.InputJsonValue,
        },
        tx,
      );
      return updated;
    });

    const counterpart = await this.invoiceContactEmail(voided, 'recipient');
    if (counterpart) {
      await this.email.sendInvoiceVoided(counterpart, {
        invoiceNumber: voided.number!,
        orderTitle: voided.order.title,
        reason: dto.reason,
      });
    }
  }

  // =========================================================================
  // §4.2 Payments
  // =========================================================================

  /**
   * Registers a payment or a refund (§11.1, P5). A possible duplication
   * (D6, §11.1) keeps both records: the new one is flagged and excluded from
   * the balance until a party reconciles it.
   */
  async registerPayment(access: CompanyAccess, auth: AuthContext, invoiceId: string, dto: CreatePaymentDto) {
    const kind = dto.kind ?? 'charge';
    const amountCents = toCents(dto.amount);
    const paidAt = dto.paidAt.slice(0, 10);
    if (paidAt > todayIso()) {
      throw new UnprocessableEntityException('La fecha del pago no puede ser futura (D7).');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: this.invoiceInclude(),
      });
      if (invoice.companyId !== access.companyId && invoice.recipientCompanyId !== access.companyId) {
        throw new NotFoundException('Factura no encontrada.');
      }
      if (invoice.status === 'draft' && invoice.companyId !== access.companyId) {
        // The recipient must not learn that a draft exists (§11.3).
        throw new NotFoundException('Factura no encontrada.');
      }
      const derived = this.derivedStatusOf(invoice);
      if (derived === 'draft' || derived === 'voided') {
        throw new ConflictException(
          derived === 'draft'
            ? 'La factura aún es un borrador (§20.4).'
            : 'La factura está anulada y no admite pagos (§11.5).',
        );
      }
      const totalCents = centsOf(invoice.total!);
      const paidNet = paidNetCents(this.paymentFacts(invoice));

      // D6 / §11.1: detect a possible duplication before the balance check —
      // both parties registering the same operation must both be kept.
      const incoming: DuplicateComparison = { kind, amountCents, paidAt, reference: dto.reference ?? null };
      const duplicateOf = invoice.payments.find(
        (payment) =>
          payment.status === 'recorded' &&
          isPossibleDuplicate(
            {
              kind: payment.kind,
              amountCents: centsOf(payment.amount),
              paidAt: isoDate(payment.paidAt)!,
              reference: payment.reference,
            },
            incoming,
          ),
      );

      if (duplicateOf) {
        const suspect = await tx.payment.create({
          data: {
            companyId: access.companyId,
            invoiceId: invoice.id,
            kind,
            status: 'duplicate_suspect',
            duplicateOfId: duplicateOf.id,
            amount: (amountCents / 100).toFixed(2),
            paidAt: new Date(`${paidAt}T00:00:00.000Z`),
            method: dto.method ?? null,
            reference: dto.reference?.trim() || null,
            notes: dto.notes?.trim() || null,
            createdById: auth.userId,
          },
        });
        await this.audit.record(
          {
            companyId: access.companyId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS_ETAPA5.PAYMENT_REGISTERED,
            entityType: AUDIT_ENTITIES_ETAPA5.PAYMENT,
            entityId: suspect.id,
            payload: {
              kind,
              amount: money(amountCents),
              paidAt,
              invoiceId: invoice.id,
              duplicateSuspect: true,
              matchedPaymentId: duplicateOf.id,
            } as Prisma.InputJsonValue,
          },
          tx,
        );
        return { payment: suspect, duplicateSuspect: true, invoice };
      }

      const amountError = paymentAmountError({
        kind,
        amountCents,
        balanceCents: totalCents - paidNet,
        paidNetCents: paidNet,
      });
      if (amountError) throw new UnprocessableEntityException(amountError);

      const payment = await tx.payment.create({
        data: {
          companyId: access.companyId,
          invoiceId: invoice.id,
          kind,
          status: 'recorded',
          amount: (amountCents / 100).toFixed(2),
          paidAt: new Date(`${paidAt}T00:00:00.000Z`),
          method: dto.method ?? null,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: auth.userId,
        },
      });
      const newPaidNet = kind === 'charge' ? paidNet + amountCents : paidNet - amountCents;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: statusAfterPayment(totalCents, newPaidNet) },
      });
      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action:
            kind === 'refund'
              ? AUDIT_ACTIONS_ETAPA5.PAYMENT_REFUNDED
              : AUDIT_ACTIONS_ETAPA5.PAYMENT_REGISTERED,
          entityType: AUDIT_ENTITIES_ETAPA5.PAYMENT,
          entityId: payment.id,
          payload: {
            kind,
            amount: money(amountCents),
            paidAt,
            invoiceId: invoice.id,
            duplicateSuspect: false,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
      return { payment, duplicateSuspect: false, invoice };
    });

    if (!result.duplicateSuspect) {
      const counterpartSide: 'issuer' | 'recipient' =
        result.invoice.companyId === access.companyId ? 'recipient' : 'issuer';
      const counterpart = await this.invoiceContactEmail(result.invoice, counterpartSide);
      if (counterpart) {
        await this.email.sendPaymentRecorded(counterpart, {
          invoiceNumber: result.invoice.number!,
          orderTitle: result.invoice.order.title,
          amount: money(amountCents),
          kind,
          paidAt,
        });
      }
    } else {
      const registrant = await this.prisma.user.findUnique({
        where: { id: auth.userId },
        select: { email: true },
      });
      if (registrant) {
        await this.email.sendPaymentDuplicateSuspect(registrant.email, {
          invoiceNumber: result.invoice.number!,
          amount: money(amountCents),
          paidAt,
        });
      }
    }

    return {
      id: result.payment.id,
      kind: result.payment.kind,
      status: result.payment.status,
      duplicateOfId: result.payment.duplicateOfId,
      amount: money(amountCents),
      paidAt,
      reference: result.payment.reference,
    };
  }

  /**
   * Resolves a suspected duplicate (§11.1, D6): `same` keeps it out of the
   * balance, `distinct` makes it count. Both records are always kept and the
   * constancy lives in the row plus the audit log.
   */
  async reconcilePayment(
    access: CompanyAccess,
    auth: AuthContext,
    paymentId: string,
    dto: ReconcilePaymentDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { invoice: { include: this.invoiceInclude() } },
      });
      const invoice = payment.invoice;
      if (invoice.companyId !== access.companyId && invoice.recipientCompanyId !== access.companyId) {
        throw new NotFoundException('Pago no encontrado.');
      }
      if (payment.status !== 'duplicate_suspect') {
        throw new ConflictException('Este pago no es un posible duplicado pendiente (§11.1).');
      }

      const same = dto.resolution === 'same';
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: same ? 'duplicate_confirmed' : 'recorded',
          duplicateOfId: same ? payment.duplicateOfId : null,
          reconciledByUserId: auth.userId,
          reconciledAt: new Date(),
        },
      });

      if (!same) {
        // The payment now counts: recompute the stored base status (D4/P6).
        const totalCents = centsOf(invoice.total!);
        const paidNet = paidNetCents([
          ...this.paymentFacts(invoice).filter((fact) => fact.id !== payment.id),
          {
            kind: updated.kind,
            status: updated.status,
            amountCents: centsOf(updated.amount),
          },
        ]);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: statusAfterPayment(totalCents, paidNet) },
        });
      }

      await this.audit.record(
        {
          companyId: access.companyId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS_ETAPA5.PAYMENT_RECONCILED,
          entityType: AUDIT_ENTITIES_ETAPA5.PAYMENT,
          entityId: payment.id,
          payload: {
            resolution: dto.resolution,
            invoiceId: invoice.id,
            counterpartPaymentId: payment.duplicateOfId,
            reconciledAt: updated.reconciledAt?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
    });
  }

  // =========================================================================
  // §4.3 Accounting exports (§3.5, §16.10)
  // =========================================================================

  /** Own accounting records as PDF or Excel; audited (§16.10, D11). */
  async exportAccounting(access: CompanyAccess, query: AccountingExportQueryDto) {
    const { data, filename } = await this.buildExport(access, query);
    await this.audit.record({
      companyId: access.companyId,
      action: AUDIT_ACTIONS_ETAPA5.ACCOUNTING_EXPORTED,
      entityType: AUDIT_ENTITIES_ETAPA5.ACCOUNTING_EXPORT,
      entityId: access.companyId,
      payload: {
        format: query.format,
        from: query.from ?? null,
        to: query.to ?? null,
        orderId: query.order_id ?? null,
        counterpartyCompanyId: query.counterparty_company_id ?? null,
        invoices: data.invoices.length,
        payments: data.payments.length,
        costs: data.costs.length,
      } as Prisma.InputJsonValue,
    });

    if (query.format === 'excel') {
      return {
        buffer: await this.excel.accountingWorkbook(data),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename,
      };
    }
    return {
      buffer: await this.pdf.accountingPdf(data),
      contentType: 'application/pdf',
      filename,
    };
  }

  // =========================================================================
  // §4.4 Limited-access accounts (P3, D13): read-only invoices of the client
  // =========================================================================

  /** Invoices addressed to this client's tenant; drafts stay internal (§11.3). */
  async listLimitedInvoices(tenantId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { recipientTenantId: tenantId, status: { not: 'draft' } },
      include: this.invoiceInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map((invoice) => this.serializeInvoice(invoice, { includeLines: false }));
  }

  async getLimitedInvoice(tenantId: string, invoiceId: string) {
    const invoice = await this.loadLimitedInvoice(tenantId, invoiceId);
    return this.serializeInvoice(invoice, { includeLines: true });
  }

  async getLimitedPdf(tenantId: string, invoiceId: string) {
    const invoice = await this.loadLimitedInvoice(tenantId, invoiceId);
    return this.invoicePdfOf(invoice);
  }

  // =========================================================================
  // §8.2 / D9: cost corrections never touch invoices — they only notify
  // =========================================================================

  /**
   * Notifies the parties of the emitted invoices of an order when a cost
   * correction is submitted (spec etapa-5 D9, proyect.md §8.2). Returns the
   * number of notifications sent.
   */
  async notifyCostCorrection(orderId: string, correctorCompanyId: string): Promise<number> {
    const invoices = await this.prisma.invoice.findMany({
      where: { orderId, status: { notIn: ['draft', 'voided'] } },
      include: this.invoiceInclude(),
    });
    let sent = 0;
    for (const invoice of invoices) {
      const targets = new Set<string>();
      if (invoice.companyId !== correctorCompanyId) {
        const email = await this.invoiceContactEmail(invoice, 'issuer');
        if (email) targets.add(email);
      }
      if (invoice.recipientCompanyId !== null && invoice.recipientCompanyId !== correctorCompanyId) {
        const email = await this.invoiceContactEmail(invoice, 'recipient');
        if (email) targets.add(email);
      }
      for (const target of targets) {
        await this.email.sendCostCorrectionNotice(target, {
          orderTitle: invoice.order.title,
          invoiceNumber: invoice.number!,
        });
        sent += 1;
      }
    }
    return sent;
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private invoiceInclude(): InvoiceInclude {
    return {
      lines: { include: { job: true } },
      payments: true,
      order: true,
      company: true,
      recipientCompany: true,
      recipientTenant: true,
    };
  }

  private paymentFacts(invoice: InvoiceFull) {
    return invoice.payments.map((payment) => ({
      id: payment.id,
      kind: payment.kind,
      status: payment.status,
      amountCents: centsOf(payment.amount),
    }));
  }

  /** API shape of an invoice: derived status, net paid, balance (§20.4). */
  private serializeInvoice(invoice: InvoiceFull, opts: { includeLines: boolean }) {
    const totalCents = invoice.total ? centsOf(invoice.total) : null;
    const netPaid = paidNetCents(
      invoice.payments.map((payment) => ({
        kind: payment.kind,
        status: payment.status,
        amountCents: centsOf(payment.amount),
      })),
    );
    const derived = deriveInvoiceStatus({
      base: invoice.status,
      totalCents,
      paidNetCents: netPaid,
      dueDate: isoDate(invoice.dueDate),
      today: todayIso(),
    });
    return {
      id: invoice.id,
      orderId: invoice.orderId,
      orderTitle: invoice.order.title,
      status: derived,
      number: invoice.number,
      issueDate: isoDate(invoice.issueDate),
      dueDate: isoDate(invoice.dueDate),
      subtotal: invoice.subtotal ? money(centsOf(invoice.subtotal)) : null,
      total: totalCents === null ? null : money(totalCents),
      notes: invoice.notes,
      paidNet: money(netPaid),
      balance: totalCents === null ? null : money(totalCents - netPaid),
      issuer: { companyId: invoice.companyId, name: invoice.company.name },
      recipient: invoice.recipientCompanyId
        ? {
            kind: 'company' as const,
            companyId: invoice.recipientCompanyId,
            name: invoice.recipientCompany?.name ?? null,
          }
        : {
            kind: 'tenant' as const,
            tenantId: invoice.recipientTenantId,
            name: invoice.recipientTenant?.name ?? null,
          },
      voidedAt: invoice.voidedAt?.toISOString() ?? null,
      voidReason: invoice.voidReason,
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        kind: payment.kind,
        status: payment.status,
        amount: money(centsOf(payment.amount)),
        paidAt: isoDate(payment.paidAt)!,
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        duplicateOfId: payment.duplicateOfId,
        reconciledAt: payment.reconciledAt?.toISOString() ?? null,
        registeredByCompanyId: payment.companyId,
        createdAt: payment.createdAt.toISOString(),
      })),
      ...(opts.includeLines
        ? {
            lines: invoice.lines.map((line) => ({
              id: line.id,
              jobId: line.jobId,
              jobTitle: line.job.title,
              kind: line.kind,
              description: line.description,
              amount: money(centsOf(line.amount)),
            })),
          }
        : {}),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }

  private derivedStatusOf(invoice: InvoiceFull) {
    return deriveInvoiceStatus({
      base: invoice.status,
      totalCents: invoice.total ? centsOf(invoice.total) : null,
      paidNetCents: paidNetCents(this.paymentFacts(invoice)),
      dueDate: isoDate(invoice.dueDate),
      today: todayIso(),
    });
  }

  /**
   * Issuer sees everything; a recipient only reaches emitted invoices (§11.3).
   * The recipient-side draft check lives in the read/write callers so edits
   * answer 403 (§11.5) while reads never confirm a draft's existence.
   */
  private async loadInvoice(invoiceId: string, access: CompanyAccess): Promise<{ invoice: InvoiceFull; role: InvoicePartyRole }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: this.invoiceInclude(),
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');
    if (invoice.companyId === access.companyId) return { invoice, role: 'issuer' };
    if (invoice.recipientCompanyId === access.companyId) return { invoice, role: 'recipient' };
    // Third companies never see an invoice (§11.3, §16.8).
    throw new NotFoundException('Factura no encontrada.');
  }

  /** Reads confirm a recipient-side draft never existed (§11.3). */
  private assertRecipientCanRead(invoice: InvoiceFull, role: InvoicePartyRole): void {
    if (role === 'recipient' && invoice.status === 'draft') {
      throw new NotFoundException('Factura no encontrada.');
    }
  }

  private async loadLimitedInvoice(tenantId: string, invoiceId: string): Promise<InvoiceFull> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: this.invoiceInclude(),
    });
    if (!invoice || invoice.recipientTenantId !== tenantId || invoice.status === 'draft') {
      throw new NotFoundException('Factura no encontrada.');
    }
    return invoice;
  }

  /** Jobs of the order with the emitter's billing facts (D1). */
  private async eligibilityContext(orderId: string, emitterCompanyId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: {
        clientRelationship: true,
        jobs: { include: { assignments: { include: { assigneeMembership: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Orden no encontrada.');
    const emitter = await client.company.findUniqueOrThrow({ where: { id: emitterCompanyId } });

    let involved = order.companyId === emitterCompanyId;
    const facts: JobBillingFact[] = order.jobs.map((job) => {
      const own = job.assignments.filter(
        (assignment) => assignment.assigneeMembership.companyId === emitterCompanyId,
      );
      if (own.length > 0) involved = true;
      return {
        jobId: job.id,
        accepted: own.some((assignment) =>
          canSubmitCostReport({ status: assignment.status, respondedAt: assignment.respondedAt }),
        ),
        terminal: isTerminalJobStatus(job.status),
      };
    });

    return {
      order,
      involved,
      emitterType: emitter.type,
      clientTenantId: order.clientRelationship?.tenantId ?? null,
      facts,
    };
  }

  /** Email of one side of an invoice; null when that side has no address (D10). */
  private async invoiceContactEmail(
    invoice: {
      companyId: string;
      recipientCompanyId: string | null;
      recipientTenantId: string | null;
      createdById: string;
      orderId: string;
    },
    side: 'issuer' | 'recipient',
  ): Promise<string | null> {
    if (side === 'issuer') {
      const user = await this.prisma.user.findUnique({
        where: { id: invoice.createdById },
        select: { email: true },
      });
      return user?.email ?? null;
    }
    if (invoice.recipientCompanyId) {
      const order = await this.prisma.order.findUnique({
        where: { id: invoice.orderId },
        select: { originatorId: true },
      });
      if (order?.originatorId) {
        const originator = await this.prisma.user.findUnique({
          where: { id: order.originatorId },
          select: { email: true },
        });
        if (originator) return originator.email;
      }
      const owner = await this.prisma.membership.findFirst({
        where: { companyId: invoice.recipientCompanyId, role: 'owner', status: 'active' },
        include: { user: { select: { email: true } } },
      });
      return owner?.user.email ?? null;
    }
    if (invoice.recipientTenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: invoice.recipientTenantId },
        select: { email: true },
      });
      return tenant?.email ?? null;
    }
    return null;
  }

  /** Gathers the company's own visible records and renders them (D11). */
  private async buildExport(
    access: CompanyAccess,
    query: AccountingExportQueryDto,
  ): Promise<{ data: AccountingExportData; filename: string }> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
      select: { name: true },
    });
    const from = query.from ? new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`) : null;
    const to = query.to ? new Date(`${query.to.slice(0, 10)}T00:00:00.000Z`) : null;

    const invoiceFilters: Prisma.InvoiceWhereInput[] = [
      { OR: [{ companyId: access.companyId }, { recipientCompanyId: access.companyId, status: { not: 'draft' } }] },
    ];
    if (query.order_id) invoiceFilters.push({ orderId: query.order_id });
    if (query.counterparty_company_id) {
      invoiceFilters.push({
        OR: [
          { companyId: query.counterparty_company_id },
          { recipientCompanyId: query.counterparty_company_id },
          { recipientTenantId: query.counterparty_company_id },
        ],
      });
    }
    if (from || to) {
      invoiceFilters.push({
        OR: [
          { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
          { issueDate: null, createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
        ],
      });
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { AND: invoiceFilters },
      include: this.invoiceInclude(),
      orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        invoiceId: { in: invoices.map((invoice) => invoice.id) },
        ...(from || to
          ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { invoice: { include: { company: true } }, company: true },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    });

    const costReports = await this.prisma.costReport.findMany({
      where: {
        companyId: access.companyId,
        ...(query.counterparty_company_id
          ? { assignment: { job: { order: { companyId: query.counterparty_company_id } } } }
          : {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { assignment: { include: { job: { include: { order: true } } } } },
      orderBy: [{ createdAt: 'asc' }],
    });

    const data: AccountingExportData = {
      companyName: company.name,
      from: query.from?.slice(0, 10) ?? null,
      to: query.to?.slice(0, 10) ?? null,
      invoices: invoices.map((invoice) => {
        const totalCents = invoice.total ? centsOf(invoice.total) : null;
        const netPaid = paidNetCents(this.paymentFacts(invoice));
        return {
          number: invoice.number,
          status: this.derivedStatusOf(invoice),
          issueDate: isoDate(invoice.issueDate),
          dueDate: isoDate(invoice.dueDate),
          counterparty:
            invoice.companyId === access.companyId
              ? (invoice.recipientCompany?.name ?? invoice.recipientTenant?.name ?? '—')
              : invoice.company.name,
          orderTitle: invoice.order.title,
          total: totalCents === null ? null : money(totalCents),
          paidNet: money(netPaid),
          balance: totalCents === null ? null : money(totalCents - netPaid),
        };
      }),
      payments: payments.map((payment) => ({
        paidAt: isoDate(payment.paidAt)!,
        kind: payment.kind,
        status: payment.status,
        amount: money(centsOf(payment.amount)),
        reference: payment.reference,
        invoiceNumber: payment.invoice.number,
        registrantName: payment.company.name,
      })),
      costs: costReports.map((report) => ({
        orderTitle: report.assignment.job.order.title,
        version: report.version,
        status: report.status,
        total: report.total ? money(centsOf(report.total)) : null,
        submittedAt: report.submittedAt?.toISOString() ?? null,
      })),
    };

    return {
      data,
      filename: `registros-contables-${access.companyId}.${query.format === 'excel' ? 'xlsx' : 'pdf'}`,
    };
  }

  private async invoicePdfOf(invoice: InvoiceFull) {
    const derived = this.derivedStatusOf(invoice);
    if (derived === 'draft') {
      throw new ConflictException('La factura aún es un borrador: emítela para descargar el PDF (§11.1).');
    }
    const totalCents = invoice.total ? centsOf(invoice.total) : null;
    const netPaid = paidNetCents(this.paymentFacts(invoice));
    const data: InvoicePdfData = {
      number: invoice.number!,
      status: derived,
      issueDate: isoDate(invoice.issueDate) ?? '—',
      dueDate: isoDate(invoice.dueDate) ?? '—',
      orderTitle: invoice.order.title,
      orderId: invoice.order.id,
      issuerName: invoice.company.name,
      recipientName: invoice.recipientCompany?.name ?? invoice.recipientTenant?.name ?? '—',
      lines: invoice.lines.map((line) => ({
        kind: line.kind,
        description: line.description,
        jobTitle: line.job.title,
        amount: money(centsOf(line.amount)),
      })),
      subtotal: totalCents === null ? '0.00' : money(totalCents),
      total: totalCents === null ? '0.00' : money(totalCents),
      payments: invoice.payments.map((payment) => ({
        paidAt: isoDate(payment.paidAt)!,
        kind: payment.kind,
        status: payment.status,
        amount: money(centsOf(payment.amount)),
        reference: payment.reference,
      })),
      paidNet: money(netPaid),
      balance: totalCents === null ? '0.00' : money(totalCents - netPaid),
      notes: invoice.notes,
      voidReason: invoice.voidReason,
    };
    return {
      buffer: await this.pdf.invoicePdf(data),
      contentType: 'application/pdf',
      filename: `factura-${invoice.number}.pdf`,
    };
  }

  /** Derived-status filter for the list endpoint (§11.2). */
  private statusFilter(status: string): Prisma.InvoiceWhereInput {
    const today = new Date(`${todayIso()}T00:00:00.000Z`);
    switch (status) {
      case 'overdue':
        return { status: { in: ['issued', 'partially_paid'] }, dueDate: { lt: today } };
      case 'issued':
      case 'partially_paid':
        return {
          status,
          OR: [{ dueDate: null }, { dueDate: { gte: today } }],
        };
      default:
        // The DTO restricts `status` to the known values (§4.1).
        return { status: status as InvoiceStatusValue };
    }
  }
}
