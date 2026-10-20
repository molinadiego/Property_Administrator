import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CompanyMemberDto, MembershipRole } from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';
import { meQueryKey, useMe } from '@/auth/session';

export const membersKey = (companyId: string) => ['company', companyId, 'members'] as const;

/** Active members of the space, any active member can read the list (§3.2). */
export function useMembers(companyId: string) {
  return useQuery({
    queryKey: membersKey(companyId),
    queryFn: () =>
      callApi(api.GET('/api/v1/companies/{id}/members', { params: { path: { id: companyId } } })),
  });
}

/**
 * Changes a member's role (owner-only server-side, spec F1 §3). When the
 * membership is the caller's own, `me` is invalidated too: its embedded role
 * changed (the active-space UI derives from it).
 */
export function useChangeMemberRole(companyId: string, selfMembershipId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['changeMemberRole', companyId],
    mutationFn: (input: { membershipId: string; role: MembershipRole }) =>
      callApi(
        api.PATCH('/api/v1/companies/{id}/members/{membershipId}', {
          params: { path: { id: companyId, membershipId: input.membershipId } },
          body: { role: input.role },
        }),
      ),
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({ queryKey: membersKey(companyId) });
      if (selfMembershipId && input.membershipId === selfMembershipId) {
        await queryClient.invalidateQueries({ queryKey: meQueryKey });
      }
    },
  });
}

/**
 * Revokes a member's access (owner-only, §3.3): the personal account and its
 * history survive; the next call to the space fails (matriz Etapa 1 #6). When
 * the caller revokes themselves, invalidating `me` sends the F0 flows back to
 * the picker or the no-spaces screen.
 */
export function useRevokeMember(companyId: string, selfMembershipId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['revokeMember', companyId],
    mutationFn: (membershipId: string) =>
      callApi(
        api.DELETE('/api/v1/companies/{id}/members/{membershipId}', {
          params: { path: { id: companyId, membershipId } },
        }),
      ),
    onSuccess: async (_data, membershipId) => {
      await queryClient.invalidateQueries({ queryKey: membersKey(companyId) });
      if (selfMembershipId && membershipId === selfMembershipId) {
        await queryClient.invalidateQueries({ queryKey: meQueryKey });
      }
    },
  });
}

/** Membership id of the current user in the space, or null. */
export function useSelfMembershipId(members: CompanyMemberDto[] | undefined) {
  const { data: me } = useMe();
  return members?.find((member) => member.userId === me?.id)?.membershipId ?? null;
}
