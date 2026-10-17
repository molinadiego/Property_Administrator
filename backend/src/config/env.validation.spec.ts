import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '4000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/home_management',
  };

  it('returns a normalized config for valid input', () => {
    expect(validateEnv(valid)).toEqual({
      NODE_ENV: 'test',
      PORT: 4000,
      DATABASE_URL: valid.DATABASE_URL,
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

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /postgresql/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
