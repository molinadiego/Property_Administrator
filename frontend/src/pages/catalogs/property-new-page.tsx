import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useCreateProperty } from '@/catalogs/queries';
import { useActiveCompany } from '@/companies/active-company';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBanner } from '@/catalogs/ui';
import {
  PropertyForm,
  propertyToValues,
  propertyValuesToDto,
  type PropertyFormValues,
} from './property-form';

/** New property (`/app/catalogs/properties/new`, spec F3 §2.1): any active
 * member registers a ficha (§5.1); on success the detail opens. */
export function PropertyNewPage() {
  const { t } = useTranslation(['catalogs', 'errors']);
  const navigate = useNavigate();
  const { activeId } = useActiveCompany();
  const create = useCreateProperty(activeId ?? '');

  const onSubmit = (values: PropertyFormValues) => {
    create
      .mutateAsync(propertyValuesToDto(values))
      .then((property) => navigate(`/app/catalogs/properties/${property.id}`))
      .catch(() => {
        // RFC 7807 detail rendered by the banner below (F0-D4).
      });
  };

  if (!activeId) return null;

  return (
    <Card className="min-w-0" role="region" aria-labelledby="property-new-title">
      <CardHeader>
        <CardTitle id="property-new-title">{t('catalogs:form.createTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBanner error={create.error} fallback={t('errors:unknown')} />
        <PropertyForm
          defaultValues={propertyToValues(null)}
          onSubmit={onSubmit}
          isPending={create.isPending}
          submitLabel={t('catalogs:form.create')}
          submittingLabel={t('catalogs:form.creating')}
          onCancel={() => navigate('/app/catalogs/properties')}
        />
      </CardContent>
    </Card>
  );
}
