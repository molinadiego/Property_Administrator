import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';

/**
 * Any 401 (from `me` or from any other request) means the session is gone: we
 * store `me = null`, which makes the route guards redirect to /login without
 * crashes (spec F0 AC-F0.4).
 */
function handleUnauthorized(client: QueryClient, error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    client.setQueryData(['me'], null);
  }
}

export function createQueryClient(): QueryClient {
  // The caches need to report 401s back to the client, which does not exist
  // yet when they are created: resolve it lazily through the holder.
  const clientHolder: { current: QueryClient | null } = { current: null };
  const onError = (error: unknown) => {
    if (clientHolder.current) handleUnauthorized(clientHolder.current, error);
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // Never retry client errors; retry transient failures once.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status > 0 && error.status < 500) &&
          failureCount < 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });
  clientHolder.current = client;
  return client;
}
