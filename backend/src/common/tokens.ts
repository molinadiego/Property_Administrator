import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token (256 bits). Only its hash is ever persisted. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest of a token — the only form stored in the DB (spec §2.5). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Email normalization: trim + lowercase ('Foo@X.com' → 'foo@x.com', spec §11). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Masks an email for public previews: 'foo@x.com' → 'f***@x.com'. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}
