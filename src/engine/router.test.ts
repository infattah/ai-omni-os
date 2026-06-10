import { describe, it, expect } from 'vitest';
import { MessageRouter } from './router.js';
import type { AgentInstance, AgentGroup } from '../types.js';

function makeAgent(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    id: 'a1',
    name: 'agent-one',
    tags: ['worker'],
    groupIds: [],
    harness: 'opencode',
    cwd: '/tmp',
    status: 'running',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGroup(overrides: Partial<AgentGroup> = {}): AgentGroup {
  return {
    id: 'g1',
    name: 'reviewers',
    tagFilter: null,
    agentIds: [],
    ...overrides,
  };
}

describe('MessageRouter', () => {
  describe('parseMentions', () => {
    it('finds @all mention', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent());
      const result = r.parseMentions('hello @all');
      expect(result).toEqual([{ type: 'all', target: 'all' }]);
    });

    it('finds @agentName mention', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent());
      const result = r.parseMentions('hello @agent-one');
      expect(result).toEqual([{ type: 'agent', target: 'agent-one' }]);
    });

    it('finds @group mention by id', () => {
      const r = new MessageRouter();
      r.registerGroup(makeGroup({ id: 'reviewers', name: 'reviewers' }));
      const result = r.parseMentions('hello @reviewers');
      expect(result).toEqual([{ type: 'group', target: 'reviewers' }]);
    });

    it('falls back to tag for unknown targets', () => {
      const r = new MessageRouter();
      const result = r.parseMentions('hello @unknown');
      expect(result).toEqual([{ type: 'tag', target: 'unknown' }]);
    });

    it('returns empty for no mentions', () => {
      const r = new MessageRouter();
      expect(r.parseMentions('hello world')).toEqual([]);
    });

    it('parses multiple mentions', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a' }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b' }));
      const result = r.parseMentions('@bot-a and @bot-b');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'agent', target: 'bot-a' });
      expect(result[1]).toEqual({ type: 'agent', target: 'bot-b' });
    });
  });

  describe('routeMessage', () => {
    it('routes to all agents when no mentions in #all', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a' }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b' }));
      const result = r.routeMessage('hello', undefined, '#all');
      expect(result.mentionType).toBe('all');
      expect(result.targets).toHaveLength(2);
    });

    it('routes by explicit targets', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a' }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b' }));
      const result = r.routeMessage('hello', ['bot-a']);
      expect(result.mentionType).toBe('agent');
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].name).toBe('bot-a');
    });

    it('routes @all to all agents', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a' }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b' }));
      const result = r.routeMessage('@all do something');
      expect(result.mentionType).toBe('all');
      expect(result.targets).toHaveLength(2);
    });

    it('routes @agentName to specific agent', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a' }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b' }));
      const result = r.routeMessage('@bot-a do it');
      expect(result.mentionType).toBe('agent');
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].name).toBe('bot-a');
    });

    it('routes @tag to matching agents', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a', tags: ['worker'] }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b', tags: ['reviewer'] }));
      const result = r.routeMessage('@worker status');
      expect(result.mentionType).toBe('agent');
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].name).toBe('bot-a');
    });

    it('routes @group to group members', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a' }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b' }));
      r.registerGroup(makeGroup({ id: 'team', name: 'team', agentIds: ['a1', 'a2'] }));
      const result = r.routeMessage('@team update');
      expect(result.mentionType).toBe('agent');
      expect(result.targets).toHaveLength(2);
    });

    it('returns empty when no mentions in DM channel', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent());
      const result = r.routeMessage('hello', undefined, 'dm-bot-a');
      expect(result.mentionType).toBe('none');
      expect(result.targets).toHaveLength(0);
    });
  });

  describe('groups with tagFilter', () => {
    it('combines manual members with tag-filtered agents', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'a1', name: 'bot-a', tags: ['frontend'] }));
      r.registerAgent(makeAgent({ id: 'a2', name: 'bot-b', tags: ['frontend'] }));
      r.registerAgent(makeAgent({ id: 'a3', name: 'bot-c', tags: ['backend'] }));
      r.registerGroup(makeGroup({ id: 'g1', name: 'fe-team', tagFilter: 'frontend', agentIds: ['a3'] }));
      const members = r.getAgentsByGroup('g1');
      const names = members.map((a) => a.name).sort();
      expect(names).toEqual(['bot-a', 'bot-b', 'bot-c']);
    });
  });

  describe('agent lifecycle', () => {
    it('registerAgent stores agent', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'x', name: 'test-agent' }));
      expect(r.getAgent('x')).toBeDefined();
      expect(r.getAgent('x')!.name).toBe('test-agent');
    });

    it('unregisterAgent removes agent', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'x' }));
      r.unregisterAgent('x');
      expect(r.getAgent('x')).toBeUndefined();
    });

    it('clear wipes all agents and groups', () => {
      const r = new MessageRouter();
      r.registerAgent(makeAgent({ id: 'x' }));
      r.registerGroup(makeGroup({ id: 'g' }));
      r.clear();
      expect(r.getAgents()).toHaveLength(0);
      expect(r.getGroups()).toHaveLength(0);
    });
  });
});
