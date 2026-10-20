import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { useRegister } from '@/auth/account';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Account registration (spec F1 §2, AC-F1.1). The server creates the account
 * without a session (201, F1-D5), so success lands on /login with a notice;
 * a 409 (email already registered) shows the RFC 7807 `detail` under the
 * email field.
 */
export function RegisterPage() {
  const { t } = useTranslation(['auth', 'errors']);
  const navigate = useNavigate();
  const registerAccount = useRegister();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = z.object({
    name: z.string().trim().min(1, t('auth:register.nameRequired')).max(200),
    email: z
      .string()
      .min(1, t('auth:register.emailRequired'))
      .email(t('auth:register.emailInvalid'))
      .max(200, t('auth:register.emailInvalid')),
    password: z
      .string()
      .min(1, t('auth:register.passwordRequired'))
      .min(8, t('auth:register.passwordTooShort'))
      .max(200),
  });

  type RegisterValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerAccount.mutateAsync(values);
      navigate('/login', { replace: true, state: { accountCreated: true } });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(t('errors:unknown'));
        return;
      }
      if (error.status === 409) {
        setError('email', { message: error.detail ?? t('auth:register.emailInUse') });
      } else if (error.status === 422) {
        setFormError(error.detail ?? t('errors:unprocessable'));
      } else if (error.status === 0 || error.status >= 500) {
        setFormError(t('errors:network'));
      } else {
        setFormError(error.detail ?? t('errors:unknown'));
      }
    }
  });

  const pending = registerAccount.isPending;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t('auth:register.title')}</CardTitle>
          <CardDescription>{t('auth:register.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="register-name">{t('auth:register.name')}</Label>
              <Input
                id="register-name"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'register-name-error' : undefined}
                {...register('name')}
              />
              {errors.name ? (
                <p id="register-name-error" role="alert" className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="register-email">{t('auth:register.email')}</Label>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'register-email-error' : undefined}
                {...register('email')}
              />
              {errors.email ? (
                <p id="register-email-error" role="alert" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="register-password">{t('auth:register.password')}</Label>
              <Input
                id="register-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={
                  errors.password
                    ? 'register-password-error'
                    : 'register-password-hint'
                }
                {...register('password')}
              />
              {errors.password ? (
                <p id="register-password-error" role="alert" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              ) : (
                <p id="register-password-hint" className="text-sm text-muted-foreground">
                  {t('auth:register.passwordHint')}
                </p>
              )}
            </div>

            <div aria-live="polite">
              {formError ? (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t('auth:register.submitting') : t('auth:register.submit')}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('auth:register.haveAccount')}{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t('auth:register.loginLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
