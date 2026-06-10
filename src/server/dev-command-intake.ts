import type { WebSocket } from 'ws';
import type { ChatService } from '../domain/chat-service.js';
import type { AgentInstance, AgentTemplate, HarnessAttachmentSelection } from '../types.js';

// Dev Command intake: the inbound-message ROUTER for dashboard commands — the Dev-facing
// counterpart to CoordinationSignalIntake. It is deliberately NOT a deep module: most arms are
// thin delegations to ChatService, which owns the real logic. Its value is locality (the server's
// composition root stops being a protocol switch) and a unit-test seam for the dashboard protocol
// that doesn't require binding a live WebSocket. Name it for what it is: a router, not depth.

export type DevCommandMessage = Record<string, unknown> & { type?: string };

export interface DevCommandIntakeDeps {
  send(ws: WebSocket, type: string, payload?: Record<string, unknown>): void;
  recordActivity(kind: string, summary: string, payload?: Record<string, unknown>): void;
  currentRepo(): string;
  chat: ChatService;
  ensureAgentContextFile(repoPath: string, agent: AgentInstance): void;
  selectedPiAttachments(input: unknown): HarnessAttachmentSelection[];
  isSafeAgentName(value: string): boolean;
  homedir(): string;
  scanDir(dirPath: string): unknown;
  listAgentTemplates(): AgentTemplate[];
  agentTemplateDir(): string;
  allowedCapabilityIds(): Set<string>;
  saveAgentTemplate(input: Partial<AgentTemplate>): AgentTemplate;
  deleteAgentTemplate(id: string): boolean;
  generateHandoff(): string;
  readProjectSummary(repoPath: string): { content: string; path: string };
  saveProjectSummary(repoPath: string, content: string): string;
  readAgentContext(repoPath: string, agentName: string): { content: string; path: string };
  saveAgentContext(repoPath: string, agentName: string, content: string): string;
}

export class DevCommandIntake {
  constructor(private deps: DevCommandIntakeDeps) {}

