// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CapabilitySurfaceCard } from './CapabilitySurfaceCard';
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
    ...overrides,
  };
}

describe('CapabilitySurfaceCard', () => {
  it('shows the title, item count, and the attachable hint', () => {
    render(
      <CapabilitySurfaceCard
        title="Skills"
        capabilities={[capability(), capability({ id: 'c2', name: 'tdd' })]}
        attachable
        empty="No skills."
        onInspect={vi.fn()}
      />,
    );
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('diagnose')).toBeTruthy();
    expect(screen.getByText('tdd')).toBeTruthy();
    expect(screen.getByText('Selectable in Templates')).toBeTruthy();
  });

  it('shows the empty hint and library-source label when there are no capabilities', () => {
    render(
      <CapabilitySurfaceCard
        title="Packages"
        capabilities={[]}
        attachable={false}
        empty="No Pi packages registered."
        onInspect={vi.fn()}
      />,
    );
    expect(screen.getByText('0 items')).toBeTruthy();
    expect(screen.getByText('No Pi packages registered.')).toBeTruthy();
    expect(screen.getByText('Library source only')).toBeTruthy();
  });

  it('inspects the group on click, passing title, capabilities, and attachable', () => {
    const onInspect = vi.fn();
    const capabilities = [capability()];
    render(
      <CapabilitySurfaceCard
        title="Skills"
        capabilities={capabilities}
        attachable
        empty="No skills."
        onInspect={onInspect}
      />,
    );
    fireEvent.click(screen.getByText('Skills'));
    expect(onInspect).toHaveBeenCalledWith({ title: 'Skills', capabilities, attachable: true });
  });
});
