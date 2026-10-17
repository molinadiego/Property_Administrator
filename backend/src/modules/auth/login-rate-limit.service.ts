import { Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export interface RateLimitState {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Sliding-window rate limit for login attempts (spec §3: 429 + Retry-After,
 * §11: only the login endpoint is affected). Keyed by ip + normalized email;
 * in-memory is enough for the single-instance v1.
 */
@Injectable()
export class LoginRateLimitService {
  private readonly attempts = new Map<string, number[]>();

  check(key: string): RateLimitState {
    const now = Date.now();
    const recent = (this.attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    this.attempts.set(key, recent);

    if (recent.length >= MAX_ATTEMPTS) {
      const retryAfterMs = WINDOW_MS - (now - recent[0]);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordFailure(key: string): void {
    const recent = this.attempts.get(key) ?? [];
    recent.push(Date.now());
    this.attempts.set(key, recent);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
