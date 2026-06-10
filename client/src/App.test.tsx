// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { initialMode } from './App';

function setLocation(search: string) {
  window.history.pushState({}, '', `/${search}`);
}

describe('initialMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocation('');
  });

  it('opens Overview and records the session token when the login token changes', () => {
    window.localStorage.setItem('omni.sessionToken', 'old-token');
    window.localStorage.setItem('omni.mode', 'agents');
    setLocation('?token=new-token');

    expect(initialMode()).toBe('overview');
    expect(window.localStorage.getItem('omni.sessionToken')).toBe('new-token');
  });

  it('restores the stored page within the same session token', () => {
    window.localStorage.setItem('omni.sessionToken', 'same-token');
    window.localStorage.setItem('omni.mode', 'agents');
    setLocation('?token=same-token');

    expect(initialMode()).toBe('agents');
  });

  it('uses a URL mode before session-token page memory', () => {
    window.localStorage.setItem('omni.sessionToken', 'old-token');
    window.localStorage.setItem('omni.mode', 'agents');
    setLocation('?token=new-token&mode=chat');

    expect(initialMode()).toBe('chat');
    expect(window.localStorage.getItem('omni.sessionToken')).toBe('old-token');
  });
});
