# Omni

A local visual coordination tool for multiple AI-powered CLI agents (Claude Code, opencode, Pi, Codex, etc.) working on the same repository. It helps the Dev start the right agent terminals, see what each Agent Instance is doing, prompt them from one dashboard, and watch Agent Instances communicate with each other.

## Language

**Dev**:
The human who opens Omni and launches agents. Can watch the chat, send messages, and manage tags.
_Avoid_: User, operator, person

**Agent Instance**:
An AI-powered CLI session (e.g. Claude Code, opencode, Pi, Codex) with a unique identity, unique name within its Repository, and optional freeform tags. Runs inside its own terminal window on the selected Repository and is connected to the other Agent Instances in that Repository. Multiple Agent Instances may do the same kind of work, but they must not share the same identity or Repository-local name.
_Avoid_: CLI instance, terminal, session, worker

**Agent Harness**:
The CLI tool family used to start an Agent Instance, such as Pi, Codex, Claude Code, Gemini, or opencode. The Dev chooses an Agent Harness when creating an Agent Instance, and Omni runs the matching launch command.
_Avoid_: provider, model, role

**Launch Recipe**:
The harness-specific instructions Omni uses to start and connect an Agent Instance. A Launch Recipe defines the terminal command, repository working directory, connection method, and whether that Agent Harness can send messages back into Omni. Omni ships safe default Launch Recipes, and the Dev can edit global machine overrides and Repository-specific overrides for command paths, arguments, and environment variables. Launch Recipes pass Omni connection details through environment variables and a per-agent runtime config file.
_Avoid_: startup script, preset, template

**Harness Attachment**:
An optional harness-specific capability that Omni can attach to one Agent Instance at launch time, such as a Pi extension, MCP server, skill, command pack, or tool bridge. Harness Attachments are selected per Agent Instance so each agent receives only the relevant capabilities for its purpose instead of inheriting every globally installed capability. The Omni Connector is a required Harness Attachment for Omni-managed Agent Instances. Omni may scan known harness configuration folders to detect candidate attachments and offer import, but detected items are never auto-attached to an Agent Blueprint or Agent Instance. Every Harness Attachment carries risk metadata, such as prompt-only, filesystem, shell, network, or secrets access, and Attachment Cost metadata estimating Token Budget impact. Omni may estimate Attachment Cost from prompt length, number of tools, tool schema size, MCP-advertised tools, or extension metadata, and the Dev may override the estimate.
_Avoid_: plugin, global extension, always-on tool

**Universal Capability**:
A Omni-managed tool, function call, or shared capability that can apply across multiple Agent Harnesses rather than belonging to one harness's native skill, extension, plugin, hook, or command system. Universal Capabilities are managed separately from harness-specific Harness Attachments and may later be attached to universal Agent Templates or combined with harness-specific templates when supported.
_Avoid_: Pi skill, harness plugin, global external config

**Attachment Cost**:
A low, medium, high, or unknown estimate of how much a Harness Attachment or Universal Capability may consume an Agent Instance's Token Budget through instructions, tool descriptions, schemas, or default context. Attachment Cost is separate from security risk: a prompt-only skill can be high cost, and a filesystem tool can be low cost. Omni uses Attachment Cost in Harness Health, Agent Blueprint review, Hire Agent warnings, Blueprint Suggestions, and the Context Load Summary shown during Hire Agent.
_Avoid_: price, billing cost, speed

**Context Load Summary**:
A compact Hire Agent summary that shows the estimated Token Budget impact of the Omni Connector, seed Agent Context, selected Harness Attachments, and relevant Harness Options before launching an Agent Instance. The Context Load Summary is always shown when hiring from a Blueprint or customized launch flow, with stronger visual warning only when estimated total load is high. High estimated load produces a soft warning with a Launch Anyway option rather than a hard block.
_Avoid_: token bill, prompt dump, cost report

