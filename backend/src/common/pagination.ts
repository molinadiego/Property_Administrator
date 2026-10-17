/** Opaque cursor over the (created_at, id) pair used by list endpoints. */
export interface Cursor {
  createdAt: Date;
  id: string;
}

/** Encodes a cursor as base64url of `<isoDate>_<id>` — opaque for clients. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}_${id}`, 'utf8').toString('base64url');
}

/** Decodes a cursor; returns undefined when malformed (caller answers 422). */
export function decodeCursor(cursor: string): Cursor | undefined {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.indexOf('_');
    if (sep <= 0) return undefined;
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || id.length === 0) return undefined;
    return { createdAt, id };
  } catch {
    return undefined;
  }
}
