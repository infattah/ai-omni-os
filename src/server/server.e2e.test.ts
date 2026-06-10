import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createServer, type OmniServer } from './server.js';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let server: OmniServer;
let msgQueue: any[];
let ws: WebSocket;

function collectAll(raw: string) {
  msgQueue.push(JSON.parse(raw));
}

function wsSend(obj: Record<string, unknown>) {
  ws.send(JSON.stringify(obj));
}

function waitForType(type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for ${type}, queue: ${JSON.stringify(msgQueue.map((m) => m.type).slice(-5))}`,
          ),
        ),
      timeout,
    );
    const check = () => {
      const idx = msgQueue.findIndex((m: any) => m.type === type);
      if (idx >= 0) {
        const [msg] = msgQueue.splice(idx, 1);
        clearTimeout(timer);
        resolve(msg);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function waitForActivityKind(kind: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for activity ${kind}, queue: ${JSON.stringify(msgQueue.map((m) => (m.type === 'activity.event' ? m.event?.kind : m.type)).slice(-8))}`,
          ),
        ),
      timeout,
    );
    const check = () => {
      const idx = msgQueue.findIndex((m: any) => m.type === 'activity.event' && m.event?.kind === kind);
      if (idx >= 0) {
        const [msg] = msgQueue.splice(idx, 1);
        clearTimeout(timer);
        resolve(msg);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function waitForMessageContent(content: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for message ${content}, queue: ${JSON.stringify(msgQueue.map((m) => m.content || m.type).slice(-8))}`,
          ),
        ),
      timeout,
    );
    const check = () => {
      const idx = msgQueue.findIndex((m: any) => m.type === 'message' && m.content === content);
      if (idx >= 0) {
        const [msg] = msgQueue.splice(idx, 1);
        clearTimeout(timer);
        resolve(msg);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function drainAll() {
  msgQueue = [];
}

function waitForSocketMessage(
  socket: WebSocket,
  predicate: (msg: any) => boolean,
  timeout = 5000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timeout waiting for connector socket message'));
    }, timeout);
    const onMessage = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (!predicate(msg)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(msg);
    };
    socket.on('message', onMessage);
  });
}

function waitForWorkClaimPath(path: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for Work Claim ${path}, queue: ${JSON.stringify(msgQueue.map((m) => m.type).slice(-8))}`,
          ),
        ),
      timeout,
    );
    const check = () => {
      const idx = msgQueue.findIndex(
        (m: any) => m.type === 'workClaim.changed' && m.workClaim?.path === path,
      );
      if (idx >= 0) {
        const [msg] = msgQueue.splice(idx, 1);
        clearTimeout(timer);
        resolve(msg.workClaim);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function waitForTaskHumanId(humanId: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for task ${humanId}, queue: ${JSON.stringify(msgQueue.map((m) => m.type).slice(-8))}`,
          ),
        ),
      timeout,
    );
    const check = () => {
      const idx = msgQueue.findIndex((m: any) => m.type === 'task.changed' && m.task?.humanId === humanId);
      if (idx >= 0) {
        const [msg] = msgQueue.splice(idx, 1);
        clearTimeout(timer);
        resolve(msg.task);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function waitForAgentNamed(name: string, predicate: (agent: any) => boolean, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for agent ${name}, queue: ${JSON.stringify(msgQueue.map((m) => m.type).slice(-8))}`,
          ),
        ),
      timeout,
    );
    const check = () => {
      const idx = msgQueue.findIndex(
        (m: any) =>
          m.type === 'agents' &&
          Array.isArray(m.agents) &&
          m.agents.some((agent: any) => agent.name === name && predicate(agent)),
      );
      if (idx >= 0) {
        const msg = msgQueue[idx];
        const agent = msg.agents.find((item: any) => item.name === name && predicate(item));
        msgQueue.splice(idx, 1);
        clearTimeout(timer);
        resolve(agent);
      } else {
        const presenceIdx = msgQueue.findIndex(
          (m: any) =>
            m.type === 'agent-presence' && m.agentName === name && predicate({ name, presence: m.presence }),
        );
        if (presenceIdx >= 0) {
          const msg = msgQueue[presenceIdx];
          msgQueue.splice(presenceIdx, 1);
          clearTimeout(timer);
          resolve({ name, presence: msg.presence });
          return;
        }
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function waitForAgentOutputContaining(text: string, timeout = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for output containing "${text}"`)),
      timeout,
    );
    const check = () => {
      const idx = msgQueue.findIndex(
        (m: any) => m.type === 'agent-output' && m.content && m.content.includes(text),
      );
      if (idx >= 0) {
        const [msg] = msgQueue.splice(idx, 1);
        clearTimeout(timer);
        resolve(msg);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

describe('Omni E2E', () => {
  beforeAll(async () => {
    server = await createServer(0);
    msgQueue = [];
    ws = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    ws.on('message', collectAll);
    await waitForType('connected');
  });

  afterAll(() => {
    ws.close();
    server.close();
  });

  it('requires the per-run session token for browser WebSocket connections', async () => {
    const unauthorized = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const closeCode = await new Promise<number>((resolve) => {
      unauthorized.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(1008);
  });

  it('rejects unknown Agent Harnesses instead of spawning arbitrary commands', async () => {
    wsSend({
      type: 'create-agent',
      name: 'bad-agent',
      tags: [],
      harness: 'definitely-not-allowed',
      cwd: '/tmp',
      openTerminal: false,
    });
    const msg = await waitForType('agent-create-failed');
    expect(msg.reason).toContain('Unsupported Agent Harness');
    drainAll();
  });

  it('creates an agent and records an activity event', async () => {
    wsSend({
      type: 'create-agent',
      name: 'cat-bot',
      tags: ['worker'],
      harness: 'cat',
      cwd: '/tmp',
      openTerminal: false,
    });
    const msg = await waitForType('agent-created');
    expect(msg.agent.name).toBe('cat-bot');
    expect(msg.agent.status).toBe('running');
    await waitForType('agents');
    const activity = await waitForActivityKind('agent.created');
    expect(activity.event.kind).toBe('agent.created');
    expect(activity.event.summary).toContain('cat-bot');
    drainAll();
  });

  it('rejects unsafe Agent Instance names before terminal launch', async () => {
    wsSend({
      type: 'create-agent',
      name: 'bad"name',
      tags: [],
      harness: 'cat',
      cwd: '/tmp',
      openTerminal: false,
    });
    const msg = await waitForType('agent-create-failed');
    expect(msg.reason).toContain('Agent Instance names may only contain');
    drainAll();
  });

  it('rejects duplicate Agent Instance names in the same Repository', async () => {
    wsSend({
      type: 'create-agent',
      name: 'cat-bot',
      tags: [],
      harness: 'cat',
      cwd: '/tmp',
      openTerminal: false,
    });
    const msg = await waitForType('agent-create-failed');
    expect(msg.reason).toContain('already exists');
    drainAll();
  });

  it('lets the dashboard create and release an explicit Work Claim', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-dev-work-claim-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'workClaim.create',
      agentName: 'Dev',
      path: 'client/src/App.tsx',
      note: 'Adding claim UI',
    });
    const claim = await waitForWorkClaimPath('client/src/App.tsx');
    expect(claim.agentName).toBe('Dev');
    expect(claim.status).toBe('active');
    expect((await waitForActivityKind('work_claim.created')).event.summary).toContain(
      'Dev claimed client/src/App.tsx',
    );
    drainAll();

    wsSend({ type: 'workClaim.release', agentName: 'Dev', path: 'client/src/App.tsx' });
    const released = await waitForWorkClaimPath('client/src/App.tsx');
    expect(released.status).toBe('released');
    expect((await waitForActivityKind('work_claim.released')).event.summary).toContain(
      'Dev released client/src/App.tsx',
    );
    drainAll();
  });

  it('lets a connector create and release an explicit Work Claim', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-work-claim-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));
    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'claim-agent-1',
        agentName: 'pi-claimer',
        harness: 'pi',
        tags: ['coding'],
      }),
    );
    await waitForActivityKind('discovery.received');
    drainAll();

    connector.send(
      JSON.stringify({
        type: 'connector.workClaim.create',
        agentName: 'pi-claimer',
        path: 'src/server/server.ts',
        note: 'Adding Work Claim support',
      }),
    );

    const claim = await waitForWorkClaimPath('src/server/server.ts');
    expect(claim.agentName).toBe('pi-claimer');
    expect(claim.status).toBe('active');
    expect(claim.note).toBe('Adding Work Claim support');
    expect((await waitForActivityKind('work_claim.created')).event.summary).toContain(
      'pi-claimer claimed src/server/server.ts',
    );
    drainAll();

    connector.send(
      JSON.stringify({
        type: 'connector.workClaim.release',
        path: 'src/server/server.ts',
        agentName: 'pi-claimer',
      }),
    );
    const released = await waitForWorkClaimPath('src/server/server.ts');
    expect(released.status).toBe('released');
    expect((await waitForActivityKind('work_claim.released')).event.summary).toContain(
      'pi-claimer released src/server/server.ts',
    );

    const refreshedMessages: any[] = [];
    const refreshed = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    refreshed.on('message', (raw) => refreshedMessages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => refreshed.on('open', () => resolve()));
    const snapshot = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for state.snapshot: ${JSON.stringify(refreshedMessages)}`)),
        5000,
      );
      const check = () => {
        const found = refreshedMessages.find((m) => m.type === 'state.snapshot');
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    expect(
      snapshot.workClaims.some(
        (item: any) => item.path === 'src/server/server.ts' && item.status === 'released',
      ),
    ).toBe(true);

    refreshed.close();
    connector.close();
    drainAll();
  });

  it('supports reject, block, fail, and Dev cancel Task lifecycle updates', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-task-more-lifecycle-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));
    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'task-life-agent-1',
        agentName: 'pi-coder-life',
        harness: 'pi',
        tags: ['coding'],
      }),
    );
    await waitForActivityKind('discovery.received');
    drainAll();

    wsSend({ type: 'task.create', title: 'Reject me', target: '@pi-coder-life' });
    await waitForTaskHumanId('TASK-1');
    await waitForActivityKind('task.created');
    connector.send(
      JSON.stringify({
        type: 'connector.task.reject',
        humanId: 'TASK-1',
        owner: 'pi-coder-life',
        reason: 'not relevant',
      }),
    );
    expect((await waitForTaskHumanId('TASK-1')).status).toBe('rejected');
    expect((await waitForActivityKind('task.rejected')).event.summary).toContain(
      'pi-coder-life rejected TASK-1',
    );
    drainAll();

    wsSend({ type: 'task.create', title: 'Block me', target: '@pi-coder-life' });
    await waitForTaskHumanId('TASK-2');
    await waitForActivityKind('task.created');
    connector.send(
      JSON.stringify({ type: 'connector.task.accept', humanId: 'TASK-2', owner: 'pi-coder-life' }),
    );
    await waitForTaskHumanId('TASK-2');
    await waitForActivityKind('task.accepted');
    connector.send(
      JSON.stringify({
        type: 'connector.task.block',
        humanId: 'TASK-2',
        owner: 'pi-coder-life',
        reason: 'waiting on Dev',
      }),
    );
    expect((await waitForTaskHumanId('TASK-2')).status).toBe('blocked');
    expect((await waitForActivityKind('task.blocked')).event.summary).toContain(
      'pi-coder-life blocked TASK-2',
    );
    drainAll();

    wsSend({ type: 'task.create', title: 'Fail me', target: '@pi-coder-life' });
    await waitForTaskHumanId('TASK-3');
    await waitForActivityKind('task.created');
    connector.send(
      JSON.stringify({
        type: 'connector.task.fail',
        humanId: 'TASK-3',
        owner: 'pi-coder-life',
        reason: 'tests impossible',
      }),
    );
    expect((await waitForTaskHumanId('TASK-3')).status).toBe('failed');
    expect((await waitForActivityKind('task.failed')).event.summary).toContain('pi-coder-life failed TASK-3');
    drainAll();

    wsSend({ type: 'task.create', title: 'Cancel me', target: '#all' });
    await waitForTaskHumanId('TASK-4');
    await waitForActivityKind('task.created');
    wsSend({ type: 'task.cancel', humanId: 'TASK-4' });
    expect((await waitForTaskHumanId('TASK-4')).status).toBe('cancelled');
    expect((await waitForActivityKind('task.cancelled')).event.summary).toContain('Dev cancelled TASK-4');

    connector.close();
    drainAll();
  });

  it('lets a connector accept and complete a Task Request', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-task-lifecycle-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'task.create',
      title: 'Patch WebSocket auth',
      target: '@pi-coder',
      priority: 'high',
    });
    await waitForTaskHumanId('TASK-1');
    await waitForActivityKind('task.created');
    drainAll();

    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));
    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'task-owner-1',
        agentName: 'pi-coder',
        harness: 'pi',
        tags: ['coding'],
      }),
    );
    await waitForActivityKind('discovery.received');
    drainAll();

    connector.send(
      JSON.stringify({
        type: 'connector.task.accept',
        humanId: 'TASK-1',
        owner: 'pi-coder',
      }),
    );
    const accepted = await waitForTaskHumanId('TASK-1');
    expect(accepted.status).toBe('accepted');
    expect(accepted.owner).toBe('pi-coder');
    const acceptedActivity = await waitForActivityKind('task.accepted');
    expect(acceptedActivity.event.summary).toContain('pi-coder accepted TASK-1');
    drainAll();

    connector.send(
      JSON.stringify({
        type: 'connector.task.complete',
        humanId: 'TASK-1',
        owner: 'pi-coder',
        resultSummary: 'Added token checks.',
      }),
    );
    const completed = await waitForTaskHumanId('TASK-1');
    expect(completed.status).toBe('completed');
    expect(completed.owner).toBe('pi-coder');
    const completedActivity = await waitForActivityKind('task.completed');
    expect(completedActivity.event.summary).toContain('pi-coder completed TASK-1');
    const projectSummary = readFileSync(join(repo, '.omni', 'summaries', 'project.md'), 'utf-8');
    expect(projectSummary).toContain('TASK-1');
    expect(projectSummary).toContain('Patch WebSocket auth');
    expect(projectSummary).toContain('pi-coder');
    expect(projectSummary).toContain('Added token checks.');

    connector.close();
    drainAll();
  });

  it('creates a Task Request from a connector tool message', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-connector-task-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));
    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'task-requester-1',
        agentName: 'pi-planner-tasker',
        harness: 'pi',
        tags: ['planning'],
      }),
    );
    await waitForActivityKind('discovery.received');
    drainAll();

    connector.send(
      JSON.stringify({
        type: 'connector.task.create',
        requester: 'pi-planner-tasker',
        target: '@pi-coder',
        title: 'Implement auth validation',
        details: 'Use the existing token middleware.',
        priority: 'urgent',
      }),
    );

    const task = await waitForTaskHumanId('TASK-1');
    expect(task.requester).toBe('pi-planner-tasker');
    expect(task.target).toBe('@pi-coder');
    expect(task.priority).toBe('urgent');
    await waitForActivityKind('task.created');

    connector.close();
    drainAll();
  });

  it('routes connector chat through the hub to other connectors', async () => {
    drainAll();
    const plannerMessages: any[] = [];
    const coderMessages: any[] = [];
    const planner = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    const coder = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    planner.on('message', (raw) => plannerMessages.push(JSON.parse(raw.toString())));
    coder.on('message', (raw) => coderMessages.push(JSON.parse(raw.toString())));
    await Promise.all([
      new Promise<void>((resolve) => planner.on('open', () => resolve())),
      new Promise<void>((resolve) => coder.on('open', () => resolve())),
    ]);

    planner.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'planner-agent',
        agentName: 'pi-planner',
        harness: 'pi',
        tags: ['planning'],
      }),
    );
    coder.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'coder-agent',
        agentName: 'pi-coder',
        harness: 'pi',
        tags: ['coding'],
      }),
    );
    await waitForActivityKind('discovery.received');
    await waitForActivityKind('discovery.received');
    drainAll();

    planner.send(
      JSON.stringify({
        type: 'connector.chat.send',
        channelId: '#all',
        sender: 'pi-planner',
        content: 'planner to coder via hub',
      }),
    );

    const routed = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(`Timeout waiting for routed coordination message: ${JSON.stringify(coderMessages)}`),
          ),
        5000,
      );
      const check = () => {
        const found = coderMessages.find(
          (m) => m.type === 'coordination.message' && m.content === 'planner to coder via hub',
        );
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    expect(routed.sender).toBe('pi-planner');
    expect(routed.channelId).toBe('#all');

    planner.close();
    coder.close();
    drainAll();
  });

  it('accepts connector Discovery and sends #all Coordination Feed messages to it', async () => {
    drainAll();
    const connectorMessages: any[] = [];
    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    connector.on('message', (raw) => connectorMessages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));

    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'connector-agent-1',
        agentName: 'pi-planner',
        harness: 'pi',
        tags: ['planning'],
        purpose: 'planning',
      }),
    );

    const activity = await waitForActivityKind('discovery.received');
    expect(activity.event.summary).toContain('pi-planner');
    const briefing = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for startup.briefing: ${JSON.stringify(connectorMessages)}`)),
        5000,
      );
      const check = () => {
        const found = connectorMessages.find(
          (m) => m.type === 'startup.briefing' && m.agentName === 'pi-planner',
        );
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    expect(briefing.content).toContain('Collaboration Contract');
    const message = await waitForType('message');
    expect(message.content).toContain('pi-planner joined');

    wsSend({
      type: 'send-message',
      channelId: '#all',
      content: 'coordination-feed-test',
      channelType: 'group',
    });
    const feed = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error(`Timeout waiting for coordination.message: ${JSON.stringify(connectorMessages)}`)),
        5000,
      );
      const check = () => {
        const found = connectorMessages.find(
          (m) => m.type === 'coordination.message' && m.content === 'coordination-feed-test',
        );
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    expect(feed.channelId).toBe('#all');
    expect(feed.sender).toBe('dev');

    wsSend({
      type: 'send-message',
      channelId: '@pi-planner',
      content: 'direct-feed-test',
      channelType: 'direct',
    });
    const directFeed = await waitForSocketMessage(
      connector,
      (msg) => msg.type === 'coordination.message' && msg.content === 'direct-feed-test',
    );
    expect(directFeed.channelId).toBe('@pi-planner');
    expect(directFeed.sender).toBe('dev');

    connector.send(
      JSON.stringify({
        type: 'connector.chat.send',
        channelId: '#all',
        sender: 'pi-planner',
        content: 'hello back from connector',
      }),
    );
    const connectorChat = await waitForMessageContent('hello back from connector');
    expect(connectorChat.sender).toBe('pi-planner');
    expect(connectorChat.content).toBe('hello back from connector');

    connector.close();
    drainAll();
  });

  it('broadcasts Agent Instance Presence when a connector connects and disconnects', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-presence-state-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'create-agent',
      name: 'pi-presence-state',
      tags: [],
      harness: 'cat',
      openTerminal: false,
    });
    await waitForType('agent-created');
    await waitForType('agents');
    await waitForActivityKind('agent.created');
    drainAll();

    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));
    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'presence-state-agent-1',
        agentName: 'pi-presence-state',
        harness: 'pi',
        tags: [],
      }),
    );

    const connectedAgent = await waitForAgentNamed(
      'pi-presence-state',
      (agent) => agent.presence?.connectionStatus === 'connected',
    );
    expect(connectedAgent.presence.workStatus).toBe('idle');
    expect(connectedAgent.presence.lastSeenAt).toBeTruthy();

    drainAll();
    connector.close();
    const disconnectedAgent = await waitForAgentNamed(
      'pi-presence-state',
      (agent) => agent.presence?.connectionStatus === 'disconnected',
    );
    expect(disconnectedAgent.presence.workStatus).toBe('unknown');
    drainAll();
  });

  it('updates Agent Instance Presence from connector heartbeat', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-presence-heartbeat-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({ type: 'create-agent', name: 'pi-heartbeat', tags: [], harness: 'cat', openTerminal: false });
    await waitForType('agent-created');
    await waitForType('agents');
    await waitForActivityKind('agent.created');
    drainAll();

    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));
    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'heartbeat-agent-1',
        agentName: 'pi-heartbeat',
        harness: 'pi',
        tags: [],
      }),
    );
    await waitForAgentNamed('pi-heartbeat', (agent) => agent.presence?.connectionStatus === 'connected');
    drainAll();

    connector.send(
      JSON.stringify({
        type: 'presence.heartbeat',
        agentName: 'pi-heartbeat',
        workStatus: 'busy',
        currentTaskId: 'TASK-1',
      }),
    );

    const busyAgent = await waitForAgentNamed(
      'pi-heartbeat',
      (agent) => agent.presence?.workStatus === 'busy',
    );
    expect(busyAgent.presence.currentTaskId).toBe('TASK-1');

    connector.close();
    drainAll();
  });

  it('records Presence activity when a connector disconnects', async () => {
    drainAll();
    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));

    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'presence-agent-1',
        agentName: 'pi-presence',
        harness: 'pi',
        tags: [],
      }),
    );

    await waitForActivityKind('discovery.received');
    drainAll();
    connector.close();

    const activity = await waitForActivityKind('presence.disconnected');
    expect(activity.event.summary).toContain('pi-presence disconnected');
    drainAll();
  });

  it('saves a timestamped Startup Briefing when a connector discovers itself', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-briefing-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    const connectorMessages: any[] = [];
    const connector = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    connector.on('message', (raw) => connectorMessages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => connector.on('open', () => resolve()));

    connector.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: 'briefing-agent-1',
        agentName: 'pi-briefing',
        harness: 'pi',
        tags: ['planning'],
        purpose: 'planning',
      }),
    );

    await waitForActivityKind('discovery.received');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for startup.briefing: ${JSON.stringify(connectorMessages)}`)),
        5000,
      );
      const check = () => {
        if (connectorMessages.some((m) => m.type === 'startup.briefing' && m.agentName === 'pi-briefing')) {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    const briefingFiles = readdirSync(join(repo, '.omni', 'briefings')).filter((name) =>
      name.includes('pi-briefing'),
    );
    expect(briefingFiles.length).toBe(1);
    const briefing = readFileSync(join(repo, '.omni', 'briefings', briefingFiles[0]), 'utf-8');
    expect(briefing).toContain('# Startup Briefing for pi-briefing');
    expect(briefing).toContain('Collaboration Contract');

    connector.close();
    drainAll();
  });

  it('agent output appears when message is sent to #all and records an activity event', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-agent-output-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'create-agent',
      name: 'output-cat-bot',
      tags: ['worker'],
      harness: 'cat',
      openTerminal: false,
    });
    await waitForType('agent-created');
    await waitForType('agents');
    await waitForActivityKind('agent.created');
    drainAll();

    wsSend({ type: 'send-message', channelId: '#all', content: 'e2e-roundtrip', channelType: 'group' });
    await waitForType('message');
    const activity = await waitForActivityKind('message.sent');
    expect(activity.event.kind).toBe('message.sent');
    expect(activity.event.summary).toContain('#all');
    const output = await waitForAgentOutputContaining('e2e-roundtrip', 10000);
    expect(output.agentName).toBe('output-cat-bot');
    drainAll();
  });

  it('selecting a Repository initializes Project Memory and gitignores it', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-memory-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    const activity = await waitForActivityKind('repository.selected');

    expect(activity.event.kind).toBe('repository.selected');
    expect(activity.event.summary).toContain(repo);
    expect(existsSync(join(repo, '.omni'))).toBe(true);
    expect(existsSync(join(repo, '.omni', 'data.db'))).toBe(true);
    expect(existsSync(join(repo, '.omni', 'agents'))).toBe(true);
    expect(existsSync(join(repo, '.omni', 'summaries', 'project.md'))).toBe(true);
    expect(existsSync(join(repo, '.omni', 'briefings'))).toBe(true);
    expect(JSON.parse(readFileSync(join(repo, '.omni', 'config.json'), 'utf-8')).version).toBe(1);
    expect(readFileSync(join(repo, '.gitignore'), 'utf-8')).toContain('.omni/');
    drainAll();
  });

  it('creates a Repository-local Task Request and includes it in refresh snapshot', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-task-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'task.create',
      title: 'Review auth flow',
      details: 'Check token validation path.',
      target: '#all',
      priority: 'high',
    });

    const task = await waitForTaskHumanId('TASK-1');
    expect(task.title).toBe('Review auth flow');
    expect(task.status).toBe('requested');
    expect(task.priority).toBe('high');
    expect(task.requester).toBe('dev');
    const activity = await waitForActivityKind('task.created');
    expect(activity.event.summary).toContain('TASK-1');

    const refreshedMessages: any[] = [];
    const refreshed = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    refreshed.on('message', (raw) => refreshedMessages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => refreshed.on('open', () => resolve()));
    const snapshot = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for state.snapshot: ${JSON.stringify(refreshedMessages)}`)),
        5000,
      );
      const check = () => {
        const found = refreshedMessages.find((m) => m.type === 'state.snapshot');
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    expect(
      snapshot.tasks.some((item: any) => item.humanId === 'TASK-1' && item.title === 'Review auth flow'),
    ).toBe(true);
    refreshed.close();
    drainAll();
  });

  it('creates a readable Agent Context file in Project Memory when creating an agent', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-agent-context-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'create-agent',
      name: 'context-agent',
      tags: ['planning'],
      harness: 'cat',
      openTerminal: false,
    });
    await waitForType('agent-created');

    const contextPath = join(repo, '.omni', 'agents', 'context-agent.md');
    expect(existsSync(contextPath)).toBe(true);
    const context = readFileSync(contextPath, 'utf-8');
    expect(context).toContain('# Agent Context: context-agent');
    expect(context).toContain('Harness: cat');
    expect(context).toContain('Tags: planning');
    drainAll();
  });

  it('broadcasts a fresh Repository-local snapshot after selecting a Repository', async () => {
    const repoA = mkdtempSync(join(tmpdir(), 'omni-snapshot-a-'));
    const repoB = mkdtempSync(join(tmpdir(), 'omni-snapshot-b-'));

    wsSend({ type: 'select-repo', path: repoA });
    await waitForType('repo-selected');
    await waitForType('state.snapshot');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({ type: 'send-message', channelId: '#all', content: 'repo-a-only-message', channelType: 'group' });
    await waitForMessageContent('repo-a-only-message');
    await waitForActivityKind('message.sent');
    drainAll();

    wsSend({ type: 'select-repo', path: repoB });
    await waitForType('repo-selected');
    const snapshot = await waitForType('state.snapshot');
    expect(snapshot.repository.path).toBe(repoB);
    expect(snapshot.messages.some((message: any) => message.content === 'repo-a-only-message')).toBe(false);
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.workClaims).toEqual([]);
    drainAll();
  });

  it('generates a Repository-local handoff snapshot', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-handoff-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'create-agent',
      name: 'handoff-agent',
      tags: ['planning'],
      harness: 'cat',
      openTerminal: false,
    });
    await waitForType('agent-created');
    wsSend({ type: 'task.create', title: 'Prepare handoff', target: '@handoff-agent' });
    await waitForTaskHumanId('TASK-1');
    await waitForActivityKind('task.created');
    wsSend({
      type: 'workClaim.create',
      agentName: 'Dev',
      path: 'docs/plan-v1.md',
      note: 'Documenting next step',
    });
    await waitForWorkClaimPath('docs/plan-v1.md');
    await waitForActivityKind('work_claim.created');
    drainAll();

    wsSend({ type: 'handoff.generate' });
    const generated = await waitForType('handoff.generated');
    expect(generated.path).toContain(join(repo, '.omni', 'handoffs'));
    const content = readFileSync(generated.path, 'utf-8');
    expect(content).toContain('# Omni Handoff');
    expect(content).toContain('@handoff-agent');
    expect(content).toContain('TASK-1: Prepare handoff');
    expect(content).toContain('docs/plan-v1.md');
    expect((await waitForActivityKind('handoff.generated')).event.summary).toContain('Handoff generated');
    drainAll();
  });

  it('lets the dashboard archive, resume, and delete an Agent Instance', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-agent-actions-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'create-agent',
      name: 'action-agent',
      tags: ['planning'],
      harness: 'cat',
      openTerminal: false,
    });
    const created = await waitForType('agent-created');
    const agentId = created.agent.id;
    drainAll();

    wsSend({ type: 'archive-agent', id: agentId });
    const archived = await waitForAgentNamed('action-agent', (agent: any) => agent.status === 'archived');
    expect(archived.status).toBe('archived');
    expect((await waitForActivityKind('agent.archived')).event.summary).toContain('action-agent');
    drainAll();

    wsSend({ type: 'resume-agent', id: agentId, openTerminal: false });
    const resumed = await waitForAgentNamed('action-agent', (agent: any) => agent.status === 'running');
    expect(resumed.status).toBe('running');
    expect((await waitForActivityKind('agent.resumed')).event.summary).toContain('action-agent');
    drainAll();

    wsSend({ type: 'delete-agent', id: agentId });
    expect((await waitForActivityKind('agent.deleted')).event.summary).toContain('action-agent');
    drainAll();
  });

  it('lets the dashboard read and save the Project Summary', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-project-summary-edit-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({ type: 'project.summary.get' });
    const summary = await waitForType('project.summary');
    expect(summary.content).toContain('# Project Summary');

    wsSend({ type: 'project.summary.save', content: '# Project Summary\n\nEdited by Dev.\n' });
    await waitForType('project.summary.saved');
    expect(readFileSync(join(repo, '.omni', 'summaries', 'project.md'), 'utf-8')).toContain('Edited by Dev.');
    expect((await waitForActivityKind('project_summary.updated')).event.summary).toContain(
      'Project Summary updated by Dev',
    );
    drainAll();
  });

  it('lets the dashboard read and save an Agent Context file', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-agent-context-edit-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'create-agent',
      name: 'context-editor',
      tags: ['planning'],
      harness: 'cat',
      openTerminal: false,
    });
    await waitForType('agent-created');
    drainAll();

    wsSend({ type: 'agent.context.get', agentName: 'context-editor' });
    const contextMsg = await waitForType('agent.context');
    expect(contextMsg.agentName).toBe('context-editor');
    expect(contextMsg.content).toContain('# Agent Context: context-editor');

    wsSend({
      type: 'agent.context.save',
      agentName: 'context-editor',
      content: '# Agent Context: context-editor\n\nUpdated by Dev.\n',
    });
    const saved = await waitForType('agent.context.saved');
    expect(saved.agentName).toBe('context-editor');
    expect(readFileSync(join(repo, '.omni', 'agents', 'context-editor.md'), 'utf-8')).toContain(
      'Updated by Dev.',
    );
    expect((await waitForActivityKind('agent_context.updated')).event.summary).toContain('context-editor');
    drainAll();
  });

  it('sends a state snapshot to a new browser connection after refresh', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'omni-refresh-'));

    wsSend({ type: 'select-repo', path: repo });
    await waitForType('repo-selected');
    await waitForType('agents');
    await waitForType('groups');
    await waitForActivityKind('repository.selected');
    drainAll();

    wsSend({
      type: 'send-message',
      channelId: '#all',
      content: 'persisted-after-refresh',
      channelType: 'group',
    });
    await waitForMessageContent('persisted-after-refresh');
    await waitForActivityKind('message.sent');

    const refreshedMessages: any[] = [];
    const refreshed = new WebSocket(`ws://127.0.0.1:${server.port}?token=${server.sessionToken}`);
    refreshed.on('message', (raw) => refreshedMessages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => refreshed.on('open', () => resolve()));

    const snapshot = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for state.snapshot: ${JSON.stringify(refreshedMessages)}`)),
        5000,
      );
      const check = () => {
        const found = refreshedMessages.find((m) => m.type === 'state.snapshot');
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    expect(snapshot.repository.path).toBe(repo);
    expect(snapshot.messages.some((message: any) => message.content === 'persisted-after-refresh')).toBe(
      true,
    );
    expect(snapshot.activity.some((event: any) => event.kind === 'message.sent')).toBe(true);

    refreshed.close();
    drainAll();
  });

  it('handles repo switch — clears agents and loads new repo', async () => {
    const repoA = mkdtempSync(join(tmpdir(), 'omni-e2e-a-'));
    const repoB = mkdtempSync(join(tmpdir(), 'omni-e2e-b-'));

    // Switch to repo A, create agent
    wsSend({ type: 'select-repo', path: repoA });
    await waitForType('repo-selected');
    // Wait for agents + groups broadcasts from select-repo handler
    await waitForType('agents');
    await waitForType('groups');
    drainAll();

    wsSend({
      type: 'create-agent',
      name: 'repo-a-agent',
      tags: [],
      harness: 'cat',
      cwd: repoA,
      openTerminal: false,
    });
    await waitForType('agent-created');
    // Drain the agents+groups broadcasts from createAgent's broadcastState
    await waitForType('agents');
    await waitForType('groups');
    drainAll();

    // Switch to repo B — agents should be cleared
    wsSend({ type: 'select-repo', path: repoB });
    await waitForType('repo-selected');
    // Agents broadcast should be empty for new repo
    const agentsB = await waitForType('agents');
    expect((agentsB.agents as any[]).length).toBe(0);
    await waitForType('groups');
    drainAll();

    // Create agent in repo B
    wsSend({
      type: 'create-agent',
      name: 'repo-b-agent',
      tags: [],
      harness: 'cat',
      cwd: repoB,
      openTerminal: false,
    });
    await waitForType('agent-created');
    // Drain broadcasts from createAgent
    await waitForType('agents');
    await waitForType('groups');
    drainAll();

    // Create another agent to verify state — repo-a-agent should NOT appear
    wsSend({
      type: 'create-agent',
      name: 'verify-agent',
      tags: [],
      harness: 'cat',
      cwd: repoB,
      openTerminal: false,
    });
    await waitForType('agent-created');
    // Get the agents broadcast — this is the current agent list for repo B
    const agentsFinal = await waitForType('agents');
    const names = (agentsFinal.agents as any[]).map((a: any) => a.name);
    expect(names).not.toContain('repo-a-agent');
    expect(names).toContain('repo-b-agent');
    expect(names).toContain('verify-agent');
  });
});
