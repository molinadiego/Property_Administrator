import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import { SELECTABLE_COMPANY_TYPES } from '@/api/types';
import { ApiError } from '@/api/errors';
import { useActiveCompany } from '@/companies/active-company';
import { useCreateCompany } from '@/companies/create-company';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

/**
 * Space-creation dialog (spec F1 §2, AC-F1.7): offered from the no-spaces
 * screen and the picker. Only the three participant types of §2 are listed
 * (F1-D2). On success `me` already contains the new membership (the hook
 * awaits the refetch), so selecting the space here simply triggers the F0-D1
 * flows: auto-entry with a single membership, picker with several.
 */
export function CreateSpaceDialog({
  triggerVariant = 'default',
}: {
  triggerVariant?: 'default' | 'outline';
}) {
  const { t } = useTranslation(['spaces', 'errors']);
  const navigate = useNavigate();
  const { setActive } = useActiveCompany();
  const createCompany = useCreateCompany();
  const [open, setOpen] = useState(false);

  const schema = z.object({
    name: z.string().trim().min(1, t('create.nameRequired')).max(200, t('create.nameRequired')),
    type: z.enum(SELECTABLE_COMPANY_TYPES, { message: t('create.typeRequired') }),
  });

  type CreateSpaceValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateSpaceValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { name: '' },
  });

  const selectedType = useWatch({ control, name: 'type' });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const company = await createCompany.mutateAsync({
        name: values.name,
        type: values.type,
      });
      reset();
      setOpen(false);
      if (company) {
        setActive(company.id);
      }
      navigate('/app', { replace: true });
    } catch {
      // Handled through `createCompany.error` in the banner below.
    }
  });

  const errorMessage =
    createCompany.error instanceof ApiError
      ? createCompany.error.detail ??
        (createCompany.error.status === 0 ? t('errors:network') : t('errors:unknown'))
      : createCompany.error
        ? t('errors:unknown')
        : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>{t('create.trigger')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-space-name">{t('create.name')}</Label>
            <Input
              id="create-space-name"
              autoComplete="organization"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'create-space-name-error' : undefined}
              {...register('name')}
            />
            {errors.name ? (
              <p id="create-space-name-error" role="alert" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-space-type">{t('create.type')}</Label>
            <Select
              value={selectedType ?? ''}
              onValueChange={(value) =>
                setValue('type', value as CreateSpaceValues['type'], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger
                id="create-space-type"
                className="w-full"
                aria-invalid={errors.type ? true : undefined}
                aria-describedby={errors.type ? 'create-space-type-error' : undefined}
              >
                <SelectValue placeholder={t('create.type')} />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_COMPANY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`create.typeLabel.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type ? (
              <p id="create-space-type-error" role="alert" className="text-sm text-destructive">
                {errors.type.message}
              </p>
            ) : null}
          </div>

          <div aria-live="polite">
            {errorMessage ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={createCompany.isPending}>
            {createCompany.isPending ? t('create.submitting') : t('create.submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
