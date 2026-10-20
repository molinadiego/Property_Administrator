import { describe, expect, it } from 'vitest';

import { ApiError, errorMessageKey, isProblemDetail, kindForStatus } from './errors';

function responseWith(status: number, headers?: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

describe('ApiError.fromResponse', () => {
  it('maps 401 to a session-expired error (AC-F0.10)', () => {
    const error = ApiError.fromResponse(
      responseWith(401),
      { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'Token inválido' },
    );
    expect(error.kind).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(errorMessageKey(error)).toBe('errors:session.expired');
  });

  it('keeps the RFC 7807 detail for 422 (actionable message)', () => {
    const error = ApiError.fromResponse(
      responseWith(422),
      {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'email debe ser un correo válido',
        requestId: 'req-1',
      },
    );
    expect(error.kind).toBe('unprocessable');
    expect(error.detail).toBe('email debe ser un correo válido');
    expect(error.message).toBe('email debe ser un correo válido');
  });

  it('maps 403 and 404 to status messages without leaking data', () => {
    const forbidden = ApiError.fromResponse(
      responseWith(403),
      { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'No tienes permiso' },
    );
    expect(forbidden.kind).toBe('forbidden');
    expect(errorMessageKey(forbidden)).toBe('errors:forbidden');

    const notFound = ApiError.fromResponse(responseWith(404), undefined);
    expect(notFound.kind).toBe('notFound');
    expect(errorMessageKey(notFound)).toBe('errors:notFound');
  });

  it('reads Retry-After seconds for 429', () => {
    const error = ApiError.fromResponse(
      responseWith(429, { 'retry-after': '45' }),
      { type: 'about:blank', title: 'Too Many Requests', status: 429, detail: 'Rate limited' },
    );
    expect(error.kind).toBe('rateLimited');
    expect(error.retryAfterSeconds).toBe(45);
    expect(errorMessageKey(error)).toBe('errors:rateLimited');
  });

  it('ignores a non-numeric Retry-After header', () => {
    const error = ApiError.fromResponse(
      responseWith(429, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }),
      undefined,
    );
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('handles non-problem bodies and 5xx without throwing', () => {
    const html = ApiError.fromResponse(responseWith(500), '<html>oops</html>');
    expect(html.kind).toBe('server');
    expect(errorMessageKey(html)).toBe('errors:server');

    const unknown = ApiError.fromResponse(responseWith(400), { unexpected: true });
    expect(unknown.kind).toBe('unknown');
    expect(errorMessageKey(unknown)).toBe('errors:unknown');
  });
});

describe('ApiError.network', () => {
  it('marks transport failures with status 0', () => {
    const error = ApiError.network(new TypeError('fetch failed'));
    expect(error.kind).toBe('network');
    expect(error.status).toBe(0);
    expect(errorMessageKey(error)).toBe('errors:network');
  });
});

describe('helpers', () => {
  it('kindForStatus covers the documented statuses', () => {
    expect(kindForStatus(401)).toBe('unauthorized');
    expect(kindForStatus(403)).toBe('forbidden');
    expect(kindForStatus(404)).toBe('notFound');
    expect(kindForStatus(422)).toBe('unprocessable');
    expect(kindForStatus(429)).toBe('rateLimited');
    expect(kindForStatus(503)).toBe('server');
    expect(kindForStatus(418)).toBe('unknown');
  });

  it('isProblemDetail only accepts RFC 7807 shapes', () => {
    expect(isProblemDetail({ status: 422, title: 'Unprocessable' })).toBe(true);
    expect(isProblemDetail({ status: '422', title: 'Unprocessable' })).toBe(false);
    expect(isProblemDetail(null)).toBe(false);
    expect(isProblemDetail('Token inválido')).toBe(false);
  });
});
