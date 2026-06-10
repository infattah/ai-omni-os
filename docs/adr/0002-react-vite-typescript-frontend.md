# ADR 0002: Use React, Vite, and TypeScript for the frontend

## Status

Accepted

## Context

The current Omni frontend is a single plain HTML file with inline JavaScript. The desired product is now a coordination dashboard with multiple interactive regions: Repository status, Agent Instances, Presence, chat channels, Task Requests, Work Claims, Agent Context editing, archived/deleted agents, and resume flows.

The existing plain JavaScript approach has already shown problems, including invalid TypeScript syntax inside browser JavaScript and stale end-to-end tests. As the dashboard grows, state management and UI consistency will become harder without a typed frontend structure.

## Decision

Omni will use React, Vite, and TypeScript for the v1 frontend.

The frontend should model Omni coordination concepts directly, including Agent Instances, Coordination Signals, Task Requests, Presence, Work Claims, and Agent Context.

## Consequences

The project gains a frontend build step and component structure, but the dashboard becomes easier to evolve and test.

The existing `client/index.html` should be treated as prototype material rather than the long-term frontend architecture.
