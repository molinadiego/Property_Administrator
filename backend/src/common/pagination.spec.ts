import { decodeCursor, encodeCursor } from './pagination';

describe('cursor pagination', () => {
  it('round-trips createdAt and id', () => {
    const createdAt = new Date('2026-10-17T12:00:00.000Z');
    const id = '76f2a8f1-9c3e-4b52-8f0d-1a2b3c4d5e6f';
    const decoded = decodeCursor(encodeCursor(createdAt, id));
    expect(decoded).toEqual({ createdAt, id });
  });

  it('produces opaque base64url cursors', () => {
    const cursor = encodeCursor(new Date('2026-10-17T12:00:00.000Z'), 'abc');
    expect(cursor).not.toContain('2026');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects malformed cursors', () => {
    expect(decodeCursor('not-a-cursor')).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
    expect(decodeCursor(Buffer.from('nodate_abc').toString('base64url'))).toBeUndefined();
  });
});
