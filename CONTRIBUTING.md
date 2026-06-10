# Contributing to Omni

Thanks for considering a contribution. This project is small enough to understand in an afternoon if you read the right three documents first.

## Read these before writing code

1. `AGENTS.md` — the working guide: commands, architecture, conventions. It is written for AI coding agents but applies equally to humans.
2. `CONTEXT.md` — the domain glossary. Use its vocabulary in code, tests, and PRs. Each term lists synonyms to avoid.
3. `docs/adr/` — settled architectural decisions with their reasoning. Several explicitly pre-empt refactors that look obvious but were rejected for a reason. If your change contradicts an ADR, say so in the PR ("Contradicts ADR-000X because...") instead of silently overriding it.

## Setup

```bash
npm install
npm run dev    # dashboard at http://127.0.0.1:3456/?token=...
```

Node 20+. For interactive agent launches you also need tmux (`brew install tmux` / `apt install tmux`).

## Checks

CI runs all four of these on every PR; run them locally first:

```bash
npm run lint           # biome (a11y findings are warnings — don't add new ones)
npm run build:server   # tsc, the type-check gate (strict mode)
npm test               # vitest, unit + integration
npm run build:client   # vite
```

Playwright e2e (`npm run test:e2e`) binds port 3456, so stop the dev server before running it.

## Conventions

- Modules ship next to a `.test.ts(x)` sibling. Match that for new code.
- Vitest runs in the node environment by default. React component tests opt into jsdom per file with a `// @vitest-environment jsdom` docblock.
- Push logic into a domain module behind a port. `DevCommandIntake` stays a shallow router; deep logic lives in `src/domain/`.
- Update `AGENTS.md`, `CONTEXT.md`, and the relevant ADR in the same commit as a behavior change. Stale docs cause AI agents (and humans) to build against fiction.

## The headline contribution: add a harness

Omni's whole point is harness interoperability, and the architecture keeps the cost of a new harness low:

1. Add a registry entry in `src/domain/harness-registry.ts` with a Launch Recipe and a delivery declaration (`native-push` if the harness's connector can wake the agent, `terminal-paste` if it is pull-only MCP).
2. Enable it in `client/src/harnesses.ts`.
3. Coordination code should not need to change. If you find yourself branching on a harness name in the domain, stop — that is the one thing ADR 0005 forbids.

## Reporting issues

Open a GitHub issue with what you ran, what you expected, and what happened. For agent-launch problems, include your platform, whether tmux is installed, and the harness involved.
