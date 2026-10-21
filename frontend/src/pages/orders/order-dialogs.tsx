import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { OrderViewDto, UpdateOrderDto } from '@/api/types';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';

/**
 * Dialogs of the order detail (spec F4 §5/§9): destructive transitions ask
 * for confirmation, transitions that take text use a validated form mirroring
 * the DTO (§6.1–§6.3, §5.6, §20.1) and the pickers build the DTOs of §5.5–§5.7.
 * Dialogs stay dumb: the page owns the mutation, the RFC 7807 banner and the
 * refetch on 409/403/404 (F4 §5).
 */

/** Plain confirmation (accept, close, revoke, start-like decisions). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  isPending,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  isPending: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(['orders', 'common']);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:action.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={isPending}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirmation + text field: the shared shape of reject (optional ≤1000),
 * progress (required ≤2000), complete (optional result), incomplete /
 * not-realized / cancel (required reason ≤2000).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  fieldLabel,
  required,
  maxLength,
  confirmLabel,
  isPending,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fieldLabel: string;
  required: boolean;
  maxLength: number;
  confirmLabel: string;
  isPending: boolean;
  destructive?: boolean;
  onConfirm: (value: string) => void;
}) {
  const { t } = useTranslation(['orders', 'common']);
  const schema = z.object({
    value: required
      ? z
          .string()
          .trim()
          .min(1, t('orders:dialog.fieldRequired'))
          .max(maxLength, t('orders:dialog.fieldTooLong', { max: maxLength }))
      : z.string().trim().max(maxLength, t('orders:dialog.fieldTooLong', { max: maxLength })),
  });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { value: '' } });

  const onSubmit = handleSubmit((values) => {
    onConfirm(values.value.trim());
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="order-reason-field">{fieldLabel}</Label>
            <Textarea
              id="order-reason-field"
              aria-invalid={errors.value ? true : undefined}
              aria-describedby={errors.value ? 'order-reason-field-error' : undefined}
              {...register('value')}
            />
            {errors.value ? (
              <p id="order-reason-field-error" role="alert" className="text-sm text-destructive">
                {errors.value.message}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={isPending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface AssignOption {
  value: string;
  label: string;
}

/** Picker of §5.6/§5.7: proposes the job to any active membership offered. */
export function AssignDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  options,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  options: AssignOption[];
  isPending: boolean;
  onConfirm: (assigneeMembershipId: string) => void;
}) {
  const { t } = useTranslation(['orders', 'common']);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setValue('');
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="order-assignee">{t('orders:dialog.assigneeLabel')}</Label>
          <Select
            value={value}
            onValueChange={(next) => {
              setValue(next);
              setError(null);
            }}
          >
            <SelectTrigger
              id="order-assignee"
              className="w-full"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'order-assignee-error' : undefined}
            >
              <SelectValue placeholder={t('orders:dialog.assigneePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? (
            <p id="order-assignee-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            {t('common:action.cancel')}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => {
              if (!value) {
                setError(t('orders:dialog.fieldRequired'));
                return;
              }
              onConfirm(value);
              close(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Adds a job to a compound order (`AddJobDto`: title + description). */
export function AddJobDialog({
  open,
  onOpenChange,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: (values: { title: string; description: string }) => void;
}) {
  const { t } = useTranslation(['orders', 'common']);
  const schema = z.object({
    title: z
      .string()
      .trim()
      .min(1, t('orders:dialog.fieldRequired'))
      .max(300, t('orders:dialog.fieldTooLong', { max: 300 })),
    description: z
      .string()
      .trim()
      .min(1, t('orders:dialog.fieldRequired'))
      .max(5000, t('orders:dialog.fieldTooLong', { max: 5000 })),
  });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: '', description: '' } });

  const onSubmit = handleSubmit((values) => {
    onConfirm({ title: values.title, description: values.description });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('orders:dialog.addJobTitle')}</DialogTitle>
          <DialogDescription>{t('orders:dialog.addJobDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="order-add-job-title">{t('orders:dialog.addJobTitleLabel')}</Label>
            <Input
              id="order-add-job-title"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? 'order-add-job-title-error' : undefined}
              {...register('title')}
            />
            {errors.title ? (
              <p id="order-add-job-title-error" role="alert" className="text-sm text-destructive">
                {errors.title.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-add-job-description">
              {t('orders:dialog.addJobDescriptionLabel')}
            </Label>
            <Textarea
              id="order-add-job-description"
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={
                errors.description ? 'order-add-job-description-error' : undefined
              }
              {...register('description')}
            />
            {errors.description ? (
              <p
                id="order-add-job-description-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.description.message}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {t('orders:dialog.addJobConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Edits the order instructions and access data (`UpdateOrderDto`, §4.4/§5.8);
 * the `urgent` toggle only renders for the owning space on a live order
 * (§14.2: the server answers 403/409 otherwise).
 */
export function EditOrderDialog({
  open,
  onOpenChange,
  order,
  allowUrgent,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderViewDto;
  allowUrgent: boolean;
  isPending: boolean;
  onConfirm: (values: UpdateOrderDto) => void;
}) {
  const { t } = useTranslation(['orders', 'common']);
  const schema = z.object({
    title: z
      .string()
      .trim()
      .min(1, t('orders:dialog.fieldRequired'))
      .max(300, t('orders:dialog.fieldTooLong', { max: 300 })),
    description: z
      .string()
      .trim()
      .min(1, t('orders:dialog.fieldRequired'))
      .max(5000, t('orders:dialog.fieldTooLong', { max: 5000 })),
    accessLockbox: z.string().trim().max(50, t('orders:dialog.fieldTooLong', { max: 50 })),
    accessCommunityCode: z.string().trim().max(50, t('orders:dialog.fieldTooLong', { max: 50 })),
    accessEntryInstructions: z
      .string()
      .trim()
      .max(2000, t('orders:dialog.fieldTooLong', { max: 2000 })),
    urgent: z.boolean(),
  });
  type Values = z.infer<typeof schema>;

  const defaults: Values = {
    title: order.title,
    description: order.description,
    accessLockbox: order.access?.lockbox ?? '',
    accessCommunityCode: order.access?.communityCode ?? '',
    accessEntryInstructions: order.access?.entryInstructions ?? '',
    urgent: order.urgent,
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit((values) => {
    onConfirm({
      title: values.title,
      description: values.description,
      accessLockbox: values.accessLockbox,
      accessCommunityCode: values.accessCommunityCode,
      accessEntryInstructions: values.accessEntryInstructions,
      ...(allowUrgent ? { urgent: values.urgent } : {}),
    });
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Reopen with the freshest order values (a refetch may have changed them).
        if (next) reset(defaults);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('orders:dialog.editTitle')}</DialogTitle>
          <DialogDescription>{t('orders:dialog.editDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="order-edit-title">{t('orders:dialog.editTitleLabel')}</Label>
            <Input
              id="order-edit-title"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? 'order-edit-title-error' : undefined}
              {...register('title')}
            />
            {errors.title ? (
              <p id="order-edit-title-error" role="alert" className="text-sm text-destructive">
                {errors.title.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-edit-description">{t('orders:dialog.editDescriptionLabel')}</Label>
            <Textarea
              id="order-edit-description"
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? 'order-edit-description-error' : undefined}
              {...register('description')}
            />
            {errors.description ? (
              <p id="order-edit-description-error" role="alert" className="text-sm text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>
          <fieldset className="space-y-4">
            <legend className="text-base font-semibold text-foreground">
              {t('orders:detail.accessTitle')}
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="order-edit-lockbox">{t('orders:detail.accessLockbox')}</Label>
              <Input
                id="order-edit-lockbox"
                maxLength={50}
                aria-invalid={errors.accessLockbox ? true : undefined}
                {...register('accessLockbox')}
              />
              {errors.accessLockbox ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.accessLockbox.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-edit-community">
                {t('orders:detail.accessCommunityCode')}
              </Label>
              <Input
                id="order-edit-community"
                maxLength={50}
                aria-invalid={errors.accessCommunityCode ? true : undefined}
                {...register('accessCommunityCode')}
              />
              {errors.accessCommunityCode ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.accessCommunityCode.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-edit-entry">
                {t('orders:detail.accessEntryInstructions')}
              </Label>
              <Textarea
                id="order-edit-entry"
                maxLength={2000}
                aria-invalid={errors.accessEntryInstructions ? true : undefined}
                {...register('accessEntryInstructions')}
              />
              {errors.accessEntryInstructions ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.accessEntryInstructions.message}
                </p>
              ) : null}
            </div>
          </fieldset>
          {allowUrgent ? (
            <label className="flex w-fit items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="size-4 accent-primary" {...register('urgent')} />
              {t('orders:dialog.editUrgentLabel')}
            </label>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {t('orders:dialog.editConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
