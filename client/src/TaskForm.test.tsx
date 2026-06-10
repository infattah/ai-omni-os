// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskForm } from './TaskForm';

afterEach(cleanup);

function props(overrides = {}) {
  return { repositoryPath: '/repo', onSubmit: vi.fn(), onCancel: vi.fn(), ...overrides };
}

describe('TaskForm', () => {
  it('defaults target to #all and priority to normal, and emits a trimmed payload on submit', () => {
    const onSubmit = vi.fn();
    render(<TaskForm {...props({ onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: '  Ship it  ' } });
    fireEvent.change(screen.getByLabelText('Task description'), { target: { value: '  do the thing  ' } });
    fireEvent.click(screen.getByText('Create Task'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Ship it',
      details: 'do the thing',
      target: '#all',
      priority: 'normal',
    });
  });

  it('carries an edited target and priority into the payload', () => {
    const onSubmit = vi.fn();
    render(<TaskForm {...props({ onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Fix bug' } });
    fireEvent.change(screen.getByLabelText('Task target'), { target: { value: '@codex' } });
    fireEvent.click(screen.getByRole('button', { name: /task priority/i }));
    fireEvent.click(screen.getByRole('option', { name: /urgent immediate attention/i }));
    fireEvent.click(screen.getByText('Create Task'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Fix bug',
      details: '',
      target: '@codex',
      priority: 'urgent',
    });
  });

  it('falls back to #all when the target is cleared', () => {
    const onSubmit = vi.fn();
    render(<TaskForm {...props({ onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'T' } });
    fireEvent.change(screen.getByLabelText('Task target'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Create Task'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ target: '#all' }));
  });

  it('disables submit with a blank title or no repository, and never emits then', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<TaskForm {...props({ onSubmit })} />);
    expect((screen.getByText('Create Task') as HTMLButtonElement).disabled).toBe(true);
    rerender(<TaskForm {...props({ onSubmit, repositoryPath: '' })} />);
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'T' } });
    expect((screen.getByText('Create Task') as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('fires onCancel from the Cancel button', () => {
    const onCancel = vi.fn();
    render(<TaskForm {...props({ onCancel })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
