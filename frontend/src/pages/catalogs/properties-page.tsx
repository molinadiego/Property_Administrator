import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveCompany } from '@/companies/active-company';
import { useProperties } from '@/catalogs/queries';
import { EmptyBox, ErrorBanner, ListSkeleton, formatDate } from '@/catalogs/ui';

/**
 * Property list (spec F3 §2.1): the fichas of the active space with their
 * occupancy badge (§4.2). Any active member may add one (§5.1); the server
 * caps the list at 100 (Etapa 2) and the UI documents the cap.
 */
export function PropertiesPage() {
  const { t } = useTranslation(['catalogs', 'common']);
  const { activeId } = useActiveCompany();
  const properties = useProperties(activeId ?? '');

  const rows = properties.data ?? [];
  const capped = rows.length >= 100;

  if (!activeId) return null;

  return (
    <Card className="min-w-0" role="region" aria-labelledby="properties-title">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle id="properties-title" className="flex items-center gap-2">
          {t('catalogs:properties.title')}
          {properties.data ? (
            <Badge variant="secondary">
              <span className="sr-only">
                {capped
                  ? t('catalogs:properties.capped')
                  : t('catalogs:properties.count', { count: rows.length })}
              </span>
              <span aria-hidden="true">{capped ? '100+' : rows.length}</span>
            </Badge>
          ) : null}
        </CardTitle>
        <Button asChild>
          <Link to="/app/catalogs/properties/new">{t('catalogs:properties.new')}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {properties.isPending ? (
          <ListSkeleton />
        ) : properties.error ? (
          <>
            <ErrorBanner error={properties.error} fallback={t('catalogs:properties.error')} />
            <Button variant="outline" size="sm" onClick={() => void properties.refetch()}>
              {t('common:action.retry')}
            </Button>
          </>
        ) : rows.length === 0 ? (
          <EmptyBox text={t('catalogs:properties.empty')} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((property) => (
              <li key={property.id}>
                <Link
                  to={`/app/catalogs/properties/${property.id}`}
                  aria-label={t('catalogs:properties.openAria', { address: property.addressLine })}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {property.addressLine}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[property.city, property.state].filter(Boolean).join(', ')} ·{' '}
                      {formatDate(property.createdAt)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {t(`catalogs:properties.occupancy.${property.occupancy}`)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
