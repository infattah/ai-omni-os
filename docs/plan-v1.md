# Omni v1 Implementation Plan

## Product goal

Omni v1 is a local browser dashboard for coordinating multiple AI CLI agents working on one Repository. The first supported Agent Harness is Pi. The Dev can create multiple Pi Agent Instances, see their coordination signals, send messages, create tracked tasks, and resume previous agents from local Project Memory.

Omni is a coordination hub, not a code editor and not a work inspector. Raw agent work stays in visible terminal windows. Omni stores and displays explicit coordination data only.

## V1 scope

### Harness support

V1 supports Pi only.

Future rollout order:

1. Pi
2. opencode
3. Codex
4. Claude Code
5. Gemini CLI

Unsupported harnesses may appear in the UI as disabled/coming soon.

### Core v1 capabilities

- Select one active Repository per server session
- Ensure `<repo>/.omni/` is gitignored
- Create multiple unique Pi Agent Instances
- Open visible macOS Terminal windows for Pi agents
- Launch Pi using a dedicated Omni Pi connector extension
- Use hub-routed Cross-Agent Communication
- Show `#all` chat and `@agentName` direct messages
- Track Presence without token-heavy polling
- Support explicit Task Requests and Task Results
- Support explicit Work Claims
- Store Project Memory in `.omni/`
- Resume previous Agent Instances from Project Memory
- Keep Agent Context files visible/editable in dashboard
- Generate Startup Briefings from Project Memory
- Keep structured event log in SQLite
- Show a simple activity feed separate from chat
- Support multiple local browser tabs for same Dev
- Use localhost + per-run session token
- Add a small Pi-only foundation for Harness Health and per-Agent Pi Harness Attachments so Omni can warn about globally loaded Pi capabilities and protect Token Budget

## V1 non-goals

- No opencode/Codex/Claude/Gemini support yet
- No true network peer-to-peer between agents
- No cloud sync
- No multi-user collaboration
- No raw terminal output copied into Omni
- No file locking
- No desktop app packaging
- No headless agents
- No groups in v1
- No natural-language task parser in v1
- No deadlines in v1
- No file uploads/screenshots
- No encryption in v1
- No search in first vertical slice
- No team templates
- No full Agent Marketplace in v1
- No full Agent Blueprint workflow in v1
- No cross-harness Harness Attachment management in v1

## Architecture decisions

See ADRs:

- `docs/adr/0001-reshape-core-domain-with-typescript.md`
- `docs/adr/0002-react-vite-typescript-frontend.md`

### Tech stack

Backend:

- Node.js
- TypeScript
- built-in HTTP server
- `ws` WebSocket server
- `better-sqlite3`

Frontend:

- React
- Vite
- TypeScript

Terminal launching:

- Terminal launcher interface
- macOS Terminal implementation first
- visible terminal windows only in v1

## Core domain model

### Repository

One active Repository per Omni server session. Project Memory lives under:

```txt
<repo>/.omni/
```

Switching Repository:

1. Confirm if active agents exist
2. Offer:
   - save agent handoffs then switch
   - switch immediately
   - cancel
3. Stop/disconnect previous Repository agents
4. Open new Repository Project Memory
5. Show previous agents/tasks/history for new Repository

### Project Memory

Hybrid storage:

```txt
.omni/data.db                  structured state
.omni/agents/<agent>.md        Agent Context
.omni/summaries/project.md     project summary
.omni/briefings/*.md           saved Startup Briefings
.omni/config.json              project Omni config
```

All `.omni/` content is private and gitignored in v1.

Global Omni memory should remain minimal: recent Repository paths, UI prefs, global Launch Recipe overrides, and later global Agent Blueprints/Harness Attachment registry entries.

### Agent Instance

Each Agent Instance has:

- internal UUID
- unique Repository-local name
- Agent Harness
- optional tags
- purpose/responsibilities/expertise
- Agent Context
- Presence
- lifecycle status

Multiple agents may do the same type of work, but names/identities must be unique.

Default naming:

- specialised: `pi-planner`, `pi-reviewer`, `pi-tester-2`
- general: `pi-agent-1`, `pi-agent-2`

### Agent Context

Readable Markdown file in Project Memory.

Contains:

- purpose
- responsibilities
- expertise
- preferred task types
- decisions
- collaboration rules
- resumable memory

Agent Context is seeded from purpose presets, then maintained by the agent at meaningful lifecycle changes. Dev can edit it in dashboard.

