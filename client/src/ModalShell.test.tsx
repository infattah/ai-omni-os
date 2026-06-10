// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModalShell } from './ModalShell';

afterEach(cleanup);

function props(overrides = {}) {
  return { titleId: 'x-title', kicker: 'Kicker', title: 'The Title', onClose: vi.fn(), ...overrides };
}

describe('ModalShell', () => {
  it('renders kicker, an id-tagged title, fineprint, and children', () => {
    render(
      <ModalShell {...props({ fineprint: 'fine details' })}>
        <p>body content</p>
      </ModalShell>,
    );
    expect(screen.getByText('Kicker')).toBeTruthy();
    const heading = screen.getByText('The Title');
    expect(heading.id).toBe('x-title');
    expect(screen.getByText('fine details')).toBeTruthy();
    expect(screen.getByText('body content')).toBeTruthy();
  });

  it('renders an icon and omits no-icon when an icon is given', () => {
    const { container } = render(<ModalShell {...props({ icon: '✓' })}>body</ModalShell>);
    expect(container.querySelector('.launch-icon')).toBeTruthy();
    expect(container.querySelector('.launch-header')!.className).not.toContain('no-icon');
  });

  it('omits the icon and adds no-icon when no icon is given', () => {
    const { container } = render(<ModalShell {...props()}>body</ModalShell>);
    expect(container.querySelector('.launch-icon')).toBeNull();
    expect(container.querySelector('.launch-header')!.className).toContain('no-icon');
  });

  it('applies an extra className to the dialog section', () => {
    const { container } = render(
      <ModalShell {...props({ className: 'repo-browser-modal' })}>body</ModalShell>,
    );
    const dialog = container.querySelector('.launch-modal')!;
    expect(dialog.className).toContain('repo-browser-modal');
  });

  it('closes from the Close button and the backdrop, but not from clicks inside the dialog', () => {
    const onClose = vi.fn();
    const { container } = render(<ModalShell {...props({ onClose })}>body</ModalShell>);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(container.querySelector('.launch-modal')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(container.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
