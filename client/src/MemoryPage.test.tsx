// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryPage } from './MemoryPage';
import type { ActivityEvent, AgentInstance } from './server-state';

afterEach(cleanup);

function agent(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return { id: 'a1', name: 'pi-planner', tags: [], harness: 'pi', status: 'running', ...overrides };
}

function props(overrides = {}) {
  return {
    repositoryPath: '/repo',
    summaryOpen: false,
    projectSummary: '',
    agents: [agent()],
    activity: [] as ActivityEvent[],
    onLoadProjectSummary: vi.fn(),
    onProjectSummaryChange: vi.fn(),
    onSaveProjectSummary: vi.fn(),
    onLoadAgentContext: vi.fn(),
    onGenerateHandoff: vi.fn(),
    ...overrides,
  };
}

describe('MemoryPage', () => {
  it('prompts to load the summary when closed and disables actions without a repo', () => {
    const { rerender } = render(<MemoryPage {...props()} />);
    expect(screen.getByText(/Load the Repository Project Summary/)).toBeTruthy();
    rerender(<MemoryPage {...props({ repositoryPath: '' })} />);
    expect((screen.getByText('Edit Project Summary') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Generate Handoff') as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits and saves the project summary when open', () => {
    const onProjectSummaryChange = vi.fn();
    const onSaveProjectSummary = vi.fn();
    render(
      <MemoryPage
        {...props({ summaryOpen: true, projectSummary: 'hi', onProjectSummaryChange, onSaveProjectSummary })}
      />,
    );
    fireEvent.change(screen.getByLabelText('Project Summary'), { target: { value: 'updated' } });
    expect(onProjectSummaryChange).toHaveBeenCalledWith('updated');
    fireEvent.click(screen.getByText('Save Project Summary'));
    expect(onSaveProjectSummary).toHaveBeenCalledTimes(1);
  });

  it('lists agent contexts and loads one on click', () => {
    const onLoadAgentContext = vi.fn();
    render(<MemoryPage {...props({ onLoadAgentContext })} />);
    fireEvent.click(screen.getByText('@pi-planner'));
    expect(onLoadAgentContext).toHaveBeenCalledWith('pi-planner');
  });

  it('shows handoff stats from activity', () => {
    const activity: ActivityEvent[] = [
      { id: 'h1', kind: 'handoff.generated', summary: 'handoff one', timestamp: new Date().toISOString() },
    ];
    render(<MemoryPage {...props({ activity })} />);
    expect(screen.getByText('1 created')).toBeTruthy();
    // appears in both the Handoffs log and the Recent Activity list
    expect(screen.getAllByText('handoff one')).toHaveLength(2);
  });
});
