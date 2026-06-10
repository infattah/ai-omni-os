// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Overview } from './Overview';
import type { ActivityEvent, TaskRequest } from './server-state';
import type { AgentInstance } from './server-state';
import type { AgentCardActions } from './AgentCard';

afterEach(cleanup);

function agent(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return { id: 'a1', name: 'pi-planner', tags: [], harness: 'pi', status: 'running', ...overrides };
}
function task(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: 't1',
    humanId: 'T-1',
    requester: 'Dev',
    target: '#all',
    title: 'Ship it',
    details: '',
    priority: 'normal',
    status: 'requested',
    ...overrides,
  };
}
const actions: AgentCardActions = {
  onOpen: vi.fn(),
  onMessage: vi.fn(),
  onResume: vi.fn(),
  onEditContext: vi.fn(),
  onArchive: vi.fn(),
  onUnarchive: vi.fn(),
  onDelete: vi.fn(),
};

function props(overrides = {}) {
  return {
    repositoryCard: <div>repo-card</div>,
    chatPanel: <div>chat-panel</div>,
    agents: [agent()],
    visibleAgents: [agent()],
    agentActions: actions,
    archivedAgentCount: 0,
    showArchived: false,
    needsAttention: ['T-2 blocked: Fix bug'],
    tasks: [task()],
    activity: [{ id: 'e1', kind: 'task.created', summary: 'created T-1', timestamp: 'now' } as ActivityEvent],
    onToggleArchive: vi.fn(),
    onOpenTasks: vi.fn(),
    onSelectTask: vi.fn(),
    onTaskAction: vi.fn(),
    ...overrides,
  };
}

describe('Overview', () => {
  it('renders the repository card, chat panel, agents, needs-attention, tasks, and activity', () => {
    render(<Overview {...props()} />);
    expect(screen.getByText('repo-card')).toBeTruthy();
    expect(screen.getByText('chat-panel')).toBeTruthy();
    expect(screen.getByText('@pi-planner')).toBeTruthy();
    expect(screen.getByText('T-2 blocked: Fix bug')).toBeTruthy();
    expect(screen.getByText('Ship it')).toBeTruthy();
    expect(screen.getByText('created T-1')).toBeTruthy();
  });

  it('shows the archived suffix in the agent count when archived are hidden', () => {
    render(<Overview {...props({ archivedAgentCount: 3, showArchived: false })} />);
    expect(screen.getByText('1 + 3 archived')).toBeTruthy();
  });

  it('shows empty states when there is nothing', () => {
    render(
      <Overview {...props({ agents: [], visibleAgents: [], needsAttention: [], tasks: [], activity: [] })} />,
    );
    expect(screen.getByText(/No Agent Instances yet/)).toBeTruthy();
    expect(screen.getByText('Nothing needs attention.')).toBeTruthy();
    expect(screen.getByText('No Task Requests.')).toBeTruthy();
    expect(screen.getByText('No coordination events.')).toBeTruthy();
  });

  it('opens the tasks page from the right rail', () => {
    const onOpenTasks = vi.fn();
    render(<Overview {...props({ onOpenTasks })} />);
    fireEvent.click(screen.getByText('Open'));
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
  });
});
