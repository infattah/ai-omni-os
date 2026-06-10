// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HarnessLocalNav } from './HarnessLocalNav';

afterEach(cleanup);

describe('HarnessLocalNav', () => {
  it('renders every harness tab label', () => {
    render(<HarnessLocalNav selected="pi" onSelect={vi.fn()} />);
    for (const label of ['General', 'Pi', 'Codex', 'Claude Code', 'Gemini CLI', 'opencode']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('marks the selected tab active', () => {
    render(<HarnessLocalNav selected="codex" onSelect={vi.fn()} />);
    expect(screen.getByText('Codex').className).toContain('active');
    expect(screen.getByText('Pi').className).not.toContain('active');
  });

  it('fires onSelect with the tab id when a tab is clicked', () => {
    const onSelect = vi.fn();
    render(<HarnessLocalNav selected="pi" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Gemini CLI'));
    expect(onSelect).toHaveBeenCalledWith('gemini-cli');
  });
});
