# AGENTS.md

Be extremely concise. Sacrifice grammar for the sake of concision.

This is the canonical guidance file for AI coding agents (opencode, Codex, Pi, Gemini, Claude Code) working in this repository. `CLAUDE.md` is a thin pointer to this file. When you change project guidance, edit this file.

## What Omni is

A **local-only** visual coordination hub for AI CLI agents (Pi, Claude Code, Codex, Gemini, opencode) working on the same Repository. The Dev launches Agent Instances from one dashboard, sees their Presence, and watches them coordinate. Omni is the hub every message routes through — it is *not* a code editor and *not* a work inspector. Runs on `127.0.0.1` with a per-run session token; no cloud, no auth, no multi-user.

The stack is TypeScript end to end: a Node server (tsx/tsc, CommonJS) and a React 19 + Vite SPA. Interactive launch has **two backends** (ADR 0007), chosen per Agent Instance, tmux default (Terminal.app still selectable): `InstanceManager` either drives **Terminal.app** via `osascript` (AppleScript launch + clipboard paste, macOS-GUI-only) or **tmux** (`new-window`/`send-keys`/`kill-window`; one session per harness namespaced per Repository — `omni-<harness>-<repohash>` — one window per agent; works over SSH/headless). Both run the same `script(1)` command and share the log-tail/exit machinery — only launch/send/remove differ. Topology is decoupled from routing: the hub never talks through tmux, so grouping never affects A2A/cross-harness comms (ADR 0005).

## Commands

```bash
npm run dev            # build client, then run server (tsx) — serves dashboard at http://127.0.0.1:3456/?token=...
npm run dev:server     # server only (tsx, no client rebuild)
npm run dev:client     # vite dev server for the client only

npm run build          # build:server (tsc → dist/) + build:client (vite → dist/client/)

npm test               # vitest run — the fast unit/integration suite (node + jsdom)
npm run test:watch     # vitest in watch mode
npm run test:e2e       # playwright (e2e/)
npm run test:all       # vitest run && playwright test
```

Run a single test:

```bash
npx vitest run src/domain/chat-service.test.ts          # one file
npx vitest run -t "name fragment"                        # by test name
```

Lint/format is **Biome** (`npm run lint`, `npm run lint:fix`, `npm run format`; config in `biome.json`). TypeScript is `strict`; `npm run build:server` (tsc) is the type-check gate. CI (`.github/workflows/ci.yml`) runs Biome + tsc + vitest + client build on every push/PR — keep all four green. A11y rules are downgraded to warnings (known backlog); don't add new warnings.

### Test environment split
Vitest defaults to the **node** environment (fast server suite). React component tests opt into jsdom **per file** with a `// @vitest-environment jsdom` docblock at the top — don't switch the global environment. `e2e/`, `node_modules/`, and `tmp/` are excluded from vitest (Playwright owns `e2e/`). Most modules ship next to a `.test.ts(x)` sibling; match that convention for new code.

> The Playwright e2e suite binds `127.0.0.1:3456` and is **blocked whenever a live Omni dev server is running** on that port. Unit-test new server behaviour through the intake modules (below) rather than relying on e2e as the only safety net. There is one known-flaky e2e snapshot test.

## Architecture

This is a **ports-and-adapters (hexagonal)** codebase. The dependency rule is enforced by directory, and the dependency graph (`graphify-out/`) reports **no import cycles** — keep it that way.

- `src/domain/` — pure business logic, no I/O. `ChatService` (Hub-Routed Messages, agents, groups, relay to terminal agents), `CoordinationService` (Task Request lifecycle, Work Claims, Startup Briefing generation — the "coordination home"), `harness-registry` (per-harness Launch Recipe + delivery capability), `ansi-strip`.
- `src/ports/` — interfaces the domain depends on: `AgentLifecyclePort`, `ContextPersistencePort`, `MessageTransportPort`. Domain talks to these, never to concrete adapters.
- `src/engine/` — `MessageRouter`: pure @mention/tag/group/all resolution (message → target agents). No I/O; injected into `ChatService`.
- `src/manager/` — `InstanceManager` (child-process lifecycle; interactive backends Terminal.app via `osascript` **or** tmux per ADR 0007; `stream-json` parsing of headless stdout; `sendInput` writes to stdin/terminal/tmux). Behind `AgentLifecyclePort`.
- `src/store/` — `ContextStore` (better-sqlite3). Behind `ContextPersistencePort`.
- `src/scanner/` — `RepoScanner` (Repository browser).
- No active `src/adapters/` path today; the old SSE `/mcp` coordination route is retired/anonymous per ADR 0005 and must not be reintroduced as a coordination path.
- `src/infra/` — plain helper modules with no port (file writers, connector-path resolvers, harness-health scanners, MCP connector helpers, `runtime-config`). `project-memory-store` writes `.omni/*.md`. Deliberately **not** behind a port (ADR 0003) — the domain reaches it via an injected writer function justified by its test fake, not by swappability.
- `src/server/server.ts` — **the composition root.** Wires every concrete adapter into the domain and owns the WebSocket/HTTP edge. This is where new dependencies get injected.
- `client/` — React 19 + Vite dashboard (separate `vite.config.ts`, builds to `dist/client/`). Connects to the server over the same WebSocket. Server build (tsc) and client build (vite) are independent.

