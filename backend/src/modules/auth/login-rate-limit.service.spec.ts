import { LoginRateLimitService } from './login-rate-limit.service';

describe('LoginRateLimitService', () => {
  let service: LoginRateLimitService;

  beforeEach(() => {
    service = new LoginRateLimitService();
  });

  it('allows requests below the threshold', () => {
    const key = '1.1.1.1|ana@example.com';
    for (let i = 0; i < 4; i += 1) {
      service.recordFailure(key);
      expect(service.check(key).allowed).toBe(true);
    }
  });

  it('blocks with retryAfterSeconds after 5 failures', () => {
    const key = '1.1.1.1|ana@example.com';
    for (let i = 0; i < 5; i += 1) service.recordFailure(key);
    const state = service.check(key);
    expect(state.allowed).toBe(false);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
    expect(state.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it('reset clears the window (successful login)', () => {
    const key = '1.1.1.1|ana@example.com';
    for (let i = 0; i < 5; i += 1) service.recordFailure(key);
    expect(service.check(key).allowed).toBe(false);
    service.reset(key);
    expect(service.check(key).allowed).toBe(true);
  });

  it('keys are independent (ip + email)', () => {
    for (let i = 0; i < 5; i += 1) service.recordFailure('1.1.1.1|ana@example.com');
    expect(service.check('1.1.1.1|ana@example.com').allowed).toBe(false);
    expect(service.check('2.2.2.2|ana@example.com').allowed).toBe(true);
    expect(service.check('1.1.1.1|otra@example.com').allowed).toBe(true);
  });
});
