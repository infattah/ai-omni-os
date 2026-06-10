import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ensureProjectMemory,
  saveStartupBriefing,
  appendProjectTaskSummary,
  ensureAgentContextFile,
  generateHandoffSnapshot,
  readProjectSummary,
  saveProjectSummary,
  readAgentContext,
  saveAgentContext,
} from './project-memory-store.js';
import type { ContextStore } from '../store/context-store.js';
import type { TaskRequest } from '../types.js';

// CHARACTERIZATION TESTS. These pin TODAY's on-disk output for each Project Memory
// file kind to prove the slice-003 relocation changed nothing (A3). They assert
// "unchanged", NOT "correct" — e.g. the blank-line stripping in the project summary
// below is a current quirk that these tests deliberately lock in, not endorse.

let repo: string;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-pm-'));
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

function makeTask(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: 't1',
    humanId: 'TASK-1',
    requester: 'dev',
    target: '#all',
    title: 'Title',
    details: '',
    expectedResult: '',
    priority: 'normal',
    status: 'completed',
    owner: 'codex',
    parentTaskId: null,
    filePaths: [],
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('project-memory-store characterization', () => {
  it('seeds project.md and config.json with their exact contents', () => {
    ensureProjectMemory(repo);

    expect(fs.readFileSync(path.join(repo, '.omni', 'summaries', 'project.md'), 'utf-8')).toBe(
      '# Project Summary\n\nNo completed Omni task summaries yet.\n',
    );
    expect(fs.readFileSync(path.join(repo, '.omni', 'config.json'), 'utf-8')).toBe('{\n  "version": 1\n}\n');
    expect(fs.existsSync(path.join(repo, '.omni', 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(repo, '.omni', 'briefings'))).toBe(true);
  });

  it('writes a Startup Briefing file with the content plus a trailing newline', () => {
    const briefingPath = saveStartupBriefing(repo, 'codex', '# Briefing\n- rule');

    expect(briefingPath.startsWith(path.join(repo, '.omni', 'briefings'))).toBe(true);
    expect(fs.readFileSync(briefingPath, 'utf-8')).toBe('# Briefing\n- rule\n');
  });

  it('appends a completed-task summary in the current format (blank lines stripped)', () => {
    appendProjectTaskSummary(repo, makeTask(), 'shipped to prod');

    expect(fs.readFileSync(path.join(repo, '.omni', 'summaries', 'project.md'), 'utf-8')).toBe(
      '# Project Summary\n## TASK-1: Title\n- Status: completed\n- Owner: codex\n- Target: #all\n- Priority: normal\n- Completed at: 2026-05-31T00:00:00.000Z\n- Result: shipped to prod',
    );
  });

  it('seeds an Agent Context file with the current layout', () => {
    ensureAgentContextFile(repo, { name: 'codex', harness: 'pi', tags: ['review'] });

    const content = fs.readFileSync(path.join(repo, '.omni', 'agents', 'codex.md'), 'utf-8');
    expect(content).toMatchInlineSnapshot(`
      "# Agent Context: codex

      Harness: pi
      Tags: review

      ## Purpose

      General-purpose Agent Instance. The Dev can edit this context in Omni.




      ## Omni Collaboration Environment

      - Follow the Omni Collaboration Contract.
      - Use Chat for coordination with the Dev and other Agent Instances.
      - Use Task Requests to accept, progress, block, complete, or reject work.
      - Claim Work before editing shared files and release claims when done.
      - Update this Agent Context at meaningful task boundaries.




      ## Resumable Memory

      No resumable memory recorded yet.
      "
    `);
  });

  it('does not overwrite an existing Agent Context file', () => {
    const contextPath = path.join(repo, '.omni', 'agents', 'codex.md');
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, 'EDITED BY DEV', 'utf-8');

    ensureAgentContextFile(repo, { name: 'codex', harness: 'pi', tags: ['review'] });

    expect(fs.readFileSync(contextPath, 'utf-8')).toBe('EDITED BY DEV');
  });

  it('reads the Project Summary verbatim and reports its path; missing file reads as empty', () => {
    // Missing file before seeding: empty content, but the path still points at project.md.
    const missing = readProjectSummary(repo);
    expect(missing.content).toBe('');
    expect(missing.path).toBe(path.join(repo, '.omni', 'summaries', 'project.md'));

    ensureProjectMemory(repo);
    const seeded = readProjectSummary(repo);
    expect(seeded.content).toBe('# Project Summary\n\nNo completed Omni task summaries yet.\n');
    expect(seeded.path).toBe(path.join(repo, '.omni', 'summaries', 'project.md'));
  });

  it('saves the Project Summary content byte-for-byte and round-trips through read', () => {
    const written = saveProjectSummary(repo, '# Edited\n\nDev notes.\n');
    expect(written).toBe(path.join(repo, '.omni', 'summaries', 'project.md'));
    expect(fs.readFileSync(written, 'utf-8')).toBe('# Edited\n\nDev notes.\n');
    expect(readProjectSummary(repo).content).toBe('# Edited\n\nDev notes.\n');
  });

  it('reads Agent Context verbatim and reports its path; missing file reads as empty', () => {
    const missing = readAgentContext(repo, 'codex');
    expect(missing.content).toBe('');
    expect(missing.path).toBe(path.join(repo, '.omni', 'agents', 'codex.md'));

    ensureAgentContextFile(repo, { name: 'codex', harness: 'pi', tags: ['review'] });
    const seeded = readAgentContext(repo, 'codex');
    expect(seeded.content).toBe(fs.readFileSync(path.join(repo, '.omni', 'agents', 'codex.md'), 'utf-8'));
    expect(seeded.path).toBe(path.join(repo, '.omni', 'agents', 'codex.md'));
  });

  it('saves Agent Context content byte-for-byte at the safe-stem path and round-trips through read', () => {
    const written = saveAgentContext(repo, 'codex', 'EDITED BY DEV\n');
    expect(written).toBe(path.join(repo, '.omni', 'agents', 'codex.md'));
    expect(fs.readFileSync(written, 'utf-8')).toBe('EDITED BY DEV\n');
    expect(readAgentContext(repo, 'codex').content).toBe('EDITED BY DEV\n');
  });

  it('writes a handoff snapshot with the current sections and rendered rows', () => {
    const store = {
      listTasks: () => [makeTask({ status: 'completed' })],
      listWorkClaims: () => [
        {
          id: 'w1',
          agentName: 'codex',
          path: 'src/x.ts',
          note: 'wip',
          status: 'active' as const,
          createdAt: '',
          updatedAt: '',
        },
      ],
      listActivityEvents: () => [
        {
          id: 'a1',
          kind: 'task.created',
          summary: 'TASK-1 created',
          payload: {},
          timestamp: '2026-05-31T00:00:00.000Z',
        },
      ],
    } as unknown as ContextStore;

    const handoffPath = generateHandoffSnapshot(repo, store, [
      {
        id: 'i1',
        name: 'codex',
        tags: ['review'],
        groupIds: [],
        harness: 'pi',
        cwd: repo,
        status: 'running',
        createdAt: '',
      },
    ]);

    const normalized = fs
      .readFileSync(handoffPath, 'utf-8')
      .replace(/^Generated: .*$/m, 'Generated: <ts>')
      .replace(/^Repository: .*$/m, 'Repository: <repo>');
    expect(normalized).toMatchInlineSnapshot(`
      "# Omni Handoff

      Repository: <repo>
      Generated: <ts>

      ## Agent Instances

      - @codex: pi · running · tags: review

      ## Active Work Claims

      - src/x.ts: @codex — wip

      ## Task Requests

      - TASK-1: Title · completed · owner: codex · target: #all

      ## Recent Activity

      - 2026-05-31T00:00:00.000Z: TASK-1 created
      "
    `);
  });
});
