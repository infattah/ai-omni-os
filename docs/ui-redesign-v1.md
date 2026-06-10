# Omni UI Redesign v1

## Goal

Redesign Omni as a native-feeling Mac control center for coordinating AI Agent Instances in one Repository.

It should feel like:

- oMLX admin dashboard
- Apple Settings
- Activity Monitor
- polished shadcn/reui-style component craft

It must not feel like:

- generic dark Tailwind dashboard
- SaaS analytics panel
- debug form dump
- Slack clone
- Jira/Trello clone

## Product frame

Omni is a local coordination utility. The UI should help the Dev answer:

- Who is here?
- Who is connected, stale, blocked, or idle?
- What is being discussed?
- What Task Requests exist?
- What Work Claims are active?
- What needs the Dev's attention?

## Visual direction

### Theme

Light-first. Calm. Native Mac utility.

```css
--bg: #f5f5f7;
--surface: #ffffff;
--surface-muted: #fbfbfd;
--text: #1d1d1f;
--text-secondary: #424245;
--muted: #6e6e73;
--border: #e7e7eb;
--border-strong: #d2d2d7;
--accent: #0071e3;
--success: #34c759;
--warning: #ffcc00;
--danger: #ff3b30;
```

CSS variables should be ready for future dark mode, but only light mode is implemented in this redesign pass.

### Typography

Use native system stack:

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif;
```

Rules:

- tight letter spacing on headings
- small secondary text
- no huge marketing hero type
- useful dashboard density
- precise labels and hierarchy

### Shapes and surfaces

- cards: 16–20px radius
- buttons: pill radius
- inputs: 12px radius
- status dots: small macOS-style circles
- shadows: very subtle or none
- restrained neutral palette
- subtle background grain/glow allowed

## Top app bar

Sticky, translucent, Mac-like.

Contains:

- Omni name/logo
- current connection status
- centered segmented nav:
  - Overview
  - Agents
  - Chat
  - Tasks
  - Memory
- right actions:
  - Generate Handoff
  - Launch Agent

Top nav modes are real screens, not merely filters.

## Modes

### Overview

Primary workspace. Dev should do ~80% of coordination here.

Layout:

```txt
Repository command card

25% Agent Instances | 50% #all Chat | 25% Needs Attention / Tasks / Work Claims / Activity
```

Center chat is dominant, but must not become Slack-like. Surrounding panels keep coordination state visible.

### Agents

Focused Agent Instance management:

- Agent detail / inspector
- Agent Context editing
- lifecycle actions
- tags
- archive/resume/delete

### Chat

Full conversation view:

```txt
Left: channel list
  #all
  @agent-name
  @agent-name

Center: selected conversation
Right optional inspector: selected Agent Instance / Task references / Work Claims
```

Direct channels are shown because the domain defines `#all` and `@agentName`.

### Tasks

Hybrid grouped list, not Jira and not Trello.

Groups:

- Requested
- Accepted / In Progress
- Blocked
- Completed
- Failed / Rejected / Cancelled

Task cards are compact and show:

- human ID, e.g. `TASK-12`
- title
- target / owner
- priority
- status
- contextual lifecycle actions only

### Memory

Primary surface is the Project Summary editor.

Order:

1. Project Summary editor
2. Agent Contexts
3. Handoffs
4. Startup Briefings

## Overview repository command card

On Overview, show a prominent but compact/native Repository command card.

It includes:

- current Repository path
- connection / health status
- Agent Instance count
- Task Request count
- Work Claim count
- Select / Switch Repository
- Generate Handoff
- Launch Agent

This must be a calm rounded card, not a hero banner.

On non-Overview pages, Repository info collapses into the top bar/status area.

## Launch Agent flow

Terminology:

- Use **Agent Harness**, not model/provider.
- Use **Launch Agent**, not Create Pi Agent.

Flow:

```txt
Dev clicks Launch Agent
→ centered modal opens
→ Dev enters Name
→ Dev enters Tags
→ Dev chooses Agent Harness
   - Pi enabled
   - Codex disabled / Coming soon
   - Claude Code disabled / Coming soon
   - Gemini CLI disabled / Coming soon
   - opencode disabled / Coming soon
→ Omni shows compact Pi Harness Health warning when global Pi config may waste context
→ Omni shows compact Context Load Summary
→ Dev optionally selects Pi Harness Attachments for this Agent Instance
→ Dev clicks Launch
→ Omni launches the Pi Agent Instance terminal
```

Modal labels:

- title: Launch Agent Instance
- fields: Name, Tags, Agent Harness
- primary action: Launch
- secondary action: Close / Cancel
- compact Harness Health warning when risk exists
- compact Context Load Summary
- Pi Harness Attachments selector when available

## Agent cards

Overview Agent cards should be calm and scannable.

Show:

