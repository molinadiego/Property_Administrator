import {
  canApproveAdditionalWork,
  canResolveRequest,
  isGrantedAtValid,
  isValidAuthorizationAmount,
} from './authorization-rules';

describe('request state machine (§9, matriz #28)', () => {
  it('resolves only pending requests', () => {
    expect(canResolveRequest('pending')).toBe(true);
    expect(canResolveRequest('approved')).toBe(false);
    expect(canResolveRequest('rejected')).toBe(false);
  });

  it('adds an approved additional_work job only to a non-terminal order (§20.1)', () => {
    expect(canApproveAdditionalWork('requested')).toBe(true);
    expect(canApproveAdditionalWork('open')).toBe(true);
    expect(canApproveAdditionalWork('in_progress')).toBe(true);
    expect(canApproveAdditionalWork('completed')).toBe(false);
    expect(canApproveAdditionalWork('cancelled')).toBe(false);
  });
});

describe('authorization amounts and offline dates (§11, §18.1)', () => {
  it('accepts a null cap (optional, §18.1) and positive amounts', () => {
    expect(isValidAuthorizationAmount(null)).toBe(true);
    expect(isValidAuthorizationAmount(1)).toBe(true);
  });

  it('rejects zero or negative caps (§11)', () => {
    expect(isValidAuthorizationAmount(0)).toBe(false);
    expect(isValidAuthorizationAmount(-100)).toBe(false);
  });

  it('rejects a granted_at in the future, accepts past/present', () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    expect(isGrantedAtValid(new Date('2026-10-18T11:59:59.000Z'), now)).toBe(true);
    expect(isGrantedAtValid(now, now)).toBe(true);
    expect(isGrantedAtValid(new Date('2026-10-18T12:00:01.000Z'), now)).toBe(false);
  });
});
