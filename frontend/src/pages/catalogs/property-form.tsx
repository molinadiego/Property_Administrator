import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { CreatePropertyDto, PropertyViewDto } from '@/api/types';
import { Button } from '@/components/ui/button';
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

/**
 * Property form (spec F3 §6): validation mirrors `CreatePropertyDto` —
 * `addressLine`/`city`/`state` required, everything else optional. The server
 * normalises empty strings to null and validates again (RFC 7807 detail).
 */
export function usePropertySchema() {
  const { t } = useTranslation('catalogs');

  const required = (max: number) =>
    z
      .string()
      .trim()
      .min(1, t('form.required'))
      .max(max, t('form.tooLong', { max }));

  const optional = (max: number) =>
    z.string().trim().max(max, t('form.tooLong', { max }));

  return z.object({
    addressLine: required(300),
    city: required(120),
    state: required(120),
    postalCode: optional(20),
    occupancy: z.enum(['occupied', 'vacant']),
    ownerName: optional(200),
    ownerPhone: optional(50),
    ownerEmail: optional(200).refine(
      (value) => value === '' || z.email().safeParse(value).success,
      t('form.invalidEmail'),
    ),
    ownerAddress: optional(300),
    ownerCity: optional(120),
    ownerState: optional(120),
    ownerPostalCode: optional(20),
    communityName: optional(200),
    communityAccessCode: optional(50),
    entryInstructions: optional(2000),
    allowUnattendedEntry: z.boolean(),
    petsInfo: optional(1000),
    otherInstructions: optional(2000),
  });
}

export type PropertyFormValues = z.infer<ReturnType<typeof usePropertySchema>>;

/** Form values → DTO body (strings trimmed by the schema; booleans as-is). */
export function propertyValuesToDto(values: PropertyFormValues): CreatePropertyDto {
  return {
    addressLine: values.addressLine,
    city: values.city,
    state: values.state,
    postalCode: values.postalCode,
    occupancy: values.occupancy,
    ownerName: values.ownerName,
    ownerPhone: values.ownerPhone,
    ownerEmail: values.ownerEmail,
    ownerAddress: values.ownerAddress,
    ownerCity: values.ownerCity,
    ownerState: values.ownerState,
    ownerPostalCode: values.ownerPostalCode,
    communityName: values.communityName,
    communityAccessCode: values.communityAccessCode,
    entryInstructions: values.entryInstructions,
    allowUnattendedEntry: values.allowUnattendedEntry,
    petsInfo: values.petsInfo,
    otherInstructions: values.otherInstructions,
  };
}

