import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CompanyCreatedDto } from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';
import { meQueryKey } from '@/auth/session';

/**
 * Space creation (spec F1 §4): POST /companies makes the creator its owner
 * (§3.1). On success `me` is invalidated — awaiting the refetch guarantees the
 * new membership is part of the list before the UI selects the space (F0-D1).
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['createCompany'],
    mutationFn: (input: { name: string; type: CompanyCreatedDto['type'] }) =>
      callApi(api.POST('/api/v1/companies', { body: input })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}
