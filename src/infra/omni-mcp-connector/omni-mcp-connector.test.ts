import { describe, expect, it } from 'vitest';
import {
  connectorWebSocketUrl,
  buildRegisterPayload,
  buildChatSendPayload,
  buildWorkClaimCreatePayload,
  buildWorkClaimReleasePayload,
  buildTaskCreatePayload,
  buildTaskLifecyclePayload,
  recentMessages,
  type OmniRuntimeConfig,
  type CoordinationMessage,
} from './omni-mcp-connector.js';

const runtime: OmniRuntimeConfig = {
  version: 1,
  serverUrl: 'http://127.0.0.1:3456',
  sessionToken: 'tok-123',
  agent: { id: 'agent-1', name: 'claude-1', harness: 'claude-code' },
  repositoryPath: '/repo',
};

describe('connectorWebSocketUrl', () => {
  it('rewrites http to ws and carries the session token', () => {
    const url = connectorWebSocketUrl(runtime);
    expect(url.startsWith('ws://127.0.0.1:3456/')).toBe(true);
    expect(url).toContain('token=tok-123');
  });

  it('rewrites https to wss', () => {
    const url = connectorWebSocketUrl({ ...runtime, serverUrl: 'https://example.test:9000' });
    expect(url.startsWith('wss://example.test:9000/')).toBe(true);
  });
});

describe('buildRegisterPayload', () => {
  it('produces a connector.register signal carrying the agent identity', () => {
    expect(buildRegisterPayload(runtime)).toEqual({
      type: 'connector.register',
      agentId: 'agent-1',
      agentName: 'claude-1',
      harness: 'claude-code',
      tags: [],
    });
  });
});

describe('buildChatSendPayload', () => {
  it('produces a connector.chat.send to #all attributed to this agent', () => {
    expect(buildChatSendPayload(runtime, 'hello team', { msg_id: 'msg-1' })).toEqual({
      type: 'connector.chat.send',
      msg_id: 'msg-1',
      channelId: '#all',
      sender: 'claude-1',
      content: 'hello team',
      inReplyTo: undefined,
      expectsReply: false,
      hops: 0,
    });
  });
});

describe('work claim payloads', () => {
  it('builds a connector.workClaim.create attributed to the agent', () => {
    expect(buildWorkClaimCreatePayload(runtime, 'src/app.ts', 'editing')).toEqual({
      type: 'connector.workClaim.create',
      agentName: 'claude-1',
      path: 'src/app.ts',
      note: 'editing',
    });
  });

  it('defaults the note and builds a release', () => {
    expect(buildWorkClaimCreatePayload(runtime, 'src/app.ts').note).toBe('');
    expect(buildWorkClaimReleasePayload(runtime, 'src/app.ts')).toEqual({
      type: 'connector.workClaim.release',
      agentName: 'claude-1',
      path: 'src/app.ts',
    });
  });
});

describe('task payloads', () => {
  it('builds a connector.task.create with sensible defaults', () => {
    expect(buildTaskCreatePayload(runtime, { title: 'Review PR' })).toEqual({
      type: 'connector.task.create',
      requester: 'claude-1',
      target: '#all',
      title: 'Review PR',
      details: '',
      expectedResult: '',
      priority: 'normal',
    });
  });

  it('carries explicit target and priority', () => {
    const payload = buildTaskCreatePayload(runtime, { title: 'Fix', target: '@pi-1', priority: 'high' });
    expect(payload).toMatchObject({ target: '@pi-1', priority: 'high' });
  });

  it('builds accept/complete lifecycle signals attributed as owner', () => {
    expect(buildTaskLifecyclePayload('accept', runtime, { humanId: 'TASK-1' })).toEqual({
      type: 'connector.task.accept',
      humanId: 'TASK-1',
      owner: 'claude-1',
      reason: '',
      resultSummary: '',
    });
    expect(
      buildTaskLifecyclePayload('complete', runtime, { humanId: 'TASK-1', resultSummary: 'done' }),
    ).toMatchObject({
      type: 'connector.task.complete',
      humanId: 'TASK-1',
      owner: 'claude-1',
      resultSummary: 'done',
    });
  });
});

describe('recentMessages', () => {
  const feed: CoordinationMessage[] = Array.from({ length: 5 }, (_, i) => ({
    type: 'coordination.message',
    msg_id: `msg-${i}`,
    channelId: '#all',
    sender: 'pi-1',
    content: `m${i}`,
    expectsReply: false,
    hops: 0,
    timestamp: '',
  }));

  it('returns the last N messages', () => {
    expect(recentMessages(feed, 2).map((m) => m.content)).toEqual(['m3', 'm4']);
  });

  it('clamps the limit into [1, 100]', () => {
    expect(recentMessages(feed, 0)).toHaveLength(1);
    expect(recentMessages(feed, 999)).toHaveLength(5);
  });
});
