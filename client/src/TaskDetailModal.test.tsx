// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskDetailModal } from './TaskDetailModal';
import type { TaskRequest } from './server-state';

afterEach(cleanup);

function task(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: 't1',
    humanId: 'T-1',
    requester: 'Dev',
    target: '#all',
    title: 'Ship it',
    details: 'do the thing',
    priority: 'high',
    status: 'accepted',
    ...overrides,
  };
}

describe('TaskDetailModal', () => {
  it('shows the id/status kicker, title, target/priority, and description', () => {
    render(<TaskDetailModal task={task()} onClose={vi.fn()} />);
    expect(screen.getByText('T-1 · accepted')).toBeTruthy();
    expect(screen.getByText('Ship it')).toBeTruthy();
    expect(screen.getByText('#all · high')).toBeTruthy();
    expect(screen.getByText('do the thing')).toBeTruthy();
  });

  it('falls back when there is no description and shows expected result when present', () => {
    render(
      <TaskDetailModal task={task({ details: '   ', expectedResult: 'green tests' })} onClose={vi.fn()} />,
    );
    expect(screen.getByText('No description provided.')).toBeTruthy();
    expect(screen.getByText('Expected Result')).toBeTruthy();
    expect(screen.getByText('green tests')).toBeTruthy();
  });

  it('omits the expected result section when empty', () => {
    render(<TaskDetailModal task={task({ expectedResult: '' })} onClose={vi.fn()} />);
    expect(screen.queryByText('Expected Result')).toBeNull();
  });

  it('closes from the Close button', () => {
    const onClose = vi.fn();
    render(<TaskDetailModal task={task()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
