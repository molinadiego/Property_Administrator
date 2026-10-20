/**
 * API error handling in the RFC 7807 `problem+json` format (spec F0 §5).
 *
 * Every failed response is normalised into `ApiError` so UI code can branch on
 * `kind` / `status` and show an actionable message (`detail` for 422) without
 * touching raw response bodies.
 */

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  requestId?: string;
}

export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'unprocessable'
  | 'rateLimited'
  | 'server'
  | 'network'
  | 'unknown';

export function isProblemDetail(value: unknown): value is ProblemDetail {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === 'number' && typeof candidate.title === 'string';
}

export function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 422:
      return 'unprocessable';
    case 429:
      return 'rateLimited';
    default:
      return status >= 500 ? 'server' : 'unknown';
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  /** RFC 7807 `detail`: the actionable message shown to the user (422 etc.). */
  readonly detail?: string;
  /** Seconds from the `Retry-After` header (429). */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: {
      status: number;
      kind?: ApiErrorKind;
      detail?: string;
      retryAfterSeconds?: number;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ApiError';
    this.status = options.status;
    this.kind = options.kind ?? kindForStatus(options.status);
    this.detail = options.detail;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** Normalises a failed fetch (network error or HTTP error) into ApiError. */
  static network(cause: unknown): ApiError {
    return new ApiError('Network request failed', { status: 0, kind: 'network', cause });
  }

  /** Builds the error for a non-2xx response, parsing the problem body. */
  static fromResponse(response: Response, errorBody: unknown): ApiError {
    const problem = isProblemDetail(errorBody) ? errorBody : undefined;
    const detail = problem?.detail ?? (typeof errorBody === 'string' ? errorBody : undefined);
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
    const status = response.status;
    const message = detail ?? problem?.title ?? `${status} ${response.statusText}`;
    return new ApiError(message, {
      status,
      detail,
      retryAfterSeconds: retryAfter,
    });
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

/** i18n key (ns:path) for a generic, data-free message about the error. */
export function errorMessageKey(error: ApiError): string {
  switch (error.kind) {
    case 'unauthorized':
      return 'errors:session.expired';
    case 'forbidden':
      return 'errors:forbidden';
    case 'notFound':
      return 'errors:notFound';
    case 'rateLimited':
      return 'errors:rateLimited';
    case 'network':
      return 'errors:network';
    case 'server':
      return 'errors:server';
    default:
      return 'errors:unknown';
  }
}
