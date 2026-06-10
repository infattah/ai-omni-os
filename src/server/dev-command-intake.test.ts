import { describe, expect, it, vi } from 'vitest';
import { DevCommandIntake, type DevCommandIntakeDeps } from './dev-command-intake.js';
import type { ChatService } from '../domain/chat-service.js';
import type { AgentInstance, AgentTemplate } from '../types.js';

function makeAgent(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    id: 'a1',
    name: 'codex',
    tags: [],
    groupIds: [],
    harness: 'pi',
    cwd: '/repo',
    status: 'running',
    createdAt: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

// Builds a partial ChatService fake; only the methods a given test exercises need to be present.
function makeChat(overrides: Partial<Record<keyof ChatService, unknown>> = {}): ChatService {
  return {
    getAgents: vi.fn(() => [] as AgentInstance[]),
    createAgent: vi.fn(() => makeAgent()),
    ...overrides,
  } as unknown as ChatService;
}

function makeDeps(overrides: Partial<DevCommandIntakeDeps> = {}): DevCommandIntakeDeps {
  return {
    send: vi.fn(),
    recordActivity: vi.fn(),
    currentRepo: () => '/repo',
    chat: makeChat(),
    ensureAgentContextFile: vi.fn(),
    selectedPiAttachments: vi.fn(() => []),
    isSafeAgentName: (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value),
    homedir: () => '/home/dev',
    scanDir: vi.fn(() => []),
    listAgentTemplates: vi.fn(() => [] as AgentTemplate[]),
    agentTemplateDir: () => '/home/dev/.omni/templates',
    allowedCapabilityIds: () => new Set<string>(),
    saveAgentTemplate: vi.fn(
      (input) => ({ id: 'tpl-1', name: input.name ?? 'Agent Template' }) as AgentTemplate,
    ),
    deleteAgentTemplate: vi.fn(() => true),
    generateHandoff: vi.fn(() => '/repo/.omni/handoffs/h.md'),
    readProjectSummary: vi.fn(() => ({ content: '', path: '/repo/.omni/summaries/project.md' })),
    saveProjectSummary: vi.fn(() => '/repo/.omni/summaries/project.md'),
    readAgentContext: vi.fn(() => ({ content: '', path: '/repo/.omni/agents/codex.md' })),
    saveAgentContext: vi.fn(() => '/repo/.omni/agents/codex.md'),
    ...overrides,
  };
}

describe('DevCommandIntake', () => {
  it('returns false for a message type it does not own (so it falls through)', () => {
    const intake = new DevCommandIntake(makeDeps());
    expect(intake.handle({} as never, { type: 'connector.task.create' })).toBe(false);
    expect(intake.handle({} as never, { type: 'totally-unknown' })).toBe(false);
  });

  it('rejects an unsafe Agent Instance name without creating anything', () => {
    const deps = makeDeps();
    const intake = new DevCommandIntake(deps);

    const handled = intake.handle({} as never, { type: 'create-agent', name: 'bad name!' });

    expect(handled).toBe(true);
    expect(deps.send).toHaveBeenCalledWith({}, 'agent-create-failed', {
      reason:
        'Agent Instance names may only contain letters, numbers, dots, underscores, and hyphens, and must start with a letter or number.',
    });
    expect(deps.chat.createAgent).not.toHaveBeenCalled();
  });

  it('rejects a duplicate Agent Instance name', () => {
    const chat = makeChat({ getAgents: vi.fn(() => [makeAgent({ name: 'codex' })]) });
    const deps = makeDeps({ chat });
    const intake = new DevCommandIntake(deps);

    const handled = intake.handle({} as never, { type: 'create-agent', name: 'codex' });

    expect(handled).toBe(true);
    expect(deps.send).toHaveBeenCalledWith({}, 'agent-create-failed', {
      reason: 'Agent Instance name already exists: codex',
    });
    expect(chat.createAgent).not.toHaveBeenCalled();
  });

  it('creates a valid Agent Instance, seeds its Agent Context, and records the activity', () => {
    const created = makeAgent({ id: 'a9', name: 'planner', harness: 'pi' });
    const chat = makeChat({ getAgents: vi.fn(() => []), createAgent: vi.fn(() => created) });
    const deps = makeDeps({ chat });
    const intake = new DevCommandIntake(deps);

    const handled = intake.handle({} as never, { type: 'create-agent', name: 'planner', harness: 'pi' });

    expect(handled).toBe(true);
    expect(chat.createAgent).toHaveBeenCalled();
    expect(deps.ensureAgentContextFile).toHaveBeenCalledWith('/repo', created);
    expect(deps.send).toHaveBeenCalledWith({}, 'agent-created', { agent: created });
    expect(deps.recordActivity).toHaveBeenCalledWith('agent.created', 'Agent created: planner', {
      agentId: 'a9',
      name: 'planner',
      harness: 'pi',
    });
  });

  it('defaults Agent Instance creation to the tmux launch backend', () => {
    const createAgent = vi.fn(() =>
      makeAgent({ id: 'a9', name: 'planner', harness: 'pi', launchBackend: 'tmux' }),
    );
    const chat = makeChat({ getAgents: vi.fn(() => []), createAgent });
    const intake = new DevCommandIntake(makeDeps({ chat }));

    intake.handle({} as never, { type: 'create-agent', name: 'planner', harness: 'pi' });

    expect(createAgent.mock.calls[0][7]).toBe(true);
  });

  it('honors explicit Terminal.app launch backend selection', () => {
    const createAgent = vi.fn(() =>
      makeAgent({ id: 'a9', name: 'planner', harness: 'pi', launchBackend: 'terminal' }),
    );
    const chat = makeChat({ getAgents: vi.fn(() => []), createAgent });
    const intake = new DevCommandIntake(makeDeps({ chat }));

    intake.handle({} as never, {
      type: 'create-agent',
      name: 'planner',
      harness: 'pi',
      launchBackend: 'terminal',
    });

    expect(createAgent.mock.calls[0][7]).toBe(false);
  });

  it('resumes using the Agent Instance persisted launch backend', () => {
    const existing = makeAgent({ id: 'a1', name: 'planner', status: 'disconnected', launchBackend: 'tmux' });
    const resumeAgent = vi.fn(() => ({ ...existing, status: 'running' }));
    const chat = makeChat({ getAgents: vi.fn(() => [existing]), resumeAgent });
    const intake = new DevCommandIntake(makeDeps({ chat }));

    intake.handle({} as never, { type: 'resume-agent', id: 'a1' });

    expect(resumeAgent).toHaveBeenCalledWith('a1', '/repo', true, true);
  });

  it('drops unknown capability IDs before saving an Agent Template', () => {
    const saveAgentTemplate = vi.fn((input) => ({ id: 'tpl-9', name: input.name }) as AgentTemplate);
    const deps = makeDeps({
      allowedCapabilityIds: () => new Set(['skill:a', 'mcp:b']),
      saveAgentTemplate,
    });
    const intake = new DevCommandIntake(deps);

    const handled = intake.handle({} as never, {
      type: 'agent.template.save',
      name: 'Reviewer',
      capabilityIds: ['skill:a', 'skill:UNKNOWN'],
      toolMcpIds: ['mcp:b', 'mcp:UNKNOWN'],
      skillPluginIds: ['skill:UNKNOWN'],
    });

    expect(handled).toBe(true);
    expect(saveAgentTemplate).toHaveBeenCalledTimes(1);
    const saved = saveAgentTemplate.mock.calls[0][0];
    expect(saved.capabilityIds).toEqual(['skill:a']);
    expect(saved.toolMcpIds).toEqual(['mcp:b']);
    expect(saved.skillPluginIds).toEqual([]);
    expect(deps.recordActivity).toHaveBeenCalledWith(
      'agent_template.saved',
      'Agent Template saved: Reviewer',
      { templateId: 'tpl-9', name: 'Reviewer' },
    );
  });

  it('refuses to generate a handoff when no Repository is selected', () => {
    const deps = makeDeps({ currentRepo: () => '', generateHandoff: vi.fn(() => '/x') });
    const intake = new DevCommandIntake(deps);

    const handled = intake.handle({} as never, { type: 'handoff.generate' });

    expect(handled).toBe(true);
    expect(deps.send).toHaveBeenCalledWith({}, 'handoff.failed', { reason: 'No Repository selected.' });
    expect(deps.generateHandoff).not.toHaveBeenCalled();
  });

  it('generates a handoff and announces it when a Repository is selected', () => {
    const deps = makeDeps({ generateHandoff: vi.fn(() => '/repo/.omni/handoffs/h.md') });
    const intake = new DevCommandIntake(deps);

    const handled = intake.handle({} as never, { type: 'handoff.generate' });

    expect(handled).toBe(true);
    expect(deps.generateHandoff).toHaveBeenCalledTimes(1);
    expect(deps.send).toHaveBeenCalledWith({}, 'handoff.generated', { path: '/repo/.omni/handoffs/h.md' });
    expect(deps.recordActivity).toHaveBeenCalledWith(
      'handoff.generated',
      'Handoff generated: /repo/.omni/handoffs/h.md',
      { path: '/repo/.omni/handoffs/h.md' },
    );
  });
});
