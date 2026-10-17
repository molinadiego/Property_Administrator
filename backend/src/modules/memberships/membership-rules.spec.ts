import { isLastOwnerBlocked } from './membership-rules';

describe('last-owner rule (spec §4.2, AC-2.4)', () => {
  it('blocks demoting the only active owner', () => {
    expect(isLastOwnerBlocked(1, true)).toBe(true);
  });

  it('blocks revoking the only active owner', () => {
    expect(isLastOwnerBlocked(1, true)).toBe(true);
  });

  it('allows demoting an owner when another active owner exists', () => {
    expect(isLastOwnerBlocked(2, true)).toBe(false);
  });

  it('never blocks plain members', () => {
    expect(isLastOwnerBlocked(1, false)).toBe(false);
    expect(isLastOwnerBlocked(0, false)).toBe(false);
  });

  it('blocks a target owner when the count is inconsistent (0)', () => {
    expect(isLastOwnerBlocked(0, true)).toBe(true);
  });
});
