import type { AssignmentViewDto, JobViewDto, OrderViewDto } from '@/api/types';

/**
 * Action matrix of the order detail (spec F4-D5, AC-F4.12): a pure function
 * that decides which transitions §20 the UI offers for the current state and
 * relationship with the order. The server validates every transition again
 * (§16.1); this only mirrors the contract's preconditions so the UI never
 * offers a button that is guaranteed to answer 409/403:
 *
 * - state gates mirror §20.1 (order), §20.2 (job) and §20.3 (assignment);
 * - `isOwnerSpace` gates the decisions of the responsible company (§2.3,
 *   Etapa 3 #13/#19: close, cancel, assign, reassign, revoke, resume,
 *   not-realized, add job, convert);
 * - the assignee gates accept/reject (pending only), start/progress/
 *   complete/incomplete (own active assignment, §6.1–§6.2).
 */
export interface OrderActionContext {
  /** Active space id; `order.companyId === companyId` means "my space owns it". */
  companyId: string;
  /** Ids of every membership of the current user (spec F2-D2). */
  myMembershipIds: readonly string[];
}

export interface JobActionPlan {
  // Responsible company decisions (§5.5–§5.7, §6.2–§6.3).
  assign: boolean;
  reassign: boolean;
  revoke: boolean;
  resume: boolean;
  notRealized: boolean;
  // Assignee decisions (§5.6, §6.1–§6.2).
  accept: boolean;
  reject: boolean;
  start: boolean;
  progress: boolean;
  complete: boolean;
  incomplete: boolean;
}

export interface OrderActionPlan {
  convert: boolean;
  editInstructions: boolean;
  editUrgent: boolean;
  cancel: boolean;
  close: boolean;
  addJob: boolean;
  jobs: Record<string, JobActionPlan>;
}

/** §20.2: `done` and `not_realized` are terminal — no transition leaves them. */
const TERMINAL_JOB_STATUSES: ReadonlySet<JobViewDto['status']> = new Set(['done', 'not_realized']);

/** An assignment that is still in flight: `pending` or `accepted` (§20.3). */
function isActiveAssignment(assignment: AssignmentViewDto): boolean {
  return assignment.status === 'pending' || assignment.status === 'accepted';
}

/** The caller's own active assignment on a job, or undefined (§2.12). */
export function myActiveAssignment(
  job: JobViewDto,
  myMembershipIds: readonly string[],
): AssignmentViewDto | undefined {
  const own = new Set(myMembershipIds);
  return job.assignments.find(
    (assignment) => own.has(assignment.assigneeMembershipId) && isActiveAssignment(assignment),
  );
}

/** The single active assignment of a job, or undefined (`assign` gate, §20.3). */
function activeAssignmentOf(job: JobViewDto): AssignmentViewDto | undefined {
  return job.assignments.find(isActiveAssignment);
}

/** The caller's accepted assignment — the only one allowed to run §6.1/§6.2. */
function acceptedAssignmentOf(
  job: JobViewDto,
  myMembershipIds: readonly string[],
): AssignmentViewDto | undefined {
  const mine = myActiveAssignment(job, myMembershipIds);
  return mine && mine.status === 'accepted' ? mine : undefined;
}

/** Per-job plan: responsible-company gates × assignee gates (§20.2, §20.3). */
function jobActionsFor(
  job: JobViewDto,
  isOwnerSpace: boolean,
  ctx: OrderActionContext,
): JobActionPlan {
  const terminal = TERMINAL_JOB_STATUSES.has(job.status);
  const active = activeAssignmentOf(job);
  const pendingMine = (() => {
    const mine = myActiveAssignment(job, ctx.myMembershipIds);
    return mine && mine.status === 'pending' ? mine : undefined;
  })();
  const acceptedMine = acceptedAssignmentOf(job, ctx.myMembershipIds);

  return {
    // Responsible company (Etapa 3 matrix #13/#19, §5.5–§5.7, §6.3).
    assign: isOwnerSpace && active === undefined,
    reassign: isOwnerSpace && active !== undefined && job.status !== 'in_progress',
    revoke: isOwnerSpace && active !== undefined && job.status !== 'in_progress',
    resume: isOwnerSpace && job.status === 'incomplete' && hasAcceptedAssignment(job),
    notRealized: isOwnerSpace && !terminal,
    // Assignee (§5.6, §6.1–§6.2).
    accept: pendingMine !== undefined && (job.status === 'pending' || job.status === 'incomplete'),
    reject: pendingMine !== undefined,
    start: acceptedMine !== undefined && job.status === 'accepted',
    progress: acceptedMine !== undefined && !terminal,
    complete: acceptedMine !== undefined && job.status === 'in_progress',
    incomplete: acceptedMine !== undefined && job.status === 'in_progress',
  };
}

/** Any accepted assignment on the job (`resume` needs it on the same person). */
function hasAcceptedAssignment(job: JobViewDto): boolean {
  return job.assignments.some((assignment) => assignment.status === 'accepted');
}

/** Computes the full plan for an order (spec F4-D5). */
export function allowedOrderActions(
  order: OrderViewDto,
  ctx: OrderActionContext,
): OrderActionPlan {
  const isOwnerSpace = order.companyId === ctx.companyId;
  const managesOrder =
    isOwnerSpace ||
    order.jobs.some((job) => myActiveAssignment(job, ctx.myMembershipIds) !== undefined);
  const terminalOrder = order.status === 'completed' || order.status === 'cancelled';
  const allJobsTerminal =
    order.jobs.length > 0 && order.jobs.every((job) => TERMINAL_JOB_STATUSES.has(job.status));
  const noJobStarted = order.jobs.every((job) => job.startedAt === null);

  const plan: OrderActionPlan = {
    convert: isOwnerSpace && order.status === 'requested',
    editInstructions: managesOrder,
    editUrgent: isOwnerSpace && !terminalOrder,
    cancel: isOwnerSpace && order.status === 'open' && noJobStarted,
    close:
      isOwnerSpace &&
      (order.status === 'open' || order.status === 'in_progress') &&
      allJobsTerminal,
    addJob: isOwnerSpace,
    jobs: Object.fromEntries(
      order.jobs.map((job) => [job.id, jobActionsFor(job, isOwnerSpace, ctx)]),
    ),
  };
  return plan;
}
