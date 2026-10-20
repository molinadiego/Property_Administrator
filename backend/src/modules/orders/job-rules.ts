/**
 * Pure state machines for jobs (§20.2) and orders (§20.1) plus the close and
 * cancel preconditions (§6.4, §20.1) (docs/especificacion/etapa-3.md §8).
 *
 * No Prisma, no Nest: unit-testable in isolation (pattern:
 * modules/memberships/membership-rules.ts). HTTP mapping (409) happens in the
 * service, not here.
 */

export type JobStatusValue =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'incomplete'
  | 'done'
  | 'not_realized';

export type OrderStatusValue = 'requested' | 'open' | 'in_progress' | 'completed' | 'cancelled';

/** §20.2: «Completado es un estado final»; «No pudo concretarse» also closes the story. */
export const JOB_TERMINAL_STATUSES: readonly JobStatusValue[] = ['done', 'not_realized'];

/** Legal job transitions (§20.2). */
const JOB_TRANSITIONS: Record<JobStatusValue, readonly JobStatusValue[]> = {
  // Assigned, waiting for the assignee's answer (Etapa 2 convention: job
  // `pending` + assignment `pending`/`accepted`).
  pending: ['accepted', 'not_realized'],
  // Revoke sends an accepted-but-unstarted job back to pending (§20.3).
  accepted: ['pending', 'in_progress', 'not_realized'],
  // Only `start` moves to in_progress; only `complete` finishes it (§20.2).
  in_progress: ['done', 'incomplete', 'not_realized'],
  // «Incompleto → En curso» needs the responsible party's authorization (§6.2).
  // `incomplete → accepted` happens when a new assignee picks the job up after
  // a reassign (Etapa 2's accept operating over an Etapa 3 state).
  incomplete: ['accepted', 'in_progress', 'not_realized'],
  done: [],
  not_realized: [],
};

/** Whether the job machine allows `from → to` (§20.2). */
export function canTransitionJob(from: JobStatusValue, to: JobStatusValue): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Whether the job is in a terminal state (§20.2). */
export function isTerminalJobStatus(status: JobStatusValue): boolean {
  return JOB_TERMINAL_STATUSES.includes(status);
}

/**
 * Order-level effect of a job starting: «Aceptada → En curso» (§20.1). Orders
 * in any other status keep it (a completed/cancelled order never reopens).
 * BE-2: `assigned` was retired; acceptance lives on the assignment (§20.3).
 */
export function orderStatusAfterJobStart(orderStatus: OrderStatusValue): OrderStatusValue {
  return orderStatus === 'open' ? 'in_progress' : orderStatus;
}

/**
 * Close precondition (§6.4): every job of the order must be `done` or
 * `not_realized`; a `requested`/`completed`/`cancelled` order never closes.
 */
export function canCloseOrder(
  orderStatus: OrderStatusValue,
  jobs: ReadonlyArray<{ status: JobStatusValue }>,
): boolean {
  if (orderStatus === 'requested' || orderStatus === 'completed' || orderStatus === 'cancelled') {
    return false;
  }
  if (jobs.length === 0) return false;
  return jobs.every((job) => job.status === 'done' || job.status === 'not_realized');
}

/**
 * Cancel precondition (§20.1): only from Borrador/Enviada (mapped `open` —
 * BE-2: `assigned` was retired) and only while **no** job has started
 * (`started_at` null in all of them — «si no se realizó ningún trabajo»).
 */
export function canCancelOrder(
  orderStatus: OrderStatusValue,
  jobs: ReadonlyArray<{ startedAt: Date | null }>,
): boolean {
  if (orderStatus !== 'open') return false;
  return jobs.every((job) => job.startedAt === null);
}

/** Max characters for job event messages (spec etapa-3 §2.5). */
export const JOB_EVENT_MESSAGE_MAX = 2000;
