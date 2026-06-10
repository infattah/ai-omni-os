// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CapabilityInspectorModal } from './CapabilityInspectorModal';
import type { HarnessAttachment } from './server-state';

afterEach(cleanup);

function capability(overrides: Partial<HarnessAttachment> = {}): HarnessAttachment {
  return {
    id: 'c1',
    name: 'diagnose',
    harness: 'pi',
    kind: 'skill',
    source: 'global',
    required: false,
    risk: ['prompt-only'],
    cost: 'low',
    path: '~/.pi/skills/diagnose',
    ...overrides,
  };
}

describe('CapabilityInspectorModal', () => {
  it('shows the group title, attachable hint, and each capability with a use action', () => {
    const onUse = vi.fn();
    render(
      <CapabilityInspectorModal
        group={{ title: 'Skills', capabilities: [capability()], attachable: true }}
        onClose={vi.fn()}
        onUse={onUse}
      />,
    );
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText(/can be selected by compatible Agent Templates/)).toBeTruthy();
    expect(screen.getByText('diagnose')).toBeTruthy();
    fireEvent.click(screen.getByText('Use in Pi Template'));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('omits the use action and shows the library-source hint when not attachable', () => {
    render(
      <CapabilityInspectorModal
        group={{ title: 'Packages', capabilities: [capability()], attachable: false }}
        onClose={vi.fn()}
        onUse={vi.fn()}
      />,
    );
    expect(screen.getByText(/not directly attachable yet/)).toBeTruthy();
    expect(screen.queryByText('Use in Pi Template')).toBeNull();
  });

  it('shows the empty state when the group has no capabilities', () => {
    render(
      <CapabilityInspectorModal
        group={{ title: 'Themes', capabilities: [], attachable: false }}
        onClose={vi.fn()}
        onUse={vi.fn()}
      />,
    );
    expect(screen.getByText('No items found.')).toBeTruthy();
  });

  it('closes from the Close button', () => {
    const onClose = vi.fn();
    render(
      <CapabilityInspectorModal
        group={{ title: 'Skills', capabilities: [], attachable: true }}
        onClose={onClose}
        onUse={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
