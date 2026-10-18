import { propertyHistoryScope } from './history-rules';

const base = {
  propertyCompanyId: 'company-own',
  callerCompanyId: 'company-own',
  hasActiveShare: false,
  hasActiveAssignment: false,
};

describe('property history scope (§7.2, §7.5)', () => {
  it('gives the owning company the complete history', () => {
    expect(propertyHistoryScope(base)).toBe('full');
  });

  it('gives an active share the shared antecedents', () => {
    expect(
      propertyHistoryScope({
        ...base,
        callerCompanyId: 'company-other',
        hasActiveShare: true,
        hasActiveAssignment: true,
      }),
    ).toBe('shared');
  });

  it('limits an active assignment without share to own jobs', () => {
    expect(
      propertyHistoryScope({
        ...base,
        callerCompanyId: 'company-other',
        hasActiveShare: false,
        hasActiveAssignment: true,
      }),
    ).toBe('own_jobs');
  });

  it('hides the property entirely without any relation (§16.8)', () => {
    expect(
      propertyHistoryScope({
        ...base,
        callerCompanyId: 'company-other',
      }),
    ).toBe('none');
  });

  it('prefers ownership over share/assignment (member acting as the owning company)', () => {
    expect(
      propertyHistoryScope({
        ...base,
        hasActiveShare: true,
        hasActiveAssignment: true,
      }),
    ).toBe('full');
  });
});