  handle(ws: WebSocket, msg: DevCommandMessage): boolean {
    const { chat } = this.deps;

    switch (msg.type) {
      case 'create-agent':
        return this.createAgent(ws, msg);

      case 'delete-agent': {
        const agentId = String(msg.id || '');
        const agent = chat.getAgents().find((item) => item.id === agentId);
        chat.deleteAgent(agentId);
        if (agent)
          this.deps.recordActivity('agent.deleted', `Agent deleted: ${agent.name}`, {
            agentId,
            name: agent.name,
          });
        return true;
      }

      case 'archive-agent': {
        const agent = chat.archiveAgent(String(msg.id || ''));
        if (agent)
          this.deps.recordActivity('agent.archived', `Agent archived: ${agent.name}`, {
            agentId: agent.id,
            name: agent.name,
          });
        return true;
      }

      case 'unarchive-agent': {
        const agent = chat.unarchiveAgent(String(msg.id || ''));
        if (agent)
          this.deps.recordActivity('agent.unarchived', `Agent unarchived: ${agent.name}`, {
            agentId: agent.id,
            name: agent.name,
          });
        return true;
      }

      case 'resume-agent': {
        const existingAgent = chat.getAgents().find((item) => item.id === String(msg.id || ''));
        const launchBackend = this.launchBackendFromMessage(msg, existingAgent?.launchBackend);
        const agent = chat.resumeAgent(
          String(msg.id || ''),
          this.deps.currentRepo() || process.cwd(),
          msg.openTerminal !== false,
          launchBackend === 'tmux',
        );
        if (agent) {
          this.deps.send(ws, 'agent-created', { agent });
          this.deps.recordActivity('agent.resumed', `Agent resumed: ${agent.name}`, {
            agentId: agent.id,
            name: agent.name,
          });
        }
        return true;
      }

      case 'add-tag':
        chat.addTag(String(msg.agentId || ''), String(msg.tag || ''));
        return true;

      case 'remove-tag':
        chat.removeTag(String(msg.agentId || ''), String(msg.tag || ''));
        return true;

      case 'set-tags':
        chat.setTags(String(msg.agentId || ''), Array.isArray(msg.tags) ? msg.tags.map(String) : []);
        return true;

      case 'create-group': {
        const group = chat.createGroup(
          String(msg.name || ''),
          typeof msg.tagFilter === 'string' ? msg.tagFilter : undefined,
        );
        this.deps.send(ws, 'group-created', { group });
        return true;
      }

      case 'delete-group':
        chat.deleteGroup(String(msg.id || ''));
        return true;

      case 'add-to-group':
        chat.addToGroup(String(msg.groupId || ''), String(msg.agentId || ''));
        return true;

      case 'remove-from-group':
        chat.removeFromGroup(String(msg.groupId || ''), String(msg.agentId || ''));
        return true;

      case 'get-history': {
        const channelId = typeof msg.channelId === 'string' ? msg.channelId : '#all';
        const limit = typeof msg.limit === 'number' ? msg.limit : undefined;
        const offset = typeof msg.offset === 'number' ? msg.offset : undefined;
        const messages = chat.getChannelHistory(channelId, limit, offset);
        this.deps.send(ws, 'history', { channelId, messages });
        return true;
      }

      case 'get-home-dir':
        this.deps.send(ws, 'home-dir', { path: this.deps.homedir() });
        return true;

      case 'scan-dir':
        this.deps.send(ws, 'dir-entries', {
          path: msg.path,
          entries: this.deps.scanDir(String(msg.path || '')),
        });
        return true;

      case 'agent.templates.list':
        this.sendAgentTemplates(ws);
        return true;

      case 'agent.template.save':
        return this.saveTemplate(ws, msg);

      case 'agent.template.delete': {
        const id = String(msg.id || '');
        const deleted = this.deps.deleteAgentTemplate(id);
        this.sendAgentTemplates(ws);
        if (deleted)
          this.deps.recordActivity('agent_template.deleted', 'Agent Template deleted', { templateId: id });
        return true;
      }

      case 'handoff.generate': {
        if (!this.deps.currentRepo()) {
          this.deps.send(ws, 'handoff.failed', { reason: 'No Repository selected.' });
          return true;
        }
        const handoffPath = this.deps.generateHandoff();
        this.deps.send(ws, 'handoff.generated', { path: handoffPath });
        this.deps.recordActivity('handoff.generated', `Handoff generated: ${handoffPath}`, {
          path: handoffPath,
        });
        return true;
      }

      case 'project.summary.get': {
        const repo = this.deps.currentRepo();
        if (!repo) {
          this.deps.send(ws, 'project.summary.failed', { reason: 'No Repository selected.' });
          return true;
        }
        const { content, path: summaryPath } = this.deps.readProjectSummary(repo);
        this.deps.send(ws, 'project.summary', { content, path: summaryPath });
        return true;
      }

      case 'project.summary.save': {
        const repo = this.deps.currentRepo();
        if (!repo) {
          this.deps.send(ws, 'project.summary.failed', { reason: 'No Repository selected.' });
          return true;
        }
        const summaryPath = this.deps.saveProjectSummary(repo, String(msg.content || ''));
        this.deps.send(ws, 'project.summary.saved', { path: summaryPath });
        this.deps.recordActivity('project_summary.updated', 'Project Summary updated by Dev', {
          path: summaryPath,
        });
        return true;
      }

      case 'agent.context.get': {
        const repo = this.deps.currentRepo();
        const agentName = String(msg.agentName || '');
        if (!repo || !this.deps.isSafeAgentName(agentName)) {
          this.deps.send(ws, 'agent.context.failed', {
            reason: 'Invalid Agent Instance name or no Repository selected.',
          });
          return true;
        }
        const { content, path: contextPath } = this.deps.readAgentContext(repo, agentName);
        this.deps.send(ws, 'agent.context', { agentName, content, path: contextPath });
        return true;
      }

      case 'agent.context.save': {
        const repo = this.deps.currentRepo();
        const agentName = String(msg.agentName || '');
        if (!repo || !this.deps.isSafeAgentName(agentName)) {
          this.deps.send(ws, 'agent.context.failed', {
            reason: 'Invalid Agent Instance name or no Repository selected.',
          });
          return true;
        }
        const contextPath = this.deps.saveAgentContext(repo, agentName, String(msg.content || ''));
        this.deps.send(ws, 'agent.context.saved', { agentName, path: contextPath });
        this.deps.recordActivity('agent_context.updated', `Agent Context updated for ${agentName}`, {
          agentName,
          path: contextPath,
        });
        return true;
      }

      default:
        return false;
    }
  }