- `@agent-name`
- Agent Harness: Pi, Codex, Claude Code, Gemini CLI, opencode
- subtle tag chips
- presence dot:
  - green = connected
  - yellow = stale or busy
  - gray = disconnected
  - red = blocked/error
- one primary action:
  - connected/running: Message
  - disconnected/stale resumable: Resume
- secondary overflow menu:
  - Edit Context
  - Resume
  - Archive
  - Delete

Clicking the card opens Agent detail / inspector.

## Chat panel

- clean `#all` header
- simple stacked rows, not cartoon bubbles
- sender name bold
- content readable
- composer fixed at bottom of panel
- send button pill black or blue
- auto-scroll to newest messages

## Right column on Overview

Order:

1. Needs Attention
2. Task Requests
3. Work Claims
4. Activity

Needs Attention surfaces:

- blocked Task Requests
- failed Task Requests
- stale/disconnected running Agent Instances
- failed launches
- Clarifying Questions
- Repository switch / handoff warnings

For current v1, start with available signals:

- blocked/failed tasks
- stale/disconnected agents
- recent failed activity events

Activity is a quiet system history list and should not dominate.

## Work Claim cards

Show:

- file/path in mono or compact text
- owner Agent Instance
- note
- release button

## Density

Hybrid native utility:

- Overview: calm, spacious, scannable, low cognitive load
- Detail pages: denser, more rows/actions/filtering, still native and polished

## Interaction feel

- minimal animations
- hover background shifts only
- segmented controls activate softly
- buttons feel native and crisp
- no bouncy SaaS effects
- no loud gradients
- no unnecessary icons everywhere

## Tech constraints

Use existing stack:

- React
- TypeScript
- Vite
- CSS variables
- custom local components
- lucide-react only if useful
- Radix only for dialogs/dropdowns/selects if needed

Avoid:

- Next.js
- Material UI
- Ant Design
- Bootstrap
- heavy animation libraries
- generic Tailwind dashboard clone

## Backend/admin windows

Sidebar-accessed backend/admin windows, such as Harness and Templates, are not live Repository coordination modes. They keep the Omni topbar shell and connection status, but the workspace segmented nav (`Overview / Agents / Chat / Tasks / Memory`) is hidden.

Harness uses its own local nav placed in the topbar between the Agent Harness brand block and the connection status:

```txt
General / Pi / Codex / Claude Code / Gemini CLI / opencode
```

Pi is the only active v1 harness. Non-Pi harnesses remain visible and show their native placeholder capability sections, but actions are disabled or marked coming soon. This teaches the future shape without implying launch support is ready.

Harness > Pi uses a future-shaped page headed **Pi agent** with a black Pi mark when available. It shows Packages, Skills, Extensions, Prompt Templates, Agent Presets, Themes, MCP Servers, Tools, Hooks, Editor, Persistent Memory, and Launch Policy. Packages, Skills, Extensions, Prompt Templates, Themes, and Pi Agent Presets are active from Omni's global Pi capability library. Agent Presets are single Pi agent definition files, not team/chain workflows. Agent-to-agent communication, team, chain, and subagent-style Pi extensions are not shown because Omni already owns agent-to-agent coordination. The other cards are visible placeholders marked coming soon. Warning copy is not shown in the Harness window by default.

Harness > General is reserved for universal tools, function calls, or shared capabilities that can apply across all Agent Harnesses. V1 does not build this yet; it is visible but marked coming soon like the inactive harnesses.

Templates is a backend/admin window for harness-specific reusable agents. It hides the workspace segmented nav and uses the same harness-family local nav as Harness:

```txt
General / Pi / Codex / Claude Code / Gemini CLI / opencode
```

Templates > Pi is for Pi-specific agent templates that can attach relevant Pi capabilities from Harness > Pi, such as Pi Skills and Pi Extensions. Future Templates tabs can attach capabilities from their matching Harness tab. Templates > General is reserved for universal agent templates that can use universal tools or shared capabilities from Harness > General; v1 keeps General coming soon.

The persistent left sidebar remains available, and clicking the Omni title in the expanded sidebar returns to Overview.

## Future UI notes

- The Harness backend/admin window should include Agent Harness sections for Harness Health and Harness Attachments.
- Future Agent Marketplace surfaces should use **Agent Blueprint** for reusable templates and **Project Agent Blueprint** for Repository-specific imported/customized templates.
- Agent Marketplace is local-first; no online marketplace in v1.
- Full Blueprint/Marketplace behavior is documented in `docs/harness-attachments-and-blueprints.md`.

## Acceptance criteria

The redesign is good if:

- it feels like a native Mac local utility
- current functionality is preserved
- UI is light, calm, and highly readable
- Agent Instances, Task Requests, Work Claims, and Chat are immediately understandable
- no debug-panel feeling remains
- design matches oMLX/Apple references more than generic SaaS dashboards
- implementation remains lightweight and maintainable
