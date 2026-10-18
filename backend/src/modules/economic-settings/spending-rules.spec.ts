import {
  computeAuthorizedCeilingCents,
  computeEffectiveLimitCents,
  emergencyCeilingCents,
  emergencyExceeds,
  exceedsLimit,
  fromCents,
  isValidMarginPercent,
  nullableToCents,
  resolveEmergencyPolicy,
  toCents,
  validateEmergencyAmount,
} from './spending-rules';

describe('money as integer cents (§3, decisión 2)', () => {
  it('converts decimal strings to cents without floats', () => {
    expect(toCents('0')).toBe(0);
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('1234.5')).toBe(123450);
    expect(toCents('9999999999.99')).toBe(999999999999);
    expect(fromCents(123456)).toBe('1234.56');
    expect(fromCents(0)).toBe('0.00');
    expect(fromCents(null)).toBeNull();
  });

  it('rejects invalid amounts (negatives, too many decimals, non-numeric)', () => {
    expect(() => toCents('-5')).toThrow(RangeError);
    expect(() => toCents('12.345')).toThrow(RangeError);
    expect(() => toCents('abc')).toThrow(RangeError);
    expect(nullableToCents(null)).toBeNull();
    expect(nullableToCents('')).toBeNull();
    expect(nullableToCents(undefined)).toBeNull();
  });

  it('round-trips cents ↔ strings', () => {
    expect(fromCents(toCents('0'))).toBe('0.00');
    expect(fromCents(toCents('0.01'))).toBe('0.01');
    expect(fromCents(toCents('7'))).toBe('7.00');
    expect(fromCents(toCents('7.5'))).toBe('7.50');
    expect(fromCents(toCents('100.99'))).toBe('100.99');
    expect(fromCents(toCents('250'))).toBe('250.00');
  });
});

describe('effective limit and authorized ceiling (§8.4)', () => {
  it('uses the order limit first, the company default second, null last', () => {
    expect(computeEffectiveLimitCents(25000, 10000)).toBe(25000);
    expect(computeEffectiveLimitCents(null, 10000)).toBe(10000);
    expect(computeEffectiveLimitCents(null, null)).toBeNull();
  });

  it('adds exceed_spending_limit constancias on top of the limit', () => {
    const ceiling = computeAuthorizedCeilingCents(25000, [
      { type: 'exceed_spending_limit', amountCapCents: 5000 },
      { type: 'exceed_spending_limit', amountCapCents: null },
      { type: 'additional_work', amountCapCents: 9999 },
    ]);
    expect(ceiling).toBe(30000);
  });

  it('keeps «sin límite» without a ceiling', () => {
    expect(computeAuthorizedCeilingCents(null, [{ type: 'exceed_spending_limit', amountCapCents: 5000 }])).toBeNull();
  });

  it('flags overage informationally only (§8.5)', () => {
    expect(exceedsLimit(30000, 30000)).toBe(false);
    expect(exceedsLimit(30000, 30001)).toBe(true);
    expect(exceedsLimit(null, 999999)).toBe(false);
  });
});

describe('commercial margin (§8.5)', () => {
  it('accepts 0–20 with up to 2 decimals', () => {
    expect(isValidMarginPercent('0')).toBe(true);
    expect(isValidMarginPercent('20')).toBe(true);
    expect(isValidMarginPercent('20.00')).toBe(true);
    expect(isValidMarginPercent('19.99')).toBe(true);
    expect(isValidMarginPercent('12.5')).toBe(true);
  });

  it('rejects over 20 or malformed values', () => {
    expect(isValidMarginPercent('20.01')).toBe(false);
    expect(isValidMarginPercent('21')).toBe(false);
    expect(isValidMarginPercent('100')).toBe(false);
    expect(isValidMarginPercent('-5')).toBe(false);
    expect(isValidMarginPercent('20.123')).toBe(false);
  });
});

describe('effective emergency policy (§8.6, decisión 4)', () => {
  const company = { emergencyPolicy: 'prior_authorization' as const, emergencyExtraAmountCents: 10000 };

  it('prefers the relation policy when it defines one', () => {
    const policy = resolveEmergencyPolicy(
      { emergencyPolicy: 'emergency_amount', emergencyExtraAmountCents: 15000 },
      company,
    );
    expect(policy).toEqual({ policy: 'emergency_amount', extraAmountCents: 15000, source: 'relation' });
  });

  it('falls back to the company when the relation defines nothing', () => {
    expect(resolveEmergencyPolicy({ emergencyPolicy: null, emergencyExtraAmountCents: null }, company)).toEqual({
      policy: 'prior_authorization',
      extraAmountCents: 10000,
      source: 'company',
    });
    expect(resolveEmergencyPolicy(null, company).source).toBe('company');
  });

  it('pre-authorizes an amount only under emergency_amount (§8.6)', () => {
    expect(emergencyCeilingCents({ policy: 'emergency_amount', extraAmountCents: 15000, source: 'company' })).toBe(15000);
    expect(emergencyCeilingCents({ policy: 'prior_authorization', extraAmountCents: 15000, source: 'company' })).toBeNull();
    expect(emergencyExceeds(15000, 15001)).toBe(true);
    expect(emergencyExceeds(15000, 15000)).toBe(false);
    expect(emergencyExceeds(null, 99999)).toBe(false);
  });

  it('requires a positive amount for emergency_amount (§11)', () => {
    expect(validateEmergencyAmount('emergency_amount', 100)).toBe(true);
    expect(validateEmergencyAmount('emergency_amount', null)).toBe(false);
    expect(validateEmergencyAmount('emergency_amount', 0)).toBe(false);
    expect(validateEmergencyAmount('prior_authorization', null)).toBe(true);
    expect(validateEmergencyAmount('resolve_without_authorization', null)).toBe(true);
  });
});
