// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkClaimForm } from './WorkClaimForm';

afterEach(cleanup);

function props(overrides = {}) {
  return { repositoryPath: '/repo', onSubmit: vi.fn(), onCancel: vi.fn(), ...overrides };
}

describe('WorkClaimForm', () => {
  it('defaults the agent to Dev and emits a trimmed payload on submit', () => {
    const onSubmit = vi.fn();
    render(<WorkClaimForm {...props({ onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Work Claim path'), { target: { value: '  src/x.ts  ' } });
    fireEvent.change(screen.getByLabelText('Work Claim note'), { target: { value: '  wip  ' } });
    fireEvent.click(screen.getByText('Create Claim'));
    expect(onSubmit).toHaveBeenCalledWith({ path: 'src/x.ts', agentName: 'Dev', note: 'wip' });
  });

  it('carries an edited agent name into the payload', () => {
    const onSubmit = vi.fn();
    render(<WorkClaimForm {...props({ onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Work Claim path'), { target: { value: 'src/y.ts' } });
    fireEvent.change(screen.getByLabelText('Work Claim agent'), { target: { value: 'codex' } });
    fireEvent.click(screen.getByText('Create Claim'));
    expect(onSubmit).toHaveBeenCalledWith({ path: 'src/y.ts', agentName: 'codex', note: '' });
  });

  it('falls back to Dev when the agent is cleared', () => {
    const onSubmit = vi.fn();
    render(<WorkClaimForm {...props({ onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Work Claim path'), { target: { value: 'src/z.ts' } });
    fireEvent.change(screen.getByLabelText('Work Claim agent'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Create Claim'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ agentName: 'Dev' }));
  });

  it('disables submit with a blank path or no repository, and never emits then', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<WorkClaimForm {...props({ onSubmit })} />);
    expect((screen.getByText('Create Claim') as HTMLButtonElement).disabled).toBe(true);
    rerender(<WorkClaimForm {...props({ onSubmit, repositoryPath: '' })} />);
    fireEvent.change(screen.getByLabelText('Work Claim path'), { target: { value: 'src/a.ts' } });
    expect((screen.getByText('Create Claim') as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('fires onCancel from the Cancel button', () => {
    const onCancel = vi.fn();
    render(<WorkClaimForm {...props({ onCancel })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
