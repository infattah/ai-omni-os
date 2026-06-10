// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';
import type { Message } from './server-state';

afterEach(cleanup);

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    channelId: '#all',
    sender: 'pi-planner',
    content: 'hello',
    timestamp: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    selectedChannel: '#all',
    messages: [message()],
    composer: '',
    listRef: createRef<HTMLDivElement>(),
    onComposerChange: vi.fn(),
    onSubmit: vi.fn(),
    onComposerKeyDown: vi.fn(),
    ...overrides,
  };
}

describe('ChatPanel', () => {
  it('shows the channel name, message count, and each message', () => {
    render(
      <ChatPanel
        {...props({ messages: [message(), message({ id: 'm2', sender: 'codex', content: 'world' })] })}
      />,
    );
    expect(screen.getByText('#all')).toBeTruthy();
    expect(screen.getByText('2 messages')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('world')).toBeTruthy();
    expect(screen.getByText('codex')).toBeTruthy();
  });

  it('shows the empty state when there are no messages', () => {
    render(<ChatPanel {...props({ messages: [] })} />);
    expect(screen.getByText(/No messages yet/)).toBeTruthy();
    expect(screen.getByText('0 messages')).toBeTruthy();
  });

  it('reports composer edits, submits, and forwards key presses', () => {
    const onComposerChange = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onComposerKeyDown = vi.fn();
    const { container } = render(<ChatPanel {...props({ onComposerChange, onSubmit, onComposerKeyDown })} />);
    const textarea = screen.getByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'hi' } });
    expect(onComposerChange).toHaveBeenCalledWith('hi');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onComposerKeyDown).toHaveBeenCalled();
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('adds the full-chat class when full', () => {
    const { container } = render(<ChatPanel {...props({ full: true })} />);
    expect(container.querySelector('.chat-panel')!.className).toContain('full-chat');
  });
});