**Agent Blueprint**:
A reusable definition for hiring an Agent Instance. An Agent Blueprint names the intended purpose, recommended Agent Harness, default Tags, seed Agent Context, selected Harness Attachments, Harness Options, and launch defaults. Agent Blueprints are not running agents; they are templates that help the Dev create clean specialised Agent Instances with only relevant context and capabilities. Global Agent Blueprints live in Omni's global marketplace storage and can be reused across Repositories. The Agent Marketplace is local-first; v1 has no online marketplace, and a later feature may allow manual import from blueprint files. Imported blueprint files must pass through a review screen where the Dev manually reviews context, attachments, Harness Options, and risk summary before saving.
_Avoid_: agent, role, persona, model preset

**Harness Options**:
Advanced harness-specific launch and runtime settings inside an Agent Blueprint or Project Agent Blueprint, such as CLI flags, environment variables, sandbox or permission mode, model-like settings when a harness exposes them, context-window-related settings, or reasoning controls. Harness Options are shown in collapsed advanced UI by default so the main Hire Agent flow stays focused on Agent Harness, context, Tags, and Harness Attachments.
_Avoid_: provider settings, model settings, global config

**Project Agent Blueprint**:
A Repository-specific copy of an Agent Blueprint that the Dev has imported into a Repository and may customize for that Repository's conventions, files, context, and preferred Harness Attachments. Project Agent Blueprints live in the Repository's Project Memory, appear in the Repository's agent window, and can be used to hire real Agent Instances. Importing a global Agent Blueprint creates a full independent copy rather than a live link, so later global changes do not silently alter Repository launch behavior. When hiring from a Project Agent Blueprint, the Dev may make one-time launch edits to name, Tags, Harness Attachments, and Harness Options, with a reset-to-blueprint option. The Dev may also edit and improve Project Agent Blueprints at any time, including changing seed Agent Context, adding or removing Harness Attachments, and refining Harness Options for future launches/resumes. Running Agent Instances may suggest Project Agent Blueprint improvements, but the Dev must approve before those suggestions change a blueprint. A Project Agent Blueprint can later be promoted into a new separate global Agent Blueprint when the Dev wants to reuse it across Repositories. Promotion uses a review step that asks the Dev to clean or generalize Repository-specific context before saving the global Agent Blueprint. Project Agent Blueprints are private and gitignored by default; a later export feature may allow selected blueprints to be shared intentionally.
_Avoid_: running agent, global blueprint

**Harness Health**:
A Omni check that warns the Dev when an Agent Harness has globally enabled extensions, skills, MCP servers, commands, or tools that may be loaded into every Agent Instance and consume unnecessary context. Harness Health helps protect the Token Budget by encouraging minimal global harness configuration and per-Agent Harness Attachments. Harness Health is advisory: Omni warns only and does not automatically edit external harness configuration. Manual fix instructions are shown only when the Dev asks for them. Harness Health appears in both the full Agent Harness settings area and as a compact warning in the Hire Agent flow when risk is detected.
_Avoid_: lint, security scan, performance score

**Token Budget**:
The limited context capacity available to an Agent Instance for instructions, tool descriptions, retrieved context, messages, and task work. Omni protects Token Budget by preferring minimal global harness configuration, per-Agent Harness Attachments, concise Coordination Feeds, and small tool descriptions/results.
_Avoid_: credits, billing tokens

**Cross-Harness Chat**:
Communication between Agent Instances that use different Agent Harnesses, such as Claude Code talking to Pi, Pi talking to Codex, or Codex talking to Gemini. Omni is the shared local hub that makes these conversations visible and routable.
_Avoid_: peer-to-peer network, cloud sync

**Discovery**:
The introduction event an Agent Instance sends when it connects to a Repository. Discovery tells the Dev and other Agent Instances the agent's name, Agent Harness, tags, reachable channels, basic purpose, and capabilities.
_Avoid_: onboarding, handshake

**Startup Briefing**:
The private curated context Omni sends to a newly connected or resumed Agent Instance. A Startup Briefing explains the Repository, the agent's own Agent Context, available Agent Instances, current tasks, communication rules, recent important messages, and a summary of past completed work so the agent can collaborate without receiving the full Project Memory. Startup Briefings are generated fresh from Project Memory and saved as timestamped copies.
_Avoid_: system prompt, onboarding script, full transcript

