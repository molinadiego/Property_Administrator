import { useMutation } from '@tanstack/react-query';

import { callApi } from '@/api/mutations';
import { api } from '@/api/client';

/**
 * Account flows of the Etapa 1 backend (spec F1 §4): register (no session is
 * created — the server returns 201 without a cookie), forgot-password (202
 * always, never reveals whether the email exists) and reset-password (204;
 * revokes every session of the user server-side).
 */
export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export function useRegister() {
  return useMutation({
    mutationKey: ['register'],
    mutationFn: (input: RegisterInput) =>
      callApi(api.POST('/api/v1/auth/register', { body: input })),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationKey: ['forgotPassword'],
    mutationFn: (input: { email: string }) =>
      callApi(api.POST('/api/v1/auth/password/forgot', { body: input })),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationKey: ['resetPassword'],
    mutationFn: (input: { token: string; password: string }) =>
      callApi(api.POST('/api/v1/auth/password/reset', { body: input })),
  });
}
