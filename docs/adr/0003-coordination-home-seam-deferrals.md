# ADR 0003: Coordination home — two deferred seams (no Project Memory port yet, Presence stays at the transport edge)

## Status

Accepted

## Context

The hexagonal refactor reached a half-applied state: Agent Instance lifecycle, Hub-Routed Messages, and groups/tags lived properly behind seams (`AgentLifecyclePort` → `InstanceManager`, `ContextPersistencePort` → `ContextStore`), but several coordination verbs were still closures inside the server's composition root. Finishing the hexagon moved Task Request lifecycle, Work Claim, and Startup Briefing generation into a single deep domain module — the **coordination home** — beside the Chat module.

While doing that, two questions about *new* seams came up. Both were consciously answered "not yet." This ADR records the reasoning so a future architecture review does not re-suggest them as if they were oversights.

### 1. Project Memory file writes

The coordination home needs to write `.omni/*.md` files (Startup Briefing save, completed-Task-Request summary append, handoff snapshot, Agent Context seed, and the project-memory setup). The tempting move is a formal `ProjectMemoryPort` with an adapter.

There is exactly **one** way these files are written. A port with a single adapter is a hollow seam — interface as complex as the implementation, no second backing to justify it. That is the same anti-pattern we deliberately deleted elsewhere in this refactor (collapsing the four-method message-transport seam down to the one method anyone actually called).

The home does still depend on an injected **Project Memory writer** function. That seam is justified — not by a hypothetical second backing, but by its **test fake**: a real file-writer in production, an in-memory spy in the home's behaviour tests. The file-writing code itself lives in a plain helper module (`infra/project-memory-store`), not behind a port.

### 2. Presence

The original charter for the coordination home named four coordination concepts: Task Request, Work Claim, Startup Briefing, and **Presence**. The first three moved in. Presence did not.

Presence is driven by the WebSocket connection lifecycle — connect, `close`, heartbeat. Its in-memory state is genuinely transport-coupled in a way the other three verbs are not. Moving it into a transport-agnostic domain module would mean dragging connection concerns across the seam, or splitting Presence awkwardly across two homes. The locked refactor sequence (Task Request → Work Claim → Startup Briefing/Project Memory) deliberately excluded it.

## Decision

1. **No `ProjectMemoryPort`.** `.omni/*.md` writes stay in a plain `infra/project-memory-store` helper module. The coordination home reaches them through an injected writer function whose seam is justified by the test fake, not by swappability. Promote to a real port only if a genuine second backing appears (e.g. a non-filesystem Project Memory store).

2. **Presence stays at the transport edge.** Its in-memory map and update logic remain in the server alongside the WebSocket lifecycle, not in the coordination home. Revisit only if Presence grows logic that is independent of the connection lifecycle.

## Consequences

- The coordination home stays a deep module with a small interface, free of a one-adapter hollow seam.
- Project Memory's on-disk format is pinned by characterization / golden-file tests (proving "unchanged," not "correct") so the helper can be refactored safely without a port abstraction.
- The home does not own the full original charter — Presence is excluded by design, not by accident. A reader comparing the charter to the code will find this ADR rather than a gap.
- If a second Project Memory backing or connection-independent Presence logic ever appears, these decisions should be reopened; until then, re-proposing either seam is re-litigating a settled choice.
