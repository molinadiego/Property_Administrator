/**
 * Validates a post-login redirect target (spec F1-D6 / §11): only internal
 * paths are honoured — `/foo` yes, `//evil.com` and `/\evil` no (protocol-
 * relative tricks) — so `/login?next=…` can never bounce users off-origin.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}
