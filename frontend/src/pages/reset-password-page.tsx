import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { useResetPassword } from '@/auth/account';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NotFoundPage } from '@/pages/not-found-page';

/**
 * Password reset (spec F1 §2, AC-F1.3): the token arrives in
 * `/reset-password?token=…` (the link the backend emails). Success (204)
 * lands on /login with a notice — the server has already revoked every
 * session of the user (Etapa 1 §4). An invalid/used token (404) or an expired
 * one (410) shows an actionable state; a URL without token is a 404 of the
 * app.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation(['auth', 'errors']);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const reset = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = z.object({
    password: z
      .string()
      .min(1, t('auth:reset.passwordRequired'))
      .min(8, t('auth:reset.passwordTooShort'))
      .max(200),
  });

  type ResetValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await reset.mutateAsync({ token, password: values.password });
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(t('errors:unknown'));
        return;
      }
      if (error.status === 422) {
        setFormError(error.detail ?? t('errors:unprocessable'));
      } else if (error.status === 0 || error.status >= 500) {
        setFormError(t('errors:network'));
      } else {
        setFormError(error.detail ?? t('errors:unknown'));
      }
    }
  });

  if (!token) return <NotFoundPage />;

  const terminalLinkError =
    reset.error instanceof ApiError && (reset.error.status === 404 || reset.error.status === 410)
      ? reset.error.status
      : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t('auth:reset.title')}</CardTitle>
          <CardDescription>{t('auth:reset.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {terminalLinkError ? (
            <div role="status" aria-live="polite" className="space-y-4">
              <p className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
                {terminalLinkError === 410 ? t('auth:reset.expiredLink') : t('auth:reset.invalidLink')}
              </p>
              <Link
                to="/forgot-password"
                className="block text-center text-sm font-medium text-primary hover:underline"
              >
                {t('auth:reset.requestNew')}
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-password">{t('auth:reset.password')}</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={
                    errors.password ? 'reset-password-error' : 'reset-password-hint'
                  }
                  {...register('password')}
                />
                {errors.password ? (
                  <p id="reset-password-error" role="alert" className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                ) : (
                  <p id="reset-password-hint" className="text-sm text-muted-foreground">
                    {t('auth:reset.passwordHint')}
                  </p>
                )}
              </div>

              <div aria-live="polite">
                {formError ? (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {formError}
                  </p>
                ) : null}
              </div>

              <Button type="submit" className="w-full" disabled={reset.isPending}>
                {reset.isPending ? t('auth:reset.submitting') : t('auth:reset.submit')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
