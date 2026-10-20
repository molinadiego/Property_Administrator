import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MembershipRole } from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';
import { meQueryKey } from '@/auth/session';

export const invitationsKey = (companyId: string) =>
  ['company', companyId, 'invitations'] as const;

/**
 * Public preview of an invitation (works with or without a session). 404/410
 * are terminal states of the screen, so the query never retries them.
 */
export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () =>
      callApi(api.GET('/api/v1/invitations/{token}', { params: { path: { token } } })),
    enabled: token.length > 0,
    retry: false,
  });
}

/**
 * Accepts an invitation (spec F1 §5, AC-F1.4/AC-F1.5): with a session the
 * current account joins (`{}`); without one the backend creates the account
 * with `{name, password}` and starts its session. Either way the new
 * membership lives in `me`, so invalidating it re-runs the F0 space flows.
 */
export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['acceptInvitation', token],
    mutationFn: (input: { name?: string; password?: string }) =>
      callApi(
        api.POST('/api/v1/invitations/{token}/accept', {
          params: { path: { token } },
          body: input,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

/** Pending invitations of the space (owner-only, spec F1-D1). */
export function useInvitations(companyId: string) {
  return useQuery({
    queryKey: [...invitationsKey(companyId), 'pending'],
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/invitations', {
          params: { path: { id: companyId }, query: { status: 'pending' } },
        }),
      ),
  });
}

/** Creates an invitation and triggers the email (owner-only). */
export function useCreateInvitation(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['createInvitation', companyId],
    mutationFn: (input: { email: string; role: MembershipRole }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/invitations', {
          params: { path: { id: companyId } },
          body: input,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invitationsKey(companyId) });
    },
  });
}

/** Revokes a pending invitation (owner-only). */
export function useRevokeInvitation(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['revokeInvitation', companyId],
    mutationFn: (invitationId: string) =>
      callApi(
        api.DELETE('/api/v1/companies/{id}/invitations/{invId}', {
          params: { path: { id: companyId, invId: invitationId } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invitationsKey(companyId) });
    },
  });
}
