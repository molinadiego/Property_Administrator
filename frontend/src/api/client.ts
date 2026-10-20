import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

/**
 * Typed API client, generated from `backend/openapi/openapi.json`
 * (frontend/AGENTS.md: never hand-write API types; regenerate with
 * `npm run openapi:generate` when the contract changes).
 *
 * Same-origin by design (frontend_plan D4): the SPA talks to the API on its
 * own origin, so the `mh_session` HttpOnly cookie works without CORS (dev:
 * Vite proxies `/api` to the backend). `window.location.origin` also makes the
 * URLs absolute in the jsdom test environment, where `Request` does not
 * resolve relative paths like a browser would.
 */
export const api = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  credentials: 'include',
});