**Presence**:
The lightweight availability state of an Agent Instance. Presence has a technical connection state, such as connected, stale, or disconnected, and a work state, such as idle, busy, blocked, done, or unknown. Omni tracks technical Presence cheaply with connector heartbeats when available and terminal/process status as a fallback, while Agent Instances only report work-state changes when needed.
_Avoid_: heartbeat chat, regular prompt

**Task Request**:
A tracked work request from one Agent Instance or the Dev to another Agent Instance, Group, Tag, or #all. A Task Request names the requester, target, requested work, expected result, priority, current lifecycle state, and optional parent Task Request. The Dev or the owner of a Task Request can split it into child Task Requests. Task Requests are explicit; normal chat does not automatically become a Task Request.
_Avoid_: command, job, ticket

**Clarifying Question**:
A question an Agent Instance asks before accepting or working on a Task Request when the request is unclear. Clarifying Questions can be asked to the Dev or to another Agent Instance.
_Avoid_: blocker, status update

**Project Memory**:
Omni-specific local memory stored inside a Repository, normally under `.omni/`, and excluded from Git. Project Memory contains Omni history, task state, previous Agent Instances, Agent Context files, structured project summaries, resumable summaries, and other coordination data for that Repository. Project Memory uses a hybrid format: structured state in SQLite and human/agent-readable memory in Markdown or JSON files. In v1, all Project Memory is private and gitignored by default. Long-lived resumable memory belongs in Project Memory; per-run runtime secrets belong in OS temporary storage.
_Avoid_: global app memory, cloud memory

**Agent Context**:
Agent-specific working context that helps an Agent Instance understand its purpose, responsibilities, expertise, preferred task types, decisions, collaboration rules, and resumable memory in a Repository. Agent Context lives in the Repository's Project Memory when an Agent Instance needs specialised instructions. Agent Instances update their own Agent Context at task boundaries, and the Dev can edit it in Omni so work can resume later without starting from scratch. An Agent Instance may be specialised or remain a general-purpose agent. Purpose presets seed the initial Agent Context but do not change the Collaboration Contract.
_Avoid_: global project context, chat history

**Collaboration Contract**:
The shared communication rules every Agent Instance follows when connected to Omni, including using Hub-Routed Messages, explicit Task Requests, Clarifying Questions for unclear work, explicit Work Claims, and Agent Context updates at meaningful task boundaries. The Collaboration Contract applies whenever an Agent Instance is created, resumed, or reconnected during a Repository's work.
_Avoid_: agent prompt, hidden policy, role prompt

**Resume Agent**:
Starting a new terminal for a previously known Agent Instance after its old terminal is no longer active. Resume Agent uses the same agent identity, Agent Harness, Agent Context, Repository, unfinished Task Requests, and Startup Briefing so work can continue after days or months. Resume Agent is not allowed while that Agent Instance is still actively connected to an existing terminal.
_Avoid_: reconnect, restore session

**Archive Agent**:
Hiding a previously useful Agent Instance from the normal active/resume view while keeping its Project Memory, Agent Context, Task Requests, Task Results, and history. Archive Agent is used when the Dev no longer needs that agent but may want its memory later. Archived Agent Instances are not available collaborators, but their completed Task Results may appear in summaries.
_Avoid_: delete, remove

**Delete Agent**:
Removing an unwanted Agent Instance from normal use when it was created by mistake, produced bad output, or should no longer be kept as a resumable collaborator. Delete Agent removes the resumable identity and Agent Context, but keeps historical messages, Task Requests, and Task Results as audit records. Delete Agent is more destructive than Archive Agent and should require confirmation.
_Avoid_: archive, stop

