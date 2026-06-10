# Issue tracker

tracker: local-markdown

## Issue creation

Issues live as markdown files under `.scratch/<feature>/` in this repo.

Each issue is a numbered file: `.scratch/<feature>/001-<slug>.md`, `002-<slug>.md`, etc.

## Issue format

Each issue file starts with frontmatter:

```markdown
---
title: <one-line title>
labels: [<triage-label>]
status: open
blocks: []
---

<body: context, acceptance criteria, implementation notes>
```

## Dependency linking

Use `blocks: [001, 002]` in frontmatter to express dependencies (issue numbers within the same feature).
Publish blockers first so their numbers are available for dependent issues.

## Status values

`open`, `in-progress`, `done`, `wontfix`.

## Note

`.scratch/` is currently gitignored. Issues here are local-only working notes. If you want issues
committed to the repo history, remove `.scratch/` from `.gitignore` or move the issue root elsewhere.
