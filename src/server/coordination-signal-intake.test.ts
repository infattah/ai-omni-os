import { describe, expect, it, vi } from 'vitest';
import { CoordinationSignalIntake, type CoordinationSignalIntakeDeps } from './coordination-signal-intake.js';
import type { TaskRequest } from '../types.js';

function makeTask(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: 'task-1',
    humanId: 'TASK-1',
    requester: 'dev',
    target: '#all',
    title: 'Test task',
    details: '',
    expectedResult: '',
    priority: 'normal',
    status: 'requested',
    owner: null,
    parentTaskId: null,
    filePaths: [],
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

function makeDeps(): CoordinationSignalIntakeDeps {
  return {
    connectorName: () => 'pi-planner',
    send: vi.fn(),
    createTask: vi.fn(() => makeTask()),
    updateTaskLifecycle: vi.fn(() => makeTask({ status: 'completed' })),
    appendCompletedTaskSummary: vi.fn(),
    createWorkClaim: vi.fn(() => null),
    releaseWorkClaim: vi.fn(() => null),
    updatePresence: vi.fn(),
    currentPresence: vi.fn(() => undefined),
    recordChatMessage: vi.fn(() => ({
      id: 'msg-1',
      msg_id: 'msg-1',
      channelId: '#all',
      sender: 'agent',
      content: 'hello',
      mentions: [],
      channelType: 'group',
      recipientAgents: [],
      expectsReply: false,
      hops: 0,
      timestamp: '2026-05-31T00:00:00.000Z',
    })),
    sendDevMessage: vi.fn(() => ({
      id: 'msg-dev',
      msg_id: 'msg-dev',
      channelId: '#all',
      sender: 'dev',
      content: 'hello',
      mentions: [],
      channelType: 'group',
      recipientAgents: [],
      expectsReply: false,
      hops: 0,
      timestamp: '2026-05-31T00:00:00.000Z',
    })),
    sendCoordinationMessage: vi.fn(),
    relayCoordinationToTerminalAgents: vi.fn(),
    recordActivity: vi.fn(),
  };
}

describe('CoordinationSignalIntake', () => {
  it('creates Dev Task Requests and sends the existing acknowledgement', () => {
    const deps = makeDeps();
    const intake = new CoordinationSignalIntake(deps);

    const handled = intake.handle({} as never, { type: 'task.create', title: 'Ship it' });

    expect(handled).toBe(true);
    expect(deps.createTask).toHaveBeenCalledWith({ type: 'task.create', title: 'Ship it' });
    expect(deps.send).toHaveBeenCalledWith({}, 'task-created', { task: makeTask() });
  });

  it('keeps Dev chat routing behind ChatService while broadcasting the Hub-Routed Message', () => {
    const deps = makeDeps();
    const intake = new CoordinationSignalIntake(deps);

    const handled = intake.handle({} as never, {
      type: 'send-message',
      channelId: '#all',
      content: '@all hello',
      channelType: 'group',
      explicitTargets: ['pi-planner'],
    });

    expect(handled).toBe(true);
    expect(deps.sendDevMessage).toHaveBeenCalledWith('#all', '@all hello', 'group', ['pi-planner']);
    expect(deps.sendCoordinationMessage).toHaveBeenCalledWith(
      '#all',
      'dev',
      '@all hello',
      expect.objectContaining({ msg_id: 'msg-dev' }),
    );
    expect(deps.recordActivity).toHaveBeenCalledWith('message.sent', 'Message sent to #all', {
      channelId: '#all',
      sender: 'dev',
    });
  });

  it('relays an agent-originated chat message into terminal-paste peers', () => {
    const deps = makeDeps();
    const intake = new CoordinationSignalIntake(deps);

    const handled = intake.handle({} as never, {
      type: 'connector.chat.send',
      channelId: '#all',
      sender: 'pi-planner',
      content: 'status?',
    });

    expect(handled).toBe(true);
    expect(deps.recordChatMessage).toHaveBeenCalledWith('#all', 'pi-planner', 'status?', {
      msg_id: undefined,
      inReplyTo: undefined,
      expectsReply: false,
      hops: 0,
    });
    expect(deps.sendCoordinationMessage).toHaveBeenCalledWith(
      '#all',
      'pi-planner',
      'status?',
      expect.objectContaining({ msg_id: 'msg-1' }),
    );
    expect(deps.relayCoordinationToTerminalAgents).toHaveBeenCalledWith(
      '#all',
      'pi-planner',
      'status?',
      expect.objectContaining({ msg_id: 'msg-1' }),
    );
  });

  it('updates presence from heartbeat without requesting a full agents broadcast', () => {
    const deps = makeDeps();
    const intake = new CoordinationSignalIntake(deps);

    const handled = intake.handle({} as never, {
      type: 'presence.heartbeat',
      agentName: 'pi-planner',
      workStatus: 'busy',
      currentTaskId: 'TASK-1',
      contextUsedPct: 42,
    });

    expect(handled).toBe(true);
    expect(deps.updatePresence).toHaveBeenCalledWith(
      'pi-planner',
      expect.objectContaining({
        connectionStatus: 'connected',
        workStatus: 'busy',
        currentTaskId: 'TASK-1',
        contextUsedPct: 42,
      }),
    );
    expect('broadcastAgents' in deps).toBe(false);
  });

  it('drops hop-cap messages before persistence or delivery and records activity', () => {
    vi.stubEnv('OMNI_MAX_HOPS', '2');
    const deps = makeDeps();
    const intake = new CoordinationSignalIntake(deps);

    const handled = intake.handle({} as never, {
      type: 'connector.chat.send',
      channelId: '#all',
      sender: 'pi-planner',
      content: 'loop',
      hops: 2,
    });

    expect(handled).toBe(true);
    expect(deps.recordChatMessage).not.toHaveBeenCalled();
    expect(deps.sendCoordinationMessage).not.toHaveBeenCalled();
    expect(deps.relayCoordinationToTerminalAgents).not.toHaveBeenCalled();
    expect(deps.recordActivity).toHaveBeenCalledWith(
      'message.dropped',
      'Message dropped at hop cap for #all',
      { channelId: '#all', sender: 'pi-planner', hops: 2, maxHops: 2 },
    );
    vi.unstubAllEnvs();
  });
});
