import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationListViewDto } from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';

/**
 * Dashboard queries (spec F2 §4). The order lists keep the F0 `['company', …]`
 * prefix so switching spaces re-runs them; notifications use a root key
 * because the account-wide pages are re-filtered per space in the client
 * (F2-D5, §2.4).
 */
export const openOrdersKey = (companyId: string) =>
  ['company', companyId, 'orders', 'dashboard', 'open'] as const;

export const pendingOrdersKey = (companyId: string) =>
  ['company', companyId, 'orders', 'dashboard', 'pending'] as const;

export const notificationsKey = ['notifications'] as const;

/** Open orders of the space: `status=open,in_progress` (F2-D1, closes BE-1 B4). */
export function useOpenOrders(companyId: string) {
  return useQuery({
    queryKey: openOrdersKey(companyId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/orders', {
          params: { path: { id: companyId }, query: { status: 'open,in_progress' } },
        }),
      ),
  });
}

/** Orders carrying a pending assignment of the caller (F2-D2, BE-1 filters). */
export function usePendingOrders(companyId: string) {
  return useQuery({
    queryKey: pendingOrdersKey(companyId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/orders', {
          params: { path: { id: companyId }, query: { assignment_status: 'pending' } },
        }),
      ),
  });
}

/** After a response the pending row leaves and both order cards must refresh. */
function useRespondedInvalidations(companyId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['company', companyId, 'orders'] });
    void queryClient.invalidateQueries({ queryKey: notificationsKey });
  };
}

/** Accepts a pending assignment of the caller (F2-D3; 204, no request body). */
export function useAcceptAssignment(companyId: string) {
  const invalidate = useRespondedInvalidations(companyId);
  return useMutation({
    mutationFn: (assignId: string) =>
      callApi(
        api.POST('/api/v1/companies/{id}/assignments/{assignId}/accept', {
          params: { path: { id: companyId, assignId } },
        }),
      ),
    onSuccess: invalidate,
    // 409 (already answered) / 404 (gone): refresh so the stale row leaves (AC-F2.6).
    onError: invalidate,
  });
}

export interface RejectAssignmentInput {
  assignId: string;
  /** Optional rejection reason, mirrored from `RejectAssignmentDto` (≤1000). */
  reason?: string;
}

/** Rejects a pending assignment with an optional reason (F2-D3; 204). */
export function useRejectAssignment(companyId: string) {
  const invalidate = useRespondedInvalidations(companyId);
  return useMutation({
    mutationFn: ({ assignId, reason }: RejectAssignmentInput) =>
      callApi(
        api.POST('/api/v1/companies/{id}/assignments/{assignId}/reject', {
          params: { path: { id: companyId, assignId } },
          body: reason ? { reason } : {},
        }),
      ),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

/** The user's latest in-app notifications (limit 50, F2-D4), cursor-paged. */
export function useNotifications() {
  return useInfiniteQuery({
    queryKey: notificationsKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      callApi(
        api.GET('/api/v1/notifications', {
          params: { query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    getNextPageParam: (lastPage: NotificationListViewDto) => lastPage.nextCursor ?? undefined,
  });
}

/** Marks a notification as read (204, idempotent) and refreshes the badge (AC-F2.8). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notifId: string) =>
      callApi(
        api.POST('/api/v1/notifications/{notifId}/read', {
          params: { path: { notifId } },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    },
  });
}
