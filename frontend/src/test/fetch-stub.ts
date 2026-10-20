import { vi } from 'vitest';

/**
 * Global fetch stub installed from `setup.ts` (before the app modules import
 * `openapi-fetch`, which captures `globalThis.fetch` at client creation).
 * Tests configure the routing per case via `setFetchHandler`.
 */
export interface ApiCall {
  url: string;
  method: string;
  body?: unknown;
}

export type FetchHandler = (call: ApiCall, callIndex: number) => Response | Promise<Response>;

let handler: FetchHandler | null = null;
const calls: ApiCall[] = [];

const fetchStub = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  // openapi-fetch calls `fetch(request)` (Request as only argument), so the
  // method/body must come from the Request when `init` is absent.
  const request = input instanceof Request ? input : null;
  const url = request
    ? request.url
    : typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const rawBody = init?.body ?? (request ? await request.clone().text() : undefined);
  let body: unknown;
  if (typeof rawBody === 'string' && rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      body = rawBody;
    }
  } else {
    body = rawBody as unknown;
  }
  const call: ApiCall = { url, method, body };
  calls.push(call);
  if (!handler) throw new Error(`Unmocked fetch: ${call.method} ${call.url}`);
  return handler(call, calls.length - 1);
};

export function installFetchStub(): void {
  vi.stubGlobal('fetch', fetchStub);
}

export function setFetchHandler(next: FetchHandler): void {
  handler = next;
}

export function apiCalls(match?: (call: ApiCall) => boolean): ApiCall[] {
  return match ? calls.filter(match) : [...calls];
}

export function resetApiCalls(): void {
  calls.length = 0;
  handler = null;
}

function statusTitle(status: number): string {
  return `${status}`;
}

/** RFC 7807 response in the `problem+json` format. */
export function problemJson(
  status: number,
  detail: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: statusTitle(status),
      status,
      detail,
      instance: '/api/v1/auth/me',
      requestId: 'req-test',
    }),
    {
      status,
      headers: { 'content-type': 'application/problem+json', ...extraHeaders },
    },
  );
}

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
