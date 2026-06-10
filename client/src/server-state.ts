// Shared client data types + the pure server-state reducer.
//
// This is the testable heart of the dashboard's data layer: given the current screen state and an
// inbound server message, produce the next state. It is a PURE function — no socket, no DOM, no side
// effects — so it is unit-tested without a browser environment. Cross-cutting UI effects (mode changes,
// notices, modal open/close, the outbound scan-dir send, and Dev-edited fields) deliberately stay in the
// component; this reducer owns only the data the server writes.

export type AttachmentCost = 'low' | 'medium' | 'high' | 'unknown';
export type AttachmentRisk =
  | 'prompt-only'
  | 'filesystem-read'
  | 'filesystem-write'
  | 'shell'
  | 'network'
  | 'secrets'
  | 'unknown';

export type HarnessAttachment = {
  id: string;
  name: string;
  harness: string;
  kind: string;
  path?: string;
  source: string;
  required: boolean;
  risk: AttachmentRisk[];
  cost: AttachmentCost;
};

export type HarnessHealth = {
  harness: string;
  status: 'ok' | 'warning';
  summary: string;
  warnings: string[];
  settingsPath?: string;
  globallyEnabledExtensions: string[];
  globallyEnabledSkills: string[];
  globallyEnabledMcpServers: string[];
  detectedAttachments: HarnessAttachment[];
};

export type AgentTemplate = {
  id: string;
  name: string;
  description: string;
  harness: string;
  tags: string[];
  capabilityIds: string[];
  createdAt: string;
  updatedAt: string;
  agentPrompt?: string;
  instructions?: string;
};

export type AgentInstance = {
  id: string;
  name: string;
  tags: string[];
  harness: string;
  launchBackend?: 'terminal' | 'tmux';
  status: 'running' | 'disconnected' | 'archived';
  harnessAttachments?: Array<{
    id: string;
    name: string;
    kind: string;
    path?: string;
    cost: AttachmentCost;
    risk: AttachmentRisk[];
  }>;
  presence?: {
    connectionStatus: 'connected' | 'stale' | 'disconnected';
    workStatus: 'idle' | 'busy' | 'blocked' | 'done' | 'unknown';
    lastSeenAt: string;
    currentTaskId?: string;
    contextUsedPct?: number;
    terminalAttached?: boolean;
  };
};

export function isActiveAgent(agent: AgentInstance): boolean {
  return agent.status === 'running' && agent.presence?.connectionStatus === 'connected';
}

export type Message = {
  id: string;
  channelId: string;
  sender: string;
  content: string;
  timestamp: string;
};

