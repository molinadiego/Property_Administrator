import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClients, useCreateClient } from '@/catalogs/queries';
import { EmptyBox, ErrorBanner, ListSkeleton, formatDate, linesToPhones } from '@/catalogs/ui';
import { useActiveCompany } from '@/companies/active-company';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Register-client dialog (spec F3 §2.1): mirror of `CreateClientDto`; the
 * optional email delivers the limited-access link (§4.3). */
function CreateClientDialog({
  companyId,
  open,
  onOpenChange,
  onCreated,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (message: string) => void;
}) {
  const { t } = useTranslation(['catalogs', 'common']);
  const createClient = useCreateClient(companyId);
  const [formError, setFormError] = useState<unknown>(null);

  const schema = z.object({
    name: z.string().trim().min(1, t('catalogs:clients.nameRequired')).max(200),
    email: z
      .string()
      .trim()
      .max(200)
      .refine(
        (value) => value === '' || z.email().safeParse(value).success,
        t('catalogs:form.invalidEmail'),
      ),
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
    defaultValues: { name: '', email: '', phonesLines: '', address: '', availability: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await createClient.mutateAsync({
        name: values.name,
        email: values.email || undefined,
        phones: linesToPhones(values.phonesLines),
        address: values.address || undefined,
        availability: values.availability || undefined,
      });
      onCreated(
        result.accessIssued
          ? `${t('catalogs:clients.created')} ${t('catalogs:clients.accessIssued')}`
          : t('catalogs:clients.created'),
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
          <DialogTitle>{t('catalogs:clients.dialogTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">{t('catalogs:clients.nameLabel')}</Label>
            <Input
              id="client-name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'client-name-error' : undefined}
              {...register('name')}
            />
            <FieldError id="client-name-error" message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-email">{t('catalogs:clients.emailLabel')}</Label>
            <Input
              id="client-email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'client-email-error' : 'client-email-hint'}
              {...register('email')}
            />
            {errors.email ? (
              <FieldError id="client-email-error" message={errors.email.message} />
            ) : (
              <p id="client-email-hint" className="text-xs text-muted-foreground">
                {t('catalogs:clients.emailHint')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-phones">{t('catalogs:clients.phonesLabel')}</Label>
            <Textarea
              id="client-phones"
              rows={2}
              aria-invalid={errors.phonesLines ? true : undefined}
              aria-describedby={errors.phonesLines ? 'client-phones-error' : undefined}
              {...register('phonesLines')}
            />
            <FieldError id="client-phones-error" message={errors.phonesLines?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-address">{t('catalogs:clients.addressLabel')}</Label>
            <Input
              id="client-address"
              aria-invalid={errors.address ? true : undefined}
              aria-describedby={errors.address ? 'client-address-error' : undefined}
              {...register('address')}
            />
            <FieldError id="client-address-error" message={errors.address?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-availability">{t('catalogs:clients.availabilityLabel')}</Label>
            <Textarea
              id="client-availability"
              rows={2}
              aria-invalid={errors.availability ? true : undefined}
              aria-describedby={errors.availability ? 'client-availability-error' : undefined}
              {...register('availability')}
            />
            <FieldError id="client-availability-error" message={errors.availability?.message} />
          </div>

          <ErrorBanner error={formError} fallback={t('catalogs:actionFailed')} />

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:action.cancel')}
            </Button>
            <Button type="submit" disabled={createClient.isPending}>
              {createClient.isPending
                ? t('catalogs:clients.submitting')
                : t('catalogs:clients.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Own-clients list (spec F3 §2.1, §2.3): only `own_business` spaces have the
 * section; the server answers 403 on `POST /clients` for any other type
 * (matriz #14/#15) — the link visibility is convenience, never the check.
 * The API has no client edit/delete (F3-D6); the screen only registers.
 */
export function ClientsPage() {
  const { t } = useTranslation(['catalogs', 'common']);
  const { activeId } = useActiveCompany();
  const clients = useClients(activeId ?? '');
  const [open, setOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const rows = clients.data ?? [];
  const capped = rows.length >= 100;

  if (!activeId) return null;

  return (
    <>
      <Card className="min-w-0" role="region" aria-labelledby="clients-title">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle id="clients-title" className="flex items-center gap-2">
            {t('catalogs:clients.title')}
            {clients.data ? (
              <Badge variant="secondary">
                <span className="sr-only">
                  {capped
                    ? t('catalogs:clients.capped')
                    : t('catalogs:clients.count', { count: rows.length })}
                </span>
                <span aria-hidden="true">{capped ? '100+' : rows.length}</span>
              </Badge>
            ) : null}
          </CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            {t('catalogs:clients.new')}
          </Button>
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
          {clients.isPending ? (
            <ListSkeleton />
          ) : clients.error ? (
            <>
              <ErrorBanner error={clients.error} fallback={t('catalogs:clients.error')} />
              <Button variant="outline" size="sm" onClick={() => void clients.refetch()}>
                {t('common:action.retry')}
              </Button>
            </>
          ) : rows.length === 0 ? (
            <EmptyBox text={t('catalogs:clients.empty')} />
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {rows.map((client) => (
                <li
                  key={client.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{client.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[client.email ?? '', (client.phones ?? []).join(' · ')]
                        .filter(Boolean)
                        .join(' · ') || formatDate(client.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <CreateClientDialog
        companyId={activeId}
        open={open}
        onOpenChange={setOpen}
        onCreated={setStatusMessage}
      />
    </>
  );
}
