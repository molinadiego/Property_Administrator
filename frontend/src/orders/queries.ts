import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AddJobDto,
  CreateAssignmentDto,
  CreateOrderDto,
  UpdateOrderDto,
} from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';

/**
 * Order queries and transitions (spec F4 §4): every key keeps the F0
 * `['company', …]` prefix and the F2 `…,'orders'` segment, so one
 * invalidation refreshes the list, the detail and the portada cards at once.
 * The server re-validates every transition (§16.1); the hooks invalidate on
 * success *and* on error (409/403/404 races recalculate the buttons, F4 §5).
 */
export interface OrdersFilter {
  /** `status` query of BE-1: comma-separated states, or undefined for all. */
  status?: string;
  /** `assignment_status` of BE-1: only `pending` is accepted by the contract. */
  assignmentStatus?: 'pending';
}

export const ordersListKey = (companyId: string, filter: OrdersFilter) =>
  ['company', companyId, 'orders', 'list', filter] as const;

export const orderKey = (companyId: string, orderId: string) =>
  ['company', companyId, 'orders', orderId] as const;

/** Invalidates list + detail + portada cards of the space (F4 §4). */
function useInvalidateOrders(companyId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['company', companyId, 'orders'] });
  };
}

/** Visible orders of the space: own orders + own cross-space assignments (§2.12). */
export function useOrders(companyId: string, filter: OrdersFilter) {
  return useQuery({
    queryKey: ordersListKey(companyId, filter),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/orders', {
          params: {
            path: { id: companyId },
            query: {
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.assignmentStatus ? { assignment_status: filter.assignmentStatus } : {}),
            },
          },
        }),
      ),
  });
}

/** Order detail with jobs and assignments (§5.5, §20). */
export function useOrder(companyId: string, orderId: string) {
  return useQuery({
    queryKey: orderKey(companyId, orderId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/orders/{orderId}', {
          params: { path: { id: companyId, orderId } },
        }),
      ),
    enabled: Boolean(orderId),
  });
}

/** Creates an order bound to a property (§5.1): 201 → the new `open` order. */
export function useCreateOrder(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['createOrder', companyId],
    mutationFn: (input: CreateOrderDto) =>
      callApi(
        api.POST('/api/v1/companies/{id}/orders', {
          params: { path: { id: companyId } },
          body: input,
        }),
      ),
    onSettled: invalidate,
  });
}

/** Edits title/description/access/urgent of the order (§4.4, §5.8, §14.2). */
export function useUpdateOrder(companyId: string, orderId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['updateOrder', companyId, orderId],
    mutationFn: (input: UpdateOrderDto) =>
      callApi(
        api.PATCH('/api/v1/companies/{id}/orders/{orderId}', {
          params: { path: { id: companyId, orderId } },
          body: input,
        }),
      ),
    onSettled: invalidate,
  });
}

/** Converts a `requested` order into a sent one with its first job (§20.1). */
export function useConvertOrder(companyId: string, orderId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['convertOrder', companyId, orderId],
    mutationFn: () =>
      callApi(
        api.POST('/api/v1/companies/{id}/orders/{orderId}/convert', {
          params: { path: { id: companyId, orderId } },
        }),
      ),
    onSettled: invalidate,
  });
}

/** Adds a job to a compound order (§5.5): 201 with the created row. */
export function useAddJob(companyId: string, orderId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['addJob', companyId, orderId],
    mutationFn: (input: AddJobDto) =>
      callApi(
        api.POST('/api/v1/companies/{id}/orders/{orderId}/jobs', {
          params: { path: { id: companyId, orderId } },
          body: input,
        }),
      ),
    onSettled: invalidate,
  });
}

/** Assigns a job to any active membership (§5.6): 201 pending (§20.3). */
export function useAssignJob(companyId: string, orderId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['assignJob', companyId, orderId],
    mutationFn: (input: CreateAssignmentDto) =>
      callApi(
        api.POST('/api/v1/companies/{id}/orders/{orderId}/assignments', {
          params: { path: { id: companyId, orderId } },
          body: input,
        }),
      ),
    onSettled: invalidate,
  });
}

