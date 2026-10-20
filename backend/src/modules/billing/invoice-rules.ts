import type { CompanyType, InvoiceStatus, OrderStatus, PaymentKind, PaymentStatus } from '../../generated/prisma/enums';
import { toCents } from '../economic-settings/spending-rules';

/** Line kinds of §11.1: materials, labor, tool rental, travel, other. */
export const INVOICE_LINE_KINDS = ['material', 'labor', 'tool_rental', 'travel', 'other'] as const;
export const INVOICE_LINE_DESCRIPTION_MAX = 500;
export const INVOICE_LINES_MAX = 200;
export const NOTES_MAX = 2000;
export const VOID_REASON_MAX = 500;
export const PAYMENT_REFERENCE_MAX = 200;

export const PAYMENT_KINDS = ['charge', 'refund'] as const;
export const PAYMENT_METHODS = ['cash', 'check', 'transfer', 'card', 'other'] as const;
export const RECONCILE_RESOLUTIONS = ['same', 'distinct'] as const;
export const EXPORT_FORMATS = ['pdf', 'excel'] as const;

/** Days between issue date and due date when the draft doesn't set one (D3). */
export const DUE_DAYS_DEFAULT = 30;

export type DerivedInvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'voided';

/** Billing facts of one job of the order, from the emitter's point of view. */
export interface JobBillingFact {
  jobId: string;
  /** An assignment of the emitter reached `accepted` (Etapa 4 decision 8). */
  accepted: boolean;
  /** Job status is terminal (§20.2). */
  terminal: boolean;
}

export type InvoiceRecipient =
  | { kind: 'company'; companyId: string }
  | { kind: 'tenant'; tenantId: string };

export interface InvoiceEligibilityInput {
  orderStatus: OrderStatus;
  orderCompanyId: string;
  /** Tenant of the order's client relationship; null when there is none. */
  clientTenantId: string | null;
  emitterCompanyId: string;
  emitterType: CompanyType;
  facts: JobBillingFact[];
}

export interface InvoiceEligibility {
  ok: boolean;
  reason?: string;
  recipient?: InvoiceRecipient;
  billableJobIds: string[];
}

/**
 * Eligibility to invoice an order (spec etapa-5 D1a/D1b, proyect.md §11.1,
 * §11.4): the emitter must be a party of the order. With an accepted
 * assignment a `contractor` may bill the originating company («una orden
 * aceptada»); a professional (`own_business`) also needs terminal jobs; an
 * originator billing its own client needs at least one terminal job and the
 * invoice goes to the client's tenant.
 */
export function evaluateInvoiceEligibility(input: InvoiceEligibilityInput): InvoiceEligibility {
  if (input.orderStatus === 'cancelled') {
    return {
      ok: false,
      reason: 'La orden fue cancelada y no admite nuevas facturas (§20.1).',
      billableJobIds: [],
    };
  }

  // D1b — originator billing its own client: recipient is the client's tenant.
  if (input.clientTenantId !== null) {
    if (input.emitterCompanyId !== input.orderCompanyId) {
      return {
        ok: false,
        reason: 'Solo la empresa originadora factura a su cliente propio (§11.1).',
        billableJobIds: [],
      };
    }
    const billableJobIds = input.facts.filter((fact) => fact.terminal).map((fact) => fact.jobId);
    if (billableJobIds.length === 0) {
      return {
        ok: false,
        reason: 'El trabajo propio aún no está terminado (§11.4).',
        billableJobIds: [],
      };
    }
    return {
      ok: true,
      recipient: { kind: 'tenant', tenantId: input.clientTenantId },
      billableJobIds,
    };
  }

  // D1a — assignment-based billing to the originating company.
  if (input.emitterType === 'property_management') {
    return {
      ok: false,
      reason: 'Una administradora no emite facturas en la v1 (§11.1).',
      billableJobIds: [],
    };
  }
  const accepted = input.facts.filter((fact) => fact.accepted);
  if (accepted.length === 0) {
    return {
      ok: false,
      reason: 'La orden no está aceptada por la empresa emisora (§11.1).',
      billableJobIds: [],
    };
  }
    // A professional (`own_business` or the legacy `profesional` type) bills
    // only finished work (§11.4); a contractor bills on acceptance (§11.1).
    const requiresTerminalJob =
      input.emitterType === 'own_business' || input.emitterType === 'profesional';
  const billableJobIds = accepted
    .filter((fact) => !requiresTerminalJob || fact.terminal)
    .map((fact) => fact.jobId);
  if (billableJobIds.length === 0) {
    return {
      ok: false,
      reason: 'El trabajo del profesional aún no está terminado (§11.4).',
      billableJobIds: [],
    };
  }
  return {
    ok: true,
    recipient: { kind: 'company', companyId: input.orderCompanyId },
    billableJobIds,
  };
}

