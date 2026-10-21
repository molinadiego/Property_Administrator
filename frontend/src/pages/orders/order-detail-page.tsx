import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { ApiError } from '@/api/errors';
import type { AssignmentViewDto, JobViewDto } from '@/api/types';
import { useActiveCompany } from '@/companies/active-company';
import { useMembers } from '@/companies/members';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/auth/session';
import { useProperties } from '@/catalogs/queries';
import { ErrorBanner, formatDate } from '@/catalogs/ui';
import { ORDER_STATUS_KEYS } from '@/dashboard/board';
import { useAcceptAssignment, useRejectAssignment } from '@/dashboard/queries';
import { allowedOrderActions, myActiveAssignment, type OrderActionPlan } from '@/orders/actions';
import {
  useAddJob,
  useAssignJob,
  useCancelOrder,
  useCloseOrder,
  useCompleteJob,
  useConvertOrder,
  useIncompleteJob,
  useNotRealizedJob,
  useOrder,
  useProgressJob,
  useReassignAssignment,
  useResumeJob,
  useRevokeAssignment,
  useStartJob,
  useUpdateOrder,
} from '@/orders/queries';
import {
  AddJobDialog,
  AssignDialog,
  ConfirmDialog,
  EditOrderDialog,
  ReasonDialog,
} from './order-dialogs';

/** An active (pending|accepted) assignment of a job — §20.3. */
function findActiveAssignment(job: JobViewDto): AssignmentViewDto | undefined {
  return job.assignments.find(
    (assignment) => assignment.status === 'pending' || assignment.status === 'accepted',
  );
}

type JobActionKind =
  | 'accept'
  | 'reject'
  | 'progress'
  | 'complete'
  | 'incomplete'
  | 'notRealized'
  | 'assign'
  | 'reassign'
  | 'revoke';

interface JobActionState {
  kind: JobActionKind;
  job: JobViewDto;
  assignment?: AssignmentViewDto;
}

type OrderActionKind = 'edit' | 'cancel' | 'close' | 'addJob';

/**
 * Order detail (spec F4 §2.3): header, access block (only when the server
 * sent it, §4.5/§5.8), jobs with their assignment history and every §20
 * transition the pure plan allows for this state + relationship (F4-D5).
 * The server re-validates each call; 409/403/404 surface in an `aria-live`
 * banner and trigger a refetch so the buttons recalculate (F4 §5/§11).
 */