/**
 * Reassigns keeping both rows in the history (§5.7): revokes the active one.
 * The ids travel with the mutation variables so direct callers cannot capture
 * an empty id from a not-yet-open dialog.
 */
export function useReassignAssignment(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['reassignAssignment', companyId],
    mutationFn: ({ assignId, input }: { assignId: string; input: CreateAssignmentDto }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/assignments/{assignId}/reassign', {
          params: { path: { id: companyId, assignId } },
          body: input,
        }),
      ),
    onSettled: invalidate,
  });
}

/** Revokes an active assignment (§20.3): the job goes back to pending. */
export function useRevokeAssignment(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['revokeAssignment', companyId],
    mutationFn: (assignId: string) =>
      callApi(
        api.POST('/api/v1/companies/{id}/assignments/{assignId}/revoke', {
          params: { path: { id: companyId, assignId } },
        }),
      ),
    onSettled: invalidate,
  });
}

/**
 * Life-cycle transitions of a job (§20.2): each path is explicit so the
 * generated client stays fully typed (no dynamic paths, frontend/AGENTS.md).
 * The `jobId` rides on the mutation variables; every transition shares the
 * same invalidation.
 */
export function useStartJob(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['startJob', companyId],
    mutationFn: (jobId: string) =>
      callApi(
        api.POST('/api/v1/companies/{id}/jobs/{jobId}/start', {
          params: { path: { id: companyId, jobId } },
        }),
      ),
    onSettled: invalidate,
  });
}

/** Appends a progress note (§6.1): 201 with the stored event. */
export function useProgressJob(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['progressJob', companyId],
    mutationFn: ({ jobId, message }: { jobId: string; message: string }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/jobs/{jobId}/progress', {
          params: { path: { id: companyId, jobId } },
          body: { message },
        }),
      ),
    onSettled: invalidate,
  });
}

/** Completes an in-progress job (§6.1): optional result text, 204. */
export function useCompleteJob(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['completeJob', companyId],
    mutationFn: ({ jobId, result }: { jobId: string; result?: string }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/jobs/{jobId}/complete', {
          params: { path: { id: companyId, jobId } },
          body: result ? { result } : {},
        }),
      ),
    onSettled: invalidate,
  });
}

/** Reports an in-progress job incomplete with the required reason (§6.2). */
export function useIncompleteJob(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['incompleteJob', companyId],
    mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/jobs/{jobId}/incomplete', {
          params: { path: { id: companyId, jobId } },
          body: { reason },
        }),
      ),
    onSettled: invalidate,
  });
}

/** Resumes an incomplete job with the same professional (§6.2): 204. */
export function useResumeJob(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['resumeJob', companyId],
    mutationFn: (jobId: string) =>
      callApi(
        api.POST('/api/v1/companies/{id}/jobs/{jobId}/resume', {
          params: { path: { id: companyId, jobId } },
        }),
      ),
    onSettled: invalidate,
  });
}

/** Marks a job not realized with the required reason (§6.3): terminal, 204. */
export function useNotRealizedJob(companyId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['notRealizedJob', companyId],
    mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/jobs/{jobId}/not-realized', {
          params: { path: { id: companyId, jobId } },
          body: { reason },
        }),
      ),
    onSettled: invalidate,
  });
}

/** Closes an order: every job terminal (§6.4): 204. */
export function useCloseOrder(companyId: string, orderId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['closeOrder', companyId, orderId],
    mutationFn: () =>
      callApi(
        api.POST('/api/v1/companies/{id}/orders/{orderId}/close', {
          params: { path: { id: companyId, orderId } },
        }),
      ),
    onSettled: invalidate,
  });
}

/** Cancels an order with the required reason (§20.1): 204, revokes assignments. */
export function useCancelOrder(companyId: string, orderId: string) {
  const invalidate = useInvalidateOrders(companyId);
  return useMutation({
    mutationKey: ['cancelOrder', companyId, orderId],
    mutationFn: (reason: string) =>
      callApi(
        api.POST('/api/v1/companies/{id}/orders/{orderId}/cancel', {
          params: { path: { id: companyId, orderId } },
          body: { reason },
        }),
      ),
    onSettled: invalidate,
  });
}
