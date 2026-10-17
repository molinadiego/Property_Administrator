import { generateToken, hashToken, maskEmail, normalizeEmail } from './tokens';

describe('tokens', () => {
  it('generateToken returns a URL-safe token unique per call', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('hashToken is deterministic and never equals the token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(generateToken())).not.toBe(hashToken(token));
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Foo@X.COM ')).toBe('foo@x.com');
    expect(normalizeEmail('foo@x.com')).toBe('foo@x.com');
  });

  it('maskEmail hides the local part', () => {
    expect(maskEmail('foo@x.com')).toBe('f***@x.com');
    expect(maskEmail('ana.garcia@example.com')).toBe('a***@example.com');
  });
});