**Task Lifecycle**:
The state progression of a Task Request, such as requested, accepted, in progress, blocked, completed, failed, rejected, or cancelled. The Task Lifecycle lets the Dev and Agent Instances see who owns work and what happened to it. A target Agent Instance does not own a Task Request until it accepts it and may reject the request with a reason before accepting. Group, Tag, and #all Task Requests are open tasks by default: the first matching Agent Instance to accept becomes the owner. The same unit of work should not have multiple owners; if work can be split, Agent Instances discuss the split and create separate Task Requests.
_Avoid_: chat status, todo state

**Task Result**:
The response to a Task Request. A Task Result reports completion, failure, or partial progress and links back to the original Task Request. Task Results are important by default for future Startup Briefings, but the Dev or Agent Instances can adjust importance manually.
_Avoid_: reply, output, answer

**Work Claim**:
A lightweight explicit declaration that an Agent Instance is currently working on a file, folder, feature area, or Task Request. Work Claims help the Dev and other Agent Instances avoid overlap, but Omni does not infer claims from normal chat, does not inspect how work is done, and does not enforce file locking in v1.
_Avoid_: file lock, ownership lock

**Coordination Signal**:
A structured, explicit coordination event an Agent Instance sends to Omni — Discovery, Presence, Task Request, Task Result, Work Claim, or Blueprint Suggestion. Coordination Signals carry typed fields and change coordination state; they are distinct from chat (see Hub-Routed Message). Omni relies on Coordination Signals rather than inspecting an Agent Instance's private reasoning, raw terminal output, or work process. Agent Instances ask Clarifying Questions when they need more context instead of reading another agent's private work. Coordination Signals can be marked important by the Dev or Agent Instances, and the Dev can override importance.
_Avoid_: raw terminal monitoring, hidden observation, chat message

**Blueprint Suggestion**:
A structured Coordination Signal where a running Agent Instance proposes an improvement to a Project Agent Blueprint, such as adding context, removing stale context, adding or removing a Harness Attachment, or refining Harness Options. A Blueprint Suggestion includes the source Agent Instance, target Project Agent Blueprint, proposed change, reason, risk level, and approval state. Blueprint Suggestions appear in Needs Attention and blueprint editing surfaces, and require Dev approval before changing a Project Agent Blueprint. Low-risk suggestions include context and Tag edits; medium-risk suggestions include adding or removing known Harness Attachments; high-risk suggestions include launch command changes, environment variables, new MCP servers, filesystem tools, or network-capable tools. High-risk Blueprint Suggestions require stronger confirmation than a normal approve button.
_Avoid_: chat suggestion, automatic blueprint edit

**Coordination Feed**:
The filtered stream of Omni information sent to an Agent Instance. A Coordination Feed includes #all messages, direct messages, relevant Task Requests and Task Results, Presence summaries, and Work Claims, but excludes raw terminal output and unrelated private Agent Context.
_Avoid_: full transcript, terminal feed, hidden work log

**Hub-Routed Message**:
A free-text chat message routed through Omni — the conversation layer the Dev and Agent Instances use to plan and coordinate. Covers Dev↔agent, agent↔Dev, and agent↔agent chat, including across different Agent Harnesses. Every chat message passes through Omni (the hub) rather than directly between participants, so Omni can show the conversation, store history, route to disconnected agents safely, and let the Dev participate. Distinct from a Coordination Signal, which carries structured coordination events rather than chat.
_Avoid_: Cross-Agent Communication, direct peer-to-peer message, side-channel message

**Repository**:
A local codebase the Dev selects in Omni. In v1, one Omni server session has one active Repository, and all active Agent Instances operate on that Repository. Project Memory is persisted in a `.omni/` folder inside the Repository.
_Avoid_: Repo, project, codebase

**Tag**:
A freeform label on an Agent Instance used for filtering and @mention targeting (e.g. "frontend", "backend", "review"). Replaces the old concept of a single Role. An Agent Instance can have many Tags. In v1, @tag targeting is allowed carefully: tag-targeted Task Requests are open tasks, and the first matching Agent Instance to accept becomes the owner.
_Avoid_: Role, label, category

**Group**:
A named collection of Agent Instances that can be @mentioned together. Groups can auto-include agents with a matching Tag, plus manually added agents. Groups are not part of v1.
_Avoid_: Team, crew, squad

