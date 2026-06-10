import { describe, expect, it, vi } from 'vitest';
import { CoordinationService, type CoordinationDeps } from './coordination-service.js';
import type { ContextPersistencePort } from '../ports/context-persistence.js';
import type { TaskRequest, WorkClaim } from '../types.js';

class FakeTaskStore {
  tasks: TaskRequest[] = [];
  workClaims: WorkClaim[] = [];
  saveTask(task: TaskRequest): void {
    const idx = this.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) this.tasks[idx] = task;
    else this.tasks.push(task);
  }
  listTasks(): TaskRequest[] {
    return [...this.tasks];
  }
  saveWorkClaim(claim: WorkClaim): void {
    const idx = this.workClaims.findIndex((c) => c.id === claim.id);
    if (idx >= 0) this.workClaims[idx] = claim;
    else this.workClaims.push(claim);
  }
  listWorkClaims(): WorkClaim[] {
    return [...this.workClaims];
  }
}

function makeService(overrides: Partial<CoordinationDeps> = {}) {
  const store = new FakeTaskStore();
  const broadcast = vi.fn();
  const recordActivity = vi.fn();
  const appendCompletedTaskSummary = vi.fn();
  let seq = 0;
  const deps: CoordinationDeps = {
    broadcast,
    recordActivity,
    appendCompletedTaskSummary,
    now: () => '2026-05-31T00:00:00.000Z',
    newId: () => `id-${++seq}`,
    ...overrides,
  };
  const service = new CoordinationService(store as unknown as ContextPersistencePort, deps);
  return { service, store, broadcast, recordActivity, appendCompletedTaskSummary };
}

describe('CoordinationService — Task Request', () => {
  it('assigns TASK-1 to the first Task Request and TASK-2 to the next', () => {
    const { service } = makeService();

    const first = service.createTask({ title: 'Ship it' });
    const second = service.createTask({ title: 'Ship it again' });

    expect(first.humanId).toBe('TASK-1');
    expect(second.humanId).toBe('TASK-2');
  });

  it('persists the Task Request, broadcasts task.changed, and records task.created', () => {
    const { service, store, broadcast, recordActivity } = makeService();

    const task = service.createTask({ title: 'Ship it', requester: 'pi-planner', target: '@codex' });

    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0]).toEqual(task);
    expect(broadcast).toHaveBeenCalledWith('task.changed', { task });
    expect(recordActivity).toHaveBeenCalledWith('task.created', 'TASK-1 created: Ship it', {
      taskId: task.id,
      humanId: 'TASK-1',
    });
    expect(task.status).toBe('requested');
    expect(task.requester).toBe('pi-planner');
    expect(task.target).toBe('@codex');
  });

  it('advances a Task Request through its lifecycle, updating status and owner', () => {
    const { service, store, broadcast, recordActivity } = makeService();
    const created = service.createTask({ title: 'Ship it' });

    const updated = service.updateTaskLifecycle(
      'TASK-1',
      'accepted',
      'codex',
      'task.accepted',
      'codex accepted TASK-1',
    );

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('accepted');
    expect(updated?.owner).toBe('codex');
    expect(store.tasks[0].status).toBe('accepted');
    expect(broadcast).toHaveBeenLastCalledWith('task.changed', { task: updated });
    expect(recordActivity).toHaveBeenLastCalledWith('task.accepted', 'codex accepted TASK-1', {
      taskId: created.id,
      humanId: 'TASK-1',
      owner: 'codex',
    });
  });

  it('returns null and announces nothing when the Task Request is unknown', () => {
    const { service, broadcast, recordActivity } = makeService();

    const result = service.updateTaskLifecycle('TASK-404', 'completed', 'dev', 'task.completed', 'noop');

    expect(result).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it('keeps the existing owner when the transition passes a null owner', () => {
    const { service } = makeService();
    service.createTask({ title: 'Ship it' });
    service.updateTaskLifecycle('TASK-1', 'accepted', 'codex', 'task.accepted', 'codex accepted TASK-1');

    const blocked = service.updateTaskLifecycle(
      'TASK-1',
      'blocked',
      null,
      'task.blocked',
      'codex blocked TASK-1',
    );

    expect(blocked?.owner).toBe('codex');
    expect(blocked?.status).toBe('blocked');
  });

  it('delegates completed-task summaries to the injected Project Memory writer', () => {
    const { service, appendCompletedTaskSummary } = makeService();
    const task = service.createTask({ title: 'Ship it' });

    service.appendCompletedTaskSummary(task, 'shipped to prod');

    expect(appendCompletedTaskSummary).toHaveBeenCalledWith(task, 'shipped to prod');
  });
});

