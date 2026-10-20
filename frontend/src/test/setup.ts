import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { installFetchStub, resetApiCalls } from './fetch-stub';

/**
 * jsdom does not implement matchMedia: polyfill a static implementation that
 * tests can control via `mockMatchMedia`.
 */
export function mockMatchMedia(matchesDark = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? matchesDark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

mockMatchMedia(false);
// Must run before src/api/client.ts is imported (openapi-fetch captures
// globalThis.fetch when the client is created).
installFetchStub();

afterEach(() => {
  cleanup();
  resetApiCalls();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
  // Restore the stubs removed by vi.unstubAllGlobals() for the next test.
  mockMatchMedia(false);
  installFetchStub();
});