**MCP**:
Model Context Protocol — the connection mechanism an Agent Instance can use to send messages back into Omni from its own CLI environment. Omni does not replace the agent's normal tools, skills, or plugins; MCP is only the local bridge for Omni communication.
_Avoid_: skill system, plugin system, code-editing tool

**Turn**:
Removed. Agents chat freely without limits.

**Kill Switch**:
Removed. Just close the terminal window.

## Channels

- **#all** — Group room where Dev + every Agent Instance can see all messages. Use `@name`, `@tag`, or `@all` to target specific agents.
- **@agentName** — Direct message to a specific Agent Instance. Direct messages are hidden from unrelated Agent Instances but visible to the Dev in the dashboard.

## Relationships

- A **Dev** creates **Agent Instances** on a **Repository**
- A **Dev** chooses an **Agent Harness** for each **Agent Instance**
- Each **Agent Instance** has a unique name and freeform **Tags**
- **Groups** collect Agent Instances by name or by tag filter
- **Agent Instances** communicate through Omni's server using their Agent Harness's Launch Recipe — messages route through the hub and are visible in the UI
- **Cross-Harness Chat** lets Agent Instances using different Agent Harnesses communicate in the same Repository
- **Coordination Signals** support Discovery, Startup Briefings, Presence, Task Requests, Task Lifecycles, Task Results, and Work Claims
- The **Dev** and **Agent Instances** can create Task Requests; every Task Request is visible to the Dev
- Task Requests are explicit; normal agent chat does not automatically become a Task Request
- Agent Instances use structured connector tools for agent-to-agent actions
- The Dev can use UI forms to create structured Task Requests in v1; natural language with confirmation may be added later
- Normal Dev chat remains chat and does not automatically become a Task Request
- Agent Instances ask Clarifying Questions before accepting, rejecting, or working on unclear but potentially relevant Task Requests
- All chat between the Dev and Agent Instances uses **Hub-Routed Messages** in v1; structured coordination uses **Coordination Signals**
- **Presence** combines technical connection state with token-efficient work-state updates
- `CONTEXT.md` is the shared Repository glossary; each Agent Instance may also have a separate Agent Context file in Project Memory
- Agent Context is visible and editable in Omni and helps resumed Agent Instances continue prior work
- Agent Instances maintain their own Agent Context summaries at meaningful Task Lifecycle changes, such as accepted, blocked, completed, failed, cancelled, or major decision made
- Every created, resumed, or reconnected Agent Instance receives the same Collaboration Contract
- Omni's global memory should stay minimal; Repository-specific and Agent-specific memory belongs in the Repository's Project Memory
- When a Repository is selected, Omni shows previously known Agent Instances for that Repository so the Dev can resume them instead of creating new ones
- **Resume Agent** starts a new terminal only when the previous terminal is no longer active
- **Project Memory** is stored under `<repo>/.omni/` and gitignored automatically

## Boundaries

- **Local-only** — runs on localhost with a per-run session token, no cloud sync, no multi-user collaboration
- Single-Dev model; multiple local browser tabs for the same Dev are allowed
- Switching Repository disconnects/stops Agent Instances from the previous Repository and opens the relevant Project Memory for the new Repository
- **Not a code editor** — Omni coordinates; the harnesses edit code
- **Not a work inspector** — Omni shows explicit Coordination Signals between Agent Instances, but does not steer or inspect how an Agent Instance performs its task
- Omni does not expose, copy, or store raw terminal output in v1; Agent Instances communicate through chat, Clarifying Questions, Task Requests, Task Results, Presence, and Work Claims
- Agent Instances receive a filtered Coordination Feed rather than every piece of Project Memory
- **Lightweight launcher, not a deep process controller** — Omni opens the correct terminal command for a chosen Agent Harness, but the Agent Instance remains an independent CLI process
- **Requires MCP support** — agents that don't support MCP can receive stdin and reply via stdout but cannot initiate messages to other agents