export type ActivityEvent = {
  id: string;
  kind: string;
  summary: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export type TaskRequest = {
  id: string;
  humanId: string;
  requester: string;
  target: string;
  title: string;
  details: string;
  expectedResult?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: string;
};

export type WorkClaim = {
  id: string;
  agentName: string;
  path: string;
  note: string;
  status: 'active' | 'released';
};

export type DirEntry = {
  name: string;
  fullPath: string;
  isDirectory: boolean;
};

// The data atoms written only by the server and read across the dashboard.
export type ServerState = {
  repositoryPath: string;
  agents: AgentInstance[];
  messages: Message[];
  activity: ActivityEvent[];
  tasks: TaskRequest[];
  workClaims: WorkClaim[];
  harnessHealth: Record<string, HarnessHealth>;
  agentTemplates: AgentTemplate[];
  launchBackends: { terminal: boolean; tmux: boolean };
  repoBrowserPath: string;
  repoBrowserEntries: DirEntry[];
  contextAgentName: string;
};

export const initialServerState: ServerState = {
  repositoryPath: '',
  agents: [],
  messages: [],
  activity: [],
  tasks: [],
  workClaims: [],
  harnessHealth: {},
  agentTemplates: [],
  launchBackends: { terminal: false, tmux: true },
  repoBrowserPath: '',
  repoBrowserEntries: [],
  contextAgentName: '',
};

// Inbound messages. Only the fields the reducer reads are typed; UI-only messages (notices, modal
// toggles, etc.) are intentionally absent — they fall through to the unchanged-state default.
export type ServerMessage =
  | {
      type: 'state.snapshot';
      repository?: { path?: string } | null;
      agents?: AgentInstance[];
      messages?: Message[];
      activity?: ActivityEvent[];
      tasks?: TaskRequest[];
      workClaims?: WorkClaim[];
      harnessHealth?: Record<string, HarnessHealth>;
      agentTemplates?: AgentTemplate[];
      launchBackends?: { terminal: boolean; tmux: boolean };
    }
  | { type: 'repo-selected'; path?: string }
  | { type: 'home-dir'; path?: string }
  | { type: 'dir-entries'; path?: string; entries?: DirEntry[] }
  | { type: 'agents'; agents?: AgentInstance[] }
  | { type: 'agent-presence'; agentName: string; presence: NonNullable<AgentInstance['presence']> }
  | { type: 'message'; id: string; channelId: string; sender: string; content: string; timestamp: string }
  | { type: 'activity.event'; event: ActivityEvent }
  | { type: 'task.changed'; task: TaskRequest }
  | { type: 'workClaim.changed'; workClaim: WorkClaim }
  | { type: 'agent.context'; agentName?: string; content?: string }
  | { type: 'agent.templates'; templates?: AgentTemplate[] }
  | { type: string; [key: string]: unknown };

export function serverStateReducer(state: ServerState, message: ServerMessage): ServerState {
  switch (message.type) {
    case 'state.snapshot': {
      const msg = message as Extract<ServerMessage, { type: 'state.snapshot' }>;
      return {
        ...state,
        repositoryPath: msg.repository?.path ?? '',
        agents: msg.agents ?? [],
        messages: msg.messages ?? [],
        activity: msg.activity ?? [],
        tasks: msg.tasks ?? [],
        workClaims: msg.workClaims ?? [],
        harnessHealth: msg.harnessHealth ?? {},
        agentTemplates: msg.agentTemplates ?? [],
        launchBackends: msg.launchBackends ?? state.launchBackends,
      };
    }

    case 'repo-selected':
      return { ...state, repositoryPath: (message as { path?: string }).path ?? '' };

    case 'home-dir':
      return { ...state, repoBrowserPath: (message as { path?: string }).path ?? '' };

    case 'dir-entries': {
      const msg = message as Extract<ServerMessage, { type: 'dir-entries' }>;
      return { ...state, repoBrowserPath: msg.path ?? '', repoBrowserEntries: msg.entries ?? [] };
    }

    case 'agents':
      return { ...state, agents: (message as { agents?: AgentInstance[] }).agents ?? [] };

    case 'agent-presence': {
      const msg = message as Extract<ServerMessage, { type: 'agent-presence' }>;
      return {
        ...state,
        agents: state.agents.map((agent) =>
          agent.name === msg.agentName ? { ...agent, presence: msg.presence } : agent,
        ),
      };
    }

    case 'message':
      return { ...state, messages: [...state.messages, message as Message].slice(-100) };

    case 'activity.event':
      return {
        ...state,
        activity: [...state.activity, (message as { event: ActivityEvent }).event].slice(-100),
      };

    case 'task.changed': {
      const task = (message as { task: TaskRequest }).task;
      const without = state.tasks.filter((item) => item.id !== task.id);
      return {
        ...state,
        tasks: [...without, task].sort((a, b) =>
          a.humanId.localeCompare(b.humanId, undefined, { numeric: true }),
        ),
      };
    }

    case 'workClaim.changed': {
      const workClaim = (message as { workClaim: WorkClaim }).workClaim;
      const without = state.workClaims.filter((item) => item.id !== workClaim.id);
      return { ...state, workClaims: [...without, workClaim] };
    }

    case 'agent.context':
      return { ...state, contextAgentName: (message as { agentName?: string }).agentName ?? '' };

    case 'agent.templates':
      return { ...state, agentTemplates: (message as { templates?: AgentTemplate[] }).templates ?? [] };

    default:
      return state;
  }
}