/** A ficha (or empty values) → form defaults. */
export function propertyToValues(
  property: Pick<
    PropertyViewDto,
    | 'addressLine'
    | 'city'
    | 'state'
    | 'postalCode'
    | 'occupancy'
    | 'owner'
    | 'community'
    | 'entryInstructions'
    | 'allowUnattendedEntry'
    | 'petsInfo'
    | 'otherInstructions'
  > | null,
): PropertyFormValues {
  return {
    addressLine: property?.addressLine ?? '',
    city: property?.city ?? '',
    state: property?.state ?? '',
    postalCode: property?.postalCode ?? '',
    occupancy: property?.occupancy ?? 'vacant',
    ownerName: property?.owner.name ?? '',
    ownerPhone: property?.owner.phone ?? '',
    ownerEmail: property?.owner.email ?? '',
    ownerAddress: property?.owner.address ?? '',
    ownerCity: property?.owner.city ?? '',
    ownerState: property?.owner.state ?? '',
    ownerPostalCode: property?.owner.postalCode ?? '',
    communityName: property?.community.name ?? '',
    communityAccessCode: property?.community.accessCode ?? '',
    entryInstructions: property?.entryInstructions ?? '',
    allowUnattendedEntry: property?.allowUnattendedEntry ?? false,
    petsInfo: property?.petsInfo ?? '',
    otherInstructions: property?.otherInstructions ?? '',
  };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export interface PropertyFormProps {
  defaultValues: PropertyFormValues;
  onSubmit: (values: PropertyFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  submittingLabel: string;
  onCancel?: () => void;
}

/** The full ficha form: address, occupancy, owner (§4.1), community and
 * operating instructions (§4.2). Labels associate with inputs; errors sit by
 * the field with `aria-describedby` (spec F3 §9). */
export function PropertyForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  submittingLabel,
  onCancel,
}: PropertyFormProps) {
  const { t } = useTranslation(['catalogs', 'common']);
  const schema = usePropertySchema();
  type Values = PropertyFormValues;

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
    defaultValues,
  });

  const occupancy = watch('occupancy');
  const allowUnattended = watch('allowUnattendedEntry');

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-foreground">
          {t('catalogs:form.section.address')}
        </legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="property-address">{t('catalogs:form.addressLine')}</Label>
            <Input
              id="property-address"
              aria-invalid={errors.addressLine ? true : undefined}
              aria-describedby={errors.addressLine ? 'property-address-error' : undefined}
              {...register('addressLine')}
            />
            <FieldError id="property-address-error" message={errors.addressLine?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-city">{t('catalogs:form.city')}</Label>
            <Input
              id="property-city"
              aria-invalid={errors.city ? true : undefined}
              aria-describedby={errors.city ? 'property-city-error' : undefined}
              {...register('city')}
            />
            <FieldError id="property-city-error" message={errors.city?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-state">{t('catalogs:form.state')}</Label>
            <Input
              id="property-state"
              aria-invalid={errors.state ? true : undefined}
              aria-describedby={errors.state ? 'property-state-error' : undefined}
              {...register('state')}
            />
            <FieldError id="property-state-error" message={errors.state?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-postal">{t('catalogs:form.postalCode')}</Label>
            <Input
              id="property-postal"
              aria-invalid={errors.postalCode ? true : undefined}
              aria-describedby={errors.postalCode ? 'property-postal-error' : undefined}
              {...register('postalCode')}
            />
            <FieldError id="property-postal-error" message={errors.postalCode?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-occupancy">{t('catalogs:form.occupancyLabel')}</Label>
            <Select
              value={occupancy}
              onValueChange={(value) =>
                setValue('occupancy', value as Values['occupancy'], { shouldValidate: true })
              }
            >
              <SelectTrigger id="property-occupancy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacant">{t('catalogs:form.occupancyVacant')}</SelectItem>
                <SelectItem value="occupied">{t('catalogs:form.occupancyOccupied')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-foreground">
          {t('catalogs:form.section.owner')}
        </legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="property-owner-name">{t('catalogs:form.ownerName')}</Label>
            <Input
              id="property-owner-name"
              aria-invalid={errors.ownerName ? true : undefined}
              aria-describedby={errors.ownerName ? 'property-owner-name-error' : undefined}
              {...register('ownerName')}
            />
            <FieldError id="property-owner-name-error" message={errors.ownerName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-owner-phone">{t('catalogs:form.ownerPhone')}</Label>
            <Input
              id="property-owner-phone"
              aria-invalid={errors.ownerPhone ? true : undefined}
              aria-describedby={errors.ownerPhone ? 'property-owner-phone-error' : undefined}
              {...register('ownerPhone')}
            />
            <FieldError id="property-owner-phone-error" message={errors.ownerPhone?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-owner-email">{t('catalogs:form.ownerEmail')}</Label>
            <Input
              id="property-owner-email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.ownerEmail ? true : undefined}
              aria-describedby={errors.ownerEmail ? 'property-owner-email-error' : undefined}
              {...register('ownerEmail')}
            />
            <FieldError id="property-owner-email-error" message={errors.ownerEmail?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-owner-address">{t('catalogs:form.ownerAddress')}</Label>
            <Input
              id="property-owner-address"
              aria-invalid={errors.ownerAddress ? true : undefined}
              aria-describedby={errors.ownerAddress ? 'property-owner-address-error' : undefined}
              {...register('ownerAddress')}
            />
            <FieldError id="property-owner-address-error" message={errors.ownerAddress?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-owner-city">{t('catalogs:form.ownerCity')}</Label>
            <Input
              id="property-owner-city"
              aria-invalid={errors.ownerCity ? true : undefined}
              aria-describedby={errors.ownerCity ? 'property-owner-city-error' : undefined}
              {...register('ownerCity')}
            />
            <FieldError id="property-owner-city-error" message={errors.ownerCity?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-owner-state">{t('catalogs:form.ownerState')}</Label>
            <Input
              id="property-owner-state"
              aria-invalid={errors.ownerState ? true : undefined}
              aria-describedby={errors.ownerState ? 'property-owner-state-error' : undefined}
              {...register('ownerState')}
            />
            <FieldError id="property-owner-state-error" message={errors.ownerState?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-owner-postal">{t('catalogs:form.ownerPostalCode')}</Label>
            <Input
              id="property-owner-postal"
              aria-invalid={errors.ownerPostalCode ? true : undefined}
              aria-describedby={errors.ownerPostalCode ? 'property-owner-postal-error' : undefined}
              {...register('ownerPostalCode')}
            />
            <FieldError id="property-owner-postal-error" message={errors.ownerPostalCode?.message} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-foreground">
          {t('catalogs:form.section.community')}
        </legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="property-community">{t('catalogs:form.communityName')}</Label>
            <Input
              id="property-community"
              aria-invalid={errors.communityName ? true : undefined}
              aria-describedby={errors.communityName ? 'property-community-error' : undefined}
              {...register('communityName')}
            />
            <FieldError id="property-community-error" message={errors.communityName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="property-access-code">
              {t('catalogs:form.communityAccessCode')}
            </Label>
            <Input
              id="property-access-code"
              aria-invalid={errors.communityAccessCode ? true : undefined}
              aria-describedby={
                errors.communityAccessCode
                  ? 'property-access-code-error'
                  : 'property-access-code-hint'
              }
              {...register('communityAccessCode')}
            />
            {errors.communityAccessCode ? (
              <FieldError id="property-access-code-error" message={errors.communityAccessCode.message} />
            ) : (
              <p id="property-access-code-hint" className="text-xs text-muted-foreground">
                {t('catalogs:form.communityAccessCodeHint')}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-foreground">
          {t('catalogs:form.section.instructions')}
        </legend>
        <div className="space-y-1.5">
          <Label htmlFor="property-entry">{t('catalogs:form.entryInstructions')}</Label>
          <Textarea
            id="property-entry"
            aria-invalid={errors.entryInstructions ? true : undefined}
            aria-describedby={errors.entryInstructions ? 'property-entry-error' : undefined}
            {...register('entryInstructions')}
          />
          <FieldError id="property-entry-error" message={errors.entryInstructions?.message} />
        </div>
        <div className="flex items-center gap-2">
          {/* Native checkbox: the design system has no checkbox component and
              a new dependency isn't justified for one field (docs/stack.md §6). */}
          <input
            id="property-unattended"
            type="checkbox"
            checked={allowUnattended}
            onChange={(event) =>
              setValue('allowUnattendedEntry', event.target.checked, { shouldValidate: true })
            }
            className="size-4 rounded border-border accent-primary"
          />
          <Label htmlFor="property-unattended" className="font-normal">
            {t('catalogs:form.allowUnattendedEntry')}
          </Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="property-pets">{t('catalogs:form.petsInfo')}</Label>
          <Textarea
            id="property-pets"
            aria-invalid={errors.petsInfo ? true : undefined}
            aria-describedby={errors.petsInfo ? 'property-pets-error' : undefined}
            {...register('petsInfo')}
          />
          <FieldError id="property-pets-error" message={errors.petsInfo?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="property-other">{t('catalogs:form.otherInstructions')}</Label>
          <Textarea
            id="property-other"
            aria-invalid={errors.otherInstructions ? true : undefined}
            aria-describedby={errors.otherInstructions ? 'property-other-error' : undefined}
            {...register('otherInstructions')}
          />
          <FieldError id="property-other-error" message={errors.otherInstructions?.message} />
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? submittingLabel : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('catalogs:form.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
