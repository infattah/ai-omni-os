# ADR 0007: tmux is a second interactive launch backend, chosen per Agent Instance

## Status

Accepted 2026-06-06. Amended 2026-06-07: the Dev made **tmux the default** launch backend (Terminal.app still selectable per Agent Instance). The per-instance picker and backend-agnostic routing are unchanged — only the default radio flipped.

## Context

Until now the only interactive launch backend was **Terminal.app via AppleScript** (`InstanceManager.createWithTerminal`): one Terminal window per Agent Instance, output read by tailing a `script(1)` log, input delivered by clipboard paste into the focused window. ADR 0006 already recorded the weakness of that input path — *"one global clipboard and one focused window, so 25 agents racing to paste is chaos"* — and it is macOS-GUI-only, so it is useless over SSH, on a headless/remote machine, or for a terminal-native Dev who lives in one multiplexed session.

The Dev wants to launch Agent Instances into **tmux**: agents grouped into attachable sessions, one window per Agent Instance, each independently visible and controllable, without losing any Omni coordination (dashboard, Presence, chat, tasks, message send, output read).

Two framings were available:

- **Replace** Terminal.app. Rejected: Terminal.app is the Dev's default and must keep working (and the GUI window is nicer for a single agent).
- **A global "use tmux" switch.** Rejected: the launch model is already per-Agent-Instance, and a Dev may want one agent in a GUI window and twenty in a tmux grid.

**Session grouping.** The first PRD said one session per Repository. Because v1 binds one server session to exactly one active Repository (CONTEXT.md), per-Repository collapses to a single session holding every agent across every harness. The Dev instead chose **one session per Agent Harness, namespaced per Repository** — `omni-<harness>-<repohash>` — so `claude-code` agents sit in one session, `pi` agents in another, with the Repository hash keeping different Repositories from colliding. This is purely a *grouping* choice: routing is decoupled from topology (below), so it changes nothing about who can talk to whom.

## Decision

tmux is an **additional** interactive backend, selected **per Agent Instance** at launch time. The picker defaults to tmux (2026-06-07 amendment; was Terminal.app); Terminal.app stays available per instance.

- A new optional `CreateOptions.tmux` flag on `AgentLifecyclePort`. `InstanceManager.create` routes `openTerminal && tmux` to `createWithTmux`; everything else is unchanged. `streamJson` (headless, ADR 0006) still wins and forces no terminal.
- **The tmux window runs the exact same command as Terminal.app** — `script -q <log> /bin/bash -lc '<harness…>'; touch <done>` (`buildTerminalScriptCommand`) — so the output-tailing, stale-line flush, and exit-sentinel/`pgrep` machinery is shared verbatim (`attachLogPolling`). tmux only changes three verbs:
  - **launch** — `tmux new-session -d -s <session> -n <window> '<cmd>'` for the first agent of a harness (guarded by `tmux has-session`), `tmux new-window -t <session> -n <window> '<cmd>'` for the rest.
  - **send** — `tmux send-keys -t <session>:<window> -l -- '<text>'` then `send-keys … Enter`. No focus, no clipboard — this is what fixes ADR 0006's paste-contention problem at 20+ agents.
  - **remove** — `tmux kill-window -t <session>:<window>`, which closes only that agent's window; tmux ends the session automatically when its last window dies.
- **Session = harness within a Repository.** `tmuxSessionName(harnessName, repoPath)` → `omni-<harness>-<sha1(repo)[:8]>`. Window = the Agent Instance name (`.`/`:` stripped so `session:window` targets stay unambiguous). Each `ManagedInstance` stores its target **structurally** (`{ session, window }`, formatted by `tmuxTargetRef`), not by window-title lookup — so send/kill hit the exact window. This is strictly more reliable than the Terminal.app path, which finds windows by fuzzy `custom title contains "Omni: <name>"` and can mis-hit on overlapping names. The harness *name* (`claude-code`), not the command (`claude`), is the grouping key, so it is threaded as `CreateOptions.harnessName` alongside the executable.
- These are **plain separate sessions**, not a tmux "session group" (`new-session -t <existing>`), which would make the harness sessions share one window set — the opposite of what we want.
- The Dev's choice flows `LaunchModal` (a "Launch Backend" picker, tmux default) → `create-agent`/`resume-agent` `launchBackend` field → `DevCommandIntake` → `ChatService.createAgent/resumeAgent(tmux)` → `lifecycle.create({ tmux, harnessName })`. **No coordination code branches on the backend or topology** — routing resolves @mentions/tags/groups against the connector Session registry (ADR 0005) and never travels through tmux, so however windows are grouped, agent-to-agent and cross-harness comms are unaffected. The only leg that needs the tmux target is the delivery-paste (`send-keys`).

## Consequences

- Omni is now useful for terminal-native, SSH, and remote workflows, and scales to large multi-agent sessions without clipboard/focus contention.
- tmux must be installed (`brew install tmux`); if it is absent the launch fails. Backend availability detection is **not** built yet — the picker offers tmux unconditionally. Follow-up if needed: probe `tmux -V` and disable the option when missing.
- Resume uses the Agent Instance's persisted `launchBackend`; agents without a stored value use the current Dev-command default, tmux.
- The AppleScript paste path (`sendInputToTerminal`) stays for the Terminal.app backend; tmux uses `sendInputToTmux`. Two input paths now exist behind one `sendInput`.
- Window-name collisions are possible if two agent names differ only by a `.`/`:` (both sanitize to `-`); domain rules already require unique names per Repository, so this is a narrow edge left unhandled in v1.
- Visible-window UX: tmux shows one Terminal.app window per Repository, not per harness. Harnesses are still separate sessions (`omni-<harness>-<repohash>`), and agents are still windows inside their harness session. The first tmux agent for a Repository opens Terminal.app attached to its session; later tmux agents in that Repository reuse the attached tmux client with `switch-client` and `select-window` so the new agent auto-focuses, even when it is in a different harness session. Different Repositories stay isolated by the Repository hash and get their own Terminal.app window.
