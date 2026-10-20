import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { useForgotPassword } from '@/auth/account';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * "Forgot my password" (spec F1 §2, AC-F1.2): the backend answers 202 for any
 * email — existing or not — so this screen always shows the same success
 * message and never reveals whether the account exists (Etapa 1 AC-1.7).
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation(['auth', 'errors']);
  const forgot = useForgotPassword();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth:forgot.emailRequired'))
      .email(t('auth:forgot.emailInvalid'))
      .max(200, t('auth:forgot.emailInvalid')),
  });

  type ForgotValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await forgot.mutateAsync(values);
      setSent(true);
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

  const pending = forgot.isPending;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t('auth:forgot.title')}</CardTitle>
          <CardDescription>{t('auth:forgot.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div role="status" aria-live="polite" className="space-y-4">
              <p className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
                {t('auth:forgot.sent')}
              </p>
              <Link
                to="/login"
                className="block text-center text-sm font-medium text-primary hover:underline"
              >
                {t('auth:forgot.backToLogin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">{t('auth:forgot.email')}</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'forgot-email-error' : undefined}
                  {...register('email')}
                />
                {errors.email ? (
                  <p id="forgot-email-error" role="alert" className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                ) : null}
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

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t('auth:forgot.submitting') : t('auth:forgot.submit')}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="font-medium text-primary hover:underline">
                  {t('auth:forgot.backToLogin')}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
