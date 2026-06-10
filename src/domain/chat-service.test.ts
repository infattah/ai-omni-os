import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { ChatService, formatCoordinationPrompt, maxHopsFromEnv } from './chat-service.js';
import { getHarness } from './harness-registry.js';
import { MessageRouter } from '../engine/router.js';
import type {
  AgentLifecyclePort,
  CreateOptions,
  ManagedInstanceInfo,
  ManagedStatus,
} from '../ports/agent-lifecycle.js';
import type { ContextPersistencePort } from '../ports/context-persistence.js';
import type { MessageTransportPort } from '../ports/message-transport.js';
import type { AgentGroup, AgentInstance, Message } from '../types.js';

class FakeLifecycle implements AgentLifecyclePort {
  created: CreateOptions[] = [];
  reopened: CreateOptions[] = [];
  inputs: Array<{ id: string; text: string }> = [];
  turnEndHandlers = new Map<string, (text?: string) => void>();
  create(opts: CreateOptions): ManagedInstanceInfo {
    this.created.push(opts);
    return { id: opts.id, name: opts.name, status: 'active', harness: opts.harness };
  }
  reopenTerminal(opts: CreateOptions): ManagedInstanceInfo {
    this.reopened.push(opts);
    return { id: opts.id, name: opts.name, status: 'active', harness: opts.harness };
  }
  terminalAttached(): boolean {
    return true;
  }
  list(): ManagedInstanceInfo[] {
    return [];
  }
  getStatus(): ManagedStatus | undefined {
    return undefined;
  }
  sendInput(id: string, text: string): void {
    this.inputs.push({ id, text });
  }
  onOutput(): void {}
  onTurnEnd(id: string, handler: (text?: string) => void): void {
    this.turnEndHandlers.set(id, handler);
  }
  onExit(): void {}
  remove(): void {}
  killAll(): void {}
}

class FakePersistence implements ContextPersistencePort {
  messages: Message[] = [];
  saveAgent(): void {}
  getAgent(): AgentInstance | undefined {
    return undefined;
  }
  listAgents(): AgentInstance[] {
    return [];
  }
  deleteAgent(): void {}
  saveMessage(message: Message): void {
    this.messages.push(message);
  }
  getMessages(channelId: string): Message[] {
    return this.messages.filter((m) => m.channelId === channelId);
  }
  getMessage(id: string): Message | undefined {
    return this.messages.find((m) => m.msg_id === id || m.id === id);
  }
  saveGroup(): void {}
  getGroup(): AgentGroup | undefined {
    return undefined;
  }
  listGroups(): AgentGroup[] {
    return [];
  }
  deleteGroup(): void {}
}

const transport: MessageTransportPort = {
  broadcast() {},
};

describe('ChatService launch attachments', () => {
  it('maps Pi extensions and universal skills to launch args', () => {
    const lifecycle = new FakeLifecycle();
    const chat = new ChatService(new MessageRouter(), lifecycle, new FakePersistence(), transport);

    chat.createAgent('pi-smoke', [], 'pi', process.cwd(), false, [
      {
        id: 'skill:/pi/bowser/SKILL.md',
        name: 'bowser',
        harness: 'pi',
        kind: 'skill',
        path: '/pi/bowser/SKILL.md',
        risk: ['prompt-only'],
        cost: 'medium',
      },
      {
        id: 'pi-extension:/pi/ext/minimal.ts',
        name: 'minimal',
        harness: 'pi',
        kind: 'pi-extension',
        path: '/pi/ext/minimal.ts',
        risk: ['unknown'],
        cost: 'low',
      },
      {
        id: 'skill:/general/improve/SKILL.md',
        name: 'improve-codebase-architecture',
        harness: 'general',
        kind: 'skill',
        path: '/general/improve/SKILL.md',
        risk: ['prompt-only'],
        cost: 'medium',
      },
    ]);

    expect(lifecycle.created).toHaveLength(1);
    expect(lifecycle.created[0].args).toEqual(
      expect.arrayContaining([
        '--skill',
        '/pi/bowser/SKILL.md',
        '-e',
        '/pi/ext/minimal.ts',
        '--skill',
        '/general/improve/SKILL.md',
      ]),
    );
  });
});