describe('CoordinationService — Work Claim', () => {
  it('records an active Work Claim for a Repository-relative path and announces it', () => {
    const { service, store, broadcast, recordActivity } = makeService();

    const claim = service.createWorkClaim({ path: 'src/login.ts', agentName: 'codex', note: 'refactor' });

    expect(claim).not.toBeNull();
    expect(claim?.status).toBe('active');
    expect(claim?.path).toBe('src/login.ts');
    expect(claim?.agentName).toBe('codex');
    expect(store.workClaims).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledWith('workClaim.changed', { workClaim: claim });
    expect(recordActivity).toHaveBeenCalledWith('work_claim.created', 'codex claimed src/login.ts', {
      workClaimId: claim?.id,
      path: 'src/login.ts',
      agentName: 'codex',
    });
  });

  it('rejects a Work Claim whose path escapes the Repository', () => {
    const { service, store, broadcast } = makeService();

    const absolute = service.createWorkClaim({ path: '/etc/passwd', agentName: 'codex' });
    const traversal = service.createWorkClaim({ path: '../secrets', agentName: 'codex' });

    expect(absolute).toBeNull();
    expect(traversal).toBeNull();
    expect(store.workClaims).toHaveLength(0);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('releases an active matching Work Claim and announces it', () => {
    const { service, store, broadcast, recordActivity } = makeService();
    service.createWorkClaim({ path: 'src/login.ts', agentName: 'codex' });

    const released = service.releaseWorkClaim({ path: 'src/login.ts', agentName: 'codex' });

    expect(released?.status).toBe('released');
    expect(store.workClaims[0].status).toBe('released');
    expect(broadcast).toHaveBeenLastCalledWith('workClaim.changed', { workClaim: released });
    expect(recordActivity).toHaveBeenLastCalledWith('work_claim.released', 'codex released src/login.ts', {
      workClaimId: released?.id,
      path: 'src/login.ts',
      agentName: 'codex',
    });
  });

  it('returns null and announces nothing when releasing a Work Claim with no active match', () => {
    const { service, broadcast, recordActivity } = makeService();

    const released = service.releaseWorkClaim({ path: 'src/nope.ts', agentName: 'codex' });

    expect(released).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe('CoordinationService — Startup Briefing', () => {
  it('generates a Briefing with the repository, harness, purpose, and the Collaboration Contract', () => {
    const { service } = makeService();

    const briefing = service.generateStartupBriefing('codex', 'pi', '/repo/omni', 'review the PR');

    expect(briefing).toContain('# Startup Briefing for codex');
    expect(briefing).toContain('Repository: /repo/omni');
    expect(briefing).toContain('Harness: pi');
    expect(briefing).toContain('Purpose: review the PR');
    expect(briefing).toContain('## Collaboration Contract');
    expect(briefing).toContain('- Communicate through Omni hub.');
    expect(briefing).toContain('- Use explicit Work Claims before overlapping work.');
  });

  it('omits the Purpose line when none is given and notes when no Repository is selected', () => {
    const { service } = makeService();

    const briefing = service.generateStartupBriefing('codex', 'pi', '');

    expect(briefing).not.toContain('Purpose:');
    expect(briefing).toContain('Repository: No Repository selected');
  });
});
