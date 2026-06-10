import path from 'path';
import fs from 'fs';
import type { ContextStore } from '../store/context-store.js';
import type { AgentInstance, TaskRequest } from '../types.js';

export function ensureProjectMemoryIgnored(repoPath: string): void {
  const gitignore = path.join(repoPath, '.gitignore');
  const entry = '.omni/';

  try {
    const existing = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf-8') : '';
    const lines = existing.split(/\r?\n/).map((line) => line.trim());
    if (lines.includes(entry) || lines.includes('.omni')) return;

    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignore, `${existing}${prefix}${entry}\n`, 'utf-8');
  } catch (err) {
    console.error(
      `[server] ensureProjectMemoryIgnored: write failed for ${repoPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function safeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
}

export function ensureProjectMemory(repoPath: string): string {
  const omniDir = path.join(repoPath, '.omni');
  const agentsDir = path.join(omniDir, 'agents');
  const summariesDir = path.join(omniDir, 'summaries');
  const briefingsDir = path.join(omniDir, 'briefings');
  const projectSummary = path.join(summariesDir, 'project.md');
  const configPath = path.join(omniDir, 'config.json');

  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(summariesDir, { recursive: true });
  fs.mkdirSync(briefingsDir, { recursive: true });

  if (!fs.existsSync(projectSummary)) {
    fs.writeFileSync(projectSummary, '# Project Summary\n\nNo completed Omni task summaries yet.\n', 'utf-8');
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ version: 1 }, null, 2) + '\n', 'utf-8');
  }

  ensureProjectMemoryIgnored(repoPath);
  return omniDir;
}

export function saveStartupBriefing(repoPath: string, agentName: string, content: string): string {
  const briefingsDir = path.join(repoPath, '.omni', 'briefings');
  fs.mkdirSync(briefingsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const briefingPath = path.join(briefingsDir, `${timestamp}-${safeFileStem(agentName)}.md`);
  fs.writeFileSync(briefingPath, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
  return briefingPath;
}

export function generateHandoffSnapshot(
  repoPath: string,
  store: ContextStore,
  agents: AgentInstance[],
): string {
  const handoffsDir = path.join(repoPath, '.omni', 'handoffs');
  fs.mkdirSync(handoffsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const handoffPath = path.join(handoffsDir, `${timestamp}-handoff.md`);
  const tasks = store.listTasks(100);
  const workClaims = store.listWorkClaims(100).filter((claim) => claim.status === 'active');
  const activity = store.listActivityEvents(20);
  const content = [
    '# Omni Handoff',
    '',
    `Repository: ${repoPath}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Agent Instances',
    '',
    agents.length === 0
      ? 'No Agent Instances recorded.'
      : agents
          .map(
            (agent) =>
              `- @${agent.name}: ${agent.harness} · ${agent.status} · tags: ${agent.tags.join(', ') || 'none'}`,
          )
          .join('\n'),
    '',
    '## Active Work Claims',
    '',
    workClaims.length === 0
      ? 'No active Work Claims.'
      : workClaims
          .map((claim) => `- ${claim.path}: @${claim.agentName}${claim.note ? ` — ${claim.note}` : ''}`)
          .join('\n'),
    '',
    '## Task Requests',
    '',
    tasks.length === 0
      ? 'No Task Requests recorded.'
      : tasks
          .map(
            (task) =>
              `- ${task.humanId}: ${task.title} · ${task.status} · owner: ${task.owner ?? 'none'} · target: ${task.target}`,
          )
          .join('\n'),
    '',
    '## Recent Activity',
    '',
    activity.length === 0
      ? 'No recent activity.'
      : activity.map((event) => `- ${event.timestamp}: ${event.summary}`).join('\n'),
    '',
  ].join('\n');
  fs.writeFileSync(handoffPath, content, 'utf-8');
  return handoffPath;
}

