// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ArchiveToggle } from './ArchiveToggle';

afterEach(cleanup);

describe('ArchiveToggle', () => {
  it('shows the active class and hides the cross when archived agents are shown', () => {
    render(<ArchiveToggle active onToggle={vi.fn()} />);
    const button = screen.getByLabelText('Hide/Show Archive');
    expect(button.className).toContain('active');
    expect(button.querySelector('.archive-cross')).toBeNull();
  });

  it('drops the active class and shows the cross when archived agents are hidden', () => {
    render(<ArchiveToggle active={false} onToggle={vi.fn()} />);
    const button = screen.getByLabelText('Hide/Show Archive');
    expect(button.className).not.toContain('active');
    expect(button.querySelector('.archive-cross')).toBeTruthy();
  });

  it('fires onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<ArchiveToggle active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText('Hide/Show Archive'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
