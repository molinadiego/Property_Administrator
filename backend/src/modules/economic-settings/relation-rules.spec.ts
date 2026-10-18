import { isRelationAttachable, relationGovernsCompany, validateCounterparty } from './relation-rules';

const OWN = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CLIENT = '33333333-3333-3333-3333-333333333333';

describe('counterparty exclusivity (§2.4)', () => {
  it('accepts exactly one counterparty, never the own company', () => {
    expect(validateCounterparty({ counterpartyCompanyId: OTHER }, OWN)).toBe('ok');
    expect(validateCounterparty({ clientRelationshipId: CLIENT }, OWN)).toBe('ok');
    expect(validateCounterparty({}, OWN)).toBe('none');
    expect(validateCounterparty({ counterpartyCompanyId: OTHER, clientRelationshipId: CLIENT }, OWN)).toBe('both');
    expect(validateCounterparty({ counterpartyCompanyId: OWN }, OWN)).toBe('self');
  });
});

describe('ended relations (§2.4)', () => {
  it('blocks new orders only when ended; existing orders keep the reference', () => {
    expect(isRelationAttachable({ endedAt: null })).toBe(true);
    expect(isRelationAttachable({ endedAt: new Date('2026-10-18') })).toBe(false);
  });
});

describe('relation governs its two parties (§2.4)', () => {
  const relation = { companyId: OWN, counterpartyCompanyId: OTHER };

  it('covers both companies of the pair', () => {
    expect(relationGovernsCompany(relation, OWN)).toBe(true);
    expect(relationGovernsCompany(relation, OTHER)).toBe(true);
    expect(relationGovernsCompany(relation, CLIENT)).toBe(false);
  });

  it('covers the client-side relation only for its own company', () => {
    const clientRelation = { companyId: OWN, counterpartyCompanyId: null };
    expect(relationGovernsCompany(clientRelation, OWN)).toBe(true);
    expect(relationGovernsCompany(clientRelation, OTHER)).toBe(false);
  });
});
