// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import type { TaskRequest } from './server-state';

afterEach(cleanup);

function task(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: 't1',
    humanId: 'TASK-1',
    requester: 'dev',
    target: '#all',
    title: 'First task',
    details: '',
    priority: 'high',
    status: 'requested',
    ...overrides,
  };
}

describe('TaskCard', () => {
  it('renders the task and shows accept/reject for a requested task', () => {
    render(<TaskCard task={task()} onSelect={vi.fn()} onAction={vi.fn()} />);
    expect(screen.getByText('TASK-1')).toBeTruthy();
    expect(screen.getByText('First task')).toBeTruthy();
    expect(screen.getByText('Accept TASK-1')).toBeTruthy();
    expect(screen.getByText('Reject TASK-1')).toBeTruthy();
  });

  it('fires onAction with the humanId and action, without also selecting the task', () => {
    const onAction = vi.fn();
    const onSelect = vi.fn();
    render(<TaskCard task={task()} onSelect={onSelect} onAction={onAction} />);
    fireEvent.click(screen.getByText('Accept TASK-1'));
    expect(onAction).toHaveBeenCalledWith('TASK-1', 'accept');
    expect(onSelect).not.toHaveBeenCalled(); // stopPropagation keeps the card from also opening
  });

  it('selects the task when the card body is clicked', () => {
    const onSelect = vi.fn();
    render(<TaskCard task={task()} onSelect={onSelect} onAction={vi.fn()} />);
    fireEvent.click(screen.getByText('First task'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ humanId: 'TASK-1' }));
  });

  it('hides the action row for a terminal task', () => {
    render(<TaskCard task={task({ status: 'completed' })} onSelect={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByText('Accept TASK-1')).toBeNull();
    expect(screen.queryByText('Cancel TASK-1')).toBeNull();
  });
});
