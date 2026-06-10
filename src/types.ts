export type AgentStatus = 'running' | 'disconnected' | 'archived';
export type PresenceConnectionStatus = 'connected' | 'stale' | 'disconnected';
export type PresenceWorkStatus = 'idle' | 'busy' | 'blocked' | 'done' | 'unknown';

export interface AgentPresence {
  connectionStatus: PresenceConnectionStatus;
  workStatus: PresenceWorkStatus;
  lastSeenAt: string;
  currentTaskId?: string;
  contextUsedPct?: number;
  terminalAttached?: boolean;
}

export type AttachmentCost = 'low' | 'medium' | 'high' | 'unknown';
export type AttachmentRisk =
  | 'prompt-only'
  | 'filesystem-read'
  | 'filesystem-write'
  | 'shell'
  | 'network'
  | 'secrets'
  | 'unknown';

export interface HarnessAttachment {
  id: string;
  name: string;
  harness: string;
  kind:
    | 'pi-package'
    | 'pi-extension'
    | 'skill'
    | 'prompt-template'
    | 'theme'
    | 'mcp-server'
    | 'command-pack'
    | 'tool-bridge'
    | 'unknown';
  path?: string;
  source: 'omni' | 'detected' | 'imported' | 'project';
  required: boolean;
  risk: AttachmentRisk[];
  cost: AttachmentCost;
}

export interface HarnessAttachmentSelection {
  id: string;
  name: string;
  harness: string;
  kind: HarnessAttachment['kind'];
  path?: string;
  risk: AttachmentRisk[];
  cost: AttachmentCost;
}

export interface HarnessHealth {
  harness: string;
  status: 'ok' | 'warning';
  summary: string;
  warnings: string[];
  settingsPath?: string;
  globallyEnabledExtensions: string[];
  globallyEnabledSkills: string[];
  globallyEnabledMcpServers: string[];
  detectedAttachments: HarnessAttachment[];
}

export interface AgentProfile {
  description?: string;
  agentPrompt?: string;
  roleAndObjective?: string;
  instructions?: string;
  workflow?: string;
  omniGuide?: string;
  projectContext?: string;
}

export interface AgentTemplate extends AgentProfile {
  id: string;
  name: string;
  description: string;
  harness: string;
  tags: string[];
  capabilityIds: string[];
  toolMcpIds?: string[];
  skillPluginIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentInstance extends AgentProfile {
  id: string;
  name: string;
  tags: string[];
  groupIds: string[];
  harness: string;
  launchBackend?: 'terminal' | 'tmux';
  cwd: string;
  status: AgentStatus;
  createdAt: string;
  templateId?: string;
  harnessAttachments?: HarnessAttachmentSelection[];
  presence?: AgentPresence;
}

export interface Message {
  id: string;
  msg_id: string;
  channelId: string;
  sender: string;
  content: string;
  mentions: string[];
  channelType: 'group' | 'dm';
  recipientAgents: string[];
  inReplyTo?: string;
  expectsReply?: boolean;
  hops: number;
  timestamp: string;
}

export interface AgentGroup {
  id: string;
  name: string;
  tagFilter: string | null;
  agentIds: string[];
}

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus =
  | 'requested'
  | 'accepted'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled';

export interface TaskRequest {
  id: string;
  humanId: string;
  requester: string;
  target: string;
  title: string;
  details: string;
  expectedResult: string;
  priority: TaskPriority;
  status: TaskStatus;
  owner: string | null;
  parentTaskId: string | null;
  filePaths: string[];
  createdAt: string;
  updatedAt: string;
}

export type WorkClaimStatus = 'active' | 'released';

export interface WorkClaim {
  id: string;
  agentName: string;
  path: string;
  note: string;
  status: WorkClaimStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
