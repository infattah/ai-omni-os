import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { AgentLifecyclePort } from '../ports/agent-lifecycle.js';
import type { ContextPersistencePort } from '../ports/context-persistence.js';
import type { MessageTransportPort } from '../ports/message-transport.js';
import type { MessageRouter } from '../engine/router.js';
import { getHarness, negotiateDelivery } from './harness-registry.js';
import { stripAnsi } from './ansi-strip.js';
import { writeRuntimeConfig } from '../infra/runtime-config.js';
import type { CreateOptions } from '../ports/agent-lifecycle.js';
import type {
  AgentInstance,
  AgentGroup,
  HarnessAttachmentSelection,
  AgentProfile,
  Message,
} from '../types.js';

export type AgentResponseHandler = (sender: string, content: string) => void;
export interface MessageMetadata {
  msg_id?: string;
  inReplyTo?: string;
  expectsReply?: boolean;
  hops?: number;
}

export function maxHopsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OMNI_MAX_HOPS;
  if (!raw) return 5;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 5;
}

/** Whether a coordination message on `channelId` is addressed to `agentName` (#all, or @name direct). */
export function isCoordinationRecipient(channelId: string, agentName: string): boolean {
  if (channelId === '#all') return true;
  return channelId === `@${agentName}`;
}

/** The prompt Omni types into a terminal-paste agent's terminal for an inbound peer message. */
export function formatCoordinationPrompt(
  channelId: string,
  sender: string,
  content: string,
  message?: Message,
): string {
  const scope = channelId === '#all' ? '#all' : `your direct channel ${channelId}`;
  const replyLine = message?.expectsReply
    ? `If replying, use omni_send with inReplyTo="${message.msg_id}" and hops=${(message.hops ?? 0) + 1}.`
    : 'No reply is required unless this changes your current work.';
  return [
    `Omni message received in ${scope} from ${sender}:`,
    message?.msg_id ? `msg_id: ${message.msg_id}` : undefined,
    message?.inReplyTo ? `inReplyTo: ${message.inReplyTo}` : undefined,
    `hops: ${message?.hops ?? 0}`,
    '',
    content,
    '',
    replyLine,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export class ChatService {
  private agentResponseHandlers: AgentResponseHandler[] = [];
  private mcpUrl: string = '';
  private serverUrl: string = '';
  private sessionToken: string = '';
  // Loop guard: suppress re-typing identical content into the same terminal within a short window,
  // so two hands-off agents on #all cannot spiral. Keyed by `${agentId}\0${content}` → last ms.
  private relayGuard = new Map<string, number>();
  private pendingReplies = new Map<string, Message>();
  private static readonly RELAY_DEDUP_WINDOW_MS = 5_000;

  constructor(
    private router: MessageRouter,
    private lifecycle: AgentLifecyclePort,
    private persistence: ContextPersistencePort,
    private transport: MessageTransportPort,
  ) {}

  setMcpUrl(url: string): void {
    this.mcpUrl = url;
  }

  setRuntimeConnection(serverUrl: string, sessionToken: string): void {
    this.serverUrl = serverUrl;
    this.sessionToken = sessionToken;
  }

  onAgentResponse(handler: AgentResponseHandler): () => void {
    this.agentResponseHandlers.push(handler);
    return () => {
      const idx = this.agentResponseHandlers.indexOf(handler);
      if (idx >= 0) this.agentResponseHandlers.splice(idx, 1);
    };
  }

  private notifyAgentResponse(sender: string, content: string): void {
    for (const h of this.agentResponseHandlers) h(sender, content);
  }

  broadcastState(): void {
    this.transport.broadcast('agents', { agents: this.router.getAgents() });
    this.transport.broadcast('groups', { groups: this.router.getGroups() });
  }

  /**
   * Deliver an agent-originated coordination message to every running `terminal-paste` recipient by
   * typing it into that agent's terminal — the wake-up mechanism for harnesses that connect over MCP
   * (Claude Code and future harnesses) and so cannot be pushed to by a tool. `native-push` agents
   * (Pi) are never relayed: their own connector wakes them. The sender is always excluded.
   */
  relayCoordinationToTerminalAgents(
    channelId: string,
    sender: string,
    content: string,
    message?: Message,
  ): void {
    if (message && (message.hops ?? 0) >= maxHopsFromEnv()) return;
    const now = Date.now();
    for (const agent of this.router.getAgents()) {
      if (agent.status !== 'running') continue;
      if (agent.name === sender) continue;
      const delivery = negotiateDelivery(getHarness(agent.harness)?.deliveryCapabilities ?? []);
      if (delivery === 'push' || delivery === 'await' || delivery === 'none') continue;
      if (delivery !== 'inject' && delivery !== 'doorbell') continue;
      if (!isCoordinationRecipient(channelId, agent.name)) continue;

      const key = `${agent.id}\0${content}`;
      const last = this.relayGuard.get(key);
      if (last !== undefined && now - last < ChatService.RELAY_DEDUP_WINDOW_MS) continue;
      this.relayGuard.set(key, now);
      if (message?.expectsReply) {
        this.pendingReplies.set(agent.id, message);
      }

      this.lifecycle.sendInput(
        agent.id,
        formatCoordinationPrompt(channelId, sender, content, message) + '\n',
      );
    }

    if (this.relayGuard.size > 200) {
      for (const [k, ts] of this.relayGuard) {
        if (now - ts >= ChatService.RELAY_DEDUP_WINDOW_MS) this.relayGuard.delete(k);
      }
    }
  }

  createAgent(
    name: string,
    tags: string[],
    harnessName: string,
    cwd: string,
    openTerminal: boolean = true,
    harnessAttachments: HarnessAttachmentSelection[] = [],
    profile: AgentProfile & { templateId?: string } = {},
    tmux: boolean = false,
  ): AgentInstance | null {
    const def = getHarness(harnessName);
    if (!def) return null;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const agent: AgentInstance = {
      id,
      name,
      tags,
      groupIds: [],
      harness: harnessName,
      cwd,
      launchBackend: tmux ? 'tmux' : 'terminal',
      status: 'running',
      createdAt: now,
      templateId: profile.templateId,
      description: profile.description,
      agentPrompt: profile.agentPrompt,
      roleAndObjective: profile.roleAndObjective,
      instructions: profile.instructions,
      workflow: profile.workflow,
      omniGuide: profile.omniGuide,
      projectContext: profile.projectContext,
      harnessAttachments,
    };

    this.router.registerAgent(agent);
    this.persistence.saveAgent(agent);

    if (def.mcpConfigFilename && this.mcpUrl) {
      const configPath = path.join(cwd, def.mcpConfigFilename);
      const content = def.mcpConfigContent(this.mcpUrl);
      if (content) {
        try {
          fs.writeFileSync(configPath, content, 'utf-8');
        } catch (err) {
          console.error(
            `[chat-service] createAgent: write MCP config failed for ${name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const runtime =
      this.serverUrl && this.sessionToken
        ? writeRuntimeConfig({
            serverUrl: this.serverUrl,
            sessionToken: this.sessionToken,
            agentId: id,
            agentName: name,
            harness: harnessName,
            repositoryPath: cwd,
          })
        : { env: {} };

    this.lifecycle.create({
      ...this.lifecycleOptions(agent, cwd, runtime.env),
      openTerminal,
      tmux,
      streamJson: false,
    });

    this.lifecycle.onOutput(id, (data) => {
      const content = stripAnsi(data).trim();
      if (!content) return;
      this.transport.broadcast('agent-output', {
        agentId: id,
        agentName: name,
        content,
        timestamp: new Date().toISOString(),
      });
      this.notifyAgentResponse(name, content);
    });
    this.lifecycle.onTurnEnd(id, (text) => this.autoReplyOnTurnEnd(id, name, text));

    this.lifecycle.onExit(id, () => {
      agent.status = 'disconnected';
      this.router.registerAgent(agent);
      this.persistence.saveAgent(agent);
      this.broadcastState();
    });

    this.broadcastState();
    return agent;
  }

  deleteAgent(id: string): void {
    this.router.unregisterAgent(id);
    this.persistence.deleteAgent(id);
    this.lifecycle.remove(id);
    this.broadcastState();
  }

  archiveAgent(id: string): AgentInstance | null {
    const agent = this.router.getAgent(id);
    if (!agent) return null;
    this.lifecycle.remove(id);
    agent.status = 'archived';
    this.router.registerAgent(agent);
    this.persistence.saveAgent(agent);
    this.broadcastState();
    return agent;
  }

  unarchiveAgent(id: string): AgentInstance | null {
    const agent = this.router.getAgent(id);
    if (!agent) return null;
    agent.status = 'disconnected';
    this.router.registerAgent(agent);
    this.persistence.saveAgent(agent);
    this.broadcastState();
    return agent;
  }

  resumeAgent(id: string, cwd: string, openTerminal: boolean = true, tmux?: boolean): AgentInstance | null {
    const agent = this.router.getAgent(id);
    if (!agent) return null;

    const useTmux = tmux ?? agent.launchBackend === 'tmux';
    if (useTmux) return this.reopenTerminal(id, cwd);

    if (agent.status === 'running') return agent;

    agent.status = 'running';
    agent.launchBackend = useTmux ? 'tmux' : 'terminal';
    this.router.registerAgent(agent);
    this.persistence.saveAgent(agent);

    const def = getHarness(agent.harness);
    if (!def) return null;

    if (def.mcpConfigFilename && this.mcpUrl) {
      const configPath = path.join(cwd, def.mcpConfigFilename);
      const content = def.mcpConfigContent(this.mcpUrl);
      if (content) {
        try {
          fs.writeFileSync(configPath, content, 'utf-8');
        } catch (err) {
          console.error(
            `[chat-service] resumeAgent: write MCP config failed for ${agent.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const runtime =
      this.serverUrl && this.sessionToken
        ? writeRuntimeConfig({
            serverUrl: this.serverUrl,
            sessionToken: this.sessionToken,
            agentId: agent.id,
            agentName: agent.name,
            harness: agent.harness,
            repositoryPath: cwd,
          })
        : { env: {} };

    this.lifecycle.create({
      ...this.lifecycleOptions(agent, cwd, runtime.env),
      openTerminal,
      tmux: useTmux,
      streamJson: false,
    });

    this.lifecycle.onOutput(agent.id, (data) => {
      const content = stripAnsi(data).trim();
      if (!content) return;
      this.transport.broadcast('agent-output', {
        agentId: agent.id,
        agentName: agent.name,
        content,
        timestamp: new Date().toISOString(),
      });
      this.notifyAgentResponse(agent.name, content);
    });
    this.lifecycle.onTurnEnd(agent.id, (text) => this.autoReplyOnTurnEnd(agent.id, agent.name, text));

    this.lifecycle.onExit(agent.id, () => {
      agent.status = 'disconnected';
      this.router.registerAgent(agent);
      this.persistence.saveAgent(agent);
      this.broadcastState();
    });

    this.broadcastState();
    return agent;
  }

  reopenTerminal(id: string, cwd: string): AgentInstance | null {
    const agent = this.router.getAgent(id);
    if (!agent) return null;

    const def = getHarness(agent.harness);
    if (!def) return null;

    agent.status = 'running';
    agent.launchBackend = 'tmux';
    this.router.registerAgent(agent);
    this.persistence.saveAgent(agent);

    if (def.mcpConfigFilename && this.mcpUrl) {
      const configPath = path.join(cwd, def.mcpConfigFilename);
      const content = def.mcpConfigContent(this.mcpUrl);
      if (content) {
        try {
          fs.writeFileSync(configPath, content, 'utf-8');
        } catch (err) {
          console.error(
            `[chat-service] reopenTerminal: write MCP config failed for ${agent.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const runtime =
      this.serverUrl && this.sessionToken
        ? writeRuntimeConfig({
            serverUrl: this.serverUrl,
            sessionToken: this.sessionToken,
            agentId: agent.id,
            agentName: agent.name,
            harness: agent.harness,
            repositoryPath: cwd,
          })
        : { env: {} };

    this.lifecycle.reopenTerminal({
      ...this.lifecycleOptions(agent, cwd, runtime.env),
      openTerminal: true,
      tmux: true,
      streamJson: false,
    });

    this.lifecycle.onOutput(agent.id, (data) => {
      const content = stripAnsi(data).trim();
      if (!content) return;
      this.transport.broadcast('agent-output', {
        agentId: agent.id,
        agentName: agent.name,
        content,
        timestamp: new Date().toISOString(),
      });
      this.notifyAgentResponse(agent.name, content);
    });
    this.lifecycle.onTurnEnd(agent.id, (text) => this.autoReplyOnTurnEnd(agent.id, agent.name, text));

    this.lifecycle.onExit(agent.id, () => {
      agent.status = 'disconnected';
      this.router.registerAgent(agent);
      this.persistence.saveAgent(agent);
      this.broadcastState();
    });

    this.broadcastState();
    return agent;
  }

  terminalAttached(agent: AgentInstance, cwd: string): boolean {
    if (agent.status !== 'running') return false;
    if (agent.launchBackend !== 'tmux') return true;
    const opts = this.lifecycleOptions(agent, cwd);
    return this.lifecycle.terminalAttached({ ...opts, openTerminal: true, tmux: true, streamJson: false });
  }

  private lifecycleOptions(
    agent: AgentInstance,
    cwd: string,
    env: Record<string, string> = {},
  ): CreateOptions {
    const def = getHarness(agent.harness);
    if (!def) {
      return {
        id: agent.id,
        name: agent.name,
        harness: agent.harness,
        harnessName: agent.harness,
        args: [],
        cwd,
        env,
      };
    }
    return {
      id: agent.id,
      name: agent.name,
      harness: def.command,
      harnessName: agent.harness,
      args: this.argsWithHarnessCapabilities(def.defaultArgs(agent.name), agent.harnessAttachments ?? []),
      cwd,
      env,
    };
  }

  private argsWithHarnessCapabilities(
    defaultArgs: string[],
    harnessAttachments: HarnessAttachmentSelection[],
  ): string[] {
    const args = [...defaultArgs];
    const existingPaths = new Set<string>();
    for (let i = 0; i < args.length - 1; i += 1) {
      if (args[i] === '-e' || args[i] === '--extension' || args[i] === '--skill')
        existingPaths.add(args[i + 1]);
    }
    for (const attachment of harnessAttachments) {
      if (!attachment.path || existingPaths.has(attachment.path)) continue;
      if (attachment.kind === 'pi-extension') args.push('-e', attachment.path);
      if (attachment.kind === 'skill') args.push('--skill', attachment.path);
      existingPaths.add(attachment.path);
    }
    return args;
  }

  sendMessage(
    channelId: string,
    content: string,
    channelType: 'group' | 'dm' = 'group',
    explicitTargets?: string[],
    metadata: MessageMetadata = {},
  ): Message {
    const route = this.router.routeMessage(content, explicitTargets, channelId);
    const mentions = this.router.parseMentions(content);
    const id = metadata.msg_id ?? crypto.randomUUID();

    const message: Message = {
      id,
      msg_id: id,
      channelId,
      sender: 'dev',
      content,
      mentions: mentions.map((m) => m.target),
      channelType,
      recipientAgents: route.targets.map((a) => a.name),
      inReplyTo: metadata.inReplyTo,
      expectsReply: metadata.expectsReply,
      hops: metadata.hops ?? 0,
      timestamp: new Date().toISOString(),
    };

    this.persistence.saveMessage(message);
    this.transport.broadcast('message', message as unknown as Record<string, unknown>);

    for (const agent of route.targets) {
      if (agent.status === 'running') {
        this.lifecycle.sendInput(agent.id, content + '\n');
      }
    }

    return message;
  }

  recordAgentMessage(
    channelId: string,
    sender: string,
    content: string,
    metadata: MessageMetadata = {},
  ): Message {
    const route = this.router.routeMessage(content, undefined, channelId);
    const mentions = this.router.parseMentions(content);
    const id = metadata.msg_id ?? crypto.randomUUID();
    const message: Message = {
      id,
      msg_id: id,
      channelId,
      sender,
      content,
      mentions: mentions.map((m) => m.target),
      channelType: channelId.startsWith('@') || channelId.startsWith('dm-') ? 'dm' : 'group',
      recipientAgents: route.targets.map((a) => a.name),
      inReplyTo: metadata.inReplyTo,
      expectsReply: metadata.expectsReply,
      hops: metadata.hops ?? 0,
      timestamp: new Date().toISOString(),
    };
    this.persistence.saveMessage(message);
    this.transport.broadcast('message', message as unknown as Record<string, unknown>);
    this.notifyAgentResponse(sender, content);
    return message;
  }

  awaitReply(inReplyTo: string, timeoutMs = 30_000): Promise<Message | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsub();
        resolve(null);
      }, timeoutMs);
      const unsub = this.onAgentResponse((sender) => {
        const reply = this.getChannelHistory('#all', 100).find(
          (m) => m.inReplyTo === inReplyTo && m.sender === sender,
        );
        if (!reply) return;
        clearTimeout(timer);
        unsub();
        resolve(reply);
      });
    });
  }

  private autoReplyOnTurnEnd(agentId: string, agentName: string, text?: string): void {
    const content = stripAnsi(text ?? '').trim();
    const original = this.pendingReplies.get(agentId);
    if (!content || !original) return;
    this.pendingReplies.delete(agentId);
    const hops = (original.hops ?? 0) + 1;
    if (hops > maxHopsFromEnv()) return;
    this.recordAgentMessage(original.channelId, agentName, content, {
      inReplyTo: original.msg_id || original.id,
      hops,
    });
  }

  addTag(agentId: string, tag: string): void {
    const agent = this.router.getAgent(agentId);
    if (!agent) return;
    if (!agent.tags.includes(tag)) {
      agent.tags.push(tag);
      this.router.registerAgent(agent);
      this.persistence.saveAgent(agent);
      this.broadcastState();
    }
  }

  removeTag(agentId: string, tag: string): void {
    const agent = this.router.getAgent(agentId);
    if (!agent) return;
    agent.tags = agent.tags.filter((t) => t !== tag);
    this.router.registerAgent(agent);
    this.persistence.saveAgent(agent);
    this.broadcastState();
  }

  setTags(agentId: string, tags: string[]): void {
    const agent = this.router.getAgent(agentId);
    if (!agent) return;
    agent.tags = tags;
    this.router.registerAgent(agent);
    this.persistence.saveAgent(agent);
    this.broadcastState();
  }

  createGroup(name: string, tagFilter?: string): AgentGroup {
    const id = crypto.randomUUID();
    const group: AgentGroup = { id, name, tagFilter: tagFilter ?? null, agentIds: [] };
    this.router.registerGroup(group);
    this.persistence.saveGroup(group);
    this.broadcastState();
    return group;
  }

  deleteGroup(id: string): void {
    this.router.unregisterGroup(id);
    this.persistence.deleteGroup(id);
    this.broadcastState();
  }

  addToGroup(groupId: string, agentId: string): void {
    const group = this.router.getGroup(groupId);
    if (!group) return;
    if (!group.agentIds.includes(agentId)) {
      group.agentIds.push(agentId);
      this.router.registerGroup(group);
      this.persistence.saveGroup(group);

      const agent = this.router.getAgent(agentId);
      if (agent && !agent.groupIds.includes(groupId)) {
        agent.groupIds.push(groupId);
        this.persistence.saveAgent(agent);
      }

      this.broadcastState();
    }
  }

  removeFromGroup(groupId: string, agentId: string): void {
    const group = this.router.getGroup(groupId);
    if (!group) return;
    group.agentIds = group.agentIds.filter((id) => id !== agentId);
    this.router.registerGroup(group);
    this.persistence.saveGroup(group);

    const agent = this.router.getAgent(agentId);
    if (agent) {
      agent.groupIds = agent.groupIds.filter((id) => id !== groupId);
      this.persistence.saveAgent(agent);
    }

    this.broadcastState();
  }

  getChannelHistory(channelId: string, limit?: number, offset?: number) {
    return this.persistence.getMessages(channelId, limit, offset);
  }

  getMessage(id: string): Message | undefined {
    return this.persistence.getMessage(id);
  }

  clear(): void {
    this.router.clear();
    this.lifecycle.killAll();
    this.agentResponseHandlers = [];
    this.pendingReplies.clear();
  }

  getAgents(): AgentInstance[] {
    return this.router.getAgents();
  }

  getGroups(): AgentGroup[] {
    return this.router.getGroups();
  }

  restoreAgentsFromStore(cwd: string): void {
    const agents = this.persistence.listAgents();
    for (const agent of agents) {
      this.router.registerAgent(agent);
      if (agent.status === 'running') {
        agent.status = 'disconnected';
        this.persistence.saveAgent(agent);
      }
    }

    const groups = this.persistence.listGroups();
    for (const group of groups) {
      this.router.registerGroup(group);
    }
  }

  writeMcpConfigs(cwd: string): void {
    for (const agent of this.router.getAgents()) {
      if (agent.status !== 'running') continue;
      const def = getHarness(agent.harness);
      if (!def || !def.mcpConfigFilename || !this.mcpUrl) continue;
      const configPath = path.join(cwd, def.mcpConfigFilename);
      const content = def.mcpConfigContent(this.mcpUrl);
      if (content) {
        try {
          fs.writeFileSync(configPath, content, 'utf-8');
        } catch (err) {
          console.error(
            `[chat-service] writeMcpConfigs: write failed for ${agent.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }
}
