import type { WebSocket } from 'ws';
import type { AgentPresence, Message, TaskRequest, TaskStatus, WorkClaim } from '../types.js';
import { maxHopsFromEnv } from '../domain/chat-service.js';

export type CoordinationSignalMessage = Record<string, unknown> & { type?: string };

export interface CoordinationSignalIntakeDeps {
  connectorName(): string | null;
  send(ws: WebSocket, type: string, payload?: Record<string, unknown>): void;
  createTask(input: Record<string, unknown>): TaskRequest;
  updateTaskLifecycle(
    humanId: string,
    status: TaskStatus,
    owner: string | null,
    activityKind: string,
    summary: string,
  ): TaskRequest | null;
  appendCompletedTaskSummary(task: TaskRequest, resultSummary: string): void;
  createWorkClaim(input: Record<string, unknown>): WorkClaim | null;
  releaseWorkClaim(input: Record<string, unknown>): WorkClaim | null;
  updatePresence(agentName: string, presence: AgentPresence): void;
  currentPresence(agentName: string): AgentPresence | undefined;
  recordChatMessage(
    channelId: string,
    sender: string,
    content: string,
    metadata?: { msg_id?: string; inReplyTo?: string; expectsReply?: boolean; hops?: number },
  ): Message;
  sendDevMessage(
    channelId: string,
    content: string,
    channelType: 'group' | 'dm',
    explicitTargets?: string[],
  ): Message;
  sendCoordinationMessage(channelId: string, sender: string, content: string, message?: Message): void;
  relayCoordinationToTerminalAgents(
    channelId: string,
    sender: string,
    content: string,
    message?: Message,
  ): void;
  recordActivity(kind: string, summary: string, payload?: Record<string, unknown>): void;
}

function connectorNameFallback(msg: CoordinationSignalMessage, connectorName: string | null): string {
  return String(msg.agentName || connectorName || 'agent');
}

function validWorkStatus(value: unknown): AgentPresence['workStatus'] | null {
  return ['idle', 'busy', 'blocked', 'done', 'unknown'].includes(String(value))
    ? (String(value) as AgentPresence['workStatus'])
    : null;
}

export class CoordinationSignalIntake {
  constructor(private deps: CoordinationSignalIntakeDeps) {}

