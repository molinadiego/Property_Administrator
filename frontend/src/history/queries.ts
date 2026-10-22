import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CreateShareDto,
  UploadFileDto,
} from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';
import type { UploadKind } from '@/history/upload-rules';

/**
 * File and history queries (spec F5 §4): keys keep the F0 `['company', …]`
 * prefix so one invalidation refreshes everything under the space; the
 * personal history is session-scoped and therefore uses `['me', …]`.
 * The server re-validates every permission (§16.1); the mutations invalidate
 * on success *and* on error (races recalculate the view, F4 §5).
 */

export const orderFilesKey = (companyId: string, orderId: string) =>
  ['company', companyId, 'orders', orderId, 'files'] as const;

export const propertyHistoryKey = (companyId: string, propertyId: string) =>
  ['company', companyId, 'history', 'properties', propertyId] as const;

export const managedHistoryKey = (companyId: string) =>
  ['company', companyId, 'history', 'orders'] as const;

export const myJobHistoryKey = () => ['me', 'job-history'] as const;

/**
 * Multipart body: the contract documents only `kind` (F5 §4); the file rides
 * on the `FormData`. Type-only cast — the API type is never hand-written.
 */
function uploadBody(file: File, kind: UploadKind): UploadFileDto {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  return form as unknown as UploadFileDto;
}

/** Visible files of one order, including soft-deleted rows (F5 §4). */
export function useOrderFiles(companyId: string, orderId: string) {
  return useQuery({
    queryKey: orderFilesKey(companyId, orderId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/orders/{orderId}/files', {
          params: { path: { id: companyId, orderId } },
        }),
      ),
    enabled: Boolean(companyId && orderId),
  });
}

export function useUploadOrderFile(companyId: string, orderId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orderFilesKey(companyId, orderId) });
  };
  return useMutation({
    mutationKey: ['uploadOrderFile', companyId, orderId],
    mutationFn: (input: { file: File; kind: UploadKind }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/orders/{orderId}/files', {
          params: { path: { id: companyId, orderId } },
          body: uploadBody(input.file, input.kind),
        }),
      ),
    onSettled: invalidate,
  });
}

export function useUploadJobFile(companyId: string, orderId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orderFilesKey(companyId, orderId) });
  };
  return useMutation({
    mutationKey: ['uploadJobFile', companyId, orderId],
    mutationFn: (input: { jobId: string; file: File; kind: UploadKind }) =>
      callApi(
        api.POST('/api/v1/companies/{id}/jobs/{jobId}/files', {
          params: { path: { id: companyId, jobId: input.jobId } },
          body: uploadBody(input.file, input.kind),
        }),
      ),
    onSettled: invalidate,
  });
}

/**
 * Property history (§7.2): the response carries the server-resolved `scope`
 * and the owner's active `shares` (F5-D2); a 404 means "no scope" (§16.8).
 */
export function usePropertyHistory(companyId: string, propertyId: string) {
  return useQuery({
    queryKey: propertyHistoryKey(companyId, propertyId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/history/properties/{propId}', {
          params: { path: { id: companyId, propId: propertyId } },
        }),
      ),
    enabled: Boolean(companyId && propertyId),
  });
}

/** Orders managed by the space: own plus every order it ever held (§7.3, §7.4). */
export function useManagedHistory(companyId: string) {
  return useQuery({
    queryKey: managedHistoryKey(companyId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/history/orders', {
          params: { path: { id: companyId } },
        }),
      ),
    enabled: Boolean(companyId),
  });
}

/** Personal history (§7.2): session-scoped, any company, closed jobs included. */
export function useMyJobHistory() {
  return useQuery({
    queryKey: myJobHistoryKey(),
    queryFn: () => callApi(api.GET('/api/v1/me/job-history')),
  });
}

/** Shares the antecedents of a property with a membership (§7.5). */
export function useShareHistory(companyId: string, propertyId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['company', companyId, 'history'] });
  };
  return useMutation({
    mutationKey: ['shareHistory', companyId, propertyId],
    mutationFn: (input: { sharedWithMembershipId: string; note?: string }) => {
      const body: CreateShareDto = input.note
        ? { propertyId, sharedWithMembershipId: input.sharedWithMembershipId, note: input.note }
        : { propertyId, sharedWithMembershipId: input.sharedWithMembershipId };
      return callApi(
        api.POST('/api/v1/companies/{id}/history/shares', {
          params: { path: { id: companyId } },
          body,
        }),
      );
    },
    onSettled: invalidate,
  });
}

/** Revokes one active share (§7.5): the beneficiary loses access on the next request. */
export function useRevokeShare(companyId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['company', companyId, 'history'] });
  };
  return useMutation({
    mutationKey: ['revokeShare', companyId],
    mutationFn: (shareId: string) =>
      callApi(
        api.DELETE('/api/v1/companies/{id}/history/shares/{shareId}', {
          params: { path: { id: companyId, shareId } },
        }),
      ),
    onSettled: invalidate,
  });
}