describe('ChatService terminal launch', () => {
  it('forces hired agents to launch interactive even when a future harness recipe is stream-json capable', () => {
    const lifecycle = new FakeLifecycle();
    const chat = new ChatService(new MessageRouter(), lifecycle, new FakePersistence(), transport);
    const harness = getHarness('cat')!;
    const original = harness.streamJson;
    harness.streamJson = true;

    try {
      chat.createAgent('future-1', [], 'cat', '/repo', true, [], {}, true);
    } finally {
      harness.streamJson = original;
    }

    expect(lifecycle.created[0]).toMatchObject({ openTerminal: true, tmux: true });
    expect(lifecycle.created[0].streamJson).toBeFalsy();
  });

  it('forces resumed agents to launch interactive even when a future harness recipe is stream-json capable', () => {
    const lifecycle = new FakeLifecycle();
    const chat = new ChatService(new MessageRouter(), lifecycle, new FakePersistence(), transport);
    const harness = getHarness('cat')!;
    const original = harness.streamJson;
    chat.createAgent('future-1', [], 'cat', '/repo', true, [], {}, false);
    const agent = chat.getAgents()[0];
    agent.status = 'disconnected';
    lifecycle.created = [];
    harness.streamJson = true;

    try {
      chat.resumeAgent(agent.id, '/repo', true, false);
    } finally {
      harness.streamJson = original;
    }

    expect(lifecycle.created[0]).toMatchObject({ openTerminal: true, tmux: false });
    expect(lifecycle.created[0].streamJson).toBeFalsy();
  });

  it('opens Claude Code in a terminal when requested', () => {
    const lifecycle = new FakeLifecycle();
    const chat = new ChatService(new MessageRouter(), lifecycle, new FakePersistence(), transport);

    chat.createAgent('claude-1', [], 'claude-code', '/repo', true);

    expect(lifecycle.created[0].streamJson).toBeFalsy();
    expect(lifecycle.created[0].openTerminal).toBe(true);
  });

  it('leaves a raw harness (Pi) on the requested openTerminal and unflagged', () => {
    const lifecycle = new FakeLifecycle();
    const chat = new ChatService(new MessageRouter(), lifecycle, new FakePersistence(), transport);

    chat.createAgent('pi-1', [], 'pi', '/repo', true);

    expect(lifecycle.created[0].streamJson).toBeFalsy();
    expect(lifecycle.created[0].openTerminal).toBe(true);
  });

  it('reopens a tmux terminal without relaunching the Agent Instance from ChatService', () => {
    const lifecycle = new FakeLifecycle();
    const chat = new ChatService(new MessageRouter(), lifecycle, new FakePersistence(), transport);
    const agent = chat.createAgent('pi-1', [], 'pi', '/repo', true, [], {}, true)!;
    lifecycle.created = [];

    const reopened = chat.reopenTerminal(agent.id, '/repo');

    expect(reopened).toEqual(agent);
    expect(lifecycle.reopened).toHaveLength(1);
    expect(lifecycle.reopened[0]).toMatchObject({
      id: agent.id,
      name: 'pi-1',
      harnessName: 'pi',
      cwd: '/repo',
      tmux: true,
    });
    expect(lifecycle.created).toHaveLength(0);
  });
});

describe('ChatService coordination relay (inbound terminal-paste)', () => {
  function setup() {
    const lifecycle = new FakeLifecycle();
    const chat = new ChatService(new MessageRouter(), lifecycle, new FakePersistence(), transport);
    const claude = chat.createAgent('claude-1', [], 'claude-code', '/repo', true)!;
    const pi = chat.createAgent('pi-1', [], 'pi', '/repo', true)!;
    lifecycle.inputs = []; // ignore any launch-time input; focus on relay
    return { lifecycle, chat, claude, pi };
  }

  it('types an #all message into terminal-paste agents, excluding the sender and native-push peers', () => {
    const { lifecycle, chat, claude, pi } = setup();
    chat.relayCoordinationToTerminalAgents('#all', 'pi-1', 'hello team');

    const targets = lifecycle.inputs.map((i) => i.id);
    expect(targets).toContain(claude.id); // terminal-paste recipient woken
    expect(targets).not.toContain(pi.id); // native-push peer is never relayed
    expect(lifecycle.inputs[0].text).toContain('hello team');
    expect(lifecycle.inputs[0].text).toContain('pi-1');
  });

  it('does not relay a message back to its sender', () => {
    const { lifecycle, chat, claude } = setup();
    chat.relayCoordinationToTerminalAgents('#all', 'claude-1', 'note to self');
    expect(lifecycle.inputs.map((i) => i.id)).not.toContain(claude.id);
  });

  it('routes a direct @name message only to that agent', () => {
    const { lifecycle, chat, claude } = setup();
    const claude2 = chat.createAgent('claude-2', [], 'claude-code', '/repo', true)!;
    lifecycle.inputs = [];
    chat.relayCoordinationToTerminalAgents('@claude-1', 'pi-1', 'just you');
    const targets = lifecycle.inputs.map((i) => i.id);
    expect(targets).toContain(claude.id);
    expect(targets).not.toContain(claude2.id);
  });

  it('suppresses an immediate duplicate so terminals cannot spiral', () => {
    const { lifecycle, chat } = setup();
    chat.relayCoordinationToTerminalAgents('#all', 'pi-1', 'same message');
    chat.relayCoordinationToTerminalAgents('#all', 'pi-1', 'same message');
    expect(lifecycle.inputs).toHaveLength(1);
  });

  it('does not relay to an archived (non-running) terminal-paste agent', () => {
    const { lifecycle, chat, claude } = setup();
    chat.archiveAgent(claude.id);
    lifecycle.inputs = [];
    chat.relayCoordinationToTerminalAgents('#all', 'pi-1', 'anyone home');
    expect(lifecycle.inputs).toHaveLength(0);
  });
});

