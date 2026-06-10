# ADR 0004: The Dev Command intake is a router; lifecycle/orchestration commands stay at the edge

## Status

Accepted

## Context

Inbound WebSocket messages to the Omni server fall into two groups: *Coordination Signals* (Task
Requests, Work Claims, chat messages — already owned by `CoordinationSignalIntake`) and *dashboard
commands* from the Dev (agent lifecycle, tags, groups, Agent Templates, Project Memory file edits,
directory scans, handoff). The dashboard commands had been a ~218-line `if (msg.type === …) else if …`
chain inside `createServer`, reachable only through the e2e suite (which is blocked whenever a live
Omni is bound to `127.0.0.1:3456`).

A later architecture review (Step 7 loop) flagged this as a half-built seam: the connector side of the
protocol had a tested home, the Dev side did not. The fix extracted a `DevCommandIntake` module. Two
questions came up while building it that a future review would otherwise re-litigate.

### 1. Is `DevCommandIntake` a deep module?

No. Most of its arms are thin delegations to `ChatService`, which already owns the real logic
(`AgentLifecyclePort` → `InstanceManager`, persistence → `ContextStore`). Applying the deletion test,
deleting the intake would re-scatter ~24-way message routing across the composition root — so it earns
its keep — but the routing is *shallow*: the interface (`handle(ws, msg): boolean`) hides dispatch, not
deep behaviour. `CoordinationSignalIntake` reads as deeper because its arms carry real logic (owner
fallbacks, status mapping, path validation); the Dev side mostly does not.

The honest cost/benefit: we built the module for **locality** (the composition root stops being a
protocol switch) and a **test surface** (the dashboard protocol becomes unit-testable without binding a
live socket). Not for depth. It is named and documented as an intake/router accordingly.

### 2. Which commands stay inline?

`select-repo` is not a command delegation. It re-initialises the persistence store, clears the chat
state, restores agents, and then **broadcasts new state (snapshot, agents, groups) to every connected
client**. That is server-wide orchestration tied to the application lifecycle. Pushing it behind the
command router would require injecting the broadcast/snapshot/`initRepo` wiring into the router — leaking
composition-root concerns across the seam. The same is true of `connector.register` (connection identity
+ Presence + Startup Briefing) and `ping` (transport keepalive).

## Decision

1. **`DevCommandIntake` is a router, not a deep module**, and is labeled as such in code. It owns the
   stateless / single-client dashboard commands: agent lifecycle (create/delete/archive/unarchive/resume,
   tags, groups, history), Agent Templates (list/save/delete), directory + home-dir queries, handoff
   generation, and Project Memory file reads/writes (which go through the `project-memory-store` helper).

2. **Lifecycle and server-wide-orchestration messages stay inline at the composition root**:
   `ping`, `connector.register`, and `select-repo`. These are edge-of-the-app concerns, not command
   delegations — the same reasoning ADR 0003 used to keep Presence at the transport edge.

## Consequences

- The composition root's inbound handler shrinks to three inline arms plus two intake delegations;
  `src/server/server.ts` dropped from 748 lines (pre-hexagon) to ~368.
- The dashboard protocol is now unit-testable through `DevCommandIntake.handle` with injected fakes, so
  changing a handler no longer depends on the blocked e2e suite as its only safety net.
- A future architecture review applying the deletion test will find "this is a shallow router" — that is
  expected and recorded here, not an oversight. Likewise, "`select-repo` is not in the intake" is a
  deliberate edge decision, not a missed move.
- If a dashboard command grows genuinely deep logic, that logic should move into a domain module
  (`ChatService` or a new home), not bulk up the router.
