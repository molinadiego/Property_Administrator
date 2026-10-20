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
  resolveEmissionTax,
  statusAfterPayment,
  taxCentsFor,
  taxableBaseCents,
  taxRateMilli,
  todayIso,
} from './invoice-rules';

const baseOrder = {
  orderStatus: 'in_progress' as const,
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

/**
 * Etapa 7 — sales tax (spec etapa-7.md §8, proyect.md §11.6, §18.2): every
 * calculation moves integer cents and integer thousandths of a percent;
 * money never touches floats (§12).
 */
describe('invoice-rules — etapa 7 tax (etapa-7.md D1/D2)', () => {
  describe('taxableBaseCents', () => {
    it('adds only the lines the issuer marked as taxable', () => {
      expect(
        taxableBaseCents([
          { amount: '100.00', taxable: true },
          { amount: '200.00', taxable: false },
          { amount: '0.10', taxable: true },
        ]),
      ).toBe(10010);
    });

    it('returns 0 without taxable lines', () => {
      expect(taxableBaseCents([{ amount: '999.99', taxable: false }])).toBe(0);
    });
  });

  describe('taxCentsFor — commercial half-up rounding (D1)', () => {
    it('matches the documented Nevada examples', () => {
      expect(taxCentsFor(10010, taxRateMilli('8.375'))).toBe(838); // 100.10 → 8.38
      expect(taxCentsFor(5, taxRateMilli('8.375'))).toBe(0); // 0.05 → 0.00
      expect(taxCentsFor(10000, taxRateMilli('8.265'))).toBe(827); // half of 8.265 rounds up
    });

    it('rounds .5 upward at the exact boundary', () => {
      // 10.00 at 6.25% = 0.625 → 0.63; 2.00 at 12.5% = 0.25 exactly.
      expect(taxCentsFor(1000, taxRateMilli('6.25'))).toBe(63);
      expect(taxCentsFor(200, taxRateMilli('12.5'))).toBe(25);
    });

    it('stays exact on amounts far beyond safe-float territory (§12)', () => {
      // 99,999,999.99 at 8.375% = 8,374,999.9994125 → 8,375,000.00
      expect(taxCentsFor(9999999999, taxRateMilli('8.375'))).toBe(837500000);
    });
  });

  describe('taxRateMilli', () => {
    it('parses percent strings into integer thousandths', () => {
      expect(taxRateMilli('8.375')).toBe(8375);
      expect(taxRateMilli('6.85')).toBe(6850);
      expect(taxRateMilli('0')).toBe(0);
      expect(taxRateMilli('100')).toBe(100000);
    });
  });

  describe('resolveEmissionTax (D2)', () => {
    const lines = [{ amount: '100.00', taxable: true }];

    it('uses the draft override over the company default (destination-based)', () => {
      const tax = resolveEmissionTax({
        exempt: false,
        overrideRate: '8.265',
        defaultRate: '8.375',
        taxableBaseCents: taxableBaseCents(lines),
      });
      expect(tax).toEqual({ rate: '8.265', taxCents: 827 });
    });

    it('falls back to the company default when the draft has no override', () => {
      const tax = resolveEmissionTax({
        exempt: false,
        overrideRate: null,
        defaultRate: '8.375',
        taxableBaseCents: taxableBaseCents(lines),
      });
      expect(tax).toEqual({ rate: '8.375', taxCents: 838 });
    });

    it('freezes 0.00 for exempt issuers whatever the rates say (§11.6)', () => {
      const tax = resolveEmissionTax({
        exempt: true,
        overrideRate: '8.375',
        defaultRate: '8.375',
        taxableBaseCents: taxableBaseCents(lines),
      });
      expect(tax).toEqual({ rate: '8.375', taxCents: 0 });
    });

    it('freezes 0.00 with the applied rate when nothing is taxable', () => {
      const tax = resolveEmissionTax({
        exempt: false,
        overrideRate: null,
        defaultRate: '8.375',
        taxableBaseCents: 0,
      });
      expect(tax).toEqual({ rate: '8.375', taxCents: 0 });
    });

    it('freezes 0.00 with a null rate when no rate exists at all', () => {
      const tax = resolveEmissionTax({
        exempt: false,
        overrideRate: null,
        defaultRate: null,
        taxableBaseCents: 0,
      });
      expect(tax).toEqual({ rate: null, taxCents: 0 });
    });

    it('refuses to emit taxable lines without any available rate (D2)', () => {
      const tax = resolveEmissionTax({
        exempt: false,
        overrideRate: null,
        defaultRate: null,
        taxableBaseCents: taxableBaseCents(lines),
      });
      expect('error' in tax).toBe(true);
      if ('error' in tax) {
        expect(tax.error).toContain('tasa');
        expect(tax.error).toContain('exenta');
      }
    });
  });
});