export function appendProjectTaskSummary(repoPath: string, task: TaskRequest, resultSummary: string): void {
  const summaryPath = path.join(repoPath, '.omni', 'summaries', 'project.md');
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  const existing = fs.existsSync(summaryPath)
    ? fs.readFileSync(summaryPath, 'utf-8')
    : '# Project Summary\n\n';
  const entry = [
    '',
    `## ${task.humanId}: ${task.title}`,
    '',
    `- Status: ${task.status}`,
    `- Owner: ${task.owner ?? 'none'}`,
    `- Target: ${task.target}`,
    `- Priority: ${task.priority}`,
    `- Completed at: ${task.updatedAt}`,
    resultSummary ? `- Result: ${resultSummary}` : undefined,
    '',
  ]
    .filter(Boolean)
    .join('\n');
  fs.writeFileSync(summaryPath, `${existing.trimEnd()}\n${entry}`, 'utf-8');
}

export function projectSummaryPath(repoPath: string): string {
  return path.join(repoPath, '.omni', 'summaries', 'project.md');
}

export function readProjectSummary(repoPath: string): { content: string; path: string } {
  const summaryPath = projectSummaryPath(repoPath);
  const content = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf-8') : '';
  return { content, path: summaryPath };
}

export function saveProjectSummary(repoPath: string, content: string): string {
  const summaryPath = projectSummaryPath(repoPath);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, content, 'utf-8');
  return summaryPath;
}

export function agentContextPath(repoPath: string, agentName: string): string {
  return path.join(repoPath, '.omni', 'agents', `${safeFileStem(agentName)}.md`);
}

export function readAgentContext(repoPath: string, agentName: string): { content: string; path: string } {
  const contextPath = agentContextPath(repoPath, agentName);
  const content = fs.existsSync(contextPath) ? fs.readFileSync(contextPath, 'utf-8') : '';
  return { content, path: contextPath };
}

export function saveAgentContext(repoPath: string, agentName: string, content: string): string {
  const contextPath = agentContextPath(repoPath, agentName);
  fs.mkdirSync(path.dirname(contextPath), { recursive: true });
  fs.writeFileSync(contextPath, content, 'utf-8');
  return contextPath;
}

export function ensureAgentContextFile(
  repoPath: string,
  agent: {
    name: string;
    harness: string;
    tags: string[];
    description?: string;
    agentPrompt?: string;
    roleAndObjective?: string;
    instructions?: string;
    workflow?: string;
    omniGuide?: string;
    projectContext?: string;
  },
): void {
  const agentsDir = path.join(repoPath, '.omni', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const contextPath = agentContextPath(repoPath, agent.name);
  if (fs.existsSync(contextPath)) return;

  const content = [
    `# Agent Context: ${agent.name}`,
    '',
    `Harness: ${agent.harness}`,
    `Tags: ${agent.tags.length > 0 ? agent.tags.join(', ') : 'none'}`,
    '',
    '## Purpose',
    '',
    agent.description || 'General-purpose Agent Instance. The Dev can edit this context in Omni.',
    '',
    agent.agentPrompt ? '## Agent Prompt' : undefined,
    agent.agentPrompt ? '' : undefined,
    agent.agentPrompt || undefined,
    '## Omni Collaboration Environment',
    '',
    agent.omniGuide ||
      '- Follow the Omni Collaboration Contract.\n- Use Chat for coordination with the Dev and other Agent Instances.\n- Use Task Requests to accept, progress, block, complete, or reject work.\n- Claim Work before editing shared files and release claims when done.\n- Update this Agent Context at meaningful task boundaries.',
    agent.projectContext ? '## Project Context' : undefined,
    agent.projectContext ? '' : undefined,
    agent.projectContext || undefined,
    '',
    '## Resumable Memory',
    '',
    'No resumable memory recorded yet.',
    '',
  ].join('\n');

  fs.writeFileSync(contextPath, content, 'utf-8');
}
