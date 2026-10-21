import { describe, expect, it } from 'vitest';

import type { AssignmentViewDto, JobViewDto, OrderViewDto } from '@/api/types';
import { allowedOrderActions, myActiveAssignment } from '@/orders/actions';

/**
 * Matrix of spec F4-D5 / AC-F4.12: for each state + relationship the plan must
 * offer exactly the transitions the server accepts (§20.1–§20.3, §5.5–§5.7,
 * §6.1–§6.4). Server rules are the source; these cases pin the mirror.
 */

const MY = 'mem-me';
const OTHER = 'mem-other';

const assignment = (
  id: string,
  assigneeMembershipId: string,
  status: AssignmentViewDto['status'],
  over: Partial<AssignmentViewDto> = {},
): AssignmentViewDto => ({
  id,
  status,
  assigneeMembershipId,
  respondedAt: null,
  rejectionReason: null,
  createdAt: '2026-10-10T08:00:00.000Z',
  ...over,
});

const job = (
  id: string,
  status: JobViewDto['status'],
  assignments: AssignmentViewDto[],
  over: Partial<JobViewDto> = {},
): JobViewDto => ({
  id,
  title: `Trabajo ${id}`,
  description: 'Desc',
  sortOrder: 1,
  status,
  startedAt: null,
  completedAt: null,
  assignments,
  ...over,
});

const order = (over: Partial<OrderViewDto> = {}): OrderViewDto => ({
  id: 'o-1',
  title: 'Orden',
  description: 'Desc',
  status: 'open',
  urgent: false,
  origin: 'management',
  propertyId: 'p-1',
  companyId: 'c-1',
  parentOrderId: null,
  closedBy: null,
  closedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  cancellationReason: null,
  access: null,
  jobs: [],
  createdAt: '2026-10-10T08:00:00.000Z',
  ...over,
});

const ctx = { companyId: 'c-1', myMembershipIds: [MY] };