Purpose presets:

- general
- planner
- coder
- reviewer
- tester
- debugger
- documenter

Presets seed context only. They do not change the Collaboration Contract.

### Launch Recipe

Each Agent Harness has a Launch Recipe:

- command
- args
- environment variables
- working directory
- connection method
- connector capability

Override order:

```txt
built-in defaults
→ global machine overrides
→ Repository-specific overrides
```

Pi v1 uses a dedicated Omni Pi connector extension.

V1 also introduces a small Pi-only Harness Attachment foundation:

- The Omni Pi Connector is required for Omni-managed Pi Agent Instances.
- Omni may warn when global Pi settings appear to load many extensions, skills, MCP servers, tools, or other context-heavy capabilities into every Pi Agent Instance.
- Harness Health is advisory only: Omni warns but does not automatically edit Pi's global configuration.
- Manual cleanup instructions are shown only when the Dev asks for them.
- When possible, Omni should attach selected Pi extensions per Agent Instance at launch instead of requiring all extensions to be globally enabled.
- Selected per-Agent Pi attachments are stored in Project Memory for future resume/launch.

The full Harness Attachment, Agent Blueprint, Project Agent Blueprint, Blueprint Suggestion, and Agent Marketplace model is documented in `docs/harness-attachments-and-blueprints.md` for future development.

Runtime connection uses both:

- environment variable pointing at runtime config
- runtime config file

Long-lived memory stays in `.omni/`; per-run secrets/tokens stay in OS temp storage.

### Collaboration Contract

Every created/resumed/reconnected Agent Instance receives the same Collaboration Contract:

- communicate through Omni hub
- use structured tools for agent-to-agent actions
- use explicit Task Requests
- ask Clarifying Questions when unclear
- use explicit Work Claims
- update Agent Context at meaningful task boundaries
- do not inspect other agents' private terminal/work

## Communication model

### Hub-routed only

All Cross-Agent Communication passes through Omni:

```txt
Agent A → Omni → Agent B
```

Agents do not send direct side-channel messages to each other in v1.

### Channels

- `#all`: shared room; all active agents receive messages in Coordination Feed
- `@agentName`: direct message; hidden from unrelated agents, visible to Dev
- `@tag`: tag-targeted open routing; first matching agent to accept owns a Task Request

### Coordination Feed

Agents receive filtered coordination information only:

- `#all` messages
- direct messages
- relevant Task Requests and Task Results
- Presence summaries
- Work Claims

Agents do not receive:

- raw terminal output
- private reasoning
- unrelated private Agent Context
- full Project Memory dump

### Discovery

When an Agent Instance connects:

- activity feed records structured Discovery event
- `#all` gets short human-readable announcement
- agent receives private Startup Briefing

Announcement example:

```txt
pi-planner joined.
Harness: Pi
Purpose: planning
Reachable as @pi-planner
```

### Presence

Presence includes:

```txt
connectionStatus: connected | stale | disconnected
workStatus: idle | busy | blocked | done | unknown
lastSeenAt
currentTaskId?
```

Use connector heartbeat first, terminal/process status as fallback. No LLM-token check-ins.

### Task Request

Explicit tracked work request.

Fields:

- internal UUID
- Repository-local human ID, e.g. `TASK-12`
- requester
- target: agent/tag/#all
- title
- details
- expected result
- priority: low | normal | high | urgent
- lifecycle state
- owner, once accepted
- optional parent task
- file path references

No deadlines in v1.

Task lifecycle:

```txt
requested
accepted
in_progress
blocked
completed
failed
rejected
cancelled
```

Rules:

- Dev and agents can create Task Requests
- Agent-to-agent task creation uses structured connector tools
- Dev creates tasks through UI forms in v1
- Normal chat does not auto-create tasks
- Receiver must accept before owning task
- If unclear but relevant, ask Clarifying Questions before accept/reject/work
- Target can reject with reason
- Group/tag/#all tasks are open; first matching agent to accept owns them
- Same unit of work has one owner
- If work can split, Dev or task owner creates child Task Requests
- Dev can cancel any task
- Owner can cancel/split/fail own task with reason
- Other agents can request cancellation

Task discussion happens in chat/DM and references task ID. No separate task comments in v1.

### Task Result

Task Results report:

- completion
- failure
- partial progress
- important files
- summary
- next steps if any

Task Results are important by default and update project-level structured summaries.