/** Sum of line amounts in cents; money never touches floats (§12). */
export function lineTotalCents(lines: Array<{ amount: string }>): number {
  return lines.reduce((sum, line) => sum + toCents(line.amount), 0);
}

export interface PaidNetInput {
  kind: PaymentKind;
  status: PaymentStatus;
  amountCents: number;
}

/** Σ charges − Σ refunds among `recorded` payments (spec etapa-5 D7). */
export function paidNetCents(payments: PaidNetInput[]): number {
  return payments.reduce((sum, payment) => {
    if (payment.status !== 'recorded') return sum;
    return payment.kind === 'charge'
      ? sum + payment.amountCents
      : sum - payment.amountCents;
  }, 0);
}

export interface DerivedStatusInput {
  base: InvoiceStatus;
  totalCents: number | null;
  paidNetCents: number;
  /** ISO date (YYYY-MM-DD) or null while draft. */
  dueDate: string | null;
  /** ISO date of «today» used for the overdue comparison. */
  today: string;
}

/**
 * Status shown by the API (spec etapa-5 D4/P6): the stored base status plus
 * the derived `overdue`. §11.2 wins over the literal §20.4 transition: a
 * partial payment after the due date stays `overdue` until the balance is
 * settled (decisión P6).
 */
export function deriveInvoiceStatus(input: DerivedStatusInput): DerivedInvoiceStatus {
  if (input.base === 'draft' || input.base === 'voided') return input.base;
  if (input.totalCents === null) return input.base;
  const balance = input.totalCents - input.paidNetCents;
  if (balance <= 0) return 'paid';
  if (input.dueDate !== null && input.dueDate < input.today) return 'overdue';
  return input.paidNetCents > 0 ? 'partially_paid' : 'issued';
}

/** Stored base status to persist after registering a payment (D4). */
export function statusAfterPayment(
  totalCents: number,
  paidNetCents: number,
): 'paid' | 'partially_paid' | 'issued' {
  const balance = totalCents - paidNetCents;
  if (balance <= 0) return 'paid';
  return paidNetCents > 0 ? 'partially_paid' : 'issued';
}

/** Voiding is allowed on emitted invoices with a balance (§20.4). */
export function isVoidableStatus(derived: DerivedInvoiceStatus): boolean {
  return derived === 'issued' || derived === 'partially_paid' || derived === 'overdue';
}

/** Why a payment cannot be registered, or null when it can (§20.4, §11.5). */
export function paymentRegistrationError(derived: DerivedInvoiceStatus): string | null {
  if (derived === 'draft') return 'La factura aún es un borrador (§20.4).';
  if (derived === 'voided') return 'La factura está anulada y no admite pagos (§11.5).';
  if (derived === 'paid') return 'La factura ya está pagada: no admite más pagos (§11.2).';
  return null;
}

export interface PaymentAmountInput {
  kind: PaymentKind;
  amountCents: number;
  balanceCents: number;
  paidNetCents: number;
}

/** Limits of §11.2/D7: charges cannot exceed the balance, refunds what was paid. */
export function paymentAmountError(input: PaymentAmountInput): string | null {
  if (input.amountCents <= 0) return 'El importe del pago debe ser mayor que cero.';
  if (input.kind === 'charge' && input.amountCents > input.balanceCents) {
    return 'El importe del pago supera el saldo pendiente (§11.2).';
  }
  if (input.kind === 'refund' && input.amountCents > input.paidNetCents) {
    return 'La devolución supera lo pagado (§12).';
  }
  return null;
}

