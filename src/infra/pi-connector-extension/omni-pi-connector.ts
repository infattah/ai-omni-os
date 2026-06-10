/**
 * Omni Pi connector extension.
 *
 * Runtime contract:
 * - Omni launches Pi with OMNI_RUNTIME_CONFIG pointing to a per-run JSON file.
 * - The JSON file contains local server URL, per-run token, Repository path, and Agent identity.
 * - This extension registers Discovery and keeps a local Coordination Feed queue.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { Type } from 'typebox';

interface CoordinationMessage {
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

interface RuntimeConfig {
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

function readRuntimeConfig(): RuntimeConfig | null {
  const configPath = process.env.OMNI_RUNTIME_CONFIG;
  if (!configPath) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as RuntimeConfig;
}

function connectorWebSocketUrl(runtime: RuntimeConfig): string {
  const url = new URL(runtime.serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', runtime.sessionToken);
  return url.toString();
}

const coordinationFeed: CoordinationMessage[] = [];
let connectorSocket: any = null;
let startupBriefing = '';
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

function sendToOmni(payload: Record<string, unknown>): boolean {
  if (!connectorSocket || connectorSocket.readyState !== 1) return false;
  connectorSocket.send(JSON.stringify(payload));
  return true;
}

function sendHeartbeat(
  runtime: RuntimeConfig,
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

function isRelevantCoordinationMessage(message: CoordinationMessage, runtime: RuntimeConfig): boolean {
  if (message.sender === runtime.agent.name) return false;
  if (message.channelId === '#all') return true;
  return message.channelId === `@${runtime.agent.name}`;
}

function promptForCoordinationMessage(message: CoordinationMessage, runtime: RuntimeConfig): string {
  const scope = message.channelId === '#all' ? '#all' : `your direct channel ${message.channelId}`;
  return [
    `Omni message received in ${scope} from ${message.sender}:`,
    '',
    message.content,
    '',
    `msg_id: ${message.msg_id}`,
    '',
    'Respond through Omni when appropriate. Use omni_send for #all responses and mention who you are replying to for direct-channel context.',
  ].join('\n');
}

function connectToOmni(runtime: RuntimeConfig, pi: any): void {
  connectorSocket = new WebSocket(connectorWebSocketUrl(runtime));
  connectorSocket.addEventListener('open', () => {
    connectorSocket.send(
      JSON.stringify({
        type: 'connector.register',
        agentId: runtime.agent.id,
        agentName: runtime.agent.name,
        harness: runtime.agent.harness,
        tags: [],
      }),
    );
    sendHeartbeat(runtime);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => sendHeartbeat(runtime), 10_000);
  });
  connectorSocket.addEventListener('message', (event: any) => {
    const message = JSON.parse(String(event.data));
    if (message.type === 'coordination.message') {
      const coordinationMessage = message as CoordinationMessage;
      coordinationFeed.push(coordinationMessage);
      coordinationFeed.splice(0, Math.max(0, coordinationFeed.length - 100));
      if (isRelevantCoordinationMessage(coordinationMessage, runtime)) {
        pi.sendUserMessage?.(promptForCoordinationMessage(coordinationMessage, runtime), {
          deliverAs: 'followUp',
        });
      }
    }
    if (message.type === 'startup.briefing' && typeof message.content === 'string') {
      startupBriefing = message.content;
    }
  });
  connectorSocket.addEventListener('close', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  });
}

export default function omniPiConnector(pi: any) {
  const runtime = readRuntimeConfig();

  pi.on?.('session_start', async (_event: unknown, ctx: any) => {
    if (!runtime) return;

    connectToOmni(runtime, pi);

    ctx.addSystemReminder?.(
      [
        'You are connected to Omni, a local coordination hub.',
        `Agent Instance: ${runtime.agent.name}`,
        `Repository: ${runtime.repositoryPath}`,
        'Use omni_get to read coordination messages from Dev and other agents.',
        'Use omni_send to send explicit coordination messages back to Omni.',
      ].join('\n'),
    );
  });

  pi.registerTool?.({
    name: 'omni_startup_briefing',
    label: 'Omni Startup Briefing',
    description: 'Read the private Startup Briefing sent by Omni to this Agent Instance.',
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{ type: 'text', text: startupBriefing || 'No Startup Briefing received yet.' }],
        details: { received: Boolean(startupBriefing) },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_get',
    label: 'Omni Get',
    description: 'Read one message by msg_id, replies to a msg_id, or recent feed messages.',
    parameters: Type.Object({
      msg_id: Type.Optional(Type.String()),
      repliesTo: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number({ description: 'Maximum number of feed messages to return.' })),
    }),
    async execute(_toolCallId: string, params: { msg_id?: string; repliesTo?: string; limit?: number }) {
      const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
      if (params.msg_id) {
        const message = coordinationFeed.find((m) => m.msg_id === params.msg_id) ?? null;
        return {
          content: [{ type: 'text', text: JSON.stringify(message, null, 2) }],
          details: { count: message ? 1 : 0 },
        };
      }
      const messages = params.repliesTo
        ? coordinationFeed.filter((m) => m.inReplyTo === params.repliesTo)
        : coordinationFeed.slice(-limit);
      return {
        content: [{ type: 'text', text: JSON.stringify({ messages }, null, 2) }],
        details: { count: messages.length },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_feed',
    label: 'Omni Feed',
    description: 'Alias for omni_get.',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: 'Maximum number of feed messages to return.' })),
    }),
    async execute(_toolCallId: string, params: { limit?: number }) {
      const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
      const messages = coordinationFeed.slice(-limit);
      return {
        content: [{ type: 'text', text: JSON.stringify({ messages }, null, 2) }],
        details: { count: messages.length },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_claim_work',
    label: 'Omni Claim Work',
    description:
      'Create an explicit Work Claim for a Repository-relative file, folder, feature area, or Task Request.',
    parameters: Type.Object({
      path: Type.String({ description: 'Repository-relative path or work area.' }),
      note: Type.Optional(Type.String({ description: 'Short note about the work being claimed.' })),
    }),
    async execute(_toolCallId: string, params: { path: string; note?: string }) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.workClaim.create',
            agentName: runtime.agent.name,
            path: params.path,
            note: params.note || '',
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? `Claimed ${params.path}.` : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_release_work',
    label: 'Omni Release Work',
    description: 'Release this Agent Instance’s active Work Claim.',
    parameters: Type.Object({
      path: Type.String({ description: 'Repository-relative path or work area to release.' }),
    }),
    async execute(_toolCallId: string, params: { path: string }) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.workClaim.release',
            agentName: runtime.agent.name,
            path: params.path,
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? `Released ${params.path}.` : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_create_task',
    label: 'Omni Create Task',
    description: 'Create an explicit Omni Task Request for another Agent Instance, tag, or #all.',
    parameters: Type.Object({
      title: Type.String({ description: 'Short task title.' }),
      target: Type.Optional(
        Type.String({ description: 'Task target, such as @pi-coder, @frontend, or #all.' }),
      ),
      details: Type.Optional(Type.String({ description: 'Task details.' })),
      expectedResult: Type.Optional(Type.String({ description: 'Expected result.' })),
      priority: Type.Optional(
        Type.Union([
          Type.Literal('low'),
          Type.Literal('normal'),
          Type.Literal('high'),
          Type.Literal('urgent'),
        ]),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: {
        title: string;
        target?: string;
        details?: string;
        expectedResult?: string;
        priority?: 'low' | 'normal' | 'high' | 'urgent';
      },
    ) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.task.create',
            requester: runtime.agent.name,
            target: params.target || '#all',
            title: params.title,
            details: params.details || '',
            expectedResult: params.expectedResult || '',
            priority: params.priority || 'normal',
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? 'Task Request sent to Omni.' : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_accept_task',
    label: 'Omni Accept Task',
    description: 'Accept ownership of a Omni Task Request.',
    parameters: Type.Object({
      humanId: Type.String({ description: 'Human-readable task ID, such as TASK-1.' }),
    }),
    async execute(_toolCallId: string, params: { humanId: string }) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.task.accept',
            humanId: params.humanId,
            owner: runtime.agent.name,
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? `Accepted ${params.humanId}.` : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_reject_task',
    label: 'Omni Reject Task',
    description: 'Reject a Omni Task Request with a reason.',
    parameters: Type.Object({
      humanId: Type.String({ description: 'Human-readable task ID, such as TASK-1.' }),
      reason: Type.Optional(Type.String({ description: 'Reason for rejecting the task.' })),
    }),
    async execute(_toolCallId: string, params: { humanId: string; reason?: string }) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.task.reject',
            humanId: params.humanId,
            owner: runtime.agent.name,
            reason: params.reason || '',
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? `Rejected ${params.humanId}.` : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_block_task',
    label: 'Omni Block Task',
    description: 'Mark a Omni Task Request blocked with a reason.',
    parameters: Type.Object({
      humanId: Type.String({ description: 'Human-readable task ID, such as TASK-1.' }),
      reason: Type.Optional(Type.String({ description: 'Reason the task is blocked.' })),
    }),
    async execute(_toolCallId: string, params: { humanId: string; reason?: string }) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.task.block',
            humanId: params.humanId,
            owner: runtime.agent.name,
            reason: params.reason || '',
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? `Blocked ${params.humanId}.` : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_fail_task',
    label: 'Omni Fail Task',
    description: 'Mark a Omni Task Request failed with a reason.',
    parameters: Type.Object({
      humanId: Type.String({ description: 'Human-readable task ID, such as TASK-1.' }),
      reason: Type.Optional(Type.String({ description: 'Reason the task failed.' })),
    }),
    async execute(_toolCallId: string, params: { humanId: string; reason?: string }) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.task.fail',
            humanId: params.humanId,
            owner: runtime.agent.name,
            reason: params.reason || '',
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? `Failed ${params.humanId}.` : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_complete_task',
    label: 'Omni Complete Task',
    description: 'Mark a Omni Task Request completed.',
    parameters: Type.Object({
      humanId: Type.String({ description: 'Human-readable task ID, such as TASK-1.' }),
      resultSummary: Type.Optional(Type.String({ description: 'Short summary of the result.' })),
    }),
    async execute(_toolCallId: string, params: { humanId: string; resultSummary?: string }) {
      const sent = runtime
        ? sendToOmni({
            type: 'connector.task.complete',
            humanId: params.humanId,
            owner: runtime.agent.name,
            resultSummary: params.resultSummary || '',
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? `Completed ${params.humanId}.` : 'Not connected to Omni.' }],
        details: { sent },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_send',
    label: 'Omni Send',
    description: 'Send a coordination chat message from this Agent Instance to Omni #all.',
    parameters: Type.Object({
      content: Type.String({ description: 'Message content to send to #all.' }),
      inReplyTo: Type.Optional(Type.String({ description: 'Message ID this is replying to.' })),
      expectsReply: Type.Optional(
        Type.Boolean({ description: 'Whether Omni should auto-capture turn-end replies.' }),
      ),
      hops: Type.Optional(Type.Number({ description: 'Reply hop count.' })),
    }),
    async execute(
      _toolCallId: string,
      params: { content: string; inReplyTo?: string; expectsReply?: boolean; hops?: number },
    ) {
      const msg_id = crypto.randomUUID();
      const sent = runtime
        ? sendToOmni({
            type: 'connector.chat.send',
            msg_id,
            channelId: '#all',
            sender: runtime.agent.name,
            content: params.content,
            inReplyTo: params.inReplyTo,
            expectsReply: params.expectsReply ?? false,
            hops: params.hops ?? 0,
          })
        : false;

      return {
        content: [{ type: 'text', text: sent ? JSON.stringify({ msg_id }) : 'Not connected to Omni.' }],
        details: { sent, msg_id: sent ? msg_id : undefined },
      };
    },
  });

  pi.registerTool?.({
    name: 'omni_await',
    label: 'Omni Await',
    description: 'Send a #all message and wait for a reply with inReplyTo=msg_id.',
    parameters: Type.Object({
      content: Type.String({ description: 'Message content to send to #all.' }),
      timeout: Type.Optional(Type.Number({ description: 'Max wait in ms.' })),
    }),
    async execute(_toolCallId: string, params: { content: string; timeout?: number }) {
      const msg_id = crypto.randomUUID();
      const sent = runtime
        ? sendToOmni({
            type: 'connector.chat.send',
            msg_id,
            channelId: '#all',
            sender: runtime.agent.name,
            content: params.content,
            expectsReply: true,
            hops: 0,
          })
        : false;
      if (!sent) return { content: [{ type: 'text', text: 'Not connected to Omni.' }], details: { sent } };
      const deadline = Date.now() + (params.timeout ?? 30_000);
      while (Date.now() < deadline) {
        const reply = coordinationFeed.find((m) => m.inReplyTo === msg_id) ?? null;
        if (reply)
          return {
            content: [{ type: 'text', text: JSON.stringify({ msg_id, reply }, null, 2) }],
            details: { sent, msg_id },
          };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ msg_id, reply: null }) }],
        details: { sent, msg_id },
      };
    },
  });
}
