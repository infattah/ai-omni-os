# Harness Attachments and Agent Blueprints

## Purpose

Omni should protect each Agent Instance's Token Budget by avoiding globally loaded, irrelevant harness capabilities. A specialised Agent Instance should start with only the Omni connector plus the skills, extensions, MCP servers, tools, commands, or plugins that are relevant to its work.

This document records the future design. V1 implements only the small Pi foundation described below.

## Problem

Most AI CLI harnesses can load extra capabilities:

- skills
- extensions
- MCP servers
- plugins
- command packs
- tools
- harness-specific config

When these are globally enabled, every launched agent may receive their tool descriptions, schemas, instructions, or prompt context. That can waste context and make specialised agents less focused.

Tokens are precious; Omni should help the Dev keep terminals clean.

## Canonical concepts

### Harness Attachment

A harness-specific optional capability that Omni can attach to one Agent Instance at launch time.

Examples:

- Pi extension
- Pi skill
- Claude Code MCP server
- Codex tool bridge
- command pack
- prompt-only skill

The Omni Connector is required for Omni-managed Agent Instances.

### Harness Health

A warning system that detects globally enabled harness capabilities that may be loaded into every Agent Instance.

Harness Health is advisory only:

- Omni warns.
- Omni does not automatically edit external harness configuration.
- Manual fix instructions appear only when the Dev asks for them.

Harness Health appears in two places:

1. full Agent Harness settings area
2. compact warning in Hire Agent when risk is detected

### Attachment Cost

A low, medium, high, or unknown estimate of Token Budget impact.

Attachment Cost is separate from security risk:

- a prompt-only skill can be high cost
- a filesystem tool can be low cost

Omni may estimate Attachment Cost from:

- prompt length
- number of tools
- tool schema size
- MCP-advertised tools
- extension metadata

The Dev can override the estimate.

### Context Load Summary

A compact Hire Agent summary showing estimated Token Budget impact before launch.

It includes:

- Omni Connector
- seed Agent Context
- selected Harness Attachments
- relevant Harness Options

It is always shown when hiring from a Blueprint or customized launch flow. High estimated load produces a soft warning with a Launch Anyway option, not a hard block.

### Agent Blueprint

A reusable global definition for hiring an Agent Instance.

It contains:

- name
- description
- recommended Agent Harness
- default Tags
- seed Agent Context
- selected Harness Attachments
- Harness Options
- launch defaults

Agent Blueprints are not running agents.

### Project Agent Blueprint

A Repository-specific full copy of a global Agent Blueprint.

It lives in Project Memory and is private/gitignored by default:

```txt
<repo>/.omni/blueprints/
```

Global blueprints live in Omni global marketplace storage, for example:

```txt
~/.omni/blueprints/
```

Omni-managed global harness capability metadata lives outside Repository Project Memory, for example:

```txt
~/.omni/harness/general/capabilities.json
~/.omni/harness/pi/capabilities.json
```

The Pi global file records imported/registerable Pi skills, extensions, single-agent presets, tools, MCP servers, and other Pi-specific capabilities that Omni can offer in Harness and Agent Template surfaces. Pi skills found in known Pi project folders, such as Bowser from `pi-vs-claude-code`, are imported as Omni global Pi capabilities without enabling them globally in Pi. Agent-to-agent communication, team, chain, workflow, and subagent-style Pi extensions are excluded because Omni already owns local agent coordination.

The General global file records universal Omni capabilities that may be reusable across harnesses. The `improve-codebase-architecture` skill from Matt Pocock's skills repository is registered there as a universal skill rather than being installed globally into Pi.

Importing a global Agent Blueprint into a Repository creates a full independent copy, not a live link.

## Desired Settings structure

```txt
Settings
  Agent Harnesses
    Pi
      Harness Health
      Available Harness Attachments
      Detected candidate attachments
      Imported/registered attachments

    Claude Code
      Harness Health
      Available Harness Attachments

    Codex
      Harness Health
      Available Harness Attachments

  Agent Marketplace
    Global Agent Blueprints
    Filter by Agent Harness
    Import Blueprint to Project
```

## Desired Project structure

```txt
Project
  Project Agent Blueprints
    Frontend Builder
      Edit Blueprint
      Hire Agent
      Duplicate
      Promote to Global Blueprint
```

## Scan + import rule

Omni may scan known harness folders and config files to detect candidate attachments.

Detected items are never auto-attached.

The Dev must explicitly:

1. import/register a detected item as a Harness Attachment
2. attach it to an Agent Blueprint, Project Agent Blueprint, or one-time Hire Agent launch

## Risk metadata

Every Harness Attachment carries risk metadata.

Suggested categories:

```txt
prompt-only
filesystem-read
filesystem-write
shell
network
secrets
unknown
```

Blueprints, imports, and suggestions show risk summaries.

High-risk examples:

- launch command changes
- environment variables
- new MCP servers
- filesystem write tools
- shell tools
- network-capable tools
- secret/API-key access

High-risk Blueprint Suggestions require stronger confirmation than a normal approve button.

## Hire Agent from Blueprint

Hiring from a Project Agent Blueprint should be editable at launch time.

Dev can adjust:

- Agent Instance name
- Tags
- Harness Attachments
- Harness Options

The launch form includes:

- reset-to-blueprint option
- Context Load Summary
- compact Harness Health warning if risk is detected
- Launch Anyway for high estimated load

## Editing and promoting blueprints

The Dev may edit Project Agent Blueprints any time, including:

- seed Agent Context
- Tags
- Harness Attachments
- Harness Options

A useful Project Agent Blueprint can be promoted into a new separate global Agent Blueprint.

Promotion uses a review step asking the Dev to clean/generalize Repository-specific context before saving globally.

## Blueprint Suggestions

A running Agent Instance may suggest improvements to a Project Agent Blueprint.

Blueprint Suggestions are structured Coordination Signals, not normal chat.

A Blueprint Suggestion includes:

- source Agent Instance
- target Project Agent Blueprint
- proposed change
- reason
- risk level
- approval state

They appear in:

- Needs Attention
- blueprint editing surfaces

The Dev must approve before a suggestion changes a Project Agent Blueprint.

## Marketplace scope

Agent Marketplace is local-first.

V1 has no online marketplace.

Later, Omni may allow manual import from blueprint files. Imported blueprint files require a review screen where the Dev manually reviews:

- context
- Harness Attachments
- Harness Options
- risk summary

before saving.

## V1 foundation: Pi only

V1 should implement only a small foundation for Pi:

1. Detect Pi global configuration that may pollute every Pi Agent Instance.
2. Show Harness Health warning for Pi.
3. Keep the Omni Pi Connector required.
4. Allow selected Pi extensions to be attached per Agent Instance launch when possible.
5. Store selected Pi attachments in Project Memory for future resume/launch.
6. Do not implement full Agent Marketplace in v1.
7. Do not implement cross-harness attachments in v1.

V1 should preserve the future model in data shapes and docs without delaying stable Pi coordination.
