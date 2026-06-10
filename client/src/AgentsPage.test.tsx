// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentsPage } from './AgentsPage';
import type { AgentInstance } from './server-state';
import type { AgentCardActions } from './AgentCard';

afterEach(cleanup);

function agent(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return { id: 'a1', name: 'pi-planner', tags: [], harness: 'pi', status: 'running', ...overrides };
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
    agents: [agent()],
    visibleAgents: [agent()],
    agentActions: actions,
    archivedAgentCount: 0,
    showArchived: false,
    repositoryPath: '/repo',
    contextAgentName: '',
    contextContent: '',
    onToggleArchive: vi.fn(),
    onHireAgent: vi.fn(),
    onContextChange: vi.fn(),
    onSaveContext: vi.fn(),
    ...overrides,
  };
}

describe('AgentsPage', () => {
  it('lists the visible agents and prompts to choose a context when none is selected', () => {
    render(<AgentsPage {...props()} />);
    expect(screen.getByText('@pi-planner')).toBeTruthy();
    expect(screen.getByText(/Choose Edit Context/)).toBeTruthy();
  });

  it('shows the empty state when there are no agents', () => {
    render(<AgentsPage {...props({ agents: [], visibleAgents: [] })} />);
    expect(screen.getByText('No Agent Instances yet.')).toBeTruthy();
  });

  it('hires an agent and disables the button without a repo', () => {
    const onHireAgent = vi.fn();
    const { rerender } = render(<AgentsPage {...props({ onHireAgent })} />);
    fireEvent.click(screen.getByText('Hire Agent'));
    expect(onHireAgent).toHaveBeenCalledTimes(1);
    rerender(<AgentsPage {...props({ repositoryPath: '' })} />);
    expect((screen.getByText('Hire Agent') as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits and saves the selected agent context', () => {
    const onContextChange = vi.fn();
    const onSaveContext = vi.fn();
    render(
      <AgentsPage
        {...props({
          contextAgentName: 'pi-planner',
          contextContent: 'notes',
          onContextChange,
          onSaveContext,
        })}
      />,
    );
    expect(screen.getByText('@pi-planner', { selector: '*' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Agent Context'), { target: { value: 'updated' } });
    expect(onContextChange).toHaveBeenCalledWith('updated');
    fireEvent.click(screen.getByText('Save Agent Context'));
    expect(onSaveContext).toHaveBeenCalledTimes(1);
  });

  it('shows the archive toggle only when there are archived agents', () => {
    const { rerender, container } = render(<AgentsPage {...props({ archivedAgentCount: 0 })} />);
    expect(container.querySelector('.archive-toggle')).toBeNull();
    rerender(<AgentsPage {...props({ archivedAgentCount: 2 })} />);
    expect(container.querySelector('.archive-toggle')).toBeTruthy();
  });

  it('partitions visible agents into Active and Inactive sections', () => {
    render(
      <AgentsPage
        {...props({
          agents: [
            agent({
              id: 'a1',
              name: 'fresh',
              presence: { connectionStatus: 'connected', workStatus: 'idle', lastSeenAt: 't' },
            }),
            agent({
              id: 'a2',
              name: 'stale',
              presence: { connectionStatus: 'stale', workStatus: 'idle', lastSeenAt: 't' },
            }),
          ],
          visibleAgents: [
            agent({
              id: 'a1',
              name: 'fresh',
              presence: { connectionStatus: 'connected', workStatus: 'idle', lastSeenAt: 't' },
            }),
            agent({
              id: 'a2',
              name: 'stale',
              presence: { connectionStatus: 'stale', workStatus: 'idle', lastSeenAt: 't' },
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });
});
