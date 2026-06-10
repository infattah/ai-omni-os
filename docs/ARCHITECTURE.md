# Omni Architecture — Navigation Map

A map of *where the code lives and how a request flows through it*. Omni is a
**local-only** visual coordination hub for AI CLI agents working on one Repository: the Dev
launches Agent Instances from a dashboard, sees their Presence, and watches them coordinate.
It is **not** a code editor and **not** a work inspector — it is the hub every message routes
through.

This is the navigation layer. The other two doc layers:

| Doc | Answers |
| --- | --- |
| **`CONTEXT.md`** (repo root) | *Vocabulary* — what each domain term means (Dev, Agent Instance, Coordination Signal vs Hub-Routed Message, Task Request, Presence, Project Memory…). Use its words; it lists synonyms to avoid. |
| **`docs/adr/`** | *Decisions* — why the seams are where they are. Binding; if you contradict one, say so explicitly. |
| **this file** | *Where & how* — entry points, the end-to-end flow, and "where do I change X". |

Build/test/run commands and the agent operating rules live in **`CLAUDE.md`**.

## System shape

```
                         Browser (React 19 SPA, client/)
                                   │  WebSocket (token-authed, one socket)
                                   ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │  src/server/server.ts  — COMPOSITION ROOT (wires everything)       │
   │  inbound dispatch:  ping / connector.register / select-repo        │
   │                     → CoordinationSignalIntake (agent signals)     │
   │                     → DevCommandIntake (dashboard commands)        │
   └───────────────┬───────────────────────────────┬───────────────────┘
                   │ domain (pure, no I/O)          │ infra (port-less helpers)
                   ▼                                ▼
        ChatService   CoordinationService     project-memory-store → <repo>/.omni/*.md
        MessageRouter  harness-registry        agent-template-store, *-harness-health, runtime-config
                   │ ports                          
                   ▼                                
     AgentLifecyclePort → InstanceManager (child procs, stream-json)
     ContextPersistencePort → ContextStore (SQLite, better-sqlite3)
     MessageTransportPort → broadcast() back to all browsers

   Agent Instances (separate CLI processes: Pi, Claude Code, Codex, …)
     join the hub as Connectors over the SAME identity-bound WebSocket.
   ( /mcp SSE — McpServerAdapter — is a RETIRED/anonymous path, ADR 0005; not a coordination route )
```

This is a **ports-and-adapters (hexagonal)** codebase; the dependency rule is enforced by
directory. The graph (`graphify-out/`) reports **no import cycles** — keep it that way.

## Core abstractions (most-connected nodes in the dependency graph)

`ChatService` · `ContextStore` · `AgentInstance` · `MessageRouter` · `TaskRequest` ·
`AgentGroup` · the **Server Composition Root** (`server.ts`). If you're new, read those first.

## Directory map

| Path | Responsibility | Key files | Behind a port? |
| --- | --- | --- | --- |
| `src/domain/` | Pure business logic, no I/O | `chat-service.ts` (Hub-Routed Messages, agents, groups), `coordination-service.ts` (Task lifecycle, Work Claims, Startup Briefing — the "coordination home"), `harness-registry.ts` (Launch Recipe + delivery per harness), `ansi-strip.ts` | depends on ports |
| `src/ports/` | Interfaces the domain depends on | `agent-lifecycle.ts`, `context-persistence.ts`, `message-transport.ts` | — |
| `src/manager/` | Agent process lifecycle | `instance-manager.ts` (child procs, `stream-json.ts`, dedup/circuit-breaker) | `AgentLifecyclePort` |
| `src/store/` | Persistence | `context-store.ts` (better-sqlite3) | `ContextPersistencePort` |
| `src/engine/` | `@mention`/channel routing | `router.ts` (`MessageRouter`) | — |
| `src/scanner/` | Repository browser | `repo-scanner.ts` | — |
| `src/adapters/` | SSE MCP server | `mcp-server.ts` — **retired/anonymous** path (ADR 0005) | — |
| `src/infra/` | Port-less helpers (justified by test fakes, not swappability — ADR 0003) | `project-memory-store.ts` (`.omni/*.md`), `agent-template-store.ts`, `general-capability-store.ts` / `pi-harness-health.ts`, `omni-mcp-connector/`, `pi-connector-extension/`, `runtime-config.ts` | — |
| `src/server/` | Composition root + WS edge | `server.ts`, `coordination-signal-intake.ts` (deep), `dev-command-intake.ts` (shallow router) | — |
| `client/src/` | React 19 SPA dashboard | `use-omni-connection.ts`, `server-state.ts`, `App.tsx`, ~25 components each with a `.test.tsx` | — |

## Inbound WebSocket dispatch (`server.ts`)

Every browser/agent message hits `ws.on('message')` and is dispatched in a fixed order
(rationale: **ADR 0004**):

1. **Inline edge commands** — `ping`, `connector.register`, `select-repo`. Lifecycle /
   server-wide orchestration (store re-init, snapshot fan-out). Stay inline by design.
