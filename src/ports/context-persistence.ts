import type { AgentInstance, Message, AgentGroup, ActivityEvent, TaskRequest, WorkClaim } from '../types.js';

export interface ContextPersistencePort {
  saveAgent(agent: AgentInstance): void;
  getAgent(id: string): AgentInstance | undefined;
  listAgents(): AgentInstance[];
  deleteAgent(id: string): void;
  saveMessage(message: Message): void;
  getMessages(channelId: string, limit?: number, offset?: number): Message[];
  getMessage(id: string): Message | undefined;
  saveGroup(group: AgentGroup): void;
  getGroup(id: string): AgentGroup | undefined;
  listGroups(): AgentGroup[];
  deleteGroup(id: string): void;
  saveActivityEvent(event: ActivityEvent): void;
  listActivityEvents(limit?: number, offset?: number): ActivityEvent[];
  saveTask(task: TaskRequest): void;
  listTasks(limit?: number, offset?: number): TaskRequest[];
  saveWorkClaim(workClaim: WorkClaim): void;
  listWorkClaims(limit?: number, offset?: number): WorkClaim[];
  close(): void;
  clearAll(): void;
  reinit(dbPath: string): void;
}
