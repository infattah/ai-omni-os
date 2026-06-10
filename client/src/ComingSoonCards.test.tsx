// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ComingSoonCards } from './ComingSoonCards';

afterEach(cleanup);

describe('ComingSoonCards', () => {
  it('renders the title, description, and one card per section', () => {
    const { container } = render(
      <ComingSoonCards
        title="Codex"
        description="Codex management lands later."
        sections={['MCP Servers', 'Tools', 'Profiles']}
      />,
    );
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('Codex management lands later.')).toBeTruthy();
    expect(screen.getByText('MCP Servers')).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('Profiles')).toBeTruthy();
    expect(container.querySelectorAll('.capability-card.disabled')).toHaveLength(3);
  });
});
