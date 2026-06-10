// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TasksPage } from './TasksPage';
import type { ActivityEvent, TaskRequest, WorkClaim } from './server-state';

afterEach(cleanup);

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
function claim(overrides: Partial<WorkClaim> = {}): WorkClaim {
  return { id: 'w1', agentName: 'codex', path: 'src/x.ts', note: 'wip', status: 'active', ...overrides };
}
function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'e1',
    kind: 'task.created',
    summary: 'created T-1',
    timestamp: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    tasks: [task()],
    activeClaims: [claim()],
    activity: [event()],
    onReleaseClaim: vi.fn(),
    onSelectTask: vi.fn(),
    onTaskAction: vi.fn(),
    ...overrides,
  };
}

describe('TasksPage', () => {
  it('groups tasks by status and shows claims and activity', () => {
    render(
      <TasksPage
        {...props({
          tasks: [task(), task({ id: 't2', humanId: 'T-2', title: 'Done thing', status: 'completed' })],
        })}
      />,
    );
    expect(screen.getByText('Requested')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Ship it')).toBeTruthy();
    expect(screen.getByText('Done thing')).toBeTruthy();
    expect(screen.getByText('src/x.ts')).toBeTruthy();
    expect(screen.getByText('created T-1')).toBeTruthy();
  });

  it('hides the Failed/Rejected/Cancelled group when it is empty', () => {
    render(<TasksPage {...props()} />);
    expect(screen.queryByText('Failed / Rejected / Cancelled')).toBeNull();
  });

  it('shows the empty claims state when there are none', () => {
    render(<TasksPage {...props({ activeClaims: [] })} />);
    expect(screen.getByText('No Work Claims.')).toBeTruthy();
  });

  it('releases a claim', () => {
    const onReleaseClaim = vi.fn();
    render(<TasksPage {...props({ onReleaseClaim })} />);
    fireEvent.click(screen.getByText('Release src/x.ts'));
    expect(onReleaseClaim).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));
  });
});
