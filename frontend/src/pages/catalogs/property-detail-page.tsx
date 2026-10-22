import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { PropertyTenantViewDto, PropertyTenantKind } from '@/api/types';
import { ApiError } from '@/api/errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useActiveCompany } from '@/companies/active-company';
import { useAddTenant, useProperty, useUpdateProperty, useUpdateTenant } from '@/catalogs/queries';
import { ErrorBanner, linesToPhones, phonesToLines } from '@/catalogs/ui';
import {
  PropertyForm,
  propertyToValues,
  propertyValuesToDto,
  type PropertyFormValues,
} from './property-form';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Read-only row of the ficha (§4.1, §4.2). */
function DetailRow({ label, value }: { label: string; value: string | null | boolean | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">
        {typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value}
      </dd>
    </div>
  );
}

/** Add-tenant dialog (spec F3 §2.1): `kind` + name required; the optional
 * email delivers the limited-access link (§4.3) — `accessIssued` confirms it. */
function AddTenantDialog({
  companyId,
  propertyId,
  open,
  onOpenChange,
  onCreated,
}: {
  companyId: string;
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (message: string) => void;
}) {
  const { t } = useTranslation(['catalogs', 'common', 'errors']);
  const addTenant = useAddTenant(companyId, propertyId);
  const [formError, setFormError] = useState<unknown>(null);

  const schema = z.object({
    kind: z.enum(['owner', 'tenant']),
    name: z.string().trim().min(1, t('catalogs:tenants.nameRequired')).max(200),
    phonesLines: z
      .string()
      .refine((value) => linesToPhones(value).length <= 5, t('catalogs:tenants.phonesTooMany'))
      .refine(
        (value) => linesToPhones(value).every((phone) => phone.length <= 50),
        t('catalogs:tenants.phoneTooLong'),
      ),
    address: z.string().trim().max(300),
    availability: z.string().trim().max(500),
    email: z
      .string()
      .trim()
      .max(200)
      .refine(
        (value) => value === '' || z.email().safeParse(value).success,
        t('catalogs:form.invalidEmail'),
      ),
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
    defaultValues: { kind: 'tenant', name: '', phonesLines: '', address: '', availability: '', email: '' },
  });

  const kind = watch('kind');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await addTenant.mutateAsync({
        kind: values.kind,
        name: values.name,
        phones: linesToPhones(values.phonesLines),
        address: values.address || undefined,
        availability: values.availability || undefined,
        email: values.email || undefined,
      });
      onCreated(
        result.accessIssued
          ? `${t('catalogs:tenants.created')} ${t('catalogs:tenants.accessIssued')}`
          : t('catalogs:tenants.created'),
      );
      reset();
      onOpenChange(false);
    } catch (error) {
      setFormError(error);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
          setFormError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('catalogs:tenants.addTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-kind">{t('catalogs:tenants.kindLabel')}</Label>
            <Select
              value={kind}
              onValueChange={(value) =>
                setValue('kind', value as Values['kind'], { shouldValidate: true })
              }
            >
              <SelectTrigger id="tenant-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">{t('catalogs:tenants.kind.owner')}</SelectItem>
                <SelectItem value="tenant">{t('catalogs:tenants.kind.tenant')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">{t('catalogs:tenants.nameLabel')}</Label>
            <Input
              id="tenant-name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'tenant-name-error' : undefined}
              {...register('name')}
            />
            <FieldError id="tenant-name-error" message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-phones">{t('catalogs:tenants.phonesLabel')}</Label>
            <Textarea
              id="tenant-phones"
              rows={2}
              aria-invalid={errors.phonesLines ? true : undefined}
              aria-describedby={errors.phonesLines ? 'tenant-phones-error' : undefined}
              {...register('phonesLines')}
            />
            <FieldError id="tenant-phones-error" message={errors.phonesLines?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-address">{t('catalogs:tenants.addressLabel')}</Label>
            <Input
              id="tenant-address"
              aria-invalid={errors.address ? true : undefined}
              aria-describedby={errors.address ? 'tenant-address-error' : undefined}
              {...register('address')}
            />
            <FieldError id="tenant-address-error" message={errors.address?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-availability">{t('catalogs:tenants.availabilityLabel')}</Label>
            <Textarea
              id="tenant-availability"
              rows={2}
              aria-invalid={errors.availability ? true : undefined}
              aria-describedby={errors.availability ? 'tenant-availability-error' : undefined}
              {...register('availability')}
            />
            <FieldError id="tenant-availability-error" message={errors.availability?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-email">{t('catalogs:tenants.emailLabel')}</Label>
            <Input
              id="tenant-email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={
                errors.email ? 'tenant-email-error' : 'tenant-email-hint'
              }
              {...register('email')}
            />
            {errors.email ? (
              <FieldError id="tenant-email-error" message={errors.email.message} />
            ) : (
              <p id="tenant-email-hint" className="text-xs text-muted-foreground">
                {t('catalogs:tenants.emailHint')}
              </p>
            )}
          </div>

          <ErrorBanner error={formError} fallback={t('catalogs:actionFailed')} />

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={addTenant.isPending}>
              {addTenant.isPending
                ? t('catalogs:tenants.adding')
                : t('catalogs:tenants.submitAdd')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edit-tenant dialog: `UpdateTenantDto` — no email, no kind (spec F3-D6). */
function EditTenantDialog({
  companyId,
  propertyId,
  tenant,
  open,
  onOpenChange,
  onSaved,
}: {
  companyId: string;
  propertyId: string;
  tenant: PropertyTenantViewDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation(['catalogs', 'common']);
  const updateTenant = useUpdateTenant(companyId, propertyId);
  const [formError, setFormError] = useState<unknown>(null);

  const schema = z.object({
    name: z.string().trim().min(1, t('catalogs:tenants.nameRequired')).max(200),
    phonesLines: z
      .string()
      .refine((value) => linesToPhones(value).length <= 5, t('catalogs:tenants.phonesTooMany'))
      .refine(
        (value) => linesToPhones(value).every((phone) => phone.length <= 50),
        t('catalogs:tenants.phoneTooLong'),
      ),
    address: z.string().trim().max(300),
    availability: z.string().trim().max(500),
  });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    values: {
      name: tenant?.name ?? '',
      phonesLines: phonesToLines(tenant?.phones),
      address: tenant?.address ?? '',
      availability: tenant?.availability ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!tenant) return;
    setFormError(null);
    try {
      await updateTenant.mutateAsync({
        tenantId: tenant.id,
        name: values.name,
        phones: linesToPhones(values.phonesLines),
        address: values.address || undefined,
        availability: values.availability || undefined,
      });
      onSaved(t('catalogs:tenants.updated'));
      reset();
      onOpenChange(false);
    } catch (error) {
      setFormError(error);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
          setFormError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('catalogs:tenants.editTitle')}
            {tenant ? `: ${tenant.name}` : ''}
          </DialogTitle>
          <DialogDescription>{t('catalogs:tenants.noEmailNote')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-edit-name">{t('catalogs:tenants.nameLabel')}</Label>
            <Input
              id="tenant-edit-name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'tenant-edit-name-error' : undefined}
              {...register('name')}
            />
            <FieldError id="tenant-edit-name-error" message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-edit-phones">{t('catalogs:tenants.phonesLabel')}</Label>
            <Textarea
              id="tenant-edit-phones"
              rows={2}
              aria-invalid={errors.phonesLines ? true : undefined}
              aria-describedby={errors.phonesLines ? 'tenant-edit-phones-error' : undefined}
              {...register('phonesLines')}
            />
            <FieldError id="tenant-edit-phones-error" message={errors.phonesLines?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-edit-address">{t('catalogs:tenants.addressLabel')}</Label>
            <Input
              id="tenant-edit-address"
              aria-invalid={errors.address ? true : undefined}
              aria-describedby={errors.address ? 'tenant-edit-address-error' : undefined}
              {...register('address')}
            />
            <FieldError id="tenant-edit-address-error" message={errors.address?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-edit-availability">
              {t('catalogs:tenants.availabilityLabel')}
            </Label>
            <Textarea
              id="tenant-edit-availability"
              rows={2}
              aria-invalid={errors.availability ? true : undefined}
              aria-describedby={
                errors.availability ? 'tenant-edit-availability-error' : undefined
              }
              {...register('availability')}
            />
            <FieldError
              id="tenant-edit-availability-error"
              message={errors.availability?.message}
            />
          </div>

          <ErrorBanner error={formError} fallback={t('catalogs:actionFailed')} />

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={updateTenant.isPending}>
              {updateTenant.isPending
                ? t('catalogs:tenants.saving')
                : t('catalogs:tenants.submitEdit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Property detail (spec F3-D4, `/app/catalogs/properties/:propertyId`):
 * official data readable by any member of the owning space; edited only from
 * `property_management` spaces (§4.4, matriz #16/#18). The tenants section
 * (§4.3) is operational data any active member maintains.
 */
export function PropertyDetailPage() {
  const { t } = useTranslation(['catalogs', 'common', 'errors']);
  const { propertyId = '' } = useParams();
  const { active, activeId } = useActiveCompany();
  const companyId = activeId ?? '';
  const detail = useProperty(companyId, propertyId);
  const updateProperty = useUpdateProperty(companyId, propertyId);

  const [editing, setEditing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<PropertyTenantViewDto | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const canEditOfficial = active?.companyType === 'property_management';

  const onEditSubmit = (values: PropertyFormValues) => {
    updateProperty
      .mutateAsync(propertyValuesToDto(values))
      .then(() => {
        setEditing(false);
        setStatusMessage(t('catalogs:form.updated'));
      })
      .catch((error: unknown) => {
        // RFC 7807 detail below; the server is the authority (matriz #16/#18).
        setActionError(error);
      });
  };

  if (!activeId) return null;

  if (detail.isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Card className="min-w-0">
        <CardContent className="space-y-3 pt-6">
          <ErrorBanner
            error={detail.error}
            fallback={notFound ? t('errors:notFound') : t('catalogs:properties.error')}
          />
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/catalogs/properties">{t('common:action.back')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const property = detail.data;
  const tenants = property.tenants ?? [];

  return (
    <div className="min-w-0 space-y-4">
      <nav aria-label={t('catalogs:properties.title')}>
        <Link
          to="/app/catalogs/properties"
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('catalogs:properties.title')}
        </Link>
      </nav>

      <Card className="min-w-0" role="region" aria-labelledby="property-detail-title">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle id="property-detail-title" className="flex min-w-0 items-center gap-2">
            <span className="truncate">{property.addressLine}</span>
            <Badge variant="secondary">
              {t(`catalogs:properties.occupancy.${property.occupancy}`)}
            </Badge>
          </CardTitle>
          {canEditOfficial && !editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {t('catalogs:form.edit')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div aria-live="polite">
            {statusMessage ? (
              <p role="status" className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
                {statusMessage}
              </p>
            ) : null}
            <ErrorBanner error={actionError} fallback={t('catalogs:actionFailed')} />
          </div>

          {!canEditOfficial ? (
            <p className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
              {t('catalogs:form.readOnlyNote')}
            </p>
          ) : null}

          {editing ? (
            <PropertyForm
              defaultValues={propertyToValues(property)}
              onSubmit={onEditSubmit}
              isPending={updateProperty.isPending}
              submitLabel={t('catalogs:form.save')}
              submittingLabel={t('catalogs:form.saving')}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <section aria-labelledby="property-address-heading" className="space-y-1.5">
                <h3 id="property-address-heading" className="text-base font-semibold text-foreground">
                  {t('catalogs:form.section.address')}
                </h3>
                <dl className="space-y-1.5">
                  <DetailRow label={t('catalogs:form.addressLine')} value={property.addressLine} />
                  <DetailRow label={t('catalogs:form.city')} value={property.city} />
                  <DetailRow label={t('catalogs:form.state')} value={property.state} />
                  <DetailRow label={t('catalogs:form.postalCode')} value={property.postalCode} />
                </dl>
              </section>

              <section aria-labelledby="property-owner-heading" className="space-y-1.5">
                <h3 id="property-owner-heading" className="text-base font-semibold text-foreground">
                  {t('catalogs:form.section.owner')}
                </h3>
                <dl className="space-y-1.5">
                  <DetailRow label={t('catalogs:form.ownerName')} value={property.owner.name} />
                  <DetailRow label={t('catalogs:form.ownerPhone')} value={property.owner.phone} />
                  <DetailRow label={t('catalogs:form.ownerEmail')} value={property.owner.email} />
                  <DetailRow label={t('catalogs:form.ownerAddress')} value={property.owner.address} />
                  <DetailRow label={t('catalogs:form.ownerCity')} value={property.owner.city} />
                  <DetailRow label={t('catalogs:form.ownerState')} value={property.owner.state} />
                  <DetailRow
                    label={t('catalogs:form.ownerPostalCode')}
                    value={property.owner.postalCode}
                  />
                </dl>
              </section>

              <section aria-labelledby="property-community-heading" className="space-y-1.5">
                <h3
                  id="property-community-heading"
                  className="text-base font-semibold text-foreground"
                >
                  {t('catalogs:form.section.community')}
                </h3>
                <dl className="space-y-1.5">
                  <DetailRow label={t('catalogs:form.communityName')} value={property.community.name} />
                  <DetailRow
                    label={t('catalogs:form.communityAccessCode')}
                    value={property.community.accessCode}
                  />
                </dl>
              </section>

              <section aria-labelledby="property-instructions-heading" className="space-y-1.5">
                <h3
                  id="property-instructions-heading"
                  className="text-base font-semibold text-foreground"
                >
                  {t('catalogs:form.section.instructions')}
                </h3>
                <dl className="space-y-1.5">
                  <DetailRow
                    label={t('catalogs:form.entryInstructions')}
                    value={property.entryInstructions}
                  />
                  <DetailRow
                    label={t('catalogs:form.allowUnattendedEntry')}
                    value={property.allowUnattendedEntry}
                  />
                  <DetailRow label={t('catalogs:form.petsInfo')} value={property.petsInfo} />
                  <DetailRow
                    label={t('catalogs:form.otherInstructions')}
                    value={property.otherInstructions}
                  />
                </dl>
              </section>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0" role="region" aria-labelledby="property-tenants-title">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle id="property-tenants-title">{t('catalogs:tenants.title')}</CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            {t('catalogs:tenants.add')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenants.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t('catalogs:tenants.empty')}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {tenants.map((tenant) => (
                <li
                  key={tenant.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(tenant.phones ?? []).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">
                      {t(`catalogs:tenants.kind.${tenant.kind as PropertyTenantKind}`)}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t('catalogs:tenants.editAria', { name: tenant.name })}
                      onClick={() => {
                        setEditTenant(tenant);
                        setEditOpen(true);
                      }}
                    >
                      {t('catalogs:tenants.edit')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddTenantDialog
        companyId={companyId}
        propertyId={propertyId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={setStatusMessage}
      />
      <EditTenantDialog
        companyId={companyId}
        propertyId={propertyId}
        tenant={editTenant}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={setStatusMessage}
      />
    </div>
  );
}
