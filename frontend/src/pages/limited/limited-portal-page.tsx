import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyBox, ErrorBanner, ListSkeleton, formatDate, invoiceMoney } from '@/catalogs/ui';
import {
  useCreateLimitedRequest,
  useLimitedInvoices,
  useLimitedOrders,
  useLimitedProperties,
} from '@/limited/queries';
import { LimitedInvalidLink, LimitedShell } from '@/limited/portal-shell';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Limited-access portal (`/limited/:token`, spec F3 §2.2): orders of the
 * account (§4.3, status only), the work-request form (§5.1, F3-D2 selector)
 * and — only when the server sent at least one (§11.3, F3-D5) — its invoices.
 * A 401 renders the invalid-link screen, never a login redirect.
 */
export function LimitedPortalPage() {
  const { t } = useTranslation(['limited', 'common', 'errors']);
  const { token = '' } = useParams();
  const orders = useLimitedOrders(token);
  const properties = useLimitedProperties(token);
  const invoices = useLimitedInvoices(token);
  const createRequest = useCreateLimitedRequest(token);

  const [formError, setFormError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isUnauthorized = (error: unknown) =>
    error instanceof ApiError && error.status === 401;

  const schema = z.object({
    title: z
      .string()
      .trim()
      .min(1, t('limited:request.titleRequired'))
      .max(300, t('limited:request.titleTooLong')),
    description: z
      .string()
      .trim()
      .min(1, t('limited:request.descriptionRequired'))
      .max(5000, t('limited:request.descriptionTooLong')),
    propertyId: z.string().trim().min(1, t('limited:request.propertyRequired')),
  });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { title: '', description: '', propertyId: '' },
  });

  const propertyId = watch('propertyId');
  const propertyRows = properties.data ?? [];
  const orderRows = orders.data ?? [];
  const invoiceRows = invoices.data ?? [];

  // Hooks above run unconditionally; the 401 screen returns after them.
  if (isUnauthorized(orders.error) || isUnauthorized(properties.error) || isUnauthorized(invoices.error)) {
    return <LimitedInvalidLink />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createRequest.mutateAsync({
        title: values.title,
        description: values.description,
        propertyId: values.propertyId,
      });
      setStatusMessage(t('limited:request.created'));
      reset();
    } catch (error) {
      setFormError(error);
    }
  });

  return (
    <LimitedShell>
      <Card className="min-w-0" role="region" aria-labelledby="limited-orders-title">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle id="limited-orders-title">{t('limited:orders.title')}</CardTitle>
          {orders.data ? (
            <Badge variant="secondary">
              <span className="sr-only">
                {t('limited:orders.count', { count: orderRows.length })}
              </span>
              <span aria-hidden="true">{orderRows.length}</span>
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.isPending ? (
            <ListSkeleton />
          ) : orders.error ? (
            <>
              <ErrorBanner error={orders.error} fallback={t('limited:orders.error')} />
              <Button variant="outline" size="sm" onClick={() => void orders.refetch()}>
                {t('common:action.retry')}
              </Button>
            </>
          ) : orderRows.length === 0 ? (
            <EmptyBox text={t('limited:orders.empty')} />
          ) : (
            <ul className="grid gap-2">
              {orderRows.map((order) => (
                <li
                  key={order.id}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{order.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                  </div>
                  <Badge variant="secondary">{t(`limited:status.${order.status}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0" role="region" aria-labelledby="limited-request-title">
        <CardHeader>
          <CardTitle id="limited-request-title">{t('limited:request.title')}</CardTitle>
          <CardDescription>{t('limited:request.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div aria-live="polite">
            {statusMessage ? (
              <p
                role="status"
                className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground"
              >
                {statusMessage}
              </p>
            ) : null}
          </div>
          {properties.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : propertyRows.length === 0 ? (
            <div className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
              <p className="font-medium">{t('limited:request.noPropertiesTitle')}</p>
              <p className="mt-1">{t('limited:request.noProperties')}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="request-property">{t('limited:request.propertyLabel')}</Label>
                <Select
                  value={propertyId}
                  onValueChange={(value) =>
                    setValue('propertyId', value, { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="request-property" className="w-full">
                    <SelectValue placeholder={t('limited:request.propertyLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {propertyRows.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {t('limited:request.propertyOption', {
                          address: property.addressLine,
                          city: property.city,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="request-property-error" message={errors.propertyId?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="request-title">{t('limited:request.titleLabel')}</Label>
                <Input
                  id="request-title"
                  placeholder={t('limited:request.titlePlaceholder')}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? 'request-title-error' : undefined}
                  {...register('title')}
                />
                <FieldError id="request-title-error" message={errors.title?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="request-description">{t('limited:request.descriptionLabel')}</Label>
                <Textarea
                  id="request-description"
                  rows={4}
                  placeholder={t('limited:request.descriptionPlaceholder')}
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={errors.description ? 'request-description-error' : undefined}
                  {...register('description')}
                />
                <FieldError id="request-description-error" message={errors.description?.message} />
              </div>

              <ErrorBanner error={formError} fallback={t('limited:error')} />

              <Button type="submit" disabled={createRequest.isPending}>
                {createRequest.isPending
                  ? t('limited:request.submitting')
                  : t('limited:request.submit')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* §11.3 (F3-D5): only rendered when the server sent at least one
          invoice — a housing account never has any. */}
      {invoiceRows.length > 0 ? (
        <Card className="min-w-0" role="region" aria-labelledby="limited-invoices-title">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle id="limited-invoices-title">{t('limited:invoices.title')}</CardTitle>
            <Badge variant="secondary">
              <span className="sr-only">
                {t('limited:invoices.count', { count: invoiceRows.length })}
              </span>
              <span aria-hidden="true">{invoiceRows.length}</span>
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoices.isPending ? (
              <ListSkeleton />
            ) : invoices.error ? (
              <>
                <ErrorBanner error={invoices.error} fallback={t('limited:invoices.error')} />
                <Button variant="outline" size="sm" onClick={() => void invoices.refetch()}>
                  {t('common:action.retry')}
                </Button>
              </>
            ) : (
              <ul className="grid gap-2">
                {invoiceRows.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      to={`/limited/${encodeURIComponent(token)}/invoices/${invoice.id}`}
                      aria-label={t('limited:invoices.openAria', {
                        number: invoice.number ?? '—',
                      })}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {invoice.number !== null
                            ? t('limited:invoices.number', { number: invoice.number })
                            : invoice.orderTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {invoice.total
                            ? `${t('limited:invoices.total')}: ${invoiceMoney(invoice.total)}`
                            : ''}
                          {invoice.balance
                            ? ` · ${t('limited:invoices.balance')}: ${invoiceMoney(invoice.balance)}`
                            : ''}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {t(`limited:invoices.status.${invoice.status}`)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </LimitedShell>
  );
}
