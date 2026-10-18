import {
  defaultDueDate,
  deriveInvoiceStatus,
  evaluateInvoiceEligibility,
  isPossibleDuplicate,
  isVoidableStatus,
  lineTotalCents,
  normalizeReference,
  paidNetCents,
  paymentAmountError,
  paymentRegistrationError,
  statusAfterPayment,
  todayIso,
} from './invoice-rules';

const baseOrder = {
  orderStatus: 'assigned' as const,
  orderCompanyId: 'order-company',
  clientTenantId: null,
  emitterCompanyId: 'emitter',
  emitterType: 'contractor' as const,
};

describe('invoice-rules (etapa-5 §1.2 D1–D7)', () => {
  describe('evaluateInvoiceEligibility — D1a assignment path', () => {
    it('lets a contractor with an accepted assignment bill the originator', () => {
      const result = evaluateInvoiceEligibility({
        ...baseOrder,
        facts: [{ jobId: 'job-1', accepted: true, terminal: false }],
      });
      expect(result.ok).toBe(true);
      expect(result.recipient).toEqual({ kind: 'company', companyId: 'order-company' });
      expect(result.billableJobIds).toEqual(['job-1']);
    });

    it('rejects an order the emitter never accepted (§11.1)', () => {
      const result = evaluateInvoiceEligibility({
        ...baseOrder,
        facts: [{ jobId: 'job-1', accepted: false, terminal: false }],
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('aceptada');
    });

    it('requires a terminal job for own_business professionals (§11.4)', () => {
      const inProgress = evaluateInvoiceEligibility({
        ...baseOrder,
        emitterType: 'own_business',
        facts: [{ jobId: 'job-1', accepted: true, terminal: false }],
      });
      expect(inProgress.ok).toBe(false);
      expect(inProgress.reason).toContain('terminado');

      const done = evaluateInvoiceEligibility({
        ...baseOrder,
        emitterType: 'own_business',
        facts: [{ jobId: 'job-1', accepted: true, terminal: true }],
      });
      expect(done.ok).toBe(true);
      expect(done.billableJobIds).toEqual(['job-1']);
    });

    it('keeps contractors out of terminal-only billing but bills only accepted jobs', () => {
      const result = evaluateInvoiceEligibility({
        ...baseOrder,
        facts: [
          { jobId: 'job-1', accepted: true, terminal: false },
          { jobId: 'job-2', accepted: false, terminal: true },
        ],
      });
      expect(result.ok).toBe(true);
      expect(result.billableJobIds).toEqual(['job-1']);
    });

    it('never lets a property_management company emit (v1)', () => {
      const result = evaluateInvoiceEligibility({
        ...baseOrder,
        emitterType: 'property_management',
        facts: [{ jobId: 'job-1', accepted: true, terminal: true }],
      });
      expect(result.ok).toBe(false);
    });

    it('rejects cancelled orders (§20.1) before anything else', () => {
      const result = evaluateInvoiceEligibility({
        ...baseOrder,
        orderStatus: 'cancelled',
        facts: [{ jobId: 'job-1', accepted: true, terminal: true }],
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('cancelada');
    });
  });

  describe('evaluateInvoiceEligibility — D1b own client', () => {
    const clientOrder = {
      ...baseOrder,
      emitterCompanyId: 'order-company',
      clientTenantId: 'tenant-1',
      facts: [{ jobId: 'job-1', accepted: false, terminal: true }],
    };

    it('routes the invoice to the client tenant when a job is terminal', () => {
      const result = evaluateInvoiceEligibility(clientOrder);
      expect(result.ok).toBe(true);
      expect(result.recipient).toEqual({ kind: 'tenant', tenantId: 'tenant-1' });
    });

    it('rejects a non-originator trying to bill the client', () => {
      const result = evaluateInvoiceEligibility({ ...clientOrder, emitterCompanyId: 'other' });
      expect(result.ok).toBe(false);
    });

    it('rejects when no job of the order is terminal (§11.4)', () => {
      const result = evaluateInvoiceEligibility({
        ...clientOrder,
        facts: [{ jobId: 'job-1', accepted: false, terminal: false }],
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('money (§12: cents only, never floats)', () => {
    it('sums line amounts in cents', () => {
      expect(
        lineTotalCents([{ amount: '10.10' }, { amount: '0.20' }, { amount: '5' }]),
      ).toBe(1530);
    });

    it('counts only recorded payments: charges minus refunds (D7)', () => {
      const payments = [
        { kind: 'charge' as const, status: 'recorded' as const, amountCents: 10000 },
        { kind: 'charge' as const, status: 'duplicate_suspect' as const, amountCents: 10000 },
        { kind: 'charge' as const, status: 'duplicate_confirmed' as const, amountCents: 10000 },
        { kind: 'refund' as const, status: 'recorded' as const, amountCents: 2500 },
      ];
      expect(paidNetCents(payments)).toBe(7500);
    });
  });

  describe('deriveInvoiceStatus (D4/P6)', () => {
    const base = { base: 'issued' as const, today: '2026-10-18' };

    it('keeps drafts and voided invoices as stored', () => {
      expect(deriveInvoiceStatus({ ...base, base: 'draft', totalCents: null, paidNetCents: 0, dueDate: null })).toBe('draft');
      expect(deriveInvoiceStatus({ ...base, base: 'voided', totalCents: 100, paidNetCents: 0, dueDate: null })).toBe('voided');
    });

    it('derives issued → partially_paid → paid from the balance (§20.4)', () => {
      expect(deriveInvoiceStatus({ ...base, totalCents: 10000, paidNetCents: 0, dueDate: '2026-11-17' })).toBe('issued');
      expect(deriveInvoiceStatus({ ...base, totalCents: 10000, paidNetCents: 4000, dueDate: '2026-11-17' })).toBe('partially_paid');
      expect(deriveInvoiceStatus({ ...base, totalCents: 10000, paidNetCents: 10000, dueDate: '2026-11-17' })).toBe('paid');
    });

    it('marks overdue once the due date passes with a balance (§11.2)', () => {
      expect(deriveInvoiceStatus({ ...base, totalCents: 10000, paidNetCents: 0, dueDate: '2026-10-17' })).toBe('overdue');
    });

    it('P6: a partial payment after the due date keeps the invoice overdue until settled', () => {
      expect(deriveInvoiceStatus({ ...base, totalCents: 10000, paidNetCents: 4000, dueDate: '2026-10-01' })).toBe('overdue');
      expect(deriveInvoiceStatus({ ...base, totalCents: 10000, paidNetCents: 10000, dueDate: '2026-10-01' })).toBe('paid');
    });

    it('does not mark an invoice due today as overdue', () => {
      expect(deriveInvoiceStatus({ ...base, totalCents: 10000, paidNetCents: 0, dueDate: '2026-10-18' })).toBe('issued');
    });
  });

  describe('statusAfterPayment', () => {
    it('returns the stored base status after a payment', () => {
      expect(statusAfterPayment(10000, 4000)).toBe('partially_paid');
      expect(statusAfterPayment(10000, 10000)).toBe('paid');
      expect(statusAfterPayment(10000, 0)).toBe('issued');
    });
  });

  describe('voiding (§20.4)', () => {
    it('allows voiding only on emitted states with a balance', () => {
      expect(isVoidableStatus('issued')).toBe(true);
      expect(isVoidableStatus('partially_paid')).toBe(true);
      expect(isVoidableStatus('overdue')).toBe(true);
      expect(isVoidableStatus('paid')).toBe(false);
      expect(isVoidableStatus('draft')).toBe(false);
      expect(isVoidableStatus('voided')).toBe(false);
    });
  });

  describe('payment registration guards (D7, §20.4)', () => {
    it('rejects payments on drafts, voided and paid invoices', () => {
      expect(paymentRegistrationError('draft')).toContain('borrador');
      expect(paymentRegistrationError('voided')).toContain('anulada');
      expect(paymentRegistrationError('paid')).toContain('pagada');
      expect(paymentRegistrationError('issued')).toBeNull();
      expect(paymentRegistrationError('overdue')).toBeNull();
      expect(paymentRegistrationError('partially_paid')).toBeNull();
    });

    it('rejects charges above the balance and refunds above what was paid', () => {
      expect(
        paymentAmountError({ kind: 'charge', amountCents: 10001, balanceCents: 10000, paidNetCents: 0 }),
      ).toContain('supera el saldo');
      expect(
        paymentAmountError({ kind: 'refund', amountCents: 5001, balanceCents: 5000, paidNetCents: 5000 }),
      ).toContain('supera lo pagado');
      expect(
        paymentAmountError({ kind: 'charge', amountCents: 10000, balanceCents: 10000, paidNetCents: 0 }),
      ).toBeNull();
      expect(
        paymentAmountError({ kind: 'refund', amountCents: 5000, balanceCents: 5000, paidNetCents: 5000 }),
      ).toBeNull();
    });

    it('rejects zero and negative amounts', () => {
      expect(
        paymentAmountError({ kind: 'charge', amountCents: 0, balanceCents: 100, paidNetCents: 0 }),
      ).toContain('mayor que cero');
    });
  });

  describe('possible duplicates (§11.1 / D6)', () => {
    const incoming = {
      kind: 'charge' as const,
      amountCents: 5000,
      paidAt: '2026-10-15',
      reference: 'TRF-001',
    };

    it('flags the same operation registered by the other party', () => {
      expect(
        isPossibleDuplicate({ ...incoming, reference: ' trf-001 ' }, incoming),
      ).toBe(true);
    });

    it('treats two missing references as equal', () => {
      expect(
        isPossibleDuplicate({ ...incoming, reference: null }, { ...incoming, reference: undefined as unknown as null }),
      ).toBe(true);
    });

    it('ignores differences in kind, amount, date or reference', () => {
      expect(isPossibleDuplicate({ ...incoming, kind: 'refund' }, incoming)).toBe(false);
      expect(isPossibleDuplicate({ ...incoming, amountCents: 5001 }, incoming)).toBe(false);
      expect(isPossibleDuplicate({ ...incoming, paidAt: '2026-10-16' }, incoming)).toBe(false);
      expect(isPossibleDuplicate({ ...incoming, reference: 'TRF-002' }, incoming)).toBe(false);
    });

    it('normalizes references', () => {
      expect(normalizeReference('  ABC-1 \n')).toBe('abc-1');
      expect(normalizeReference(null)).toBe('');
    });
  });

  describe('dates (D3)', () => {
    it('defaults the due date to issue + 30 days', () => {
      expect(defaultDueDate('2026-10-18')).toBe('2026-11-17');
      expect(defaultDueDate('2026-01-15')).toBe('2026-02-14');
    });

    it('formats today as YYYY-MM-DD', () => {
      expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