export function OrderDetailPage() {
  const { t } = useTranslation(['orders', 'dashboard', 'common']);
  const { orderId = '' } = useParams();
  const { activeId, memberships } = useActiveCompany();
  const { data: me } = useMe();
  const companyId = activeId ?? '';

  const orderQuery = useOrder(companyId, orderId);
  const members = useMembers(companyId);
  const properties = useProperties(companyId);

  const accept = useAcceptAssignment(companyId);
  const reject = useRejectAssignment(companyId);
  const updateOrder = useUpdateOrder(companyId, orderId);
  const convert = useConvertOrder(companyId, orderId);
  const close = useCloseOrder(companyId, orderId);
  const cancel = useCancelOrder(companyId, orderId);
  const addJob = useAddJob(companyId, orderId);
  const assignJob = useAssignJob(companyId, orderId);

  // Job-scoped hooks: the ids ride on each mutation call (no captured state).
  const [jobAction, setJobAction] = useState<JobActionState | null>(null);
  const [orderAction, setOrderAction] = useState<OrderActionKind | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const startJob = useStartJob(companyId);
  const progressJob = useProgressJob(companyId);
  const completeJob = useCompleteJob(companyId);
  const incompleteJob = useIncompleteJob(companyId);
  const resumeJob = useResumeJob(companyId);
  const notRealizedJob = useNotRealizedJob(companyId);
  const reassign = useReassignAssignment(companyId);
  const revoke = useRevokeAssignment(companyId);

  // Every mutation owns the same failure shape: show detail, then refetch.
  const runAction = async (action: Promise<unknown>) => {
    try {
      await action;
      setActionError(null);
    } catch (error) {
      setActionError(error);
    }
  };

  const myMembershipIds = memberships.map((membership) => membership.id);

  // Assign picker options: active-space members + my memberships elsewhere (F4 §2.3).
  const assignOptions = [
    ...(members.data ?? []).map((member) => ({
      value: member.membershipId,
      label: member.name,
    })),
    ...memberships
      .filter((membership) => membership.companyId !== companyId)
      .map((membership) => ({
        value: membership.id,
        label: `${me?.name ?? membership.companyName} · ${membership.companyName}`,
      })),
  ];

  const nameFor = (membershipId: string): string | null => {
    const member = (members.data ?? []).find((item) => item.membershipId === membershipId);
    if (member) return member.name;
    return memberships.some((membership) => membership.id === membershipId)
      ? (me?.name ?? null)
      : null;
  };

  if (!activeId || !orderId) return null;

  if (orderQuery.isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <span className="sr-only">{t('orders:detail.loading')}</span>
      </div>
    );
  }

  if (orderQuery.error) {
    const notFound =
      orderQuery.error instanceof ApiError && orderQuery.error.status === 404;
    if (notFound) {
      return (
        <Card role="region" aria-labelledby="order-missing-title">
          <CardContent className="space-y-4 p-6">
            <h1 id="order-missing-title" className="text-lg font-semibold text-foreground">
              {t('orders:detail.notFoundTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('orders:detail.notFoundBody')}</p>
            <Button variant="outline" asChild>
              <Link to="/app/orders">{t('orders:detail.backToList')}</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <ErrorBanner error={orderQuery.error} fallback={t('orders:detail.error')} />
        <Button variant="outline" size="sm" onClick={() => void orderQuery.refetch()}>
          {t('common:action.retry')}
        </Button>
      </div>
    );
  }

  const order = orderQuery.data;
  const plan: OrderActionPlan = allowedOrderActions(order, { companyId, myMembershipIds });
  const address = (properties.data ?? []).find(
    (property) => property.id === order.propertyId,
  )?.addressLine;
  const accessRows = order.access
    ? [
        { key: 'lockbox', label: t('orders:detail.accessLockbox'), value: order.access.lockbox },
        {
          key: 'communityCode',
          label: t('orders:detail.accessCommunityCode'),
          value: order.access.communityCode,
        },
        {
          key: 'entryInstructions',
          label: t('orders:detail.accessEntryInstructions'),
          value: order.access.entryInstructions,
        },
      ].filter((row) => row.value !== null && row.value !== '')
    : [];
  const jobs = [...order.jobs].sort((left, right) => left.sortOrder - right.sortOrder);

  const closeDialog = () => setOrderAction(null);
  const closeJobDialog = () => setJobAction(null);
  // Locals so the dialog callbacks read a narrowed, stable reference.
  const openAssignment = jobAction?.assignment;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6" role="region" aria-labelledby="order-title">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="order-title" className="text-xl font-semibold text-foreground">
            {order.title}
          </h1>
          <Badge variant="secondary">{t(`dashboard:${ORDER_STATUS_KEYS[order.status]}`)}</Badge>
          {order.urgent ? <Badge variant="destructive">{t('orders:urgent')}</Badge> : null}
          <Badge variant="outline">{t(`orders:origin.${order.origin}`)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('orders:detail.createdAt', { date: formatDate(order.createdAt) })}
        </p>
        {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}
        <p className="text-sm text-muted-foreground">{order.description}</p>
        {order.closedAt ? (
          <p className="text-sm text-muted-foreground">
            {t('orders:detail.closedAt', { date: formatDate(order.closedAt) })}
          </p>
        ) : null}
        {order.cancelledAt ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t('orders:detail.cancelledAt', { date: formatDate(order.cancelledAt) })}</p>
            {order.cancellationReason ? (
              <p>
                {t('orders:detail.cancellationReason')}: {order.cancellationReason}
              </p>
            ) : null}
          </div>
        ) : null}
        <ErrorBanner error={actionError} fallback={t('orders:detail.actionFailed')} />
        <div className="flex flex-wrap gap-2">
          {plan.convert ? (
            <Button disabled={convert.isPending} onClick={() => void runAction(convert.mutateAsync())}>
              {t('orders:actions.convert')}
            </Button>
          ) : null}
          {plan.editInstructions ? (
            <Button variant="outline" onClick={() => setOrderAction('edit')}>
              {t('orders:actions.edit')}
            </Button>
          ) : null}
          {plan.close ? (
            <Button variant="outline" onClick={() => setOrderAction('close')}>
              {t('orders:actions.close')}
            </Button>
          ) : null}
          {plan.cancel ? (
            <Button variant="destructive" onClick={() => setOrderAction('cancel')}>
              {t('orders:actions.cancel')}
            </Button>
          ) : null}
        </div>
      </header>

      {accessRows.length > 0 ? (
        <Card role="region" aria-labelledby="order-access-title">
          <CardHeader>
            <CardTitle id="order-access-title" className="text-base">
              {t('orders:detail.accessTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              {accessRows.map((row) => (
                <div key={row.key} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[10rem_1fr]">
                  <dt className="font-medium text-muted-foreground">{row.label}</dt>
                  <dd className="whitespace-pre-wrap text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card role="region" aria-labelledby="order-jobs-title">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle id="order-jobs-title" className="text-base">
            {t('orders:detail.jobsTitle')}
          </CardTitle>
          {plan.addJob ? (
            <Button variant="outline" size="sm" onClick={() => setOrderAction('addJob')}>
              {t('orders:actions.addJob')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="grid gap-3">
            {jobs.map((job, index) => {
              const planForJob = plan.jobs[job.id];
              const mine = myActiveAssignment(job, myMembershipIds);
              const active = findActiveAssignment(job);
              return (
                <li key={job.id}>
                  <article
                    aria-labelledby={`job-title-${job.id}`}
                    className="space-y-3 rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id={`job-title-${job.id}`} className="text-sm font-semibold text-foreground">
                        {index + 1}. {job.title}
                      </h3>
                      <Badge variant="secondary">{t(`orders:jobStatus.${job.status}`)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{job.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        job.startedAt
                          ? t('orders:detail.jobStarted', { date: formatDate(job.startedAt) })
                          : null,
                        job.completedAt
                          ? t('orders:detail.jobCompleted', { date: formatDate(job.completedAt) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>

                    <section aria-label={t('orders:detail.assignmentsTitle')}>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                        {t('orders:detail.assignmentsTitle')}
                      </h4>
                      <ul className="mt-1 grid gap-1">
                        {job.assignments.map((assignment) => {
                          const assigneeName = nameFor(assignment.assigneeMembershipId);
                          return (
                            <li key={assignment.id} className="text-xs text-muted-foreground">
                              <Badge variant="outline" className="mr-1">
                                {t(`orders:assignmentStatus.${assignment.status}`)}
                              </Badge>
                              {assigneeName
                                ? t('orders:detail.assignee', { name: assigneeName })
                                : t('orders:detail.assigneeExternal')}
                              {' · '}
                              {formatDate(assignment.createdAt)}
                              {assignment.rejectionReason ? (
                                <>
                                  {' · '}
                                  {t('orders:detail.rejectionReason', {
                                    reason: assignment.rejectionReason,
                                  })}
                                </>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </section>

                    <div className="flex flex-wrap gap-2">
                      {planForJob.accept && mine ? (
                        <Button
                          size="sm"
                          onClick={() => setJobAction({ kind: 'accept', job, assignment: mine })}
                        >
                          {t('orders:actions.accept')}
                        </Button>
                      ) : null}
                      {planForJob.reject && mine ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobAction({ kind: 'reject', job, assignment: mine })}
                        >
                          {t('orders:actions.reject')}
                        </Button>
                      ) : null}
                      {planForJob.start ? (
                        <Button
                          size="sm"
                          disabled={startJob.isPending}
                          onClick={() => void runAction(startJob.mutateAsync(job.id))}
                        >
                          {t('orders:actions.start')}
                        </Button>
                      ) : null}
                      {planForJob.progress ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobAction({ kind: 'progress', job })}
                        >
                          {t('orders:actions.progress')}
                        </Button>
                      ) : null}
                      {planForJob.complete ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobAction({ kind: 'complete', job })}
                        >
                          {t('orders:actions.complete')}
                        </Button>
                      ) : null}
                      {planForJob.incomplete ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobAction({ kind: 'incomplete', job })}
                        >
                          {t('orders:actions.incomplete')}
                        </Button>
                      ) : null}
                      {planForJob.resume ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resumeJob.isPending}
                          onClick={() => void runAction(resumeJob.mutateAsync(job.id))}
                        >
                          {t('orders:actions.resume')}
                        </Button>
                      ) : null}
                      {planForJob.notRealized ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setJobAction({ kind: 'notRealized', job })}
                        >
                          {t('orders:actions.notRealized')}
                        </Button>
                      ) : null}
                      {planForJob.assign ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobAction({ kind: 'assign', job })}
                        >
                          {t('orders:actions.assign')}
                        </Button>
                      ) : null}
                      {planForJob.reassign && active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setJobAction({ kind: 'reassign', job, assignment: active })}
                        >
                          {t('orders:actions.reassign')}
                        </Button>
                      ) : null}
                      {planForJob.revoke && active ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setJobAction({ kind: 'revoke', job, assignment: active })}
                        >
                          {t('orders:actions.revoke')}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Order-level dialogs (F4 §5): the plan decides which one can open. */}
      {orderAction === 'edit' ? (
        <EditOrderDialog
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
          order={order}
          allowUrgent={plan.editUrgent}
          isPending={updateOrder.isPending}
          onConfirm={(values) => void runAction(updateOrder.mutateAsync(values))}
        />
      ) : null}
      {orderAction === 'close' ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
          title={t('orders:dialog.closeTitle')}
          description={t('orders:dialog.closeDescription')}
          confirmLabel={t('orders:dialog.closeConfirm')}
          isPending={close.isPending}
          onConfirm={() => void runAction(close.mutateAsync())}
        />
      ) : null}
      {orderAction === 'cancel' ? (
        <ReasonDialog
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
          title={t('orders:dialog.cancelTitle')}
          description={t('orders:dialog.cancelDescription')}
          fieldLabel={t('orders:dialog.cancelReason')}
          required
          maxLength={2000}
          confirmLabel={t('orders:dialog.cancelConfirm')}
          isPending={cancel.isPending}
          destructive
          onConfirm={(reason) => void runAction(cancel.mutateAsync(reason))}
        />
      ) : null}
      {orderAction === 'addJob' ? (
        <AddJobDialog
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
          isPending={addJob.isPending}
          onConfirm={(values) => void runAction(addJob.mutateAsync(values))}
        />
      ) : null}

      {/* Job-level dialogs (F4 §5/§6). */}
      {jobAction?.kind === 'accept' && openAssignment ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.acceptTitle')}
          description={t('orders:dialog.acceptDescription', { job: jobAction.job.title })}
          confirmLabel={t('orders:dialog.acceptConfirm')}
          isPending={accept.isPending}
          onConfirm={() => void runAction(accept.mutateAsync(openAssignment.id))}
        />
      ) : null}
      {jobAction?.kind === 'reject' && openAssignment ? (
        <ReasonDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.rejectTitle')}
          description={t('orders:dialog.rejectDescription')}
          fieldLabel={t('orders:dialog.rejectReason')}
          required={false}
          maxLength={1000}
          confirmLabel={t('orders:dialog.rejectConfirm')}
          isPending={reject.isPending}
          destructive
          onConfirm={(reason) =>
            void runAction(
              reject.mutateAsync({ assignId: openAssignment.id, reason: reason || undefined }),
            )
          }
        />
      ) : null}
      {jobAction?.kind === 'progress' ? (
        <ReasonDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.progressTitle')}
          description={t('orders:dialog.progressDescription', { job: jobAction.job.title })}
          fieldLabel={t('orders:dialog.progressMessage')}
          required
          maxLength={2000}
          confirmLabel={t('orders:dialog.progressConfirm')}
          isPending={progressJob.isPending}
          onConfirm={(message) =>
            void runAction(progressJob.mutateAsync({ jobId: jobAction.job.id, message }))
          }
        />
      ) : null}
      {jobAction?.kind === 'complete' ? (
        <ReasonDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.completeTitle')}
          description={t('orders:dialog.completeDescription', { job: jobAction.job.title })}
          fieldLabel={t('orders:dialog.completeResult')}
          required={false}
          maxLength={2000}
          confirmLabel={t('orders:dialog.completeConfirm')}
          isPending={completeJob.isPending}
          onConfirm={(result) =>
            void runAction(
              completeJob.mutateAsync({ jobId: jobAction.job.id, result: result || undefined }),
            )
          }
        />
      ) : null}
      {jobAction?.kind === 'incomplete' ? (
        <ReasonDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.incompleteTitle')}
          description={t('orders:dialog.incompleteDescription', { job: jobAction.job.title })}
          fieldLabel={t('orders:dialog.incompleteReason')}
          required
          maxLength={2000}
          confirmLabel={t('orders:dialog.incompleteConfirm')}
          isPending={incompleteJob.isPending}
          onConfirm={(reason) =>
            void runAction(incompleteJob.mutateAsync({ jobId: jobAction.job.id, reason }))
          }
        />
      ) : null}
      {jobAction?.kind === 'notRealized' ? (
        <ReasonDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.notRealizedTitle')}
          description={t('orders:dialog.notRealizedDescription', { job: jobAction.job.title })}
          fieldLabel={t('orders:dialog.notRealizedReason')}
          required
          maxLength={2000}
          confirmLabel={t('orders:dialog.notRealizedConfirm')}
          isPending={notRealizedJob.isPending}
          destructive
          onConfirm={(reason) =>
            void runAction(notRealizedJob.mutateAsync({ jobId: jobAction.job.id, reason }))
          }
        />
      ) : null}
      {jobAction?.kind === 'assign' ? (
        <AssignDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.assignTitle')}
          description={t('orders:dialog.assignDescription', { job: jobAction.job.title })}
          confirmLabel={t('orders:dialog.assignConfirm')}
          options={assignOptions}
          isPending={assignJob.isPending}
          onConfirm={(assigneeMembershipId) =>
            void runAction(
              assignJob.mutateAsync({ jobId: jobAction.job.id, assigneeMembershipId }),
            )
          }
        />
      ) : null}
      {jobAction?.kind === 'reassign' && openAssignment ? (
        <AssignDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.reassignTitle')}
          description={t('orders:dialog.reassignDescription', { job: jobAction.job.title })}
          confirmLabel={t('orders:dialog.reassignConfirm')}
          options={assignOptions}
          isPending={reassign.isPending}
          onConfirm={(assigneeMembershipId) =>
            void runAction(
              reassign.mutateAsync({
                assignId: openAssignment.id,
                input: { jobId: jobAction.job.id, assigneeMembershipId },
              }),
            )
          }
        />
      ) : null}
      {jobAction?.kind === 'revoke' && openAssignment ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) closeJobDialog();
          }}
          title={t('orders:dialog.revokeTitle')}
          description={t('orders:dialog.revokeDescription')}
          confirmLabel={t('orders:dialog.revokeConfirm')}
          isPending={revoke.isPending}
          destructive
          onConfirm={() => void runAction(revoke.mutateAsync(openAssignment.id))}
        />
      ) : null}
    </div>
  );
}