### Work Claim

Explicit declaration that an Agent Instance is working on a file/folder/area/task.

Rules:

- explicit only
- no inference from chat
- no file locking
- shown in activity feed and Work Claims panel, not chat
- structured file paths must resolve inside selected Repository

### Important signals

Dev and agents can mark Coordination Signals important. Dev can override.

Startup Briefings include recent important `#all` messages and important/recent Task Results, not full history.

## Startup Briefing and resume

Startup Briefings are generated fresh and saved as timestamped copies.

Include:

- Repository summary
- shared glossary reference
- agent's own Agent Context
- Collaboration Contract
- available active agents
- current tasks relevant to the agent
- current Work Claims
- recent important messages
- recent important Task Results
- unfinished tasks
- summary of past completed work

Resume Agent means:

- previous terminal is no longer active
- Omni starts a new terminal
- same identity/name/harness/context
- new Startup Briefing generated

Resume is not allowed while same Agent Instance is actively connected to an existing terminal.

If old disconnected terminal may still exist, ask Dev before opening a new terminal.

## Agent lifecycle actions

### Stop Agent

Offer:

- save handoff then stop
- stop now
- cancel

Default: save handoff then stop.

Handoff timeout: 30 seconds.

Handoff is structured Coordination Signal:

- `handoff_requested`
- `handoff_submitted`
- `handoff_timeout`

### Archive Agent

Use when an agent was useful but no longer needed.

- hidden from active/resume view by default
- memory kept
- not available collaborator
- completed Task Results may appear in summaries

### Delete Agent

Use for accidental/bad/unwanted agents.

- removes resumable identity
- removes Agent Context
- keeps historical messages/tasks/results as audit records
- requires confirmation

## Frontend dashboard

Use React + Vite + TypeScript.

Layout:

```txt
Top:
  Repository selector/status
  session/security status

Left:
  Agent Instances
  Presence
  Resume old agents

Center:
  #all chat
  @agentName DMs

Right:
  Task board
  Work Claims
  Agent Context editor
  Activity feed
```

Activity feed is separate from chat.

Show:

- Discovery: activity + short `#all` announcement
- Presence changes: activity only
- Task Requests: task board + activity + relevant chat/feed
- Work Claims: activity + Work Claims panel
- Task Results: chat/feed + task board + activity + summaries

File path references:

- validate inside Repository for structured references
- copy path in v1
- do not open editor in v1

Multiple browser tabs for same Dev synchronize live through WebSocket broadcasts.

## Backend modules target shape

Suggested TypeScript structure:

```txt
src/domain/
  repository.ts
  agent-instance.ts
  agent-context.ts
  launch-recipe.ts
  coordination-signal.ts
  channel.ts
  task-request.ts
  task-result.ts
  presence.ts
  work-claim.ts

src/application/
  select-repository.ts
  create-agent.ts
  resume-agent.ts
  stop-agent.ts
  archive-agent.ts
  delete-agent.ts
  route-message.ts
  create-task.ts
  update-task-lifecycle.ts
  update-presence.ts
  claim-work.ts
  generate-startup-briefing.ts
  update-agent-context.ts

src/infra/
  sqlite-project-memory.ts
  gitignore.ts
  launch-recipes.ts
  macos-terminal-launcher.ts
  pi-connector-extension/
  token.ts
  runtime-config.ts

src/server/
  http-server.ts
  websocket-protocol.ts
  auth.ts

src/client/
  React/Vite app
```

## WebSocket/API events

Initial event families:

### Browser/server

- `repository.select`
- `repository.switch.confirmed`
- `agent.create`
- `agent.resume`
- `agent.stop`
- `agent.archive`
- `agent.delete`
- `chat.send`
- `task.create`
- `task.cancel`
- `workClaim.release`
- `agentContext.update`

### Connector/server

- `connector.register`
- `discovery.send`
- `presence.heartbeat`
- `presence.workStatusChanged`
- `chat.send`
- `task.create`
- `task.accept`
- `task.reject`
- `task.block`
- `task.complete`
- `task.fail`
- `task.cancelOwn`
- `task.split`
- `workClaim.create`
- `workClaim.release`
- `agentContext.update`
- `handoff.submit`

### Server/browser broadcasts

- `state.snapshot`
- `agent.changed`
- `presence.changed`
- `chat.message`
- `task.changed`
- `workClaim.changed`
- `activity.event`
- `agentContext.changed`
- `startupBriefing.generated`