When adding logic, push it into a domain module behind a port. Only widen a port or add an injected function at the composition root — don't let adapters call each other directly.

### Inbound WebSocket message routing
`server.ts`'s `ws.on('message')` dispatches in a fixed order, and the split is an intentional architectural decision (ADR 0004):

1. **Inline at the composition root** — `ping`, `connector.register`, `select-repo`. These are edge/lifecycle concerns that orchestrate server-wide state (store re-init, fan-out snapshots) and must stay inline.
2. **`CoordinationSignalIntake`** — structured Coordination Signals from agents (chat, Work Claims, Task Request lifecycle). Carries real logic (owner fallbacks, status mapping, path validation). This is the **deep** side.
3. **`DevCommandIntake`** — dashboard commands from the Dev (agent lifecycle, tags, groups, Agent Templates, Project Memory file edits, directory scans, handoff). A **shallow router** by design — thin delegations to `ChatService`. Don't grow deep logic here; move it into a domain module.

### Frontend data flow (one-way)
`useOmniConnection` (`client/src/use-omni-connection.ts`) owns the single WebSocket. Each inbound message `dispatch`es into the **pure** `serverStateReducer` (`client/src/server-state.ts`) → next `ServerState` → `App.tsx` → presentational cards (`ChatPanel`, `TaskCard`, `AgentCard`, `WorkClaimCard`, …). Outbound is a single `send(payload)`. The reducer owns **only** data the server writes (it's the unit-tested heart, node env, no DOM). Non-pure UI effects (modal toggles, mode changes, the scan-dir follow-up) stay in the component via the `onServerMessage` callback — don't put socket or side-effect logic in the reducer.

### One coordination model (ADR 0005 — important)
Every agent — Pi included — joins as a **Connector over the identity-bound WebSocket** (`connector.register` binds the per-run runtime token → `agent.id`/`name`). Presence, fan-out, and Coordination Signal attribution all key off that Session. **The domain never branches on a harness *name*.** Adding harness #N is a `harness-registry` entry + a delivery-capability declaration — coordination code is untouched. The SSE `McpServerAdapter` (`/mcp`) is a **retired/anonymous** path; do not route coordination through it or point agents at `/mcp`.

### Inbound delivery — what's actually built (ADR 0006 is the wider design)
MCP is pull-not-push, so waking an agent with a peer's message depends on the harness. The **registry models two delivery modes** (`HarnessDelivery` in `harness-registry.ts`):

- **`native-push`** — the harness's own connector wakes the agent (e.g. Pi's extension). Currently: **`pi`**.
- **`terminal-paste`** — the harness connects over MCP (pull-only) and can't be woken by a tool, so Omni relays the peer's message *into the agent's terminal* via `ChatService.relayCoordinationToTerminalAgents` → `InstanceManager` (macOS `osascript` paste, or `sendInput`/stdin). Currently: **`claude-code`**, **`cat`**.

This is the active, $0-API path: pasting into real subscription terminal agents rather than calling an API. ADR 0006 describes a richer future (capability negotiation, push-inject, stream-json reply auto-capture, a `MAX_HOPS=5` chain cap via `OMNI_MAX_HOPS`). The current source already has the registry delivery seam (`native-push`/`terminal-paste`), persisted `hops`, and hop-cap enforcement/defaulting in `ChatService` + `CoordinationSignalIntake`; fuller `deliveryCapabilities` negotiation and SDK/headless push remain deferred behind that seam.

