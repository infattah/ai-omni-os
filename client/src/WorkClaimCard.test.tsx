// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkClaimCard } from './WorkClaimCard';
import type { WorkClaim } from './server-state';

afterEach(cleanup);

function claim(overrides: Partial<WorkClaim> = {}): WorkClaim {
  return { id: 'w1', agentName: 'codex', path: 'src/x.ts', note: 'wip', status: 'active', ...overrides };
}

describe('WorkClaimCard', () => {
  it('shows path, agent, and note, and releases the claim on click', () => {
    const onRelease = vi.fn();
    render(<WorkClaimCard claim={claim()} onRelease={onRelease} />);
    expect(screen.getByText('src/x.ts')).toBeTruthy();
    expect(screen.getByText('@codex')).toBeTruthy();
    expect(screen.getByText('wip')).toBeTruthy();
    fireEvent.click(screen.getByText('Release src/x.ts'));
    expect(onRelease).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));
  });

  it('omits the note when it is empty', () => {
    render(<WorkClaimCard claim={claim({ note: '' })} onRelease={vi.fn()} />);
    expect(screen.queryByText('wip')).toBeNull();
  });
});
