import path from 'path';
import type { ContextPersistencePort } from '../ports/context-persistence.js';
import type { TaskPriority, TaskRequest, TaskStatus, WorkClaim } from '../types.js';

function isSafeRepositoryRelativePath(value: string): boolean {
  return Boolean(value) && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..');
}

export interface CoordinationDeps {
  broadcast(type: string, payload?: Record<string, unknown>): void;
  recordActivity(kind: string, summary: string, payload?: Record<string, unknown>): void;
  appendCompletedTaskSummary(task: TaskRequest, resultSummary: string): void;
  now(): string;
  newId(): string;
}

export class CoordinationService {
  constructor(
    private persistence: ContextPersistencePort,
    private deps: CoordinationDeps,
  ) {}

  private nextTaskHumanId(): string {
    const max = this.persistence.listTasks(10_000).reduce((current, task) => {
      const match = /^TASK-(\d+)$/.exec(task.humanId);
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    return `TASK-${max + 1}`;
  }

  createTask(input: Record<string, unknown>): TaskRequest {
    const now = this.deps.now();
    const priority = ['low', 'normal', 'high', 'urgent'].includes(String(input.priority))
      ? (String(input.priority) as TaskPriority)
      : 'normal';
    const task: TaskRequest = {
      id: this.deps.newId(),
      humanId: this.nextTaskHumanId(),
      requester: String(input.requester || 'dev'),
      target: String(input.target || '#all'),
      title: String(input.title || 'Untitled Task Request'),
      details: String(input.details || ''),
      expectedResult: String(input.expectedResult || ''),
      priority,
      status: 'requested',
      owner: null,
      parentTaskId: typeof input.parentTaskId === 'string' ? input.parentTaskId : null,
      filePaths: Array.isArray(input.filePaths) ? input.filePaths.map(String) : [],
      createdAt: now,
      updatedAt: now,
    };
    this.persistence.saveTask(task);
    this.deps.broadcast('task.changed', { task });
    this.deps.recordActivity('task.created', `${task.humanId} created: ${task.title}`, {
      taskId: task.id,
      humanId: task.humanId,
    });
    return task;
  }

  updateTaskLifecycle(
    humanId: string,
    status: TaskStatus,
    owner: string | null,
    activityKind: string,
    summary: string,
  ): TaskRequest | null {
    const task = this.persistence.listTasks(10_000).find((item) => item.humanId === humanId);
    if (!task) return null;
    const updated: TaskRequest = {
      ...task,
      status,
      owner: owner ?? task.owner,
      updatedAt: this.deps.now(),
    };
    this.persistence.saveTask(updated);
    this.deps.broadcast('task.changed', { task: updated });
    this.deps.recordActivity(activityKind, summary, {
      taskId: updated.id,
      humanId: updated.humanId,
      owner: updated.owner,
    });
    return updated;
  }

  appendCompletedTaskSummary(task: TaskRequest, resultSummary: string): void {
    this.deps.appendCompletedTaskSummary(task, resultSummary);
  }

  generateStartupBriefing(
    agentName: string,
    harness: string,
    repositoryPath: string,
    purpose?: string,
  ): string {
    return [
      `# Startup Briefing for ${agentName}`,
      '',
      `Repository: ${repositoryPath || 'No Repository selected'}`,
      `Harness: ${harness}`,
      purpose ? `Purpose: ${purpose}` : undefined,
      '',
      '## Collaboration Contract',
      '',
      '- Communicate through Omni hub.',
      '- Use explicit Task Requests for assignable work.',
      '- Ask Clarifying Questions when unclear.',
      '- Use explicit Work Claims before overlapping work.',
      '- Do not inspect other agents private terminal work.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private connectorNameFallback(input: Record<string, unknown>): string {
    return String(input.agentName || 'agent');
  }

  createWorkClaim(input: Record<string, unknown>): WorkClaim | null {
    const claimPath = String(input.path || '');
    if (!isSafeRepositoryRelativePath(claimPath)) return null;
    const now = this.deps.now();
    const existing = this.persistence
      .listWorkClaims(10_000)
      .find(
        (item) =>
          item.path === claimPath &&
          item.agentName === String(input.agentName || this.connectorNameFallback(input)),
      );
    const workClaim: WorkClaim = {
      id: existing?.id ?? this.deps.newId(),
      agentName: String(input.agentName || this.connectorNameFallback(input)),
      path: claimPath,
      note: String(input.note || ''),
      status: 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.persistence.saveWorkClaim(workClaim);
    this.deps.broadcast('workClaim.changed', { workClaim });
    this.deps.recordActivity('work_claim.created', `${workClaim.agentName} claimed ${workClaim.path}`, {
      workClaimId: workClaim.id,
      path: workClaim.path,
      agentName: workClaim.agentName,
    });
    return workClaim;
  }

  releaseWorkClaim(input: Record<string, unknown>): WorkClaim | null {
    const claimPath = String(input.path || '');
    const agentName = String(input.agentName || this.connectorNameFallback(input));
    const existing = this.persistence
      .listWorkClaims(10_000)
      .find((item) => item.path === claimPath && item.agentName === agentName && item.status === 'active');
    if (!existing) return null;
    const workClaim: WorkClaim = {
      ...existing,
      status: 'released',
      updatedAt: this.deps.now(),
    };
    this.persistence.saveWorkClaim(workClaim);
    this.deps.broadcast('workClaim.changed', { workClaim });
    this.deps.recordActivity('work_claim.released', `${workClaim.agentName} released ${workClaim.path}`, {
      workClaimId: workClaim.id,
      path: workClaim.path,
      agentName: workClaim.agentName,
    });
    return workClaim;
  }
}