export function normalizeReference(reference: string | null | undefined): string {
  return (reference ?? '').trim().toLowerCase();
}

export interface DuplicateComparison {
  kind: PaymentKind;
  amountCents: number;
  /** ISO date of the operation. */
  paidAt: string;
  reference: string | null;
}

/**
 * Possible-duplication test of §11.1 (decisión P6 — D6): same operation as
 * compared by kind, amount, date and reference (two null references count as
 * equal). Detection only happens at registration time.
 */
export function isPossibleDuplicate(a: DuplicateComparison, b: DuplicateComparison): boolean {
  return (
    a.kind === b.kind &&
    a.amountCents === b.amountCents &&
    a.paidAt === b.paidAt &&
    normalizeReference(a.reference) === normalizeReference(b.reference)
  );
}

/** Emission + 30 days when the draft has no due date (D3). */
export function defaultDueDate(issueDateIso: string): string {
  const date = new Date(`${issueDateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + DUE_DAYS_DEFAULT);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Etapa 7 — sales tax (spec etapa-7.md §1, proyect.md §11.6, §18.2)
// ---------------------------------------------------------------------------

/** Thousandths of one percent: 8.375% → 8375 (integer math, no floats). */
export const TAX_RATE_SCALE = 100_000;

/**
 * Taxable base of the invoice in cents (etapa-7.md D1): only lines the
 * issuer marked as taxable add up; money never touches floats (§12).
 */
export function taxableBaseCents(lines: Array<{ amount: string; taxable: boolean }>): number {
  return lines.reduce((sum, line) => (line.taxable ? sum + toCents(line.amount) : sum), 0);
}

/**
 * Sales tax in cents: commercial half-up rounding of `base × rate` (D1).
 * Rates are integer thousandths of percent — `8375` means 8.375% — so
 * `tax_cents = round(base_cents × rate_milli / 100_000)`; `Math.round` is
 * half-up for non-negative amounts. Values stay well inside 2^53.
 */
export function taxCentsFor(taxableBaseCentsValue: number, rateMilli: number): number {
  return Math.round((taxableBaseCentsValue * rateMilli) / TAX_RATE_SCALE);
}

export interface EmissionTaxInput {
  /** `companies.tax_exempt` of the issuer (etapa-7.md D2). */
  exempt: boolean;
  /** Draft override (`invoices.tax_rate`) in percent, or null. */
  overrideRate: string | null;
  /** `companies.default_tax_rate` of the issuer, or null. */
  defaultRate: string | null;
  taxableBaseCents: number;
}

export type EmissionTax = { rate: string | null; taxCents: number };

/**
 * Resolves the tax frozen at emission (etapa-7.md D2):
 * - exempt issuers always freeze 0.00, whatever the rates or lines say;
 * - no taxable lines (or a zero base) freeze 0.00 with the applied rate
 *   (override ?? default, possibly null);
 * - taxable lines without any available rate are an error: tax is never
 *   silently charged nor silently skipped (§11.6). The message names the
 *   three valid exits.
 */
export function resolveEmissionTax(input: EmissionTaxInput): EmissionTax | { error: string } {
  const rate = input.overrideRate ?? input.defaultRate;
  if (input.exempt) return { rate, taxCents: 0 };
  if (input.taxableBaseCents <= 0) return { rate, taxCents: 0 };
  if (rate === null) {
    return {
      error:
        'Hay renglones imponibles pero la empresa no tiene tasa: fija una tasa en la factura, ' +
        'configura la tasa por defecto del perfil fiscal o marca la empresa como exenta (§11.6).',
    };
  }
  return { rate, taxCents: taxCentsFor(input.taxableBaseCents, taxRateMilli(rate)) };
}

/** Parses a percent rate string into integer thousandths ("8.375" → 8375). */
export function taxRateMilli(rate: string): number {
  return Math.round(Number(rate) * 1000);
}

/** Today in UTC as YYYY-MM-DD (dates of domain are calendar dates). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
