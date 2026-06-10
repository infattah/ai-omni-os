/**
 * Generic Omni MCP connector.
 *
 * Runtime contract (identical to the Pi connector, harness-agnostic):
 * - Omni launches the harness with OMNI_RUNTIME_CONFIG pointing to a per-run JSON file
 *   (server URL, per-run token, Repository path, Agent identity).
 * - The harness (Claude Code today; Codex/Gemini/opencode later) spawns this file as an MCP stdio
 *   server. It inherits OMNI_RUNTIME_CONFIG, so no per-agent data lives in the MCP config.
 * - On start it opens the SAME WebSocket connector Pi uses (connector.register + heartbeat) and
 *   exposes MCP tools that emit the SAME connector.* signals Pi's extension emits.
 *
 * Inbound delivery is NOT handled here: MCP is pull-only and cannot wake the agent. Omni types
 * peer messages into this harness's terminal (the harness recipe's `terminal-paste` delivery).
 *
 * This connect-half ships connector.register + heartbeat + Startup Briefing + a feed buffer and the
 * omni_startup_briefing tool. Chat / Work Claim / Task tools are added in later slices.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';

export interface OmniRuntimeConfig {
  version: 1;
  serverUrl: string;
  sessionToken: string;
  agent: {
    id: string;
    name: string;
    harness: string;
  };
  repositoryPath: string;
}

export interface CoordinationMessage {
  type: 'coordination.message';
  msg_id: string;
  channelId: string;
  sender: string;
  content: string;
  inReplyTo?: string;
  expectsReply?: boolean;
  hops: number;
  timestamp: string;
}

// ---- Pure helpers (unit-tested) -------------------------------------------------------------

export function readRuntimeConfig(): OmniRuntimeConfig | null {
  const configPath = process.env.OMNI_RUNTIME_CONFIG;
  if (!configPath) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OmniRuntimeConfig;
}

export function connectorWebSocketUrl(runtime: OmniRuntimeConfig): string {
  const url = new URL(runtime.serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', runtime.sessionToken);
  return url.toString();
}

export function buildRegisterPayload(runtime: OmniRuntimeConfig): Record<string, unknown> {
  return {
    type: 'connector.register',
    agentId: runtime.agent.id,
    agentName: runtime.agent.name,
    harness: runtime.agent.harness,
    tags: [],
  };
}

export function buildChatSendPayload(
  runtime: OmniRuntimeConfig,
  content: string,
  metadata: { msg_id?: string; inReplyTo?: string; expectsReply?: boolean; hops?: number } = {},
): Record<string, unknown> {
  const msg_id = metadata.msg_id ?? crypto.randomUUID();
  return {
    type: 'connector.chat.send',
    msg_id,
    channelId: '#all',
    sender: runtime.agent.name,
    content,
    inReplyTo: metadata.inReplyTo,
    expectsReply: metadata.expectsReply ?? false,
    hops: metadata.hops ?? 0,
  };
}

export function recentMessages(feed: CoordinationMessage[], limit: number): CoordinationMessage[] {
  const bounded = Math.max(1, Math.min(limit, 100));
  return feed.slice(-bounded);
}

export function getMessage(feed: CoordinationMessage[], msg_id: string): CoordinationMessage | undefined {
  return feed.find((message) => message.msg_id === msg_id);
}

export function replyMessages(feed: CoordinationMessage[], msg_id: string): CoordinationMessage[] {
  return feed.filter((message) => message.inReplyTo === msg_id);
}

export function buildWorkClaimCreatePayload(
  runtime: OmniRuntimeConfig,
  path: string,
  note = '',
): Record<string, unknown> {
  return { type: 'connector.workClaim.create', agentName: runtime.agent.name, path, note };
}

export function buildWorkClaimReleasePayload(
  runtime: OmniRuntimeConfig,
  path: string,
): Record<string, unknown> {
  return { type: 'connector.workClaim.release', agentName: runtime.agent.name, path };
}

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export function buildTaskCreatePayload(
  runtime: OmniRuntimeConfig,
  task: {
    title: string;
    target?: string;
    details?: string;
    expectedResult?: string;
    priority?: TaskPriority;
  },
): Record<string, unknown> {
  return {
    type: 'connector.task.create',
    requester: runtime.agent.name,
    target: task.target || '#all',
    title: task.title,
    details: task.details || '',
    expectedResult: task.expectedResult || '',
    priority: task.priority || 'normal',
  };
}

export type TaskLifecycleAction = 'accept' | 'reject' | 'block' | 'fail' | 'complete';

export function buildTaskLifecyclePayload(
  action: TaskLifecycleAction,
  runtime: OmniRuntimeConfig,
  params: { humanId: string; reason?: string; resultSummary?: string },
): Record<string, unknown> {
  return {
    type: `connector.task.${action}`,
    humanId: params.humanId,
    owner: runtime.agent.name,
    reason: params.reason || '',
    resultSummary: params.resultSummary || '',
  };
}

// ---- Live wiring (covered by manual run / /verify, not unit tests) --------------------------

const coordinationFeed: CoordinationMessage[] = [];
let connectorSocket: WebSocket | null = null;
let startupBriefing = '';
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

function sendToOmni(payload: Record<string, unknown>): boolean {
  if (!connectorSocket || connectorSocket.readyState !== WebSocket.OPEN) return false;
  connectorSocket.send(JSON.stringify(payload));
  return true;
}

function sendHeartbeat(
  runtime: OmniRuntimeConfig,
  workStatus: 'idle' | 'busy' | 'blocked' | 'done' | 'unknown' = 'idle',
  contextUsedPct?: number,
): void {
  sendToOmni({
    type: 'presence.heartbeat',
    agentName: runtime.agent.name,
    workStatus,
    ...(typeof contextUsedPct === 'number' ? { contextUsedPct } : {}),
  });
}

function connectToOmni(runtime: OmniRuntimeConfig): void {
  connectorSocket = new WebSocket(connectorWebSocketUrl(runtime));
  connectorSocket.on('open', () => {
    sendToOmni(buildRegisterPayload(runtime));
    sendHeartbeat(runtime);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => sendHeartbeat(runtime), 10_000);
  });
  connectorSocket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === 'coordination.message') {
      coordinationFeed.push(message as CoordinationMessage);
      coordinationFeed.splice(0, Math.max(0, coordinationFeed.length - 100));
    }
    if (message.type === 'startup.briefing' && typeof message.content === 'string') {
      startupBriefing = message.content;
    }
  });
  connectorSocket.on('close', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  });
  connectorSocket.on('error', (err) => {
    console.error(`[omni-mcp-connector] socket error: ${err instanceof Error ? err.message : String(err)}`);
  });
}

async function startMcpServer(runtime: OmniRuntimeConfig | null): Promise<void> {
  const server = new McpServer({ name: 'omni', version: '1.0.0' });

  server.registerTool(
    'omni_startup_briefing',
    { description: 'Read the private Startup Briefing Omni sent to this Agent Instance.' },
    async () => ({
      content: [{ type: 'text' as const, text: startupBriefing || 'No Startup Briefing received yet.' }],
    }),
  );

  server.registerTool(
    'omni_send',
    {
      description: 'Send a coordination chat message from this Agent Instance to Omni #all.',
      inputSchema: z.object({
        content: z.string().describe('Message content to send to #all'),
        inReplyTo: z.string().optional().describe('Message ID this is replying to'),
        expectsReply: z.boolean().optional().describe('Whether Omni should auto-capture turn-end replies'),
        hops: z.number().optional().describe('Reply hop count'),
      }),
    },
    async (args) => {
      const { content, inReplyTo, expectsReply, hops } = args as {
        content: string;
        inReplyTo?: string;
        expectsReply?: boolean;
        hops?: number;
      };
      const payload = runtime
        ? buildChatSendPayload(runtime, content, { inReplyTo, expectsReply, hops })
        : null;
      const sent = payload ? sendToOmni(payload) : false;
      return {
        content: [
          {
            type: 'text' as const,
            text: sent ? JSON.stringify({ msg_id: payload!.msg_id }) : 'Not connected to Omni.',
          },
        ],
      };
    },
  );

  server.registerTool(
    'omni_get',
    {
      description: 'Read one Omni message by msg_id, replies to msg_id, or recent feed messages.',
      inputSchema: z.object({
        msg_id: z.string().optional(),
        repliesTo: z.string().optional(),
        limit: z.number().optional().describe('Max messages to return (default 20)'),
      }),
    },
    async (args) => {
      const { msg_id, repliesTo, limit } = args as { msg_id?: string; repliesTo?: string; limit?: number };
      if (msg_id)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(getMessage(coordinationFeed, msg_id) ?? null, null, 2),
            },
          ],
        };
      const messages = repliesTo
        ? replyMessages(coordinationFeed, repliesTo)
        : recentMessages(coordinationFeed, limit ?? 20);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ messages }, null, 2) }] };
    },
  );

  server.registerTool(
    'omni_await',
    {
      description: 'Send a #all message and wait for a reply with inReplyTo=msg_id.',
      inputSchema: z.object({
        content: z.string(),
        timeout: z.number().optional().describe('Max wait in ms (default 30000)'),
      }),
    },
    async (args) => {
      const { content, timeout } = args as { content: string; timeout?: number };
      const payload = runtime ? buildChatSendPayload(runtime, content, { expectsReply: true }) : null;
      const sent = payload ? sendToOmni(payload) : false;
      if (!sent || !payload)
        return { content: [{ type: 'text' as const, text: 'Not connected to Omni.' }], isError: true };
      const deadline = Date.now() + (timeout ?? 30_000);
      while (Date.now() < deadline) {
        const reply = replyMessages(coordinationFeed, String(payload.msg_id))[0];
        if (reply)
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ msg_id: payload.msg_id, reply }, null, 2) },
            ],
          };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ msg_id: payload.msg_id, reply: null }) }],
      };
    },
  );

  const emit = (payload: Record<string, unknown>, ok: string) => {
    const sent = runtime ? sendToOmni(payload) : false;
    return { content: [{ type: 'text' as const, text: sent ? ok : 'Not connected to Omni.' }] };
  };

  server.registerTool(
    'omni_claim_work',
    {
      description: 'Create a Work Claim for a Repository-relative file, folder, or feature area.',
      inputSchema: z.object({
        path: z.string().describe('Repository-relative path or work area'),
        note: z.string().optional().describe('Short note about the work being claimed'),
      }),
    },
    async (args) => {
      const { path, note } = args as { path: string; note?: string };
      return runtime
        ? emit(buildWorkClaimCreatePayload(runtime, path, note ?? ''), `Claimed ${path}.`)
        : emit({}, '');
    },
  );

  server.registerTool(
    'omni_release_work',
    {
      description: 'Release this Agent Instance’s active Work Claim.',
      inputSchema: z.object({
        path: z.string().describe('Repository-relative path or work area to release'),
      }),
    },
    async (args) => {
      const { path } = args as { path: string };
      return runtime ? emit(buildWorkClaimReleasePayload(runtime, path), `Released ${path}.`) : emit({}, '');
    },
  );

  server.registerTool(
    'omni_create_task',
    {
      description: 'Create a Omni Task Request for another Agent Instance, tag, or #all.',
      inputSchema: z.object({
        title: z.string().describe('Short task title'),
        target: z.string().optional().describe('Task target, e.g. @pi-1, @frontend, or #all'),
        details: z.string().optional(),
        expectedResult: z.string().optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      }),
    },
    async (args) => {
      const task = args as {
        title: string;
        target?: string;
        details?: string;
        expectedResult?: string;
        priority?: TaskPriority;
      };
      return runtime
        ? emit(buildTaskCreatePayload(runtime, task), 'Task Request sent to Omni.')
        : emit({}, '');
    },
  );

  const lifecycleTool = (
    name: string,
    action: TaskLifecycleAction,
    ok: (id: string) => string,
    withReason: boolean,
    withSummary: boolean,
  ) => {
    server.registerTool(
      name,
      {
        description: `Mark a Omni Task Request ${action}.`,
        inputSchema: z.object({
          humanId: z.string().describe('Human-readable task ID, e.g. TASK-1'),
          ...(withReason ? { reason: z.string().optional() } : {}),
          ...(withSummary ? { resultSummary: z.string().optional() } : {}),
        }),
      },
      async (args) => {
        const params = args as { humanId: string; reason?: string; resultSummary?: string };
        return runtime
          ? emit(buildTaskLifecyclePayload(action, runtime, params), ok(params.humanId))
          : emit({}, '');
      },
    );
  };

  lifecycleTool('omni_accept_task', 'accept', (id) => `Accepted ${id}.`, false, false);
  lifecycleTool('omni_reject_task', 'reject', (id) => `Rejected ${id}.`, true, false);
  lifecycleTool('omni_block_task', 'block', (id) => `Blocked ${id}.`, true, false);
  lifecycleTool('omni_fail_task', 'fail', (id) => `Failed ${id}.`, true, false);
  lifecycleTool('omni_complete_task', 'complete', (id) => `Completed ${id}.`, false, true);

  await server.connect(new StdioServerTransport());
}

async function main(): Promise<void> {
  const runtime = readRuntimeConfig();
  if (runtime) connectToOmni(runtime);
  await startMcpServer(runtime);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[omni-mcp-connector] fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
