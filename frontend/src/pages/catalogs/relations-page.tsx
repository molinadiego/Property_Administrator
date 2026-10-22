import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { CommercialRelationViewDto, EmergencyPolicyValue } from '@/api/types';
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
import { useClients, useCreateRelation, useRelations, useUpdateRelation } from '@/catalogs/queries';
import { EmptyBox, ErrorBanner, ListSkeleton } from '@/catalogs/ui';
import { useActiveCompany } from '@/companies/active-company';
import { formatMoney, MONEY_PATTERN } from '@/lib/money';

const POLICY_OPTIONS = [
  'prior_authorization',
  'resolve_without_authorization',
  'emergency_amount',
] as const satisfies readonly EmergencyPolicyValue[];

const MANUAL_COMPANY = 'manual';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Create-relation dialog (spec F3-D7): exactly one counterparty — a company
 * or an own client (§2.4) — plus label and emergency override (§8.6). */
function CreateRelationDialog({
  companyId,
  otherSpaces,
  open,
  onOpenChange,
  onCreated,
}: {
  companyId: string;
  otherSpaces: Array<{ companyId: string; companyName: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (message: string) => void;
}) {
  const { t } = useTranslation(['catalogs', 'common']);
  const createRelation = useCreateRelation(companyId);
  const clients = useClients(companyId);
  const [formError, setFormError] = useState<unknown>(null);

  const schema = z
    .object({
      counterpartyType: z.enum(['company', 'client']),
      companyChoice: z.string(),
      companyIdManual: z.string().trim(),
      clientId: z.string(),
      label: z.string().trim().max(120, t('catalogs:form.tooLong', { max: 120 })),
      policy: z.enum(['none', ...POLICY_OPTIONS]),
      extraAmount: z.string().trim(),
    })
    .superRefine((values, ctx) => {
      if (values.counterpartyType === 'company') {
        if (values.companyChoice === MANUAL_COMPANY && values.companyIdManual === '') {
          ctx.addIssue({
            code: 'custom',
            path: ['companyIdManual'],
            message: t('catalogs:relations.companyIdRequired'),
          });
        } else if (
          values.companyChoice === MANUAL_COMPANY &&
          !z.uuid().safeParse(values.companyIdManual).success
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['companyIdManual'],
            message: t('catalogs:relations.invalidUuid'),
          });
        }
      } else if (values.clientId === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['clientId'],
          message: t('catalogs:relations.clientRequired'),
        });
      }
      if (values.policy === 'emergency_amount') {
        if (values.extraAmount === '') {
          ctx.addIssue({
            code: 'custom',
            path: ['extraAmount'],
            message: t('catalogs:relations.extraAmountRequired'),
          });
        } else if (!MONEY_PATTERN.test(values.extraAmount)) {
          ctx.addIssue({
            code: 'custom',
            path: ['extraAmount'],
            message: t('catalogs:relations.extraAmountPattern'),
          });
        }
      }
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
    defaultValues: {
      counterpartyType: 'company',
      companyChoice: otherSpaces[0]?.companyId ?? MANUAL_COMPANY,
      companyIdManual: '',
      clientId: '',
      label: '',
      policy: 'none',
      extraAmount: '',
    },
  });

  const counterpartyType = watch('counterpartyType');
  const companyChoice = watch('companyChoice');
  const policy = watch('policy');
  const clientRows = clients.data ?? [];

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const counterparty =
      values.counterpartyType === 'company'
        ? {
            counterpartyCompanyId:
              values.companyChoice === MANUAL_COMPANY
                ? values.companyIdManual
                : values.companyChoice,
          }
        : { clientRelationshipId: values.clientId };
    try {
      await createRelation.mutateAsync({
        ...counterparty,
        label: values.label || undefined,
        ...(values.policy === 'none' ? {} : { emergencyPolicy: values.policy }),
        ...(values.policy === 'emergency_amount'
          ? { emergencyExtraAmount: values.extraAmount }
          : {}),
      });
      onCreated(t('catalogs:relations.created'));
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
          <DialogTitle>{t('catalogs:relations.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('catalogs:relations.ownerOnlyActions')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-foreground">
              {t('catalogs:relations.counterpartyLabel')}
            </legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="counterpartyType"
                  value="company"
                  checked={counterpartyType === 'company'}
                  onChange={() => setValue('counterpartyType', 'company', { shouldValidate: true })}
                  className="size-4 accent-primary"
                />
                {t('catalogs:relations.counterpartyCompanyOption')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="counterpartyType"
                  value="client"
                  checked={counterpartyType === 'client'}
                  onChange={() => setValue('counterpartyType', 'client', { shouldValidate: true })}
                  className="size-4 accent-primary"
                />
                {t('catalogs:relations.counterpartyClientOption')}
              </label>
            </div>
          </fieldset>

          {counterpartyType === 'company' ? (
            <div className="space-y-1.5">
              <Label htmlFor="relation-company-choice">
                {t('catalogs:relations.companyIdLabel')}
              </Label>
              <Select
                value={companyChoice}
                onValueChange={(value) =>
                  setValue('companyChoice', value, { shouldValidate: true })
                }
              >
                <SelectTrigger id="relation-company-choice" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {otherSpaces.map((space) => (
                    <SelectItem key={space.companyId} value={space.companyId}>
                      {space.companyName}
                    </SelectItem>
                  ))}
                  <SelectItem value={MANUAL_COMPANY}>
                    {t('catalogs:relations.companyIdOwnOption')}
                  </SelectItem>
                </SelectContent>
              </Select>
              {companyChoice === MANUAL_COMPANY ? (
                <>
                  <Input
                    id="relation-company-id"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    aria-invalid={errors.companyIdManual ? true : undefined}
                    aria-describedby={
                      errors.companyIdManual
                        ? 'relation-company-id-error'
                        : 'relation-company-id-hint'
                    }
                    {...register('companyIdManual')}
                  />
                  {errors.companyIdManual ? (
                    <FieldError id="relation-company-id-error" message={errors.companyIdManual.message} />
                  ) : (
                    <p id="relation-company-id-hint" className="text-xs text-muted-foreground">
                      {t('catalogs:relations.companyIdHint')}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="relation-client">{t('catalogs:relations.clientLabel')}</Label>
              {clientRows.length === 0 ? (
                <p className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
                  {t('catalogs:relations.noClients')}
                </p>
              ) : (
                <Select
                  value={watch('clientId')}
                  onValueChange={(value) => setValue('clientId', value, { shouldValidate: true })}
                >
                  <SelectTrigger id="relation-client" className="w-full">
                    <SelectValue placeholder={t('catalogs:relations.pickClient')} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientRows.map((client) => (
                      <SelectItem key={client.id} value={client.relationshipId}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors.clientId ? <FieldError id="relation-client-error" message={errors.clientId.message} /> : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="relation-label">{t('catalogs:relations.labelLabel')}</Label>
            <Input
              id="relation-label"
              aria-invalid={errors.label ? true : undefined}
              aria-describedby={errors.label ? 'relation-label-error' : undefined}
              {...register('label')}
            />
            <FieldError id="relation-label-error" message={errors.label?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="relation-policy">{t('catalogs:relations.policyLabel')}</Label>
            <Select
              value={policy}
              onValueChange={(value) =>
                setValue('policy', value as Values['policy'], { shouldValidate: true })
              }
            >
              <SelectTrigger id="relation-policy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('catalogs:relations.policyNone')}</SelectItem>
                {POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`catalogs:relations.policy.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {policy === 'emergency_amount' ? (
            <div className="space-y-1.5">
              <Label htmlFor="relation-extra">{t('catalogs:relations.extraAmountLabel')}</Label>
              <Input
                id="relation-extra"
                inputMode="decimal"
                placeholder="300.00"
                aria-invalid={errors.extraAmount ? true : undefined}
                aria-describedby={errors.extraAmount ? 'relation-extra-error' : undefined}
                {...register('extraAmount')}
              />
              <FieldError id="relation-extra-error" message={errors.extraAmount?.message} />
            </div>
          ) : null}

          <ErrorBanner error={formError} fallback={t('catalogs:actionFailed')} />

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={createRelation.isPending}>
              {createRelation.isPending
                ? t('catalogs:relations.submitting')
                : t('catalogs:relations.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edit relation (owner-only): label and emergency override; the counterparty
 * is immutable in the contract (F3-D6). */
function EditRelationDialog({
  companyId,
  relation,
  open,
  onOpenChange,
  onSaved,
}: {
  companyId: string;
  relation: CommercialRelationViewDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation(['catalogs', 'common']);
  const updateRelation = useUpdateRelation(companyId);
  const [formError, setFormError] = useState<unknown>(null);

  const schema = z
    .object({
      label: z.string().trim().max(120, t('catalogs:form.tooLong', { max: 120 })),
      policy: z.enum(['none', ...POLICY_OPTIONS]),
      extraAmount: z.string().trim(),
    })
    .superRefine((values, ctx) => {
      if (values.policy === 'emergency_amount') {
        if (values.extraAmount === '') {
          ctx.addIssue({
            code: 'custom',
            path: ['extraAmount'],
            message: t('catalogs:relations.extraAmountRequired'),
          });
        } else if (!MONEY_PATTERN.test(values.extraAmount)) {
          ctx.addIssue({
            code: 'custom',
            path: ['extraAmount'],
            message: t('catalogs:relations.extraAmountPattern'),
          });
        }
      }
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
    values: {
      label: relation?.label ?? '',
      policy: relation?.emergencyPolicy ?? 'none',
      extraAmount: relation?.emergencyExtraAmount ?? '',
    },
  });

  const policy = watch('policy');

  const onSubmit = handleSubmit(async (values) => {
    if (!relation) return;
    setFormError(null);
    try {
      await updateRelation.mutateAsync({
        relationId: relation.id,
        label: values.label || null,
        emergencyPolicy: values.policy === 'none' ? null : values.policy,
        emergencyExtraAmount:
          values.policy === 'emergency_amount' ? values.extraAmount : null,
      });
      onSaved(t('catalogs:relations.updated'));
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
            {t('catalogs:relations.editDialogTitle')}
            {relation?.label ? `: ${relation.label}` : ''}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="relation-edit-label">{t('catalogs:relations.labelLabel')}</Label>
            <Input
              id="relation-edit-label"
              aria-invalid={errors.label ? true : undefined}
              aria-describedby={errors.label ? 'relation-edit-label-error' : undefined}
              {...register('label')}
            />
            <FieldError id="relation-edit-label-error" message={errors.label?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="relation-edit-policy">{t('catalogs:relations.policyLabel')}</Label>
            <Select
              value={policy}
              onValueChange={(value) =>
                setValue('policy', value as Values['policy'], { shouldValidate: true })
              }
            >
              <SelectTrigger id="relation-edit-policy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('catalogs:relations.policyNone')}</SelectItem>
                {POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`catalogs:relations.policy.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {policy === 'emergency_amount' ? (
            <div className="space-y-1.5">
              <Label htmlFor="relation-edit-extra">
                {t('catalogs:relations.extraAmountLabel')}
              </Label>
              <Input
                id="relation-edit-extra"
                inputMode="decimal"
                placeholder="300.00"
                aria-invalid={errors.extraAmount ? true : undefined}
                aria-describedby={
                  errors.extraAmount ? 'relation-edit-extra-error' : undefined
                }
                {...register('extraAmount')}
              />
              <FieldError id="relation-edit-extra-error" message={errors.extraAmount?.message} />
            </div>
          ) : null}

          <ErrorBanner error={formError} fallback={t('catalogs:actionFailed')} />

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={updateRelation.isPending}>
              {updateRelation.isPending
                ? t('catalogs:relations.saving')
                : t('catalogs:relations.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Close/reopen relation (§2.4): closing is confirmed, reopening is direct. */
function CloseRelationDialog({
  companyId,
  relation,
  open,
  onOpenChange,
  onClosed,
}: {
  companyId: string;
  relation: CommercialRelationViewDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: (message: string) => void;
}) {
  const { t } = useTranslation(['catalogs', 'common']);
  const updateRelation = useUpdateRelation(companyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('catalogs:relations.closeDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('catalogs:relations.closeDescription', {
              label: relation?.label || relation?.counterpartyCompanyName || relation?.clientName || '',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:action.cancel')}
          </Button>
          <Button
            disabled={updateRelation.isPending}
            onClick={() => {
              if (!relation) return;
              updateRelation
                .mutateAsync({ relationId: relation.id, ended: true })
                .then(() => {
                  onClosed(t('catalogs:relations.closed'));
                  onOpenChange(false);
                })
                .catch(() => onOpenChange(false));
            }}
          >
            {t('catalogs:relations.closeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Commercial relations (spec F3 §2.1, §2.4, Etapa 4 §4.7): any active member
 * reads the list; only the `owner` role creates, edits or closes one
 * (`@RequireRole('owner')`, Etapa 4 decisión 7) — the actions simply don't
 * render for other roles and the server answers 403 anyway.
 */
export function RelationsPage() {
  const { t } = useTranslation(['catalogs', 'common']);
  const { active, activeId, memberships } = useActiveCompany();
  const companyId = activeId ?? '';
  const relations = useRelations(companyId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRelation, setEditRelation] = useState<CommercialRelationViewDto | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [closeRelation, setCloseRelation] = useState<CommercialRelationViewDto | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isOwner = active?.role === 'owner';
  const otherSpaces = memberships
    .filter((membership) => membership.companyId !== activeId)
    .map((membership) => ({
      companyId: membership.companyId,
      companyName: membership.companyName,
    }));

  const rows = relations.data ?? [];

  if (!activeId) return null;

  return (
    <>
      <Card className="min-w-0" role="region" aria-labelledby="relations-title">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle id="relations-title">{t('catalogs:relations.title')}</CardTitle>
          {isOwner ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              {t('catalogs:relations.new')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
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
          {!isOwner ? (
            <p className="text-xs text-muted-foreground">{t('catalogs:relations.ownerOnlyActions')}</p>
          ) : null}
          {relations.isPending ? (
            <ListSkeleton />
          ) : relations.error ? (
            <>
              <ErrorBanner error={relations.error} fallback={t('catalogs:relations.error')} />
              <Button variant="outline" size="sm" onClick={() => void relations.refetch()}>
                {t('common:action.retry')}
              </Button>
            </>
          ) : rows.length === 0 ? (
            <EmptyBox text={t('catalogs:relations.empty')} />
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {rows.map((relation) => {
                const name =
                  relation.label ||
                  relation.counterpartyCompanyName ||
                  relation.clientName ||
                  '—';
                const extra = relation.emergencyExtraAmount
                  ? formatMoney(relation.emergencyExtraAmount)
                  : null;
                return (
                  <li
                    key={relation.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {relation.counterpartyCompanyId
                          ? t('catalogs:relations.counterpartyCompany', {
                              name: relation.counterpartyCompanyName ?? '—',
                            })
                          : t('catalogs:relations.counterpartyClient', {
                              name: relation.clientName ?? '—',
                            })}
                        {' · '}
                        {t(`catalogs:relations.policy.${relation.emergencyPolicy}`)}
                        {extra
                          ? ` · ${t('catalogs:relations.extraAmount', { amount: extra })}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">
                        {relation.endedAt
                          ? t('catalogs:relations.state.ended')
                          : t('catalogs:relations.state.active')}
                      </Badge>
                      {isOwner ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={t('catalogs:relations.editAria', { label: name })}
                            onClick={() => {
                              setEditRelation(relation);
                              setEditOpen(true);
                            }}
                          >
                            {t('catalogs:relations.edit')}
                          </Button>
                          {/* §2.4: a closed relation never reopens (the server
                              answers 422 to `ended: false`, Etapa 4) — only
                              the close action renders for an active one. */}
                          {!relation.endedAt ? (
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={t('catalogs:relations.closeAria', { label: name })}
                              onClick={() => {
                                setCloseRelation(relation);
                                setCloseOpen(true);
                              }}
                            >
                              {t('catalogs:relations.close')}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <CreateRelationDialog
        companyId={companyId}
        otherSpaces={otherSpaces}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setStatusMessage}
      />
      <EditRelationDialog
        companyId={companyId}
        relation={editRelation}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={setStatusMessage}
      />
      <CloseRelationDialog
        companyId={companyId}
        relation={closeRelation}
        open={closeOpen}
        onOpenChange={setCloseOpen}
        onClosed={setStatusMessage}
      />
    </>
  );
}