  handle(ws: WebSocket, msg: CoordinationSignalMessage): boolean {
    const connectorName = this.deps.connectorName();

    switch (msg.type) {
      case 'connector.workClaim.create':
        this.deps.createWorkClaim({ ...msg, agentName: msg.agentName || connectorName || 'agent' });
        return true;

      case 'connector.workClaim.release':
        this.deps.releaseWorkClaim({ ...msg, agentName: msg.agentName || connectorName || 'agent' });
        return true;

      case 'connector.task.create':
        this.deps.createTask({ ...msg, requester: msg.requester || connectorName || 'agent' });
        return true;

      case 'connector.task.accept':
        return this.updateConnectorTask(msg, 'accepted', 'task.accepted', 'accepted');

      case 'connector.task.reject':
        return this.updateConnectorTask(msg, 'rejected', 'task.rejected', 'rejected');

      case 'connector.task.block':
        return this.updateConnectorTask(msg, 'blocked', 'task.blocked', 'blocked');

      case 'connector.task.fail':
        return this.updateConnectorTask(msg, 'failed', 'task.failed', 'failed');

      case 'connector.task.complete': {
        const humanId = String(msg.humanId || '');
        const owner = String(msg.owner || connectorName || 'agent');
        const task = this.deps.updateTaskLifecycle(
          humanId,
          'completed',
          owner,
          'task.completed',
          `${owner} completed ${humanId}`,
        );
        if (task) this.deps.appendCompletedTaskSummary(task, String(msg.resultSummary || ''));
        return true;
      }

      case 'presence.heartbeat': {
        const agentName = connectorNameFallback(msg, connectorName);
        const workStatus =
          validWorkStatus(msg.workStatus) ?? this.deps.currentPresence(agentName)?.workStatus ?? 'idle';
        const currentTaskId = typeof msg.currentTaskId === 'string' ? msg.currentTaskId : undefined;
        this.deps.updatePresence(agentName, {
          connectionStatus: 'connected',
          workStatus,
          lastSeenAt: new Date().toISOString(),
          ...(currentTaskId ? { currentTaskId } : {}),
          ...(typeof msg.contextUsedPct === 'number'
            ? { contextUsedPct: Math.max(0, Math.min(100, msg.contextUsedPct)) }
            : {}),
        });
        return true;
      }

      case 'connector.chat.send': {
        const channelId = String(msg.channelId || '#all');
        const sender = String(msg.sender || connectorName || 'agent');
        const content = String(msg.content || '');
        if (content) {
          const hops = typeof msg.hops === 'number' ? msg.hops : 0;
          if (hops >= maxHopsFromEnv()) {
            this.deps.recordActivity('message.dropped', `Message dropped at hop cap for ${channelId}`, {
              channelId,
              sender,
              hops,
              maxHops: maxHopsFromEnv(),
            });
            return true;
          }
          const message = this.deps.recordChatMessage(channelId, sender, content, {
            msg_id: typeof msg.msg_id === 'string' ? msg.msg_id : undefined,
            inReplyTo: typeof msg.inReplyTo === 'string' ? msg.inReplyTo : undefined,
            expectsReply: msg.expectsReply === true,
            hops,
          });
          this.deps.sendCoordinationMessage(channelId, sender, content, message);
          this.deps.relayCoordinationToTerminalAgents(channelId, sender, content, message);
          this.deps.recordActivity('message.sent', `Message sent to ${channelId}`, { channelId, sender });
        }
        return true;
      }

      case 'task.create': {
        const task = this.deps.createTask(msg);
        this.deps.send(ws, 'task-created', { task });
        return true;
      }

      case 'workClaim.create': {
        const workClaim = this.deps.createWorkClaim({ ...msg, agentName: msg.agentName || 'Dev' });
        if (workClaim) this.deps.send(ws, 'workClaim-created', { workClaim });
        else
          this.deps.send(ws, 'workClaim.failed', {
            reason: 'Work Claim path must be Repository-relative and cannot contain ..',
          });
        return true;
      }

      case 'workClaim.release': {
        const workClaim = this.deps.releaseWorkClaim({ ...msg, agentName: msg.agentName || 'Dev' });
        if (workClaim) this.deps.send(ws, 'workClaim-released', { workClaim });
        else this.deps.send(ws, 'workClaim.failed', { reason: 'No active matching Work Claim found.' });
        return true;
      }

      case 'task.accept':
        return this.updateDevTask(msg, 'accepted', 'task.accepted', 'accepted');

      case 'task.reject':
        return this.updateDevTask(msg, 'rejected', 'task.rejected', 'rejected');

      case 'task.block':
        return this.updateDevTask(msg, 'blocked', 'task.blocked', 'blocked');

      case 'task.fail':
        return this.updateDevTask(msg, 'failed', 'task.failed', 'failed');

      case 'task.complete': {
        const humanId = String(msg.humanId || '');
        const task = this.deps.updateTaskLifecycle(
          humanId,
          'completed',
          'Dev',
          'task.completed',
          `Dev completed ${humanId}`,
        );
        if (task) this.deps.appendCompletedTaskSummary(task, String(msg.resultSummary || ''));
        return true;
      }

      case 'task.cancel': {
        const humanId = String(msg.humanId || '');
        this.deps.updateTaskLifecycle(
          humanId,
          'cancelled',
          null,
          'task.cancelled',
          `Dev cancelled ${humanId}`,
        );
        return true;
      }

      case 'send-message': {
        const channelId = String(msg.channelId || '#all');
        const content = String(msg.content || '');
        const channelType = msg.channelType === 'dm' ? 'dm' : 'group';
        const explicitTargets = Array.isArray(msg.explicitTargets)
          ? msg.explicitTargets.map(String)
          : undefined;
        const message = this.deps.sendDevMessage(channelId, content, channelType, explicitTargets);
        this.deps.sendCoordinationMessage(channelId, 'dev', content, message);
        this.deps.recordActivity('message.sent', `Message sent to ${channelId}`, {
          channelId,
          sender: 'dev',
        });
        return true;
      }

      default:
        return false;
    }
  }

  private updateConnectorTask(
    msg: CoordinationSignalMessage,
    status: TaskStatus,
    activityKind: string,
    verb: string,
  ): boolean {
    const humanId = String(msg.humanId || '');
    const owner = String(msg.owner || this.deps.connectorName() || 'agent');
    this.deps.updateTaskLifecycle(humanId, status, owner, activityKind, `${owner} ${verb} ${humanId}`);
    return true;
  }

  private updateDevTask(
    msg: CoordinationSignalMessage,
    status: TaskStatus,
    activityKind: string,
    verb: string,
  ): boolean {
    const humanId = String(msg.humanId || '');
    this.deps.updateTaskLifecycle(humanId, status, 'Dev', activityKind, `Dev ${verb} ${humanId}`);
    return true;
  }
}
