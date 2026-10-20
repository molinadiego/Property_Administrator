import {
  JOB_TERMINAL_STATUSES,
  canCancelOrder,
  canCloseOrder,
  canTransitionJob,
  isTerminalJobStatus,
  orderStatusAfterJobStart,
} from './job-rules';

describe('job state machine (§20.2)', () => {
  it('allows the documented job transitions', () => {
    expect(canTransitionJob('pending', 'accepted')).toBe(true); // accept
    expect(canTransitionJob('pending', 'not_realized')).toBe(true); // §6.3
    expect(canTransitionJob('accepted', 'in_progress')).toBe(true); // start
    expect(canTransitionJob('accepted', 'not_realized')).toBe(true);
    expect(canTransitionJob('in_progress', 'done')).toBe(true); // complete
    expect(canTransitionJob('in_progress', 'incomplete')).toBe(true); // §6.2
    expect(canTransitionJob('in_progress', 'not_realized')).toBe(true);
    expect(canTransitionJob('incomplete', 'in_progress')).toBe(true); // resume
    expect(canTransitionJob('incomplete', 'not_realized')).toBe(true);
  });

  it('sends an accepted-but-unstarted job back to pending on revoke (§20.3)', () => {
    expect(canTransitionJob('accepted', 'pending')).toBe(true);
  });

  it('refuses every transition out of a terminal state (§20.2)', () => {
    for (const terminal of JOB_TERMINAL_STATUSES) {
      for (const to of ['pending', 'accepted', 'in_progress', 'incomplete', 'done', 'not_realized'] as const) {
        expect(canTransitionJob(terminal, to)).toBe(false);
      }
    }
    expect(isTerminalJobStatus('done')).toBe(true);
    expect(isTerminalJobStatus('not_realized')).toBe(true);
    expect(isTerminalJobStatus('in_progress')).toBe(false);
  });

  it('requires explicit start: pending/accepted never jump to done or incomplete', () => {
    expect(canTransitionJob('pending', 'in_progress')).toBe(false);
    expect(canTransitionJob('pending', 'done')).toBe(false);
    expect(canTransitionJob('pending', 'incomplete')).toBe(false);
    expect(canTransitionJob('accepted', 'done')).toBe(false);
    expect(canTransitionJob('accepted', 'incomplete')).toBe(false);
  });
});

describe('order effects (§20.1)', () => {
  it('moves an open order to in_progress when a job starts', () => {
    expect(orderStatusAfterJobStart('open')).toBe('in_progress');
  });

  it('never reopens or rewrites a completed/cancelled order', () => {
    expect(orderStatusAfterJobStart('completed')).toBe('completed');
    expect(orderStatusAfterJobStart('cancelled')).toBe('cancelled');
    expect(orderStatusAfterJobStart('in_progress')).toBe('in_progress');
    expect(orderStatusAfterJobStart('requested')).toBe('requested');
  });
});

describe('close precondition (§6.4)', () => {
  const terminal = [
    { status: 'done' as const },
    { status: 'not_realized' as const },
  ];

  it('closes only when every job is done or not_realized', () => {
    expect(canCloseOrder('open', terminal)).toBe(true);
    expect(canCloseOrder('in_progress', terminal)).toBe(true);
  });

  it('refuses while any job is not terminal', () => {
    expect(canCloseOrder('in_progress', [...terminal, { status: 'incomplete' as const }])).toBe(false);
    expect(canCloseOrder('open', [...terminal, { status: 'pending' as const }])).toBe(false);
    expect(canCloseOrder('open', [...terminal, { status: 'accepted' as const }])).toBe(false);
    expect(canCloseOrder('open', [...terminal, { status: 'in_progress' as const }])).toBe(false);
    expect(canCloseOrder('open', [])).toBe(false);
  });

  it('never closes a requested/completed/cancelled order (§11)', () => {
    expect(canCloseOrder('requested', terminal)).toBe(false);
    expect(canCloseOrder('completed', terminal)).toBe(false);
    expect(canCloseOrder('cancelled', terminal)).toBe(false);
  });
});

describe('cancel precondition (§20.1)', () => {
  it('cancels from open while no job has started', () => {
    const untouched = [{ startedAt: null }, { startedAt: null }];
    expect(canCancelOrder('open', untouched)).toBe(true);
  });

  it('refuses once any job has a started_at', () => {
    expect(canCancelOrder('open', [{ startedAt: null }, { startedAt: new Date() }])).toBe(false);
  });

  it('refuses from in_progress/completed/cancelled/requested', () => {
    const untouched = [{ startedAt: null }];
    expect(canCancelOrder('in_progress', untouched)).toBe(false);
    expect(canCancelOrder('completed', untouched)).toBe(false);
    expect(canCancelOrder('cancelled', untouched)).toBe(false);
    expect(canCancelOrder('requested', untouched)).toBe(false);
  });
});