## Security rules

- Bind server to `127.0.0.1`
- Generate per-run session token
- Browser URL includes token
- WebSocket requires token
- Connector requires token/runtime secret
- Reject unknown Agent Harnesses
- Validate Launch Recipes against allowlisted harness IDs
- Structured file path references must stay inside active Repository
- Never store per-run token in long-lived Project Memory
- No auth/multi-user beyond local token in v1

## Implementation phases

### Phase 0 — Stabilize project skeleton

- Add ADRs and this plan
- Add React/Vite/TypeScript frontend setup
- Keep backend TypeScript
- Remove reliance on `client/index.html` as production frontend
- Ensure tests/build commands are clear

### Phase 1 — Project Memory foundation

- Implement `.omni/` initialization
- Safe `.gitignore` update
- SQLite schema for agents/tasks/messages/events/work claims
- Markdown/JSON paths for Agent Context, summaries, briefings
- Timestamped snapshots for context/summary/briefings

### Phase 2 — Domain model and event log

- Implement Agent Instance entity with unique Repository-local names
- Implement Task Request lifecycle
- Implement Coordination Signals
- Implement Presence model
- Implement Work Claims
- Implement structured event log

### Phase 3 — Local server and secure sessions

- Bind to `127.0.0.1`
- Per-run session token
- Browser WebSocket auth
- Connector WebSocket/auth route
- Multi-tab live broadcast

### Phase 4 — Pi Launch Recipe and terminal launcher

- Terminal launcher interface
- macOS Terminal implementation
- Built-in Pi Launch Recipe
- Global and Repository Launch Recipe override loading
- Runtime config generation
- OS temp secret storage

### Phase 5 — Dedicated Pi connector extension

- Pi extension reads runtime config
- Registers with Omni
- Receives Startup Briefing / Collaboration Contract
- Sends Discovery
- Heartbeat Presence
- Structured connector tools:
  - send message
  - create task
  - accept/reject/block/complete/fail task
  - send result
  - claim/release work
  - update Agent Context
  - submit handoff

### Phase 6 — Thin vertical slice UI

- Repository select
- Agent create modal: Pi only enabled, others disabled
- Agent list + Presence
- `#all` chat
- Discovery announcement
- Activity feed
- Project Memory persistence
- Resume list after restart/reselect Repository

### Phase 7 — Task/claims/context UI

- Task board
- Create Task Request form
- Task lifecycle actions
- Work Claims panel
- Agent Context editor
- Project summary editor

### Phase 8 — Resume/handoff/archive/delete flows

- Stop with handoff option
- Repository switch confirmation
- Resume Agent with Startup Briefing
- Archive Agent
- Delete Agent confirmation

### Phase 9 — Hardening and tests

- Security tests for token and localhost binding
- Launch Recipe validation tests
- Path validation tests
- Task lifecycle tests
- Presence heartbeat/stale tests
- Resume briefing tests
- UI e2e tests for thin slice

## Migration from current prototype

Keep/adapt if useful:

- TypeScript project setup
- Node HTTP/WebSocket approach
- `better-sqlite3`
- repository `.omni/` idea
- some router/persistence tests after rewriting expectations

Replace/reshape:

- plain `client/index.html` frontend
- stale Playwright tests
- raw harness spawning from WebSocket input
- global `currentRepo`
- MCP identity model
- terminal output-as-message behaviour
- Date.now IDs
- groups in v1 UI/model

## Key risks

1. Pi connector extension may require deeper Pi API work than expected.
2. Terminal launching via AppleScript can be fragile.
3. Startup Briefing injection must avoid large context dumps.
4. Task model can grow too complex; keep explicit and minimal.
5. Local token/security must be done before exposing terminal launch controls.
6. Agent Context quality depends on agents updating it at task boundaries.
7. Multi-tab synchronization must avoid duplicated actions.

## First tracer bullet

The first usable tracer bullet should prove:

```txt
Dev starts Omni
→ selects Repository
→ .omni/ is initialized and gitignored
→ creates pi-planner
→ visible terminal opens and runs Pi with Omni connector
→ Pi registers and sends Discovery
→ #all shows pi-planner joined
→ Dev sends #all message
→ Pi receives it through Coordination Feed
→ Pi sends a message back through Omni
→ event/message saved in Project Memory
→ browser refresh shows same agent/message state
```
