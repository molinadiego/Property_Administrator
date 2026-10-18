import {
  canSubmitCostReport,
  nextVersionNumber,
  totalCentsOf,
  validateCostItems,
} from './cost-rules';

describe('cost items validation (§8.1, §3)', () => {
  it('accepts valid items', () => {
    expect(validateCostItems([])).toEqual({ valid: true });
    expect(
      validateCostItems([
        { category: 'material', description: 'Pulgadas de tubería de cobre', amount: '125.50' },
        { category: 'labor', description: 'Dos horas de mano de obra', amount: '80', isEmergency: true },
        { category: 'other', description: 'Traslado', amount: '0' },
      ]),
    ).toEqual({ valid: true });
  });

  it('rejects unknown categories, empty descriptions and invalid amounts', () => {
    expect(validateCostItems([{ category: 'fuel', description: 'x', amount: '1' }])).toEqual({
      valid: false,
      reason: 'Categoría de costo inválida.',
    });
    expect(validateCostItems([{ category: 'material', description: '   ', amount: '1' }]).valid).toBe(false);
    expect(validateCostItems([{ category: 'material', description: 'x', amount: '12.345' }]).valid).toBe(false);
    expect(validateCostItems([{ category: 'material', description: 'x', amount: 'abc' }]).valid).toBe(false);
    expect(validateCostItems([{ category: 'material', description: 'x'.repeat(501), amount: '1' }]).valid).toBe(false);
  });

  it('sums amounts as integer cents', () => {
    expect(totalCentsOf([{ amount: '125.50' }, { amount: '80' }, { amount: '0.01' }])).toBe(20551);
    expect(totalCentsOf([])).toBe(0);
  });
});

describe('submit permission (decisión 8, §20.2)', () => {
  it('lets an accepted assignment submit', () => {
    expect(canSubmitCostReport({ status: 'accepted', respondedAt: new Date() })).toBe(true);
  });

  it('lets a revoked assignment submit only if it reached accepted once', () => {
    // Revoked after accepting: responded_at was set on accept.
    expect(canSubmitCostReport({ status: 'revoked', respondedAt: new Date() })).toBe(true);
    // Revoked while pending: never accepted.
    expect(canSubmitCostReport({ status: 'revoked', respondedAt: null })).toBe(false);
  });

  it('never lets pending or rejected assignments submit', () => {
    expect(canSubmitCostReport({ status: 'pending', respondedAt: null })).toBe(false);
    expect(canSubmitCostReport({ status: 'rejected', respondedAt: new Date() })).toBe(false);
  });
});

describe('version chain (§8.2)', () => {
  it('starts at 1 and increments', () => {
    expect(nextVersionNumber(null)).toBe(1);
    expect(nextVersionNumber(1)).toBe(2);
    expect(nextVersionNumber(7)).toBe(8);
  });
});
