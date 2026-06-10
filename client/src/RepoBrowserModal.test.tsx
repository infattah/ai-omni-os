// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RepoBrowserModal } from './RepoBrowserModal';
import type { DirEntry } from './server-state';

afterEach(cleanup);

function entry(overrides: Partial<DirEntry> = {}): DirEntry {
  return { name: 'project', fullPath: '/Users/me/project', isDirectory: true, ...overrides };
}

function props(overrides = {}) {
  return {
    path: '/Users/me',
    entries: [entry()],
    onClose: vi.fn(),
    onUp: vi.fn(),
    onChoose: vi.fn(),
    onScan: vi.fn(),
    ...overrides,
  };
}

describe('RepoBrowserModal', () => {
  it('shows the current path and a button per entry', () => {
    render(
      <RepoBrowserModal
        {...props({ entries: [entry(), entry({ name: 'other', fullPath: '/Users/me/other' })] })}
      />,
    );
    expect(screen.getByText('/Users/me')).toBeTruthy();
    expect(screen.getByText('project')).toBeTruthy();
    expect(screen.getByText('other')).toBeTruthy();
  });

  it('shows the empty state and a loading hint when path is blank', () => {
    render(<RepoBrowserModal {...props({ path: '', entries: [] })} />);
    expect(screen.getByText(/No child folders found/)).toBeTruthy();
    expect(screen.getByText('Loading home folder…')).toBeTruthy();
  });

  it('goes up, chooses the current folder, scans on click, and chooses on double-click', () => {
    const onUp = vi.fn();
    const onChoose = vi.fn();
    const onScan = vi.fn();
    render(<RepoBrowserModal {...props({ onUp, onChoose, onScan })} />);
    fireEvent.click(screen.getByText('Up'));
    expect(onUp).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Use this folder'));
    expect(onChoose).toHaveBeenCalledWith('/Users/me');
    fireEvent.click(screen.getByText('project'));
    expect(onScan).toHaveBeenCalledWith('/Users/me/project');
    fireEvent.dblClick(screen.getByText('project'));
    expect(onChoose).toHaveBeenCalledWith('/Users/me/project');
  });

  it('disables Up and Use-this-folder when there is no path yet', () => {
    render(<RepoBrowserModal {...props({ path: '', entries: [] })} />);
    expect((screen.getByText('Up') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Use this folder') as HTMLButtonElement).disabled).toBe(true);
  });
});
