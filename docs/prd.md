# Omni — Product Requirements Document

## Problem Statement

A developer working on a codebase often needs to spin up multiple AI-powered CLI agents (Claude Code, opencode, etc.) to work on different aspects of the same repository — one reviews code, another implements features, another plans architecture. Currently, each agent runs in its own isolated terminal with no awareness of the others. The developer must manually switch between terminals, copy context between them, and has no unified view of what each agent is doing or saying.

Omni solves this by providing a single chat interface — opened in the browser on localhost — where the developer can create, monitor, and coordinate multiple agent instances working on the same repository, with preserved context, room-based conversations, and turn limits to prevent runaway loops.

## Solution

A local-only web application that:
1. Runs a localhost server (Node.js/TypeScript backend)
2. Opens a React web UI in the browser
3. Lets the Dev select a local repository
4. Lets the Dev create Agent Instances — each is a real terminal process running a harness (Claude Code, opencode, etc.) on that repository
5. Provides a chat interface with rooms (#all, #{role}) where agents and the Dev communicate
6. Enforces Turn limits so agents don't chat infinitely
7. Persists agent contexts in SQLite so they can be resumed later

## User Stories

1. As a Dev, I want to open Omni in my browser on localhost, so that I can start managing my agents.
2. As a Dev, I want to browse and select a local repository, so that all Agent Instances work on the correct codebase.
3. As a Dev, I want to create an Agent Instance with a unique name, optional role, optional description, and optional context, so that I can launch a new agent on the repo.
4. As a Dev, I want to choose which harness (Claude Code, opencode, etc.) an Agent Instance uses, so that I can use my preferred AI tool.
5. As a Dev, I want a newly created Agent Instance to be automatically added to #all, so that it can participate in global chat.
6. As a Dev, I want Agent Instances with matching roles to be grouped into #{role} rooms, so that role-specific conversations happen in context.
7. As a Dev, I want to chat with all agents in #all, so that I can broadcast to every instance.
8. As a Dev, I want to mention a specific Agent Instance by @name in any room, so that I can direct a message to a single agent.
9. As a Dev, I want to send a message to a #{role} room, so that only agents with that role receive it.
10. As a Dev, I want to set a per-Turn message limit per Agent Instance, so that agents stop after N messages and wait for my response.
11. As a Dev, I want an agent to resume chatting when I respond to it (resetting its Turn counter), so that I control the conversation flow.
12. As a Dev, I want a Kill Switch button for any Agent Instance, so that I can immediately stop an agent that is looping or misbehaving.
13. As a Dev, I want to see a summary of each Agent Instance's recent activity in the UI, so that I know what each agent is doing.
14. As a Dev, I want to close and later reopen an Agent Instance with its full context preserved, so that long-running agent sessions survive browser restarts.
15. As a Dev, I want to configure default harnesses and default Turn limits in settings, so that creating new instances is faster.
16. As a Dev, I want to delete/destroy an Agent Instance and its terminal process, so that I can clean up finished agents.
17. As a Dev, I want real-time message delivery (WebSocket), so that I see agent messages as they arrive.
18. As a Dev, I want to see which agents are online/offline/busy in the UI, so that I know their current state.

## Implementation Decisions

### Modules

1. **Instance Manager** — spawns child processes (node `child_process.spawn`) for each Agent Instance. Each instance gets a pseudo-terminal (via `node-pty` or similar). Interface: `create(id, name, role, harness, cwd)`, `kill(id)`, `list()`, `getStatus(id)`, `sendInput(id, text)`, `getContext(id)`, `saveContext(id)`. This is a deep module: complex process management behind a simple CRUD-like interface.

2. **Chat Engine** — the core message router. Manages rooms (#all, #{role}), enforces Turn limits, handles @mentions, processes Kill Switch commands. Routes messages from the Dev to the right agents and from agents to the right rooms. State machine per agent: IDLE → TURN_ACTIVE → TURN_EXHAUSTED → IDLE (on Dev response).

3. **Context Store** — SQLite via `better-sqlite3`. Tables: `instances` (id, name, role, harness, cwd, created_at, context_json), `messages` (id, room, sender, content, timestamp, turn_number), `settings` (key, value). Deep module — only a few query methods but handles serialization, migrations, and context blobs.

4. **WebSocket Server** — single WebSocket connection per browser tab using `ws` or `socket.io`. Pushes: new messages, instance status changes, turn state changes. Accepts: create instance, kill instance, send message, save context, load context.

5. **Web UI** — React SPA loaded from the localhost server. Main views: room list sidebar, message area, instance creation form (modal), settings panel, instance status bar. Uses a lightweight state management approach (React context + hooks).

6. **Repo Scanner** — reads local filesystem to present a directory browser. Simple: `fs.readdir` with directory filtering.

### Architecture

- Single Node.js process serves both HTTP (static files + API) and WebSocket
- Child processes are spawned and managed by the Instance Manager
- Messages flow: Dev → WebSocket → Chat Engine → Instance Manager → child process stdin
- Agent responses flow: child process stdout → Instance Manager → Chat Engine → WebSocket → UI
- SQLite database lives at `~/.omni/data.db` (or alongside the repo)

## Testing Decisions

- **Good tests** test external behavior through the public interface, not implementation details
- **Instance Manager** — test that spawning a process produces a running process, that kill() terminates it, that sendInput() writes to stdin. Use a simple echo script as the test harness.
- **Chat Engine** — test message routing to correct rooms, Turn limit enforcement, @mention parsing, Kill Switch behavior. Pure logic, easy to unit test.
- **Context Store** — test save/load round-trips, migrations, edge cases (null contexts, large blobs). Use an in-memory SQLite for tests.
- **WebSocket/API** — integration tests with a companion WebSocket client
- **Web UI** — tested via Playwright or similar E2E tests for critical paths (create instance, send message, see message appear)

## Out of Scope

- User authentication / multi-user support — local-only, single-Dev tool
- Cloud sync or remote hosting
- Plugin or extensibility API
- Mobile app or native desktop app
- File editing, diff viewing, or any code capabilities — those belong to the harnesses
- CI/CD integration
- Support for non-AI CLI tools as instances (only AI harness agents)
- Multi-repository mode (one repo at a time)
