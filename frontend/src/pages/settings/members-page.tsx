import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import type { CompanyMemberDto, InvitationViewDto, MembershipRole } from '@/api/types';
import { ApiError } from '@/api/errors';
import { useActiveCompany } from '@/companies/active-company';
import { useCreateInvitation, useInvitations, useRevokeInvitation } from '@/companies/invitations';
import {
  useChangeMemberRole,
  useMembers,
  useRevokeMember,
  useSelfMembershipId,
} from '@/companies/members';
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

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Error banner shared by the panel's mutations (RFC 7807 detail or a state message). */
function ErrorBanner({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useTranslation('errors');
  if (!error) return null;
  const detail =
    error instanceof ApiError
      ? error.detail ?? (error.status === 0 ? t('network') : t('unknown'))
      : fallback;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {detail}
    </p>
  );
}

/** Invite dialog (owner-only, spec F1-D1): email + role to grant. */
function InviteDialog({ companyId }: { companyId: string }) {
  const { t } = useTranslation(['spaces', 'errors']);
  const createInvitation = useCreateInvitation(companyId);
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = z.object({
    email: z
      .string()
      .min(1, t('spaces:members.invite.emailRequired'))
      .email(t('spaces:members.invite.emailInvalid'))
      .max(200, t('spaces:members.invite.emailInvalid')),
    role: z.enum(['owner', 'member']),
  });

  type InviteValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { email: '', role: 'member' },
  });

  const selectedRole = useWatch({ control, name: 'role' });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createInvitation.mutateAsync(values);
      reset();
      setSentTo(values.email);
      setOpen(false);
    } catch {
      // Shown by the ErrorBanner below through `createInvitation.error`.
    }
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('spaces:members.invite.button')}</Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSentTo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('spaces:members.invite.title')}</DialogTitle>
            <DialogDescription>{t('spaces:members.invite.subtitle')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">{t('spaces:members.invite.email')}</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'invite-email-error' : undefined}
                {...register('email')}
              />
              {errors.email ? (
                <p id="invite-email-error" role="alert" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-role">{t('spaces:members.invite.role')}</Label>
              <Select
                value={selectedRole}
                onValueChange={(value) =>
                  setValue('role', value as InviteValues['role'], { shouldValidate: true })
                }
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t('spaces:role.member')}</SelectItem>
                  <SelectItem value="owner">{t('spaces:role.owner')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ErrorBanner error={createInvitation.error} fallback={t('errors:unknown')} />

            <Button type="submit" className="w-full" disabled={createInvitation.isPending}>
              {createInvitation.isPending
                ? t('spaces:members.invite.submitting')
                : t('spaces:members.invite.submit')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {sentTo ? (
        <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
          {t('spaces:members.invite.sent', { email: sentTo })}
        </p>
      ) : null}
    </>
  );
}

/** Revoke-access confirmation (spec F1 §5, §3.3). */
function RevokeMemberDialog({
  member,
  disabled,
  onConfirm,
  isPending,
}: {
  member: CompanyMemberDto;
  disabled: boolean;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation(['spaces', 'common']);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={t('spaces:members.revokeTitle', { name: member.name })}
      >
        {t('spaces:members.revoke')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('spaces:members.revokeTitle', { name: member.name })}</DialogTitle>
          <DialogDescription>{t('spaces:members.revokeBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common:action.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {t('spaces:members.revokeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pending invitations with revoke (spec F1-D1, owner-only). */
function InvitationsSection({ companyId }: { companyId: string }) {
  const { t } = useTranslation(['spaces', 'errors']);
  const invitations = useInvitations(companyId);
  const revokeInvitation = useRevokeInvitation(companyId);

  return (
    <section aria-labelledby="invitations-heading" className="space-y-3">
      <h2 id="invitations-heading" className="text-base font-semibold text-foreground">
        {t('spaces:members.invite.pendingTitle')}
      </h2>
      {invitations.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : invitations.error ? (
        <ErrorBanner error={invitations.error} fallback={t('spaces:members.loadFailed')} />
      ) : (
        <ul className="grid gap-2">
          {(invitations.data?.data ?? []).map((invitation: InvitationViewDto) => (
            <li
              key={invitation.id}
              className="grid grid-cols-1 items-center gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {invitation.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`spaces:role.${invitation.role}`)} ·{' '}
                  {t('spaces:members.invite.expires', { date: formatDate(invitation.expiresAt) })}
                </p>
              </div>
              <Badge variant="secondary" className="justify-self-start sm:justify-self-center">
                {t('spaces:members.invite.statusPending')}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={revokeInvitation.isPending}
                aria-label={t('spaces:members.invite.revokeOf', { email: invitation.email })}
                onClick={() => revokeInvitation.mutate(invitation.id)}
              >
                {t('spaces:members.invite.revoke')}
              </Button>
            </li>
          ))}
          {(invitations.data?.data ?? []).length === 0 ? (
            <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t('spaces:members.invite.empty')}
            </li>
          ) : null}
        </ul>
      )}
      <ErrorBanner error={revokeInvitation.error} fallback={t('errors:unknown')} />
    </section>
  );
}

/** Members panel: list for everyone; owner-only actions (spec F1 §3). */
function MembersPanel({ companyId }: { companyId: string }) {
  const { t } = useTranslation(['spaces', 'errors', 'common']);
  const { active } = useActiveCompany();
  const members = useMembers(companyId);
  const selfMembershipId = useSelfMembershipId(members.data);
  const changeRole = useChangeMemberRole(companyId, selfMembershipId);
  const revokeMember = useRevokeMember(companyId, selfMembershipId);

  const rows = members.data ?? [];
  const ownerCount = rows.filter((member) => member.role === 'owner').length;
  const isOwner = active?.role === 'owner';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('spaces:members.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('spaces:members.subtitle')}</p>
        </div>
        {isOwner ? <InviteDialog companyId={companyId} /> : null}
      </div>

      <ErrorBanner error={changeRole.error} fallback={t('errors:unknown')} />
      <ErrorBanner error={revokeMember.error} fallback={t('errors:unknown')} />

      {members.isPending ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : members.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('spaces:members.loadFailed')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void members.refetch()}>
              {t('common:action.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('spaces:members.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {rows.map((member) => {
              const isLastOwner = ownerCount === 1 && member.role === 'owner';
              return (
                <li
                  key={member.membershipId}
                  className="grid grid-cols-1 items-center gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{member.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner ? (
                      <Select
                        value={member.role}
                        disabled={changeRole.isPending || isLastOwner}
                        onValueChange={(role) =>
                          changeRole.mutate({
                            membershipId: member.membershipId,
                            role: role as MembershipRole,
                          })
                        }
                      >
                        <SelectTrigger
                          className="w-full max-w-40"
                          aria-label={t('spaces:members.roleOf', { name: member.name })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">{t('spaces:role.owner')}</SelectItem>
                          <SelectItem value="member">{t('spaces:role.member')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{t(`spaces:role.${member.role}`)}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {t('spaces:members.joined')} {formatDate(member.joinedAt)}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    {isOwner ? (
                      <RevokeMemberDialog
                        member={member}
                        disabled={revokeMember.isPending || isLastOwner}
                        isPending={revokeMember.isPending}
                        onConfirm={() => revokeMember.mutate(member.membershipId)}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {isOwner ? (
            <p className="text-sm text-muted-foreground">{t('spaces:members.lastOwnerHint')}</p>
          ) : null}
        </>
      )}

      {isOwner ? <InvitationsSection companyId={companyId} /> : null}
    </div>
  );
}

/**
 * Members screen (spec F1 §2, `/app/settings/members`, F1-D7): every active
 * member can read the list (§3.2); invite / role change / revoke are shown
 * only to owners and verified by the server on every call (§3.4, §16.1).
 */
export function MembersPage() {
  const { activeId } = useActiveCompany();
  if (!activeId) return null;
  return <MembersPanel companyId={activeId} />;
}
