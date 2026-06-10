# ADR 0005: One coordination model — every agent is a Connector with an identity Session; retire the anonymous SSE path

## Status

Accepted

## Context

Omni needs agents from many harnesses (Pi, Claude Code, Codex, Gemini, opencode) to coordinate at
scale on one Repository. Today there are **two** ways an agent can reach the hub, and they are not
equal:

1. **The WebSocket connector mesh** — what Pi's native extension uses. On connect it sends
   `connector.register` with an identity (the per-run runtime token → `agent.id`/`name`), is tracked in
   the `connectors` map and in Presence, and receives fan-out (`coordination.message`). This is the
   first-class, *identified* path. Coordination Signals (chat, Work Claims, Task lifecycle) are handled
   by `CoordinationSignalIntake` against this path with correct actor attribution.
2. **The SSE `mcp-server.ts`** — the official MCP SDK over SSE, exposing 5 tools. Verified in code: it
   keys transports by `transport.sessionId` (transport-level, **not** agent), shares one `this.chat`,
   and its send path calls `chat.sendMessage('#all', …)` with **no sender** — so it is *anonymous*. It
   is absent from the connector mesh and from Presence. It cannot attribute `send`/`claim`/`task` to an
   agent, let alone do per-agent inbound or heartbeat.

A parallel design thread proposed bolting per-agent identity, a mailbox, and inbound `await` onto the
SSE server. That re-solves — on the weaker transport — identity that the connector mesh already has.
The reference implementation we drew from (`disler/coms-net.ts`) is itself a single hub where every
agent is an identified, registered client; it does not run two parallel agent transports.

## Decision

**Collapse to one model: every agent is a Connector with an identity-bound Session, and the anonymous
SSE server is retired as a coordination path.**

- **Connector.** Every agent — Pi included — reaches the hub over the **identity-bound WebSocket** as a
  Connector. Pi's connector is its native extension; all MCP/CLI harnesses use the **generic Omni
  MCP connector** (`src/infra/omni-mcp-connector/`), which already joins the mesh with token
  identity. No harness is special-cased in the domain; the domain never branches on a harness *name*.
- **Identity Session.** Connection identity is bound at `connector.register` from the per-run runtime
  token (`agent.id`/`name`). Presence, fan-out, Coordination Signal attribution, and (per ADR 0006)
  inbound delivery and request/response correlation all key off this Session — not a transport sessionId.
- **Retire the SSE coordination path.** `mcp-server.ts` is no longer how an agent coordinates. Claude
  (and Codex/Gemini/opencode) do **not** talk to `/mcp` for coordination; they use the connector. The
  SSE server is removed from the coordination story (it may survive only as a clearly-labelled read-only
  dev convenience, never the identity path).

## Consequences

- The "make SSE identity-bound + a dual-fed mailbox" work disappears: identity, Presence, attribution,
  and fan-out are reused from the mesh, not rebuilt on a weaker transport.
- Adding harness #N is a registry entry + (ADR 0006) a capability declaration; coordination code is
  untouched. This is the "25 mixed CLIs, no limits" property.
- The generic MCP connector becomes the single SDK for "join Omni" — inspectable, and publishable as
  a standalone package later.
- Cost: the 5-tool SSE server and any docs that point agents at `/mcp` for coordination must be removed
  or relabelled; a regression there is isolated to that deletion.
- This ADR settles only *how an agent connects and is identified*. *How an inbound message is delivered*
  and *how replies correlate* are ADR 0006.
</content>