  private sendAgentTemplates(ws: WebSocket): void {
    this.deps.send(ws, 'agent.templates', {
      templates: this.deps.listAgentTemplates(),
      path: this.deps.agentTemplateDir(),
    });
  }

  private saveTemplate(ws: WebSocket, msg: DevCommandMessage): boolean {
    const allowed = this.deps.allowedCapabilityIds();
    const filterIds = (value: unknown): string[] =>
      Array.isArray(value) ? value.map(String).filter((id) => allowed.has(id)) : [];

    const template = this.deps.saveAgentTemplate({
      id: typeof msg.id === 'string' ? msg.id : undefined,
      name: String(msg.name || 'Agent Template'),
      description: String(msg.description || ''),
      harness: String(msg.harness || 'pi'),
      tags: Array.isArray(msg.tags) ? msg.tags.map(String) : [],
      capabilityIds: filterIds(msg.capabilityIds),
      toolMcpIds: filterIds(msg.toolMcpIds),
      skillPluginIds: filterIds(msg.skillPluginIds),
      agentPrompt: String(msg.agentPrompt || msg.instructions || ''),
      roleAndObjective: String(msg.roleAndObjective || ''),
      instructions: String(msg.instructions || ''),
      workflow: String(msg.workflow || ''),
      omniGuide: String(msg.omniGuide || ''),
      projectContext: String(msg.projectContext || ''),
    });
    this.sendAgentTemplates(ws);
    this.deps.recordActivity('agent_template.saved', `Agent Template saved: ${template.name}`, {
      templateId: template.id,
      name: template.name,
    });
    return true;
  }

  private createAgent(ws: WebSocket, msg: DevCommandMessage): boolean {
    const { chat } = this.deps;
    const requestedName = String(msg.name || '');

    if (!this.deps.isSafeAgentName(requestedName)) {
      this.deps.send(ws, 'agent-create-failed', {
        reason:
          'Agent Instance names may only contain letters, numbers, dots, underscores, and hyphens, and must start with a letter or number.',
      });
      return true;
    }

    if (chat.getAgents().some((agent) => agent.name === requestedName)) {
      this.deps.send(ws, 'agent-create-failed', {
        reason: `Agent Instance name already exists: ${requestedName}`,
      });
      return true;
    }

    const harness = String(msg.harness || 'pi');
    const repo = this.deps.currentRepo();
    const agent = chat.createAgent(
      requestedName,
      Array.isArray(msg.tags) ? msg.tags.map(String) : [],
      harness,
      repo || process.cwd(),
      msg.openTerminal !== false,
      harness === 'pi' ? this.deps.selectedPiAttachments(msg.harnessAttachmentIds) : [],
      {
        templateId: typeof msg.templateId === 'string' ? msg.templateId : undefined,
        description: String(msg.description || ''),
        agentPrompt: String(msg.agentPrompt || msg.instructions || ''),
        roleAndObjective: String(msg.roleAndObjective || ''),
        instructions: String(msg.instructions || ''),
        workflow: String(msg.workflow || ''),
        omniGuide: String(msg.omniGuide || ''),
        projectContext: String(msg.projectContext || ''),
      },
      this.launchBackendFromMessage(msg) === 'tmux',
    );

    if (agent) {
      if (repo) this.deps.ensureAgentContextFile(repo, agent);
      this.deps.send(ws, 'agent-created', { agent });
      this.deps.recordActivity('agent.created', `Agent created: ${agent.name}`, {
        agentId: agent.id,
        name: agent.name,
        harness: agent.harness,
      });
    } else {
      this.deps.send(ws, 'agent-create-failed', { reason: `Unsupported Agent Harness: ${harness}` });
    }
    return true;
  }

  private launchBackendFromMessage(
    msg: DevCommandMessage,
    fallback?: AgentInstance['launchBackend'],
  ): 'terminal' | 'tmux' {
    if (msg.launchBackend === 'terminal' || msg.launchBackend === 'tmux') return msg.launchBackend;
    return fallback ?? 'tmux';
  }
}
