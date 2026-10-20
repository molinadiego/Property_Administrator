import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { MeResponseDto } from '@/api/types';
import { api } from '@/api/client';
import { ApiError } from '@/api/errors';
import { storage, storageKeys } from '@/lib/storage';

export const meQueryKey = ['me'] as const;

export interface LoginInput {
  email: string;
  password: string;
}

async function fetchMe(): Promise<MeResponseDto | null> {
  try {
    const { data, error, response } = await api.GET('/api/v1/auth/me');
    if (response.status === 401) return null;
    if (!response.ok) throw ApiError.fromResponse(response, error);
    return data ?? null;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw ApiError.network(cause);
  }
}

/**
 * Current session: `data` is `null` when there is no session (401), an object
 * when authenticated, and `error` only for non-401 failures (e.g. network →
 * error screen with retry, never a login redirect).
 */
export function useMe(): UseQueryResult<MeResponseDto | null> {
  return useQuery<MeResponseDto | null>({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['login'],
    mutationFn: async (input: LoginInput): Promise<void> => {
      let response: Response;
      try {
        const result = await api.POST('/api/v1/auth/login', { body: input });
        response = result.response;
        if (!response.ok) throw ApiError.fromResponse(response, result.error);
      } catch (cause) {
        if (cause instanceof ApiError) throw cause;
        throw ApiError.network(cause);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['logout'],
    // Logout is best-effort: even if the request fails, the local session is
    // cleared and the user ends up on /login (spec F0 §11).
    mutationFn: async (): Promise<void> => {
      await api.POST('/api/v1/auth/logout').catch(() => undefined);
    },
    onSettled: () => {
      storage.remove(storageKeys.activeCompany);
      queryClient.setQueryData(meQueryKey, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] === 'company',
      });
    },
  });
}
