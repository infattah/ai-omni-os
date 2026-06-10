// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LaunchModal } from './LaunchModal';
import type { HarnessAttachment } from './server-state';

afterEach(cleanup);

function capability(overrides: Partial<HarnessAttachment> = {}): HarnessAttachment {
  return {
    id: 'c1',
    name: 'diagnose',
    harness: 'pi',
    kind: 'skill',
    source: 'global',
    required: false,
    risk: ['prompt-only'],
    cost: 'low',
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    repositoryPath: '/repo',
    agentName: 'pi-planner',
    agentDescription: 'plans things',
    agentTagDraft: '',
    tags: ['planning'],
    agentHarness: 'pi',
    launchBackend: 'tmux' as 'terminal' | 'tmux',
    launchBackends: { terminal: true, tmux: true },
    agentPrompt: 'be helpful',
    toolMcpCapabilities: [] as HarnessAttachment[],
    skillPluginCapabilities: [capability()],
    selectedAttachmentIds: ['c1'],
    onAgentNameChange: vi.fn(),
    onAgentDescriptionChange: vi.fn(),
    onAgentTagDraftChange: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onAgentHarnessChange: vi.fn(),
    onLaunchBackendChange: vi.fn(),
    onAgentPromptChange: vi.fn(),
    onToggleCapability: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('LaunchModal', () => {
  it('reflects the current name, description, prompt, tags, and selected capabilities', () => {
    render(<LaunchModal {...props()} />);
    expect((screen.getByLabelText('Agent name') as HTMLInputElement).value).toBe('pi-planner');
    expect((screen.getByLabelText('Agent description') as HTMLTextAreaElement).value).toBe('plans things');
    expect((screen.getByLabelText('Agent prompt') as HTMLTextAreaElement).value).toBe('be helpful');
    expect(screen.getByText('planning')).toBeTruthy();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('reports edits and tag actions', () => {
    const onAgentNameChange = vi.fn();
    const onRemoveTag = vi.fn();
    const onAddTag = vi.fn();
    render(<LaunchModal {...props({ onAgentNameChange, onRemoveTag, onAddTag })} />);
    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'reviewer' } });
    expect(onAgentNameChange).toHaveBeenCalledWith('reviewer');
    fireEvent.click(screen.getByText(/planning/));
    expect(onRemoveTag).toHaveBeenCalledWith('planning');
    fireEvent.keyDown(screen.getByLabelText('Add agent tag'), { key: 'Enter' });
    expect(onAddTag).toHaveBeenCalledTimes(1);
  });

  it('toggles a capability by id', () => {
    const onToggleCapability = vi.fn();
    render(<LaunchModal {...props({ onToggleCapability, selectedAttachmentIds: [] })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleCapability).toHaveBeenCalledWith('c1');
  });

  it('disables Hire when there is no repo or the harness is not yet enabled', () => {
    const { rerender } = render(<LaunchModal {...props({ repositoryPath: '' })} />);
    expect((screen.getByRole('button', { name: 'Hire Agent' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<LaunchModal {...props({ agentHarness: 'codex' })} />);
    expect((screen.getByRole('button', { name: 'Hire Agent' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Claude Code as a selectable, hireable harness', () => {
    const onAgentHarnessChange = vi.fn();
    render(<LaunchModal {...props({ agentHarness: 'claude-code', onAgentHarnessChange })} />);
    fireEvent.click(screen.getByRole('button', { name: /agent harness/i }));
    fireEvent.click(screen.getByRole('option', { name: /pi available now/i }));
    expect(onAgentHarnessChange).toHaveBeenCalledWith('pi');
    expect((screen.getByRole('button', { name: 'Hire Agent' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers a Launch Backend picker, tmux selected, and reports a switch to Terminal.app', () => {
    const onLaunchBackendChange = vi.fn();
    render(<LaunchModal {...props({ onLaunchBackendChange })} />);
    expect(screen.getByRole('button', { name: /launch backend/i }).textContent).toContain('tmux');
    fireEvent.click(screen.getByRole('button', { name: /launch backend/i }));
    fireEvent.click(
      screen.getByRole('option', { name: /terminal.app one macos terminal window per agent/i }),
    );
    expect(onLaunchBackendChange).toHaveBeenCalledWith('terminal');
  });

  it('submits and closes', () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onClose = vi.fn();
    const { container } = render(<LaunchModal {...props({ onSubmit, onClose })} />);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
