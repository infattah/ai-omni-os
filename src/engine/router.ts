import type { AgentInstance, AgentGroup } from '../types.js';

export type MentionType = 'agent' | 'tag' | 'group' | 'all' | 'none';

export interface RouteResult {
  mentionType: MentionType;
  targets: AgentInstance[];
}

export class MessageRouter {
  private agents = new Map<string, AgentInstance>();
  private groups = new Map<string, AgentGroup>();

  registerAgent(agent: AgentInstance): void {
    this.agents.set(agent.id, { ...agent });
  }

  unregisterAgent(id: string): void {
    this.agents.delete(id);
  }

  getAgent(id: string): AgentInstance | undefined {
    return this.agents.get(id);
  }

  getAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  getAgentByName(name: string): AgentInstance | undefined {
    return this.getAgents().find((a) => a.name === name);
  }

  getAgentsByTag(tag: string): AgentInstance[] {
    return this.getAgents().filter((a) => a.tags.includes(tag));
  }

  getAgentsByGroup(groupId: string): AgentInstance[] {
    const group = this.groups.get(groupId);
    if (!group) return [];
    let ids = group.agentIds;
    if (group.tagFilter) {
      const tagAgents = this.getAgentsByTag(group.tagFilter);
      ids = [...new Set([...ids, ...tagAgents.map((a) => a.id)])];
    }
    return ids.map((id) => this.agents.get(id)).filter(Boolean) as AgentInstance[];
  }

  getGroup(id: string): AgentGroup | undefined {
    return this.groups.get(id);
  }

  getGroups(): AgentGroup[] {
    return Array.from(this.groups.values());
  }

  registerGroup(group: AgentGroup): void {
    this.groups.set(group.id, { ...group });
  }

  unregisterGroup(id: string): void {
    this.groups.delete(id);
  }

  clear(): void {
    this.agents.clear();
    this.groups.clear();
  }

  parseMentions(content: string): { type: MentionType; target: string }[] {
    const results: { type: MentionType; target: string }[] = [];
    for (const match of content.matchAll(/@(\S+)/g)) {
      const target = match[1];
      if (target === 'all') {
        results.push({ type: 'all', target });
      } else if (this.getAgentByName(target)) {
        results.push({ type: 'agent', target });
      } else if (this.groups.has(target)) {
        results.push({ type: 'group', target });
      } else {
        results.push({ type: 'tag', target });
      }
    }
    return results;
  }

  routeMessage(content: string, explicitTargets?: string[], channelId?: string): RouteResult {
    const mentions = this.parseMentions(content);

    if (explicitTargets && explicitTargets.length > 0) {
      const targets = explicitTargets.map((t) => this.getAgentByName(t)).filter(Boolean) as AgentInstance[];
      return { mentionType: 'agent', targets };
    }

    if (mentions.length === 0) {
      if (channelId === '#all') {
        return { mentionType: 'all', targets: this.getAgents() };
      }
      return { mentionType: 'none', targets: [] };
    }

    const hasAll = mentions.some((m) => m.type === 'all');
    if (hasAll) {
      return { mentionType: 'all', targets: this.getAgents() };
    }

    const targetSet = new Set<AgentInstance>();
    for (const mention of mentions) {
      if (mention.type === 'agent') {
        const agent = this.getAgentByName(mention.target);
        if (agent) targetSet.add(agent);
      } else if (mention.type === 'tag') {
        for (const agent of this.getAgentsByTag(mention.target)) {
          targetSet.add(agent);
        }
      } else if (mention.type === 'group') {
        for (const agent of this.getAgentsByGroup(mention.target)) {
          targetSet.add(agent);
        }
      }
    }

    return {
      mentionType: targetSet.size > 0 ? 'agent' : 'none',
      targets: Array.from(targetSet),
    };
  }
}
