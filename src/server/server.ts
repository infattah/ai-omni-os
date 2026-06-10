import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { InstanceManager } from '../manager/instance-manager.js';
import { MessageRouter } from '../engine/router.js';
import { RepoScanner } from '../scanner/repo-scanner.js';
import { ContextStore } from '../store/context-store.js';
import { ChatService } from '../domain/chat-service.js';
import { CoordinationService } from '../domain/coordination-service.js';
import { CoordinationSignalIntake } from './coordination-signal-intake.js';
import { DevCommandIntake } from './dev-command-intake.js';
import { scanGeneralHarnessHealth } from '../infra/general-capability-store.js';
import { scanPiHarnessHealth } from '../infra/pi-harness-health.js';
import {
  agentTemplateDir,
  deleteAgentTemplate,
  listAgentTemplates,
  saveAgentTemplate,
} from '../infra/agent-template-store.js';
import {
  ensureProjectMemory,
  saveStartupBriefing,
  generateHandoffSnapshot,
  appendProjectTaskSummary,
  ensureAgentContextFile,
  readProjectSummary,
  saveProjectSummary,
  readAgentContext,
  saveAgentContext,
} from '../infra/project-memory-store.js';
import type {
  ActivityEvent,
  AgentInstance,
  AgentPresence,
  HarnessAttachmentSelection,
  Message,
} from '../types.js';

export interface OmniServer {
  close(): void;
  port: number;
  host: string;
  sessionToken: string;
}

let currentRepo: string = '';
export const STALE_CUTOFF_MS = 30_000;
const PRESENCE_SWEEP_MS = 5_000;

export function deriveConnectionStatus(
  lastSeenAt: string,
  now: Date = new Date(),
  cutoffMs: number = STALE_CUTOFF_MS,
): AgentPresence['connectionStatus'] {
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return 'stale';
  return now.getTime() - seen >= cutoffMs ? 'stale' : 'connected';
}

export function deriveTerminalAttached(
  agent: Pick<AgentInstance, 'status' | 'launchBackend'>,
  tmuxAttached: () => boolean,
): boolean {
  if (agent.status !== 'running') return false;
  if (agent.launchBackend !== 'tmux') return true;
  return tmuxAttached();
}

// Built client lives next to the compiled server when installed from npm,
// and under the repo root during development; cwd is the dev-server fallback.
function clientDistDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(moduleDir, '../../dist/client'), path.join(process.cwd(), 'dist/client')];
  return candidates.find((c) => fs.existsSync(path.join(c, 'index.html'))) ?? candidates[0];
}

function loadClientHtml(): string {
  const htmlPath = path.join(clientDistDir(), 'index.html');
  if (fs.existsSync(htmlPath)) return fs.readFileSync(htmlPath, 'utf-8');
  console.warn('client/index.html not found -- using fallback');
  return '<html><body><h1>Omni</h1><p>UI file not found.</p></body></html>';
}

function isSafeAgentName(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value);
}

function selectedPiAttachments(input: unknown): HarnessAttachmentSelection[] {
  const requestedIds = Array.isArray(input) ? input.map(String) : [];
  if (requestedIds.length === 0) return [];
  const allowedAttachments = [
    ...scanPiHarnessHealth().detectedAttachments.filter(
      (attachment) =>
        !attachment.required &&
        ['skill', 'pi-extension', 'mcp-server', 'tool-bridge'].includes(attachment.kind),
    ),
    ...scanGeneralHarnessHealth().detectedAttachments.filter(
      (attachment) =>
        !attachment.required && ['skill', 'mcp-server', 'tool-bridge'].includes(attachment.kind),
    ),
  ];
  const allowed = new Map(allowedAttachments.map((attachment) => [attachment.id, attachment]));
  return requestedIds
    .map((id) => allowed.get(id))
    .filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment))
    .map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      harness: attachment.harness,
      kind: attachment.kind,
      path: attachment.path,
      risk: attachment.risk,
      cost: attachment.cost,
    }));
}

