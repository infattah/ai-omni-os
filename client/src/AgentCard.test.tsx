// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentCard } from './AgentCard';
import type { AgentInstance } from './server-state';

afterEach(cleanup);

function agent(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    id: 'a1',
    name: 'codex',
    tags: ['review'],
    harness: 'pi',
    status: 'running',
    presence: { connectionStatus: 'connected', workStatus: 'idle', lastSeenAt: 't' },
    ...overrides,
  };
}

const noopActions = {
  onOpen: vi.fn(),
  onMessage: vi.fn(),
  onResume: vi.fn(),
  onEditContext: vi.fn(),
  onArchive: vi.fn(),
  onUnarchive: vi.fn(),
  onDelete: vi.fn(),
};

describe('AgentCard', () => {
  it('offers Message as the primary action for a connected running agent', () => {
    const onMessage = vi.fn();
    render(<AgentCard agent={agent()} {...noopActions} onMessage={onMessage} />);
    fireEvent.click(screen.getByText('Message'));
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ name: 'codex' }));
  });

  it('offers Resume as the primary action for a disconnected agent', () => {
    const onResume = vi.fn();
    render(
      <AgentCard
        agent={agent({ status: 'disconnected', presence: undefined })}
        {...noopActions}
        onResume={onResume}
      />,
    );
    expect(screen.queryByText('Message')).toBeNull();
    fireEvent.click(screen.getAllByText('Resume')[0]);
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ name: 'codex' }));
  });

  it('offers Resume for a stale running agent and renders context usage', () => {
    const onResume = vi.fn();
    render(
      <AgentCard
        agent={agent({
          presence: { connectionStatus: 'stale', workStatus: 'busy', lastSeenAt: 't', contextUsedPct: 42 },
        })}
        {...noopActions}
        onResume={onResume}
      />,
    );
    expect(screen.getByText(/stale · busy · ctx 42%/)).toBeTruthy();
    expect(screen.queryByText('Message')).toBeNull();
    fireEvent.click(screen.getAllByText('Resume')[0]);
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ name: 'codex' }));
  });

  it('shows only Message when a reachable tmux-backed agent has an attached terminal', () => {
    render(
      <AgentCard
        agent={agent({
          launchBackend: 'tmux',
          presence: {
            connectionStatus: 'connected',
            workStatus: 'idle',
            lastSeenAt: 't',
            terminalAttached: true,
          },
        })}
        {...noopActions}
      />,
    );

    expect(screen.getByText('Message')).toBeTruthy();
    expect(screen.queryByText(/Resume/)).toBeNull();
    expect(screen.queryByText('Reopen terminal')).toBeNull();
  });

  it('shows Message and Resume when a reachable tmux-backed agent is detached', () => {
    const onResume = vi.fn();
    render(
      <AgentCard
        agent={agent({
          launchBackend: 'tmux',
          presence: {
            connectionStatus: 'connected',
            workStatus: 'idle',
            lastSeenAt: 't',
            terminalAttached: false,
          },
        })}
        {...noopActions}
        onResume={onResume}
      />,
    );

    expect(screen.getByText('Message')).toBeTruthy();
    fireEvent.click(screen.getByText('Resume'));

    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ name: 'codex' }));
    expect(screen.queryByText('Reopen terminal')).toBeNull();
  });

  it('shows Resume without the agent name in secondary actions', () => {
    const onResume = vi.fn();
    render(<AgentCard agent={agent()} {...noopActions} onResume={onResume} />);

    fireEvent.click(screen.getByRole('button', { name: /codex secondary actions/i }));
    fireEvent.click(screen.getByText('Resume'));

    expect(screen.queryByText('Resume codex')).toBeNull();
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ name: 'codex' }));
  });

  it('shows Archive for an active agent and Unarchive for an archived one', () => {
    const onArchive = vi.fn();
    render(<AgentCard agent={agent()} {...noopActions} onArchive={onArchive} />);
    fireEvent.click(screen.getByRole('button', { name: /codex secondary actions/i }));
    fireEvent.click(screen.getByText('Archive codex'));
    expect(onArchive).toHaveBeenCalledTimes(1);
    cleanup();

    const onUnarchive = vi.fn();
    render(<AgentCard agent={agent({ status: 'archived' })} {...noopActions} onUnarchive={onUnarchive} />);
    expect(screen.queryByText('Archive codex')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /codex secondary actions/i }));
    fireEvent.click(screen.getByText('Unarchive codex'));
    expect(onUnarchive).toHaveBeenCalledTimes(1);
  });
});