describe('allowedOrderActions (AC-F4.12)', () => {
  it('offers the responsible decisions on an own open order without jobs', () => {
    const plan = allowedOrderActions(order(), ctx);
    expect(plan).toMatchObject({
      convert: false,
      editInstructions: true,
      editUrgent: true,
      // open + no jobs started → cancelable; close needs ≥1 terminal job (§6.4).
      cancel: true,
      close: false,
      addJob: true,
    });
  });

  it('converts only `requested` orders of the own space (§20.1)', () => {
    expect(allowedOrderActions(order({ status: 'requested' }), ctx).convert).toBe(true);
    expect(allowedOrderActions(order({ status: 'open' }), ctx).convert).toBe(false);
    expect(
      allowedOrderActions(order({ status: 'requested', companyId: 'c-2' }), ctx).convert,
    ).toBe(false);
  });

  it('locks cancel when a job already started, and close until all are terminal (§6.1–§6.4)', () => {
    const started = order({
      status: 'in_progress',
      jobs: [job('j-1', 'in_progress', [], { startedAt: '2026-10-11T09:00:00.000Z' })],
    });
    const startedPlan = allowedOrderActions(started, ctx);
    expect(startedPlan.cancel).toBe(false);
    expect(startedPlan.close).toBe(false);

    const finished = order({
      status: 'in_progress',
      jobs: [
        job('j-1', 'done', [], { startedAt: '2026-10-11T09:00:00.000Z' }),
        job('j-2', 'not_realized', []),
      ],
    });
    const finishedPlan = allowedOrderActions(finished, ctx);
    expect(finishedPlan.close).toBe(true);
    expect(finishedPlan.cancel).toBe(false);
  });

  it('locks the lifecycle buttons on terminal orders (completed/cancelled)', () => {
    const plan = allowedOrderActions(order({ status: 'completed' }), ctx);
    expect(plan).toMatchObject({
      convert: false,
      editUrgent: false,
      cancel: false,
      close: false,
      // Instructions stay editable (§4.4), urgent does not (§14.2).
      editInstructions: true,
    });
  });

  it('hides every responsible decision from another space (§2.3, §16.1)', () => {
    const foreign = order({
      companyId: 'c-2',
      jobs: [job('j-1', 'pending', [assignment('a-1', MY, 'pending')])],
    });
    const plan = allowedOrderActions(foreign, ctx);
    expect(plan).toMatchObject({
      convert: false,
      editInstructions: true, // managing company with an active assignment (§4.4)
      editUrgent: false,
      cancel: false,
      close: false,
      addJob: false,
    });
    expect(plan.jobs['j-1']).toMatchObject({
      assign: false,
      reassign: false,
      revoke: false,
      resume: false,
      notRealized: false,
      accept: true,
      reject: true,
      start: false,
      progress: false,
    });
  });

  it('walks the assignee flow pending → accepted → in_progress (§5.6, §20.2)', () => {
    const pending = order({ jobs: [job('j-1', 'pending', [assignment('a-1', MY, 'pending')])] });
    expect(allowedOrderActions(pending, ctx).jobs['j-1']).toMatchObject({
      accept: true,
      reject: true,
      start: false,
      progress: false,
      complete: false,
      incomplete: false,
    });

    const accepted = order({ jobs: [job('j-1', 'accepted', [assignment('a-1', MY, 'accepted')])] });
    expect(allowedOrderActions(accepted, ctx).jobs['j-1']).toMatchObject({
      accept: false,
      reject: false,
      start: true,
      progress: true,
      complete: false,
      incomplete: false,
    });

    const running = order({
      jobs: [
        job('j-1', 'in_progress', [assignment('a-1', MY, 'accepted')], {
          startedAt: '2026-10-11T09:00:00.000Z',
        }),
      ],
    });
    expect(allowedOrderActions(running, ctx).jobs['j-1']).toMatchObject({
      start: false,
      progress: true,
      complete: true,
      incomplete: true,
      reassign: false, // in progress → first report it incomplete (§5.7)
      revoke: false,
    });
  });

  it('never offers assignee buttons for somebody else’s assignment (§2.12)', () => {
    const notMine = order({
      jobs: [job('j-1', 'pending', [assignment('a-1', OTHER, 'pending')])],
    });
    const plan = allowedOrderActions(notMine, ctx);
    expect(plan.jobs['j-1']).toMatchObject({ accept: false, reject: false, start: false });
    // Own space still runs the responsible decisions over the same job.
    expect(plan.jobs['j-1']).toMatchObject({ assign: false, reassign: true, revoke: true });
    expect(myActiveAssignment(notMine.jobs[0], [MY])).toBeUndefined();
  });

  it('offers resume only on an incomplete job with an accepted assignment (§6.2)', () => {
    const incomplete = order({
      jobs: [job('j-1', 'incomplete', [assignment('a-1', MY, 'accepted')])],
    });
    const plan = allowedOrderActions(incomplete, ctx);
    expect(plan.jobs['j-1']).toMatchObject({ resume: true, notRealized: true, start: false });

    const noAssignee = order({ jobs: [job('j-1', 'incomplete', [])] });
    expect(allowedOrderActions(noAssignee, ctx).jobs['j-1'].resume).toBe(false);
  });

  it('keeps not-realized available while the job is not terminal (§6.3)', () => {
    const done = order({ jobs: [job('j-1', 'done', [assignment('a-1', MY, 'accepted')])] });
    expect(allowedOrderActions(done, ctx).jobs['j-1']).toMatchObject({
      notRealized: false,
      progress: false,
      complete: false,
      incomplete: false,
    });
    const unrealized = order({ jobs: [job('j-1', 'not_realized', [])] });
    expect(allowedOrderActions(unrealized, ctx).jobs['j-1'].notRealized).toBe(false);
  });

  it('offers assign only while the job has no active assignment (§20.3)', () => {
    const free = order({ jobs: [job('j-1', 'pending', [])] });
    expect(allowedOrderActions(free, ctx).jobs['j-1'].assign).toBe(true);

    const taken = order({ jobs: [job('j-1', 'pending', [assignment('a-1', OTHER, 'pending')])] });
    expect(allowedOrderActions(taken, ctx).jobs['j-1'].assign).toBe(false);

    const answered = order({
      jobs: [job('j-1', 'pending', [assignment('a-1', OTHER, 'rejected')])],
    });
    expect(allowedOrderActions(answered, ctx).jobs['j-1'].assign).toBe(true);
  });
});
