import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { useAcceptInvitation, useInvitationPreview } from '@/companies/invitations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Public invitation screen (`/invitations/:token`, spec F1 §2): the preview
 * never exposes more than the public data (company, masked email, role,
 * expiry). With a session the current account joins; without one, the
 * visitor can log in (returning here via `?next`) or create the account and
 * join in one step (the backend sets its session, F1-D5).
 */
export function InvitationPage() {
  const { t } = useTranslation(['spaces', 'errors']);
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const meQuery = useMe();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation(token);
  const [formError, setFormError] = useState<string | null>(null);

  const session = meQuery.data;

  const schema = z.object({
    name: z.string().trim().min(1, t('spaces:accept.nameRequired')).max(200),
    password: z
      .string()
      .min(1, t('spaces:accept.passwordRequired'))
      .min(8, t('spaces:accept.passwordTooShort'))
      .max(200),
  });

  type CreateValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { name: '' },
  });

  const handleAccept = async (input: { name?: string; password?: string }) => {
    setFormError(null);
    try {
      await accept.mutateAsync(input);
      navigate('/', { replace: true });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(t('errors:unknown'));
        return;
      }
      if (error.status === 404 || error.status === 409 || error.status === 410) {
        // Terminal server state: surface the actionable detail, no retries.
        setFormError(error.detail ?? t('spaces:accept.invalid'));
      } else if (error.status === 422) {
        setFormError(error.detail ?? t('errors:unprocessable'));
      } else if (error.status === 0 || error.status >= 500) {
        setFormError(t('errors:network'));
      } else {
        setFormError(error.detail ?? t('errors:unknown'));
      }
    }
  };

  const onCreateSubmit = handleSubmit((values) =>
    handleAccept({ name: values.name, password: values.password }),
  );

  const previewError =
    preview.error instanceof ApiError &&
    (preview.error.status === 404 || preview.error.status === 410)
      ? preview.error.status
      : null;

  if (preview.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md" role="status" aria-live="polite">
          <CardHeader>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (previewError || !preview.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-xl">
              {previewError === 410 ? t('spaces:accept.expiredTitle') : t('spaces:accept.invalidTitle')}
            </CardTitle>
            <CardDescription>
              {previewError === 410 ? t('spaces:accept.expired') : t('spaces:accept.invalid')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" className="text-sm font-medium text-primary hover:underline">
              Home
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invitation = preview.data;
  const expiresOn = new Date(invitation.expiresAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {t('spaces:accept.title', { company: invitation.companyName })}
          </CardTitle>
          <CardDescription>{t('spaces:accept.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{t('spaces:members.email')}</dt>
              <dd className="font-medium text-foreground">{invitation.emailMasked}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{t('spaces:members.role')}</dt>
              <dd>
                <Badge variant="secondary">{t(`spaces:role.${invitation.role}`)}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{t('spaces:accept.expiresLabel')}</dt>
              <dd className="text-foreground">{expiresOn}</dd>
            </div>
          </dl>

          <div aria-live="polite">
            {formError ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          {meQuery.isPending ? null : session ? (
            <Button
              className="w-full"
              disabled={accept.isPending}
              onClick={() => void handleAccept({})}
            >
              {accept.isPending
                ? t('spaces:accept.joining')
                : t('spaces:accept.join', { company: invitation.companyName })}
            </Button>
          ) : (
            <div className="space-y-4">
              <form onSubmit={onCreateSubmit} noValidate className="space-y-4">
                <p className="text-sm font-medium text-foreground">{t('spaces:accept.createTitle')}</p>

                <div className="space-y-1.5">
                  <Label htmlFor="accept-name">{t('spaces:accept.name')}</Label>
                  <Input
                    id="accept-name"
                    autoComplete="name"
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? 'accept-name-error' : undefined}
                    {...register('name')}
                  />
                  {errors.name ? (
                    <p id="accept-name-error" role="alert" className="text-sm text-destructive">
                      {errors.name.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="accept-password">{t('spaces:accept.password')}</Label>
                  <Input
                    id="accept-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={
                      errors.password ? 'accept-password-error' : 'accept-password-hint'
                    }
                    {...register('password')}
                  />
                  {errors.password ? (
                    <p id="accept-password-error" role="alert" className="text-sm text-destructive">
                      {errors.password.message}
                    </p>
                  ) : (
                    <p id="accept-password-hint" className="text-sm text-muted-foreground">
                      {t('spaces:accept.passwordHint')}
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={accept.isPending}>
                  {accept.isPending
                    ? t('spaces:accept.creating')
                    : t('spaces:accept.createSubmit')}
                </Button>
              </form>

              <div className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
                <p>{t('spaces:accept.haveAccount')}</p>
                <Link
                  to={`/login?next=${encodeURIComponent(`/invitations/${token}`)}`}
                  className="mt-1 inline-block font-medium text-primary hover:underline"
                >
                  {t('spaces:accept.loginCta')}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