export function createServer(port: number): Promise<OmniServer> {
  return new Promise((resolve, reject) => {
    const host = '127.0.0.1';
    const sessionToken = process.env.OMNI_SESSION_TOKEN || crypto.randomBytes(24).toString('base64url');

    const globalDir = path.join(os.homedir(), '.omni');
    if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });
    const dbPath = process.env.OMNI_DB || path.join(globalDir, 'data.db');

    const store = new ContextStore(dbPath);
    store.initialize();
    const manager = new InstanceManager();
    const router = new MessageRouter();
    const scanner = new RepoScanner();

    function send(ws: WebSocket, type: string, payload: Record<string, unknown> = {}) {
      ws.send(JSON.stringify({ type, ...payload }));
    }

    function broadcast(wss: WebSocketServer, type: string, payload: Record<string, unknown> = {}) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) send(client, type, payload);
      });
    }

    function recordActivity(
      kind: string,
      summary: string,
      payload: Record<string, unknown> = {},
    ): ActivityEvent {
      const event: ActivityEvent = {
        id: crypto.randomUUID(),
        kind,
        summary,
        payload,
        timestamp: new Date().toISOString(),
      };
      store.saveActivityEvent(event);
      broadcast(wss, 'activity.event', { event });
      return event;
    }

    function sendCoordinationMessage(
      channelId: string,
      sender: string,
      content: string,
      message?: Message,
    ): void {
      const payload = {
        type: 'coordination.message',
        msg_id: message?.msg_id ?? message?.id,
        inReplyTo: message?.inReplyTo,
        expectsReply: message?.expectsReply ?? false,
        hops: message?.hops ?? 0,
        channelId,
        sender,
        content,
        timestamp: message?.timestamp ?? new Date().toISOString(),
      };
      for (const connector of connectors.values()) {
        if (connector.readyState === WebSocket.OPEN) connector.send(JSON.stringify(payload));
      }
    }

    function recordChatMessage(
      channelId: string,
      sender: string,
      content: string,
      metadata: { msg_id?: string; inReplyTo?: string; expectsReply?: boolean; hops?: number } = {},
    ): Message {
      if (sender === 'dev') return chat.sendMessage(channelId, content, 'group', undefined, metadata);
      return chat.recordAgentMessage(channelId, sender, content, metadata);
    }

    function recordSystemMessage(channelId: string, content: string): Message {
      return recordChatMessage(channelId, 'omni', content);
    }

    const httpServer = http.createServer((req, res) => {
      const requestPath = new URL(req.url || '/', `http://${host}`).pathname;
      const builtAssetPath = path.join(clientDistDir(), requestPath);

      if (requestPath === '/' || requestPath === '/index.html') {
        // Read index.html per request so a client rebuild is picked up on refresh
        // without restarting the server (asset hashes change on every build).
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
        res.end(loadClientHtml());
      } else if (requestPath.startsWith('/assets/') && fs.existsSync(builtAssetPath)) {
        const contentType = requestPath.endsWith('.css') ? 'text/css' : 'application/javascript';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(builtAssetPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    const wss = new WebSocketServer({ server: httpServer });
    const connectors = new Map<string, WebSocket>();
    const presenceByAgentName = new Map<string, AgentPresence>();
    const chat = new ChatService(router, manager, store, {
      broadcast(type, payload) {
        broadcast(wss, type, payload);
      },
    });
    const coordination = new CoordinationService(store, {
      broadcast: (type, payload) => broadcast(wss, type, payload),
      recordActivity,
      appendCompletedTaskSummary: (task, resultSummary) => {
        if (currentRepo) appendProjectTaskSummary(currentRepo, task, resultSummary);
      },
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
    });
    const devCommandIntake = new DevCommandIntake({
      send,
      recordActivity,
      currentRepo: () => currentRepo,
      chat,
      ensureAgentContextFile,
      selectedPiAttachments,
      isSafeAgentName,
      homedir: () => os.homedir(),
      scanDir: (dirPath) => scanner.scan(dirPath),
      listAgentTemplates,
      agentTemplateDir,
      allowedCapabilityIds: () =>
        new Set([
          ...scanPiHarnessHealth()
            .detectedAttachments.filter(
              (attachment) =>
                !attachment.required &&
                ['skill', 'pi-extension', 'mcp-server', 'tool-bridge'].includes(attachment.kind),
            )
            .map((attachment) => attachment.id),
          ...scanGeneralHarnessHealth()
            .detectedAttachments.filter(
              (attachment) =>
                !attachment.required && ['skill', 'mcp-server', 'tool-bridge'].includes(attachment.kind),
            )
            .map((attachment) => attachment.id),
        ]),
      saveAgentTemplate,
      deleteAgentTemplate,
      generateHandoff: () => generateHandoffSnapshot(currentRepo, store, agentsWithPresence()),
      readProjectSummary,
      saveProjectSummary,
      readAgentContext,
      saveAgentContext,
    });

    function agentsWithPresence(): AgentInstance[] {
      return chat.getAgents().map((agent) => ({
        ...agent,
        presence: derivePresence(agent),
      }));
    }

    function derivePresence(agent: AgentInstance): AgentPresence {
      const presence = presenceByAgentName.get(agent.name) ??
        agent.presence ?? {
          connectionStatus: 'disconnected' as const,
          workStatus: 'unknown' as const,
          lastSeenAt: agent.createdAt,
        };
      const terminalAttached = deriveTerminalAttached(agent, () =>
        chat.terminalAttached(agent, currentRepo || agent.cwd),
      );
      if (presence.connectionStatus === 'disconnected') return { ...presence, terminalAttached };
      return { ...presence, connectionStatus: deriveConnectionStatus(presence.lastSeenAt), terminalAttached };
    }

    function stateSnapshot(): Record<string, unknown> {
      const hasRepository = Boolean(currentRepo);
      return {
        repository: currentRepo ? { path: currentRepo } : null,
        agents: hasRepository ? agentsWithPresence() : [],
        groups: hasRepository ? chat.getGroups() : [],
        messages: hasRepository ? store.getMessages('#all', 100) : [],
        activity: hasRepository ? store.listActivityEvents(100) : [],
        tasks: hasRepository ? store.listTasks(100) : [],
        workClaims: hasRepository ? store.listWorkClaims(100) : [],
        harnessHealth: {
          general: scanGeneralHarnessHealth(),
          pi: scanPiHarnessHealth(),
        },
        agentTemplates: listAgentTemplates(),
        launchBackends: manager.detectLaunchBackends(),
      };
    }

    function broadcastAgents(): void {
      broadcast(wss, 'agents', { agents: agentsWithPresence() });
    }

    function broadcastAgentPresence(agentName: string, presence: AgentPresence): void {
      const agent = chat.getAgents().find((item) => item.name === agentName);
      const nextPresence = agent
        ? {
            ...presence,
            terminalAttached: deriveTerminalAttached(agent, () =>
              chat.terminalAttached(agent, currentRepo || agent.cwd),
            ),
          }
        : presence;
      presenceByAgentName.set(agentName, nextPresence);
      broadcast(wss, 'agent-presence', { agentName, presence: nextPresence });
    }

    const presenceSweep = setInterval(() => {
      for (const [agentName, presence] of presenceByAgentName) {
        if (presence.connectionStatus === 'disconnected') continue;
        const agent = chat.getAgents().find((item) => item.name === agentName);
        const nextStatus = deriveConnectionStatus(presence.lastSeenAt);
        const nextTerminalAttached = agent
          ? deriveTerminalAttached(agent, () => chat.terminalAttached(agent, currentRepo || agent.cwd))
          : presence.terminalAttached;
        if (nextStatus === presence.connectionStatus && nextTerminalAttached === presence.terminalAttached)
          continue;
        const nextPresence = {
          ...presence,
          connectionStatus: nextStatus,
          terminalAttached: nextTerminalAttached,
        };
        presenceByAgentName.set(agentName, nextPresence);
        broadcastAgentPresence(agentName, nextPresence);
      }
    }, PRESENCE_SWEEP_MS);

    function initRepo(repoPath: string): void {
      currentRepo = repoPath;
      const omniDir = ensureProjectMemory(repoPath);
      const repoDb = path.join(omniDir, 'data.db');
      chat.clear();
      presenceByAgentName.clear();
      store.reinit(repoDb);
      chat.restoreAgentsFromStore(repoPath);
      chat.writeMcpConfigs(repoPath);
    }

    wss.on('connection', (ws, req) => {
      let connectorAgentName: string | null = null;
      const coordinationSignalIntake = new CoordinationSignalIntake({
        connectorName: () => connectorAgentName,
        send,
        createTask: (input) => coordination.createTask(input),
        updateTaskLifecycle: (humanId, status, owner, activityKind, summary) =>
          coordination.updateTaskLifecycle(humanId, status, owner, activityKind, summary),
        appendCompletedTaskSummary: (task, resultSummary) =>
          coordination.appendCompletedTaskSummary(task, resultSummary),
        createWorkClaim: (input) => coordination.createWorkClaim(input),
        releaseWorkClaim: (input) => coordination.releaseWorkClaim(input),
        updatePresence(agentName, presence) {
          presenceByAgentName.set(agentName, presence);
          broadcastAgentPresence(agentName, presence);
        },
        currentPresence(agentName) {
          return presenceByAgentName.get(agentName);
        },
        recordChatMessage,
        sendDevMessage(channelId, content, channelType, explicitTargets) {
          return chat.sendMessage(channelId, content, channelType, explicitTargets);
        },
        sendCoordinationMessage,
        relayCoordinationToTerminalAgents(channelId, sender, content, message) {
          chat.relayCoordinationToTerminalAgents(channelId, sender, content, message);
        },
        recordActivity,
      });
      const url = new URL(req.url || '/', `http://${host}`);
      if (url.searchParams.get('token') !== sessionToken) {
        ws.close(1008, 'Invalid Omni session token');
        return;
      }

      send(ws, 'connected');
      if (currentRepo) {
        send(ws, 'repo-selected', { path: currentRepo });
      }
      send(ws, 'state.snapshot', stateSnapshot());
      broadcastAgents();
      broadcast(wss, 'groups', { groups: chat.getGroups() });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'ping') {
            send(ws, 'pong');
          } else if (msg.type === 'connector.register') {
            const agentName = String(msg.agentName || msg.name || 'unknown-agent');
            const harness = String(msg.harness || 'unknown');
            const purpose = msg.purpose ? String(msg.purpose) : undefined;
            const tags = Array.isArray(msg.tags) ? msg.tags.map(String) : [];
            connectorAgentName = agentName;
            connectors.set(agentName, ws);
            ws.on('close', () => {
              if (connectorAgentName) {
                connectors.delete(connectorAgentName);
                const disconnectedPresence: AgentPresence = {
                  connectionStatus: 'disconnected',
                  workStatus: 'unknown',
                  lastSeenAt: new Date().toISOString(),
                };
                presenceByAgentName.set(connectorAgentName, disconnectedPresence);
                broadcastAgentPresence(connectorAgentName, disconnectedPresence);
                recordActivity('presence.disconnected', `${connectorAgentName} disconnected`, {
                  agentName: connectorAgentName,
                });
              }
            });
            const presence: AgentPresence = {
              connectionStatus: 'connected',
              workStatus: 'idle',
              lastSeenAt: new Date().toISOString(),
            };
            presenceByAgentName.set(agentName, presence);
            broadcastAgentPresence(agentName, presence);
            recordActivity('discovery.received', `Discovery received from ${agentName}`, {
              agentId: msg.agentId,
              agentName,
              harness,
              tags,
              purpose,
            });
            recordSystemMessage(
              '#all',
              [
                `${agentName} joined.`,
                `Harness: ${harness}`,
                purpose ? `Purpose: ${purpose}` : undefined,
                `Reachable as @${agentName}`,
              ]
                .filter(Boolean)
                .join('\n'),
            );
            const startupBriefing = coordination.generateStartupBriefing(
              agentName,
              harness,
              currentRepo,
              purpose,
            );
            if (currentRepo) {
              const briefingPath = saveStartupBriefing(currentRepo, agentName, startupBriefing);
              recordActivity('startup_briefing.generated', `Startup Briefing generated for ${agentName}`, {
                agentName,
                briefingPath,
              });
            }
            send(ws, 'startup.briefing', { agentName, content: startupBriefing });
            send(ws, 'connector.registered', { agentName, harness });
          } else if (coordinationSignalIntake.handle(ws, msg)) {
            // Coordination Signal handled by intake module.
          } else if (devCommandIntake.handle(ws, msg)) {
            // Dev dashboard command handled by intake module.
          } else if (msg.type === 'select-repo') {
            // Repo selection stays at the composition root: it orchestrates server-wide state
            // (store re-init, chat clear) and fans out snapshots to all clients — not a command
            // delegation. Same edge-of-the-app reasoning as connector.register (see ADR 0003).
            scanner.setRepo(msg.path);
            initRepo(msg.path);
            broadcast(wss, 'repo-selected', { path: msg.path });
            recordActivity('repository.selected', `Repository selected: ${msg.path}`, { path: msg.path });
            broadcast(wss, 'state.snapshot', stateSnapshot());
            broadcastAgents();
            broadcast(wss, 'groups', { groups: chat.getGroups() });
          }
        } catch (err) {
          console.error('WebSocket handler error:', err);
        }
      });
    });

    httpServer.listen(port, host, () => {
      const addr = httpServer.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      chat.setRuntimeConnection(`http://${host}:${actualPort}`, sessionToken);
      resolve({
        close: () => {
          clearInterval(presenceSweep);
          wss.close();
          httpServer.close();
        },
        port: actualPort,
        host,
        sessionToken,
      });
    });

    httpServer.on('error', reject);
  });
}
