import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SESSION_COOKIE, SESSION_TTL_DAYS } from './guards/session.guard';

/**
 * Sets the session cookie (HttpOnly + SameSite=Lax always; Secure only in
 * production so dev/test over plain http still work, spec §3).
 */
export function setSessionCookie(
  res: Response,
  token: string,
  config: ConfigService,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.getOrThrow<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** Clears the session cookie on logout. */
export function clearSessionCookie(res: Response, config: ConfigService): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.getOrThrow<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
