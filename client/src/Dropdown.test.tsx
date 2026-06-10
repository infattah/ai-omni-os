// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dropdown } from './Dropdown';

afterEach(cleanup);

const options = [
  { value: 'pi', label: 'Pi', hint: 'Available now' },
  { value: 'codex', label: 'Codex', hint: 'Coming soon', disabled: true },
  { value: 'claude-code', label: 'Claude Code', hint: 'Available now' },
];

describe('Dropdown', () => {
  it('opens on click and calls onChange when an option is clicked', () => {
    const onChange = vi.fn();
    render(<Dropdown ariaLabel="Agent Harness" value="pi" options={options} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /agent harness/i }));
    fireEvent.click(screen.getByRole('option', { name: /claude code available now/i }));

    expect(onChange).toHaveBeenCalledWith('claude-code');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects the active option with keyboard navigation', () => {
    const onChange = vi.fn();
    render(<Dropdown ariaLabel="Agent Harness" value="pi" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: /agent harness/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('claude-code');
  });

  it('closes on Escape', () => {
    render(<Dropdown ariaLabel="Agent Harness" value="pi" options={options} onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /agent harness/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not select disabled options', () => {
    const onChange = vi.fn();
    render(<Dropdown ariaLabel="Agent Harness" value="pi" options={options} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /agent harness/i }));
    fireEvent.click(screen.getByRole('option', { name: /codex coming soon/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('fires action menu items and closes', () => {
    const onEdit = vi.fn();
    render(
      <Dropdown
        ariaLabel="Agent actions"
        actionItems={[{ value: 'edit', label: 'Edit Context', onSelect: onEdit }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /agent actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Context' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
