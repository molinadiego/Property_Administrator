import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '4000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/home_management',
    APP_DATABASE_URL: 'postgresql://app:pass@localhost:5432/home_management',
  };

  it('returns a normalized config for valid input', () => {
    expect(validateEnv(valid)).toEqual({
      NODE_ENV: 'test',
      PORT: 4000,
      DATABASE_URL: valid.DATABASE_URL,
      APP_DATABASE_URL: valid.APP_DATABASE_URL,
      EMAIL_TRANSPORT: 'console',
    });
  });

  it('defaults PORT to 3000 when missing or empty', () => {
    expect(validateEnv({ ...valid, PORT: undefined }).PORT).toBe(3000);
    expect(validateEnv({ ...valid, PORT: '' }).PORT).toBe(3000);
  });

  it('defaults NODE_ENV to development when missing', () => {
    const { NODE_ENV, ...rest } = valid;
    expect(validateEnv(rest).NODE_ENV).toBe('development');
  });

  it('defaults EMAIL_TRANSPORT to console', () => {
    expect(validateEnv(valid).EMAIL_TRANSPORT).toBe('console');
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /postgresql/,
    );
  });

  it('rejects a missing APP_DATABASE_URL', () => {
    const { APP_DATABASE_URL, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/APP_DATABASE_URL/);
  });

  it('rejects a non-postgres APP_DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, APP_DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /APP_DATABASE_URL/,
    );
  });

  it('rejects an unknown EMAIL_TRANSPORT', () => {
    expect(() => validateEnv({ ...valid, EMAIL_TRANSPORT: 'smtp' })).toThrow(/EMAIL_TRANSPORT/);
  });

  it('requires API key and from address when EMAIL_TRANSPORT=resend', () => {
    expect(() => validateEnv({ ...valid, EMAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(() =>
      validateEnv({ ...valid, EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_123' }),
    ).toThrow(/EMAIL_FROM/);
    expect(
      validateEnv({
        ...valid,
        EMAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 're_123',
        EMAIL_FROM: 'no-reply@example.com',
      }).RESEND_API_KEY,
    ).toBe('re_123');
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
