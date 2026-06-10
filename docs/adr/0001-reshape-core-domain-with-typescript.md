# ADR 0001: Reshape core domain while keeping useful infrastructure

## Status

Accepted

## Context

Omni is being planned as a local visual coordination tool for AI CLI agents. The existing codebase already has useful pieces: a TypeScript server, SQLite-backed Project Memory, a browser dashboard, repository selection, and early routing/persistence tests.

However, the current implementation does not match the desired domain model closely enough. The new product direction centres on Project Memory, Agent Instances, Agent Harnesses, Launch Recipes, Hub-Routed Messages, Coordination Signals, Task Requests, Task Results, Presence, Work Claims, Agent Context, Startup Briefings, Resume Agent, Archive Agent, and Delete Agent.

The team considered patching the current code gradually, fully rewriting from scratch, or reshaping the core domain while keeping useful infrastructure.

## Decision

Omni will keep TypeScript as the main technology stack.

Omni will reshape the core domain around the new model while keeping useful infrastructure where it still fits. This means preserving useful ideas and code where practical, but not forcing the new model into the old abstractions when they conflict.

Useful pieces to keep or adapt include:

- TypeScript project setup
- local Node server
- browser dashboard direction
- SQLite Project Memory approach
- repository `.omni/` storage
- existing tests where they still describe desired behaviour

Areas expected to be rebuilt or significantly reshaped include:

- core domain model
- server message protocol
- Agent Harness and Launch Recipe handling
- Pi connector path
- Task Request lifecycle
- Agent Context files
- Startup Briefing generation
- frontend state/UI around coordination rather than raw terminal output

## Consequences

This avoids a risky full rewrite while preventing the existing prototype architecture from controlling the product design.

The first implementation should be a thin vertical slice rather than a broad refactor. The v1 slice starts with Pi-only support and proves that multiple Pi Agent Instances can be launched, connected, discovered, messaged through Omni, persisted in Project Memory, and resumed later.
