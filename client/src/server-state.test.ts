import { describe, expect, it } from 'vitest';
import { isActiveAgent, serverStateReducer, initialServerState, type ServerState } from './server-state';

function state(overrides: Partial<ServerState> = {}): ServerState {
  return { ...initialServerState, ...overrides };
}

describe('serverStateReducer', () => {
  it('replaces all server-owned data from a state.snapshot', () => {
    const next = serverStateReducer(initialServerState, {
      type: 'state.snapshot',
      repository: { path: '/repo' },
      agents: [{ id: 'a1', name: 'codex', tags: [], harness: 'pi', status: 'running' }],
      messages: [{ id: 'm1', channelId: '#all', sender: 'codex', content: 'hi', timestamp: 't' }],
      activity: [{ id: 'e1', kind: 'agent.created', summary: 'created', timestamp: 't' }],
      tasks: [
        {
          id: 't1',
          humanId: 'TASK-1',
          requester: 'dev',
          target: '#all',
          title: 'x',
          details: '',
          priority: 'normal',
          status: 'requested',
        },
      ],
      workClaims: [{ id: 'w1', agentName: 'codex', path: 'src/x', note: '', status: 'active' }],
      harnessHealth: { pi: { harness: 'pi' } as never },
      agentTemplates: [],
    });

    expect(next.repositoryPath).toBe('/repo');
    expect(next.agents).toHaveLength(1);
    expect(next.messages).toHaveLength(1);
    expect(next.tasks[0].humanId).toBe('TASK-1');
    expect(next.workClaims[0].path).toBe('src/x');
  });

  it('defaults missing snapshot fields to empty collections', () => {
    const next = serverStateReducer(initialServerState, { type: 'state.snapshot' });
    expect(next.repositoryPath).toBe('');
    expect(next.agents).toEqual([]);
    expect(next.harnessHealth).toEqual({});
  });

  it('appends a message and caps history at 100', () => {
    const seeded = state({
      messages: Array.from({ length: 100 }, (_, i) => ({
        id: `m${i}`,
        channelId: '#all',
        sender: 's',
        content: `${i}`,
        timestamp: 't',
      })),
    });
    const next = serverStateReducer(seeded, {
      type: 'message',
      id: 'new',
      channelId: '#all',
      sender: 's',
      content: 'newest',
      timestamp: 't',
    });
    expect(next.messages).toHaveLength(100);
    expect(next.messages[next.messages.length - 1].id).toBe('new');
    expect(next.messages[0].id).toBe('m1');
  });

  it('appends an activity event and caps at 100', () => {
    const next = serverStateReducer(initialServerState, {
      type: 'activity.event',
      event: { id: 'e1', kind: 'k', summary: 's', timestamp: 't' },
    });
    expect(next.activity).toHaveLength(1);
    expect(next.activity[0].id).toBe('e1');
  });

  it('upserts a changed task and sorts by humanId numerically', () => {
    const seeded = state({
      tasks: [
        {
          id: 't1',
          humanId: 'TASK-2',
          requester: 'dev',
          target: '#all',
          title: 'two',
          details: '',
          priority: 'normal',
          status: 'requested',
        },
        {
          id: 't2',
          humanId: 'TASK-10',
          requester: 'dev',
          target: '#all',
          title: 'ten',
          details: '',
          priority: 'normal',
          status: 'requested',
        },
      ],
    });
    const next = serverStateReducer(seeded, {
      type: 'task.changed',
      task: {
        id: 't1',
        humanId: 'TASK-2',
        requester: 'dev',
        target: '#all',
        title: 'two',
        details: '',
        priority: 'high',
        status: 'accepted',
      },
    });
    expect(next.tasks.map((t) => t.humanId)).toEqual(['TASK-2', 'TASK-10']); // numeric sort, not lexical
    expect(next.tasks[0].status).toBe('accepted'); // upserted, not duplicated
    expect(next.tasks).toHaveLength(2);
  });

  it('upserts a changed work claim by id', () => {
    const seeded = state({
      workClaims: [{ id: 'w1', agentName: 'codex', path: 'src/x', note: '', status: 'active' }],
    });
    const next = serverStateReducer(seeded, {
      type: 'workClaim.changed',
      workClaim: { id: 'w1', agentName: 'codex', path: 'src/x', note: 'done', status: 'released' },
    });
    expect(next.workClaims).toHaveLength(1);
    expect(next.workClaims[0].status).toBe('released');
  });

  it('replaces agents on an agents message and sets dir-entries', () => {
    const agentsNext = serverStateReducer(initialServerState, {
      type: 'agents',
      agents: [{ id: 'a1', name: 'x', tags: [], harness: 'pi', status: 'running' }],
    });
    expect(agentsNext.agents).toHaveLength(1);

    const dirNext = serverStateReducer(initialServerState, {
      type: 'dir-entries',
      path: '/home',
      entries: [{ name: 'proj', fullPath: '/home/proj', isDirectory: true }],
    });
    expect(dirNext.repoBrowserPath).toBe('/home');
    expect(dirNext.repoBrowserEntries).toHaveLength(1);
  });

  it('applies an agent-presence delta to one matching agent only', () => {
    const seeded = state({
      agents: [
        {
          id: 'a1',
          name: 'fresh',
          tags: [],
          harness: 'pi',
          status: 'running',
          presence: { connectionStatus: 'connected', workStatus: 'idle', lastSeenAt: 't1' },
        },
        {
          id: 'a2',
          name: 'quiet',
          tags: [],
          harness: 'pi',
          status: 'running',
          presence: { connectionStatus: 'connected', workStatus: 'idle', lastSeenAt: 't1' },
        },
      ],
    });

    const next = serverStateReducer(seeded, {
      type: 'agent-presence',
      agentName: 'quiet',
      presence: {
        connectionStatus: 'stale',
        workStatus: 'busy',
        lastSeenAt: 't1',
        contextUsedPct: 42,
        terminalAttached: false,
      },
    });

    expect(next.agents[0].presence?.connectionStatus).toBe('connected');
    expect(next.agents[1].presence).toMatchObject({
      connectionStatus: 'stale',
      workStatus: 'busy',
      contextUsedPct: 42,
      terminalAttached: false,
    });
  });

  it('treats stale running agents as inactive', () => {
    expect(
      isActiveAgent({
        id: 'a1',
        name: 'fresh',
        tags: [],
        harness: 'pi',
        status: 'running',
        presence: { connectionStatus: 'connected', workStatus: 'idle', lastSeenAt: 't' },
      }),
    ).toBe(true);
    expect(
      isActiveAgent({
        id: 'a2',
        name: 'stale',
        tags: [],
        harness: 'pi',
        status: 'running',
        presence: { connectionStatus: 'stale', workStatus: 'idle', lastSeenAt: 't' },
      }),
    ).toBe(false);
    expect(isActiveAgent({ id: 'a3', name: 'archived', tags: [], harness: 'pi', status: 'archived' })).toBe(
      false,
    );
  });

  it('records the context agent name from an agent.context message', () => {
    const next = serverStateReducer(initialServerState, {
      type: 'agent.context',
      agentName: 'codex',
      content: 'body',
    });
    expect(next.contextAgentName).toBe('codex');
  });

  it('returns the same state for a UI-only or unknown message', () => {
    const seeded = state({ repositoryPath: '/repo' });
    expect(serverStateReducer(seeded, { type: 'agent-created', agent: { name: 'x' } })).toBe(seeded);
    expect(serverStateReducer(seeded, { type: 'totally-unknown' } as never)).toBe(seeded);
  });
});
