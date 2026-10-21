import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateRequestDto } from '@/api/types';
import { api } from '@/api/client';
import { ApiError } from '@/api/errors';
import { callApi } from '@/api/mutations';

/**
 * Limited-portal queries (spec F3 §4, §2.2): no session, the token in the URL
 * is the credential (pattern of the F1 invitation). Keys carry the token and
 * never the active space — the portal is foreign to `/app` and its queries are
 * untouched by F0's space invalidation.
 */
export const limitedOrdersKey = (token: string) => ['limited', token, 'orders'] as const;

export const limitedPropertiesKey = (token: string) => ['limited', token, 'properties'] as const;

export const limitedInvoicesKey = (token: string) => ['limited', token, 'invoices'] as const;

export const limitedInvoiceKey = (token: string, invoiceId: string) =>
  ['limited', token, 'invoices', invoiceId] as const;

/** Orders of the account's housing/relation, status only (§4.3). */
export function useLimitedOrders(token: string) {
  return useQuery({
    queryKey: limitedOrdersKey(token),
    queryFn: () =>
      callApi(api.GET('/api/v1/limited/{token}/orders', { params: { path: { token } } })),
    enabled: Boolean(token),
  });
}

/** Properties the account may target in a request (F3-D2, §4.3). */
export function useLimitedProperties(token: string) {
  return useQuery({
    queryKey: limitedPropertiesKey(token),
    queryFn: () =>
      callApi(api.GET('/api/v1/limited/{token}/properties', { params: { path: { token } } })),
    enabled: Boolean(token),
  });
}

/** Invoices sent to the client account, never drafts (§11.3). */
export function useLimitedInvoices(token: string) {
  return useQuery({
    queryKey: limitedInvoicesKey(token),
    queryFn: () =>
      callApi(api.GET('/api/v1/limited/{token}/invoices', { params: { path: { token } } })),
    enabled: Boolean(token),
  });
}

/** Invoice detail with lines and payments (§11.3). */
export function useLimitedInvoice(token: string, invoiceId: string) {
  return useQuery({
    queryKey: limitedInvoiceKey(token, invoiceId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/limited/{token}/invoices/{invId}', {
          params: { path: { token, invId: invoiceId } },
        }),
      ),
    enabled: Boolean(token) && Boolean(invoiceId),
  });
}

/** Places a work request: an order in `requested` the company converts (§5.1). */
export function useCreateLimitedRequest(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['createLimitedRequest', token],
    mutationFn: (input: CreateRequestDto) =>
      callApi(
        api.POST('/api/v1/limited/{token}/requests', {
          params: { path: { token } },
          body: input,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: limitedOrdersKey(token) });
    },
  });
}

/**
 * Downloads the invoice PDF (spec F3 §5): same-origin fetch of the binary
 * endpoint (the typed client models JSON; binary goes through `fetch`), then
 * an anchor click with an object URL. A 401/404 surfaces as `ApiError` like
 * every other call.
 */
export async function downloadLimitedInvoicePdf(token: string, invoiceId: string): Promise<void> {
  const url = `${window.location.origin}/api/v1/limited/${encodeURIComponent(token)}/invoices/${encodeURIComponent(invoiceId)}/pdf`;
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include' });
  } catch (cause) {
    throw ApiError.network(cause);
  }
  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = undefined;
    }
    throw ApiError.fromResponse(response, errorBody);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `factura-${invoiceId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
