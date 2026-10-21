import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { CreateOrderDto } from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';
import { useActiveCompany } from '@/companies/active-company';
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
import { Textarea } from '@/components/ui/textarea';
import { useClients, useProperties } from '@/catalogs/queries';
import { ErrorBanner } from '@/catalogs/ui';
import { useCreateOrder } from '@/orders/queries';

/**
 * Order creation (spec F4 §2.2, §5.1): property + title + description are
 * required, urgency (§14.2), the visit access data (§5.8) and the own client
 * are optional — the client select only renders for `own_business` spaces
 * (§2.3). Economic fields (spending limit, margin) belong to F6 and are not
 * offered here. Validation mirrors `CreateOrderDto`; the server validates
 * again (RFC 7807 detail in the banner).
 */
export function OrderNewPage() {
  const { t } = useTranslation(['orders', 'common']);
  const { active, activeId } = useActiveCompany();
  const navigate = useNavigate();
  const properties = useProperties(activeId ?? '');
  const isOwnBusiness = active?.companyType === 'own_business';
  const clients = useClients(activeId ?? '');
  const createOrder = useCreateOrder(activeId ?? '');

  const schema = z.object({
    propertyId: z.string().min(1, t('orders:form.required')),
    title: z
      .string()
      .trim()
      .min(1, t('orders:form.required'))
      .max(300, t('orders:form.titleTooLong')),
    description: z
      .string()
      .trim()
      .min(1, t('orders:form.required'))
      .max(5000, t('orders:form.descriptionTooLong')),
    urgent: z.boolean(),
    accessLockbox: z
      .string()
      .trim()
      .max(50, t('orders:form.accessTooLong', { max: 50 })),
    accessCommunityCode: z
      .string()
      .trim()
      .max(50, t('orders:form.accessTooLong', { max: 50 })),
    accessEntryInstructions: z
      .string()
      .trim()
      .max(2000, t('orders:form.accessTooLong', { max: 2000 })),
    clientRelationshipId: z.string(),
  });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      propertyId: '',
      title: '',
      description: '',
      urgent: false,
      accessLockbox: '',
      accessCommunityCode: '',
      accessEntryInstructions: '',
      clientRelationshipId: '',
    },
  });

  const propertyId = watch('propertyId');
  const clientRelationshipId = watch('clientRelationshipId');
  const hasProperties = (properties.data ?? []).length > 0;

  const onSubmit = handleSubmit(async (values) => {
    if (!activeId) return;
    const body: CreateOrderDto = {
      propertyId: values.propertyId,
      title: values.title,
      description: values.description,
      // The schema marks it required with default true (F6 owns the economics);
      // sending it explicitly keeps the server behaviour of omitting it.
      applyCompanyDefault: true,
      ...(values.accessLockbox ? { accessLockbox: values.accessLockbox } : {}),
      ...(values.accessCommunityCode ? { accessCommunityCode: values.accessCommunityCode } : {}),
      ...(values.accessEntryInstructions
        ? { accessEntryInstructions: values.accessEntryInstructions }
        : {}),
      ...(values.clientRelationshipId ? { clientRelationshipId: values.clientRelationshipId } : {}),
    };
    try {
      const created = await createOrder.mutateAsync(body);
      if (values.urgent) {
        // `CreateOrderDto` has no `urgent` (only PATCH does), so the mark is a
        // best-effort second call; on failure the order still opens and the
        // detail's «Editar instrucciones» sets it (spec F4 §11).
        try {
          await callApi(
            api.PATCH('/api/v1/companies/{id}/orders/{orderId}', {
              params: { path: { id: activeId, orderId: created.id } },
              body: { urgent: true },
            }),
          );
        } catch {
          // The created order wins: never leave the user on a stale form.
        }
      }
      navigate(`/app/orders/${created.id}`);
    } catch {
      // RFC 7807 detail renders in the banner below (spec F4 §6/§11).
    }
  });

  if (!activeId) return null;

  return (
    <Card className="mx-auto w-full max-w-2xl" role="region" aria-labelledby="order-new-title">
      <CardHeader>
        <CardTitle id="order-new-title">{t('orders:new.title')}</CardTitle>
        <CardDescription>{t('orders:new.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="order-property">{t('orders:new.property')}</Label>
            <Select
              value={propertyId}
              onValueChange={(value) =>
                setValue('propertyId', value, { shouldValidate: true })
              }
            >
              <SelectTrigger
                id="order-property"
                className="w-full"
                aria-invalid={errors.propertyId ? true : undefined}
                aria-describedby={errors.propertyId ? 'order-property-error' : undefined}
              >
                <SelectValue placeholder={t('orders:new.propertyPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {(properties.data ?? []).map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.addressLine}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.propertyId ? (
              <p id="order-property-error" role="alert" className="text-sm text-destructive">
                {errors.propertyId.message}
              </p>
            ) : null}
            {properties.data && !hasProperties ? (
              <p className="text-sm text-muted-foreground">{t('orders:new.noProperties')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order-title">{t('orders:new.orderTitle')}</Label>
            <Input
              id="order-title"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? 'order-title-error' : undefined}
              {...register('title')}
            />
            {errors.title ? (
              <p id="order-title-error" role="alert" className="text-sm text-destructive">
                {errors.title.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order-description">{t('orders:new.orderDescription')}</Label>
            <Textarea
              id="order-description"
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? 'order-description-error' : undefined}
              {...register('description')}
            />
            {errors.description ? (
              <p id="order-description-error" role="alert" className="text-sm text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <label className="flex w-fit items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="size-4 accent-primary" {...register('urgent')} />
            {t('orders:new.urgentLabel')}
          </label>

          <fieldset className="space-y-4">
            <legend className="text-base font-semibold text-foreground">
              {t('orders:new.accessLegend')}
            </legend>
            <p className="text-sm text-muted-foreground">{t('orders:new.accessHint')}</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="order-lockbox">{t('orders:new.accessLockbox')}</Label>
                <Input
                  id="order-lockbox"
                  maxLength={50}
                  aria-invalid={errors.accessLockbox ? true : undefined}
                  aria-describedby={errors.accessLockbox ? 'order-lockbox-error' : undefined}
                  {...register('accessLockbox')}
                />
                {errors.accessLockbox ? (
                  <p id="order-lockbox-error" role="alert" className="text-sm text-destructive">
                    {errors.accessLockbox.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-community">{t('orders:new.accessCommunityCode')}</Label>
                <Input
                  id="order-community"
                  maxLength={50}
                  aria-invalid={errors.accessCommunityCode ? true : undefined}
                  aria-describedby={errors.accessCommunityCode ? 'order-community-error' : undefined}
                  {...register('accessCommunityCode')}
                />
                {errors.accessCommunityCode ? (
                  <p id="order-community-error" role="alert" className="text-sm text-destructive">
                    {errors.accessCommunityCode.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="order-entry">{t('orders:new.accessEntryInstructions')}</Label>
                <Textarea
                  id="order-entry"
                  maxLength={2000}
                  aria-invalid={errors.accessEntryInstructions ? true : undefined}
                  aria-describedby={
                    errors.accessEntryInstructions ? 'order-entry-error' : undefined
                  }
                  {...register('accessEntryInstructions')}
                />
                {errors.accessEntryInstructions ? (
                  <p id="order-entry-error" role="alert" className="text-sm text-destructive">
                    {errors.accessEntryInstructions.message}
                  </p>
                ) : null}
              </div>
            </div>
          </fieldset>

          {isOwnBusiness ? (
            <div className="space-y-1.5">
              <Label htmlFor="order-client">{t('orders:new.client')}</Label>
              <Select
                value={clientRelationshipId}
                onValueChange={(value) =>
                  setValue('clientRelationshipId', value, { shouldValidate: true })
                }
              >
                <SelectTrigger id="order-client" className="w-full">
                  <SelectValue placeholder={t('orders:new.clientPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.relationshipId} value={client.relationshipId}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <ErrorBanner error={createOrder.error} fallback={t('orders:new.error')} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={createOrder.isPending}>
              {createOrder.isPending ? t('orders:new.submitting') : t('orders:new.submit')}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/app/orders">{t('common:action.cancel')}</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
