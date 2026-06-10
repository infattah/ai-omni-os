// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HarnessPage } from './HarnessPage';
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

function props(overrides = {}) {
  return {
    harnessTab: 'pi' as const,
    piCapabilities: [capability(), capability({ id: 'c2', name: 'eslint', kind: 'pi-package' })],
    generalCapabilities: [capability({ id: 'g1', name: 'shared-skill' })],
    universalSkills: [capability({ id: 'g1', name: 'shared-skill' })],
    onInspectGroup: vi.fn(),
    ...overrides,
  };
}

describe('HarnessPage', () => {
  it('renders the Pi harness library with capability surfaces and the launch policy', () => {
    render(<HarnessPage {...props()} />);
    expect(screen.getByText('Pi agent')).toBeTruthy();
    expect(screen.getByText('Packages')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('Launch Policy')).toBeTruthy();
  });

  it('inspects a Pi capability surface on click', () => {
    const onInspectGroup = vi.fn();
    render(<HarnessPage {...props({ onInspectGroup })} />);
    fireEvent.click(screen.getByText('Skills'));
    expect(onInspectGroup).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Skills', attachable: true }),
    );
  });

  it('renders the General harness universal capabilities', () => {
    render(<HarnessPage {...props({ harnessTab: 'general' })} />);
    expect(screen.getByText('General capabilities')).toBeTruthy();
    expect(screen.getByText('Universal Skills')).toBeTruthy();
    expect(screen.getByText('1 registered')).toBeTruthy();
  });

  it('renders a coming-soon placeholder for other harnesses', () => {
    render(<HarnessPage {...props({ harnessTab: 'codex' })} />);
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('MCP Servers')).toBeTruthy();
  });
});
