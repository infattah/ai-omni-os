// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatPage } from './ChatPage';
import type { AgentInstance } from './server-state';

afterEach(cleanup);

function agent(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return { id: 'a1', name: 'pi-planner', tags: [], harness: 'pi', status: 'running', ...overrides };
}

function props(overrides = {}) {
  return {
    selectedChannel: '#all',
    agents: [agent()],
    onSelectChannel: vi.fn(),
    chatPanel: <div>chat-panel-here</div>,
    ...overrides,
  };
}

describe('ChatPage', () => {
  it('renders the #all channel, a button per agent, and the chat panel', () => {
    render(<ChatPage {...props({ agents: [agent(), agent({ id: 'a2', name: 'codex' })] })} />);
    expect(screen.getByText('#all')).toBeTruthy();
    expect(screen.getByText('@pi-planner')).toBeTruthy();
    expect(screen.getByText('@codex')).toBeTruthy();
    expect(screen.getByText('chat-panel-here')).toBeTruthy();
  });

  it('marks the selected channel', () => {
    render(<ChatPage {...props({ selectedChannel: '@pi-planner' })} />);
    expect(screen.getByText('#all').className).not.toContain('selected');
    expect(screen.getByText('@pi-planner').closest('button')!.className).toContain('selected');
  });

  it('selects #all and agent channels on click', () => {
    const onSelectChannel = vi.fn();
    render(<ChatPage {...props({ onSelectChannel })} />);
    fireEvent.click(screen.getByText('#all'));
    expect(onSelectChannel).toHaveBeenCalledWith('#all');
    fireEvent.click(screen.getByText('@pi-planner'));
    expect(onSelectChannel).toHaveBeenCalledWith('@pi-planner');
  });
});
