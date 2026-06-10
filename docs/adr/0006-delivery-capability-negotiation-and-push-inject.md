# ADR 0006: Inbound delivery is negotiated capability + push-inject; replies auto-capture and correlate by msg_id

## Status

Accepted, amended 2026-06-06: Claude Code currently uses Terminal.app doorbell delivery by Dev preference.

## Context

MCP is **pull-not-push**: a server cannot inject a prompt into a running MCP client (verifiable in the
SDK and in our own `mcp-server.ts`). Pi sidesteps this because its native extension *can* be pushed to
(`pi.sendMessage` follow-up). For every other harness we needed a way to *wake* an agent with a peer's
message. Two stop-gaps were considered and rejected:

- **Terminal-paste (AppleScript + clipboard).** Shipped as a placeholder. macOS-only and it **does not
  scale**: one global clipboard and one focused window, so 25 agents racing to paste is chaos.
- **Park each agent on a blocking `await_inbound` tool.** Makes inbound a perpetual loop: every idle
  agent holds a turn, empty returns force re-calls, and *something* must drive re-entry forever — an
  unpriced, ever-present token cost.

The `disler/coms-net.ts` reference does neither. Inbound is **server-push over the stream, injected into
the agent's own input** (`pi.sendMessage({customType:'…-inbound'})`); the agent answers normally; on
turn-end the extension **auto-captures the last assistant message** and submits it as the response.
Loops are bounded by a **`hops` counter capped at `MAX_HOPS=5`**, and the agent is *instructed not to
send-to-reply*. Request/response correlates by a **`msg_id`** (ULID); the sender may long-poll
`…/await?timeout_ms=` (default 30 min) or poll `…/get`.

The earlier source chose **Unified-in-Omni / headless** for Claude Code. On 2026-06-06 the Dev
reversed that product preference for Claude Code: it should open a real Terminal.app window like Pi.
The stream-json path remains as the capability direction for future opt-in/headless harness work, but
Claude Code's current launch recipe uses Terminal.app doorbell delivery.

## Decision

**Inbound delivery is a negotiated harness capability, realised as push-inject; replies auto-capture and
correlate by `msg_id`; chains are hops-capped.**

- **`deliveryCapabilities` per harness recipe**, replacing the `delivery: 'native-push'|'terminal-paste'`
  enum. The hub resolves an inbound message by preference: **push/inject if supported → resolve a parked
  `await` if the agent is listening → `doorbell` (terminal-paste) only as a last resort.** Pi declares
  `push` (`pi.sendMessage`); current Claude Code declares `doorbell` so it opens and receives inbound
  messages through Terminal.app. Future headless harnesses can declare **inject-stdin** `+ await`. The
  hub never branches on a harness name.
- **Push-inject for headless = write a stream-json user message to the agent's stdin.** No AppleScript,
  no clipboard, cross-platform, scales to N. `InstanceManager` parses stream-json stdout (assistant text
  → `agent-output`; turn-end detection) and frames stream-json user messages for stdin.
- **Auto-reply on turn-end.** An injected *request* carries a `msg_id`; when the agent's turn ends,
  Omni captures the final assistant message and submits it as the response. The injected text tells
  the agent to **answer normally and not call send-to-reply** — which, with the hops cap, prevents
  ping-pong.
- **Correlation.** `omni_send` returns a `msg_id`; `omni_await(msg_id, timeout)` long-polls and
  `omni_get(msg_id)` polls; messages carry `inReplyTo`.
- **`MAX_HOPS = 5`** (env `OMNI_MAX_HOPS`), enforced when a send is built; a relayed message carries
  its `hops`, incremented from the inbound context; over the cap is dropped.

## Consequences

- The honest tradeoff (recorded plainly): push-inject means a peer message *interrupts* the agent with a
  new turn — but that is the same semantics as a Dev message today, and it avoids both the scale failure
  of terminal-paste and the standing-loop cost of await-park. `await` survives only for *sender-side*
  request/response, not as the inbound channel.
- The doorbell (terminal-paste) is **demoted, not deleted**: it stays in the capability model to wake a
  fully-stopped agent or serve a future opt-in "open a real terminal" mode — but it is never the primary
  channel and never carries scale.
- A future harness with a genuine push hook declares `push` and skips inject; one that only speaks MCP
  gets `await + doorbell`. The hub is unchanged either way — this is the extensibility guarantee.
- Adds `msg_id`/`inReplyTo`/`hops` to the message + coordination shapes (small, additive).
- The multi-turn persistence of a `claude` stream-json session is verified by live smoke (`/verify`), not
  unit tests — the one assumption tests can't cover.
</content>