### Where do I change X?
| Goal | Touch | Notes |
| --- | --- | --- |
| New **Dev dashboard command** | `src/server/dev-command-intake.ts` (+ a `ChatService` method for real logic) | keep the intake shallow |
| New **agent Coordination Signal** | `src/server/coordination-signal-intake.ts` + `src/domain/coordination-service.ts` | the deep side |
| Support a **new harness** | `src/domain/harness-registry.ts` (registry entry + `delivery`) | one place; coordination code untouched |
| New **interactive launch backend** | `src/manager/instance-manager.ts` (+ `CreateOptions` flag, thread through `ChatService`→`DevCommandIntake`→`LaunchModal`) | reuse `attachLogPolling`; coordination code stays backend-agnostic (ADR 0007) |
| New **persisted field** | `src/store/context-store.ts` + `src/ports/context-persistence.ts` + `src/types.ts` + `client/src/server-state.ts` | keep port + client type in sync |
| New **broadcast → UI** | a `serverStateReducer` case in `client/src/server-state.ts` + the consuming component | pure-data only in the reducer |
| New **`.omni/` file** | `src/infra/project-memory-store.ts` | plain helper, no port (ADR 0003) |

## Anti-slop guardrails

Docs are load-bearing here. Update `AGENTS.md`, `CONTEXT.md`, and relevant ADR/docs in the **same commit** as behaviour changes; stale guidance causes agents to implement against fiction. Keep the `Where do I change X?` table and ADR current-state notes accurate.

Watch the growing files: `src/manager/instance-manager.ts` (668 lines), `src/domain/chat-service.ts` (624), `client/src/App.tsx` (550). They are not broken, but they are the highest-risk edit zones for agents. Before adding a third interactive launch backend, split Terminal.app and tmux backend logic behind the existing lifecycle port instead of growing `InstanceManager` further.

When fixing a bug, check analogous nearby paths in the same edit (example class: command escaping vs window-title escaping). Periodically remove retired/dead paths and verify dependencies before pruning (for example, `zod` is currently used by the MCP connector schemas).

## Domain vocabulary (read before naming things)
`CONTEXT.md` at the repo root is the **canonical glossary** — Dev, Agent Instance, Agent Harness, Launch Recipe, Coordination Signal vs Hub-Routed Message, Task Request/Result, Work Claim, Presence, Startup Briefing, Project Memory, Agent Blueprint, Token Budget, etc. Each term lists synonyms to **avoid**. Use the glossary's vocabulary in code, tests, issues, and proposals; if a concept isn't in the glossary, that's a signal you may be inventing language.

## Decisions are binding — read the ADRs
`docs/adr/` records settled architectural decisions with their reasoning (0001 core domain reshape, 0002 React/Vite frontend, 0003 coordination-home seam deferrals, 0004 DevCommandIntake-is-a-router, 0005 one-coordination-model, 0006 delivery negotiation + push-inject, 0007 tmux as a second per-agent interactive launch backend). Several explicitly pre-empt "obvious" refactors (no `ProjectMemoryPort`; Presence stays at the transport edge; `DevCommandIntake` is intentionally shallow; `select-repo` stays inline; SSE is retired). **If your change contradicts an ADR, surface it explicitly** ("Contradicts ADR-000X because…") rather than silently overriding — don't re-litigate a recorded decision as if it were an oversight.

`docs/ARCHITECTURE.md` is the navigation map (system shape, request lifecycles, the dependency-graph tooling under `graphify-out/`). Read it when you need to trace a flow end to end.

## Storage & runtime
- **Project Memory** lives in `<repo>/.omni/` (gitignored): SQLite (`data.db`) for structured state + Markdown/JSON for human/agent-readable memory (Startup Briefings, task summaries, Agent Context). `select-repo` re-inits the store against the selected Repository's `.omni/`.
- Global app data: `~/.omni/`. Env overrides in code: `PORT`, `OMNI_DB`, `OMNI_SESSION_TOKEN`, `OMNI_MAX_HOPS`.
- Module system is CommonJS (`"type": "commonjs"`); server compiles via tsc, client via Vite.
- Interactive launch: Terminal.app backend is macOS-GUI-only (AppleScript via `osascript`); the tmux backend (ADR 0007) requires `tmux` on `PATH` (`brew install tmux`) and works headless/over SSH. No backend-availability probe yet — the launch picker offers tmux unconditionally.

## Issue tracker
Issues are local Markdown under `.scratch/<feature>/NNN-slug.md` (gitignored working notes) with frontmatter (`title`, `labels`, `status`, `blocks`). Triage labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md`.