describe('delivery negotiation guard (009)', () => {
  it('does not branch on harness names in ChatService delivery', () => {
    const source = readFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname), 'chat-service.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/harness\s*[!=]==?\s*['"`](pi|claude-code|cat)['"`]/);
    expect(source).not.toMatch(/['"`](pi|claude-code|cat)['"`]\s*[!=]==?\s*harness/);
  });
});

describe('formatCoordinationPrompt (008)', () => {
  it('includes message ids and exact reply metadata when reply capture is expected', () => {
    const prompt = formatCoordinationPrompt('#all', 'pi-1', 'question', {
      id: 'msg-root',
      msg_id: 'msg-root',
      channelId: '#all',
      sender: 'pi-1',
      content: 'question',
      mentions: [],
      channelType: 'group',
      recipientAgents: [],
      expectsReply: true,
      hops: 2,
      timestamp: '',
    });

    expect(prompt).toContain('msg_id: msg-root');
    expect(prompt).toContain('hops: 2');
    expect(prompt).toContain('inReplyTo="msg-root"');
    expect(prompt).toContain('hops=3');
  });
});

describe('maxHopsFromEnv (008)', () => {
  it('defaults to 5 and accepts OMNI_MAX_HOPS', () => {
    expect(maxHopsFromEnv({})).toBe(5);
    expect(maxHopsFromEnv({ OMNI_MAX_HOPS: '2' })).toBe(2);
    expect(maxHopsFromEnv({ OMNI_MAX_HOPS: 'bad' })).toBe(5);
  });
});

describe('ChatService pending replies (008)', () => {
  it('records a turn-end reply with inReplyTo and incremented hops', () => {
    const lifecycle = new FakeLifecycle();
    const persistence = new FakePersistence();
    const chat = new ChatService(new MessageRouter(), lifecycle, persistence, transport);
    const claude = chat.createAgent('claude-1', [], 'claude-code', '/repo', true)!;

    const original = chat.recordAgentMessage('#all', 'pi-1', 'question', {
      msg_id: 'msg-root',
      expectsReply: true,
      hops: 2,
    });
    chat.relayCoordinationToTerminalAgents('#all', 'pi-1', original.content, original);
    lifecycle.turnEndHandlers.get(claude.id)?.('answer');

    const reply = persistence.messages.find((m) => m.sender === 'claude-1');
    expect(reply).toMatchObject({ content: 'answer', inReplyTo: 'msg-root', hops: 3 });
  });

  it('does not auto-reply past MAX_HOPS', () => {
    const lifecycle = new FakeLifecycle();
    const persistence = new FakePersistence();
    const chat = new ChatService(new MessageRouter(), lifecycle, persistence, transport);
    const claude = chat.createAgent('claude-1', [], 'claude-code', '/repo', true)!;

    const original = chat.recordAgentMessage('#all', 'pi-1', 'too deep', {
      msg_id: 'msg-root',
      expectsReply: true,
      hops: maxHopsFromEnv(),
    });
    chat.relayCoordinationToTerminalAgents('#all', 'pi-1', original.content, original);
    lifecycle.turnEndHandlers.get(claude.id)?.('answer');

    expect(persistence.messages.filter((m) => m.sender === 'claude-1')).toHaveLength(0);
    expect(lifecycle.inputs).toHaveLength(0);
  });

  it('does not auto-reply when expectsReply is false', () => {
    const lifecycle = new FakeLifecycle();
    const persistence = new FakePersistence();
    const chat = new ChatService(new MessageRouter(), lifecycle, persistence, transport);
    const claude = chat.createAgent('claude-1', [], 'claude-code', '/repo', true)!;

    const original = chat.recordAgentMessage('#all', 'pi-1', 'FYI', { msg_id: 'msg-root', hops: 0 });
    chat.relayCoordinationToTerminalAgents('#all', 'pi-1', original.content, original);
    lifecycle.turnEndHandlers.get(claude.id)?.('ack');

    expect(persistence.messages.filter((m) => m.sender === 'claude-1')).toHaveLength(0);
  });
});
