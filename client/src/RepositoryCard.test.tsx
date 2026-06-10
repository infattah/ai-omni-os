// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RepositoryCard } from './RepositoryCard';

afterEach(cleanup);

function props(overrides = {}) {
  return {
    repositoryPath: '/Users/me/project',
    repoInput: '/Users/me/project',
    agentCount: 2,
    taskCount: 3,
    claimCount: 1,
    onRepoInputChange: vi.fn(),
    onSubmit: vi.fn(),
    onBrowse: vi.fn(),
    onGenerateHandoff: vi.fn(),
    onHireAgent: vi.fn(),
    ...overrides,
  };
}

describe('RepositoryCard', () => {
  it('shows the repository folder name, full path, and counts', () => {
    render(<RepositoryCard {...props()} />);
    expect(screen.getByText('project')).toBeTruthy();
    expect(
      screen.getByText('/Users/me/project · 2 Agent Instances · 3 Task Requests · 1 Work Claims'),
    ).toBeTruthy();
  });

  it('falls back to placeholders when no repository is selected', () => {
    render(<RepositoryCard {...props({ repositoryPath: '', repoInput: '' })} />);
    expect(screen.getByText('Select a Repository')).toBeTruthy();
    expect(screen.getByText(/No Repository selected/)).toBeTruthy();
  });

  it('reports input edits and submits the form', () => {
    const onRepoInputChange = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const { container } = render(<RepositoryCard {...props({ onRepoInputChange, onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Repository path'), { target: { value: '/new/path' } });
    expect(onRepoInputChange).toHaveBeenCalledWith('/new/path');
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('fires browse, handoff, and hire callbacks', () => {
    const onBrowse = vi.fn();
    const onGenerateHandoff = vi.fn();
    const onHireAgent = vi.fn();
    render(<RepositoryCard {...props({ onBrowse, onGenerateHandoff, onHireAgent })} />);
    fireEvent.click(screen.getByText('Browse'));
    fireEvent.click(screen.getByText('Generate Handoff'));
    fireEvent.click(screen.getByText('Hire Agent'));
    expect(onBrowse).toHaveBeenCalledTimes(1);
    expect(onGenerateHandoff).toHaveBeenCalledTimes(1);
    expect(onHireAgent).toHaveBeenCalledTimes(1);
  });

  it('disables handoff and hire when no repository is selected', () => {
    render(<RepositoryCard {...props({ repositoryPath: '' })} />);
    expect((screen.getByText('Generate Handoff') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Hire Agent') as HTMLButtonElement).disabled).toBe(true);
  });
});
