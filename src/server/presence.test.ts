import { describe, expect, it } from 'vitest';
import { deriveConnectionStatus, deriveTerminalAttached, STALE_CUTOFF_MS } from './server.js';

describe('deriveConnectionStatus', () => {
  it('keeps a fresh heartbeat connected and marks old heartbeat stale at 30s', () => {
    const now = new Date('2026-06-06T00:00:30.000Z');

    expect(deriveConnectionStatus('2026-06-06T00:00:05.000Z', now)).toBe('connected');
    expect(deriveConnectionStatus('2026-06-06T00:00:00.000Z', now)).toBe('stale');
    expect(STALE_CUTOFF_MS).toBe(30_000);
  });
});

describe('deriveTerminalAttached', () => {
  it('uses tmux attach detection for tmux-backed running agents', () => {
    expect(deriveTerminalAttached({ status: 'running', launchBackend: 'tmux' }, () => false)).toBe(false);
    expect(deriveTerminalAttached({ status: 'running', launchBackend: 'tmux' }, () => true)).toBe(true);
  });

  it('treats non-tmux running agents as attached until their process exits', () => {
    expect(deriveTerminalAttached({ status: 'running', launchBackend: 'terminal' }, () => false)).toBe(true);
    expect(deriveTerminalAttached({ status: 'disconnected', launchBackend: 'terminal' }, () => true)).toBe(
      false,
    );
  });
});
