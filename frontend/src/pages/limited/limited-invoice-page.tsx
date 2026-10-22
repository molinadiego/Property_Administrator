import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { ApiError } from '@/api/errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner, formatDate, invoiceMoney } from '@/catalogs/ui';
import { LimitedInvalidLink, LimitedShell } from '@/limited/portal-shell';
import { downloadLimitedInvoicePdf, useLimitedInvoice } from '@/limited/queries';

/**
 * Invoice detail of the portal (`/limited/:token/invoices/:invoiceId`, spec
 * F3 §2.2): numbers, lines and payments — never the company cost fields a
 * recipient must not see (§11.3). 401 → invalid-link screen, 404 → status.
 */
export function LimitedInvoicePage() {
  const { t } = useTranslation(['limited', 'common']);
  const { token = '', invoiceId = '' } = useParams();
  const invoice = useLimitedInvoice(token, invoiceId);

  if (invoice.error instanceof ApiError && invoice.error.status === 401) {
    return <LimitedInvalidLink />;
  }

  if (invoice.isPending) {
    return (
      <LimitedShell>
        <div role="status" aria-live="polite" className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </LimitedShell>
    );
  }

  if (invoice.error || !invoice.data) {
    return (
      <LimitedShell>
        <Card className="min-w-0">
          <CardContent className="space-y-3 pt-6">
            <ErrorBanner error={invoice.error} fallback={t('limited:invoices.detailError')} />
            <Button variant="outline" size="sm" asChild>
              <Link to={`/limited/${encodeURIComponent(token)}`}>{t('limited:invoices.back')}</Link>
            </Button>
          </CardContent>
        </Card>
      </LimitedShell>
    );
  }

  const data = invoice.data;
  const payments = data.payments.filter((payment) => payment.status === 'recorded');

  return (
    <LimitedShell>
      <nav aria-label={t('limited:invoices.title')}>
        <Link
          to={`/limited/${encodeURIComponent(token)}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('limited:invoices.back')}
        </Link>
      </nav>

      <Card className="min-w-0" role="region" aria-labelledby="invoice-detail-title">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle id="invoice-detail-title" className="flex min-w-0 items-center gap-2">
            <span className="truncate">
              {data.number !== null
                ? t('limited:invoices.number', { number: data.number })
                : data.orderTitle}
            </span>
            <Badge variant="secondary">{t(`limited:invoices.status.${data.status}`)}</Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void downloadLimitedInvoicePdf(token, invoiceId)}
          >
            {t('limited:invoices.downloadPdf')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">{t('limited:invoices.orderLabel')}</dt>
              <dd className="min-w-0 truncate text-sm font-medium text-foreground">
                {data.orderTitle}
              </dd>
            </div>
            {data.dueDate ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-muted-foreground">
                  {t('limited:invoices.dueLabel')}
                </dt>
                <dd className="text-sm font-medium text-foreground">{formatDate(data.dueDate)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">{t('limited:invoices.total')}</dt>
              <dd className="text-sm font-medium text-foreground">{invoiceMoney(data.total)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">{t('limited:invoices.paid')}</dt>
              <dd className="text-sm font-medium text-foreground">{invoiceMoney(data.paidNet)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">{t('limited:invoices.balance')}</dt>
              <dd className="text-sm font-medium text-foreground">{invoiceMoney(data.balance)}</dd>
            </div>
          </dl>

          <section aria-labelledby="invoice-lines-heading" className="space-y-2">
            <h3 id="invoice-lines-heading" className="text-base font-semibold text-foreground">
              {t('limited:invoices.lines')}
            </h3>
            <ul className="grid grid-cols-1 gap-2">
              {data.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {line.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('limited:invoices.lineJob', { title: line.jobTitle })}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-foreground">
                    {invoiceMoney(line.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {payments.length > 0 ? (
            <section aria-labelledby="invoice-payments-heading" className="space-y-2">
              <h3
                id="invoice-payments-heading"
                className="text-base font-semibold text-foreground"
              >
                {t('limited:invoices.payments')}
              </h3>
              <ul className="grid grid-cols-1 gap-2">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <p className="text-sm text-muted-foreground">{formatDate(payment.paidAt)}</p>
                    <p className="shrink-0 text-sm font-medium text-foreground">
                      {invoiceMoney(payment.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </LimitedShell>
  );
}
