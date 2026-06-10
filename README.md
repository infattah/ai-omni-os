# Omni (ai-omni-os)

One local dashboard where AI CLI agents from different providers work together on your repository. Hire a Claude Code agent and a Pi agent side by side, watch them talk to each other, and message any of them yourself. Omni is the hub every message routes through: agent to agent, agent to developer, across harnesses.

The goal is interoperability. You should be able to build with whatever agent you prefer, and your agents should be able to coordinate regardless of which vendor made them. Adding support for a new harness is one registry entry, not a rewrite.

## How it works

- Every agent joins over an identity-bound WebSocket connector, no matter which harness it runs on. Coordination code never branches on a vendor name.
- Agents that can be woken by their own connector get pushed messages directly. Agents on pull-only MCP get peer messages relayed straight into their terminal, so a real subscription-based CLI agent participates with zero API cost.
- Your repository gets a `.omni/` folder with startup briefings, task summaries, and per-agent context in plain Markdown, readable by humans and agents alike.
- Everything runs on `127.0.0.1` with a per-session token. No cloud, no account, no telemetry.

## Harness support

| Harness | Status |
| --- | --- |
| Claude Code | Supported |
| Pi | Supported |
| Codex | Planned |
| Gemini CLI | Planned |
| opencode | Planned |

## Platform support

| Platform | Status |
| --- | --- |
| macOS | Supported (tmux or Terminal.app launch) |
| Linux | Supported (tmux launch; needs a desktop session for interactive agents) |
| Windows | Not yet supported |

The tmux backend is the default. Install tmux with `brew install tmux` (macOS) or `apt install tmux` (Debian/Ubuntu).

## Quick start

Requires Node.js 20 or newer.

```bash
git clone https://github.com/inagentai/ai-omni-os.git
cd ai-omni-os
npm install
npm run dev
```

The console prints a dashboard URL that includes your session token, like `http://127.0.0.1:3456/?token=...`. Open that exact URL; without the token the dashboard cannot connect.

Then, in the dashboard:

1. Select the repository you want agents to work on.
2. Hire an agent: pick a name, a harness, and a launch backend.
3. The agent opens in a tmux window (or Terminal.app window) and connects back to the hub.
4. Message it from the chat, or hire a second agent and watch them coordinate.

## Commands

```bash
npm run dev        # build the client, then run the server
npm test           # unit and integration tests (vitest)
npm run test:e2e   # browser tests (playwright) — stop the dev server first
npm run lint       # biome
npm run build      # compile server (tsc) and client (vite)
```

## Security model

Omni is built for one developer on one machine. The server binds to localhost only and every WebSocket connection needs the per-run session token. There is deliberately no auth layer and no multi-user mode.

One thing to understand before you rely on it: cross-harness chat works by relaying peer messages into agents' terminals. That means anything an agent says reaches the other agents' input. Treat your agent crew with the same care as a single agent, and don't point them at content you wouldn't paste into a terminal yourself.

## Architecture

The codebase is ports-and-adapters: pure domain logic in `src/domain/`, ports in `src/ports/`, and concrete adapters (SQLite store, process manager, WebSocket edge) wired together in `src/server/server.ts`.

```
src/
├── domain/    — chat, coordination, and harness registry (pure logic)
├── ports/     — interfaces the domain depends on
├── engine/    — message routing (@mentions, tags, groups)
├── manager/   — agent process lifecycle (tmux / Terminal.app backends)
├── store/     — SQLite persistence
├── scanner/   — repository browser
├── infra/     — connectors, file writers, health scans
└── server/    — composition root, HTTP + WebSocket edge
client/        — React 19 + Vite dashboard
```

`docs/ARCHITECTURE.md` is the navigation map, `docs/adr/` records the architectural decisions and the reasoning behind them, and `CONTEXT.md` is the domain glossary. If you plan to contribute, start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- Windows launch backend
- Enable the remaining harnesses (Codex, Gemini CLI, opencode)
- `npx ai-omni-os` packaged install
- Headless/SDK delivery path behind the existing delivery seam

## License

[MIT](LICENSE)