2. **`CoordinationSignalIntake.handle()`** — structured Coordination Signals *from agents*
   (chat, Work Claims, Task Request lifecycle). A **deep** module (owner fallbacks, status
   mapping, path validation).
3. **`DevCommandIntake.handle()`** — dashboard commands *from the Dev* (agent lifecycle, tags,
   groups, Agent Templates, Project Memory edits, directory scans, handoff). A **shallow
   router** by design — thin delegations to `ChatService`. Don't grow deep logic here.

## Frontend data flow (one-way)

`useOmniConnection` (`client/src/use-omni-connection.ts`) owns the WebSocket. On each
inbound message it `dispatch`es into the **pure** `serverStateReducer`
(`client/src/server-state.ts`) → produces the next `ServerState` → `App.tsx` → presentational
cards (`ChatPanel`, `TaskCard`, `AgentCard`, `WorkClaimCard`, …). Outbound is a single
`send(payload)`.

The reducer owns **only** data the server writes (it's the unit-tested heart, node env, no
DOM). Non-pure UI effects — modal toggles, mode changes, connection notices, the scan-dir
follow-up — stay in the component via the `onServerMessage` callback. Don't put socket or
side-effect logic in the reducer.

## Request lifecycles (trace these to navigate)

**Dev sends a chat message**
SPA `send({type:'message',…})` → `server.ts` dispatch → `CoordinationSignalIntake` →
`ChatService.sendMessage` → `MessageRouter` resolves `@mentions`/channel →
`ContextStore.saveMessage` + `broadcast('message', …)` → reducer `message` case →
`ChatPanel` renders.

**Agent connects (Discovery)**
Agent child process opens the WS and sends `connector.register` (binds the per-run runtime
token → `agent.id`/`name`) → server sets Presence `connected`, generates + saves a Startup
Briefing, posts an `#all` system message, returns `startup.briefing`. Presence, fan-out, and
signal attribution all key off this Session — **the domain never branches on a harness name**.

**Task Request lifecycle**
`CoordinationService.createTask` → `updateTaskLifecycle` (accept → own → in-progress →
complete) broadcasts `task.changed` (reducer upserts + sorts by `humanId`); on completion
`appendProjectTaskSummary` writes to `<repo>/.omni/`.

**Repository selection**
`select-repo` → `initRepo`: `ensureProjectMemory`, `store.reinit(<repo>/.omni/data.db)`,
`chat.clear()`, restore agents, write MCP configs → `broadcast('state.snapshot', …)` to all
browsers.

## Where do I change X?

| Goal | Touch | Notes |
| --- | --- | --- |
| New **Dev dashboard command** | `src/server/dev-command-intake.ts` (+ a `ChatService` method if real logic) | keep the intake shallow |
| New **agent Coordination Signal** | `src/server/coordination-signal-intake.ts` + `src/domain/coordination-service.ts` | the deep side |
| Support a **new harness** | `src/domain/harness-registry.ts` (registry entry + delivery capability) | one place; coordination code untouched (ADR 0005/0006) |
| New **persisted field** | `src/store/context-store.ts` + `src/ports/context-persistence.ts` + `src/types.ts` + `client/src/server-state.ts` | keep the port and the client type in sync |
| New **broadcast → UI** | add a `serverStateReducer` case in `client/src/server-state.ts` + the consuming component | pure-data only in the reducer |
| New **dashboard screen** | a `client/src/*.tsx` component (+ `.test.tsx`) wired into `App.tsx` | |
| New **`.omni/` file** | `src/infra/project-memory-store.ts` | plain helper, no port (ADR 0003) |

## Invariants to respect

- **No import cycles** — the graph reports none; don't introduce one.
- **The domain never branches on a harness *name*.** Add capabilities to `harness-registry`,
  not `if (harness === 'claude')` in domain code. (ADR 0005/0006)
- **Don't route coordination through `/mcp`** — the SSE `McpServerAdapter` is retired/anonymous.
  Agents coordinate over the identity-bound connector WebSocket. (ADR 0005)
- **`DevCommandIntake` stays shallow**; deep logic belongs in a domain module. (ADR 0004)
- **Presence stays at the transport edge**, and `.omni/` writes stay in a plain helper —
  both deliberately *not* behind a port. (ADR 0003)

## Storage & runtime

- **Project Memory**: `<repo>/.omni/` (gitignored) — SQLite `data.db` (structured state) +
  Markdown/JSON (Startup Briefings, task summaries, Agent Context).
- **Global app data**: `~/.omni/`.
- **Env overrides**: `PORT`, `OMNI_DB`, `OMNI_SESSION_TOKEN`, `OMNI_MAX_HOPS`.

## The dependency graph as a tool

This map was derived against `graphify-out/`. To re-explore or re-derive after large changes:

- `graphify-out/GRAPH_REPORT.md` — god nodes, communities, surprising connections, **import
  cycles** (currently "None detected").
- `graphify-out/graph.html` — open in a browser for an interactive view.

Last graph run: 2026-06-01 (118 files). Re-run graphify if the structure has drifted.
