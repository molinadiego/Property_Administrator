import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { useLogin } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeInternalPath } from '@/lib/internal-path';

/**
 * Login (spec F0 §6). Validation runs on submit + blur (never while typing),
 * the submit button is disabled while pending (no double submit), and server
 * responses map to actionable messages: 401 → bad credentials, 422 → `detail`,
 * 429 → wait `Retry-After` seconds before retrying.
 *
 * F1 (F1-D6): returns to the route that redirected here — `state.from` (set by
 * the session guards) or a validated `?next=` internal path — and shows the
 * notices left by the register / password-reset flows.
 */
export function LoginPage() {
  const { t } = useTranslation(['auth', 'errors']);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const [formError, setFormError] = useState<string | null>(null);
  const [rateWait, setRateWait] = useState(0);

  const state = location.state as
    | { from?: string; accountCreated?: boolean; passwordReset?: boolean }
    | null;
  const next = useMemo(
    () => safeInternalPath(new URLSearchParams(location.search).get('next')),
    [location.search],
  );

  useEffect(() => {
    if (rateWait <= 0) return;
    const timer = setTimeout(() => setRateWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [rateWait]);

  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth:login.emailRequired'))
      .email(t('auth:login.emailInvalid'))
      .max(200, t('auth:login.emailInvalid')),
    password: z.string().min(1, t('auth:login.passwordRequired')).max(200),
  });

  type LoginValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      navigate(state?.from ?? next ?? '/', { replace: true });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(t('errors:unknown'));
        return;
      }
      if (error.status === 401) {
        setFormError(t('auth:login.invalid'));
      } else if (error.status === 422) {
        setFormError(error.detail ?? t('errors:unprocessable'));
      } else if (error.status === 429) {
        setRateWait(error.retryAfterSeconds ?? 60);
        setFormError(null);
      } else if (error.status === 0 || error.status >= 500) {
        setFormError(t('errors:network'));
      } else {
        setFormError(error.detail ?? t('errors:unknown'));
      }
    }
  });

  const rateLimited = rateWait > 0;
  const pending = login.isPending;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t('auth:login.title')}</CardTitle>
          <CardDescription>{t('auth:login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div aria-live="polite">
              {state?.accountCreated ? (
                <p
                  role="status"
                  className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground"
                >
                  {t('auth:account.created')}
                </p>
              ) : null}
              {state?.passwordReset ? (
                <p
                  role="status"
                  className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground"
                >
                  {t('auth:account.passwordReset')}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-email">{t('auth:login.email')}</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                {...register('email')}
              />
              {errors.email ? (
                <p id="login-email-error" role="alert" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">{t('auth:login.password')}</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                {...register('password')}
              />
              {errors.password ? (
                <p id="login-password-error" role="alert" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
              <p className="text-right text-sm">
                <Link
                  to="/forgot-password"
                  className="font-medium text-primary hover:underline"
                >
                  {t('auth:login.forgot')}
                </Link>
              </p>
            </div>

            <div aria-live="polite">
              {formError ? (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              {rateLimited ? (
                <p role="status" className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
                  {t('auth:login.rateLimited', { seconds: rateWait })}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={pending || rateLimited}>
              {pending ? t('auth:login.submitting') : t('auth:login.submit')}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('auth:login.noAccount')}{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              {t('auth:login.registerLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
