import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import type { AgentTemplate } from '../types.js';

const TEMPLATE_DIR = path.join(os.homedir(), '.omni', 'agent-templates');

function ensureTemplateDir(): void {
  fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
}

const STARTER_TEMPLATES: Array<Omit<AgentTemplate, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'starter-pi-planner',
    name: 'Pi Planner',
    description: 'Break work into steps, identify risks, and coordinate Task Requests before implementation.',
    harness: 'pi',
    tags: ['planning'],
    capabilityIds: [],
  },
  {
    id: 'starter-pi-reviewer',
    name: 'Pi Reviewer',
    description: 'Review changes for correctness, maintainability, test coverage, and project conventions.',
    harness: 'pi',
    tags: ['review'],
    capabilityIds: [],
  },
  {
    id: 'starter-pi-debugger',
    name: 'Pi Debugger',
    description: 'Diagnose failures, reproduce bugs, and propose minimal fixes with regression checks.',
    harness: 'pi',
    tags: ['debugging'],
    capabilityIds: [],
  },
];

function seedStarterTemplates(): void {
  const existing = new Set(
    fs
      .readdirSync(TEMPLATE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(/\.json$/, '')),
  );
  const now = new Date().toISOString();
  for (const starter of STARTER_TEMPLATES) {
    if (existing.has(safeStem(starter.id))) continue;
    const template: AgentTemplate = { ...starter, createdAt: now, updatedAt: now };
    fs.writeFileSync(templatePath(starter.id), JSON.stringify(template, null, 2) + '\n', 'utf-8');
  }
}

function safeStem(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'agent-template'
  );
}

function templatePath(id: string): string {
  return path.join(TEMPLATE_DIR, `${safeStem(id)}.json`);
}

export function listAgentTemplates(): AgentTemplate[] {
  ensureTemplateDir();
  seedStarterTemplates();
  const templates: AgentTemplate[] = [];
  for (const entry of fs.readdirSync(TEMPLATE_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(TEMPLATE_DIR, entry.name), 'utf-8'),
      ) as AgentTemplate;
      if (parsed.id && parsed.name && parsed.harness) templates.push(parsed);
    } catch {}
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export function saveAgentTemplate(input: Partial<AgentTemplate>): AgentTemplate {
  ensureTemplateDir();
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const existing = listAgentTemplates().find((template) => template.id === id);
  const template: AgentTemplate = {
    id,
    name: String(input.name || existing?.name || 'Agent Template'),
    description: String(input.description ?? existing?.description ?? ''),
    harness: String(input.harness || existing?.harness || 'pi'),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : (existing?.tags ?? []),
    capabilityIds: Array.isArray(input.capabilityIds)
      ? input.capabilityIds.map(String)
      : (existing?.capabilityIds ?? []),
    toolMcpIds: Array.isArray(input.toolMcpIds) ? input.toolMcpIds.map(String) : (existing?.toolMcpIds ?? []),
    skillPluginIds: Array.isArray(input.skillPluginIds)
      ? input.skillPluginIds.map(String)
      : (existing?.skillPluginIds ?? []),
    agentPrompt: String(input.agentPrompt ?? existing?.agentPrompt ?? ''),
    roleAndObjective: String(input.roleAndObjective ?? existing?.roleAndObjective ?? ''),
    instructions: String(input.instructions ?? existing?.instructions ?? ''),
    workflow: String(input.workflow ?? existing?.workflow ?? ''),
    omniGuide: String(input.omniGuide ?? existing?.omniGuide ?? ''),
    projectContext: String(input.projectContext ?? existing?.projectContext ?? ''),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  fs.writeFileSync(templatePath(id), JSON.stringify(template, null, 2) + '\n', 'utf-8');
  return template;
}

export function deleteAgentTemplate(id: string): boolean {
  ensureTemplateDir();
  if (STARTER_TEMPLATES.some((template) => template.id === id)) return false;
  const filePath = templatePath(id);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function agentTemplateDir(): string {
  ensureTemplateDir();
  seedStarterTemplates();
  return TEMPLATE_DIR;
}
