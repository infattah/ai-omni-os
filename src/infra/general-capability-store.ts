import fs from 'fs';
import os from 'os';
import path from 'path';
import type { HarnessHealth, HarnessAttachment } from '../types.js';

const GENERAL_DIR = path.join(os.homedir(), '.omni', 'harness', 'general');
const GENERAL_CAPABILITIES_PATH = path.join(GENERAL_DIR, 'capabilities.json');
const IMPROVE_ARCHITECTURE_SKILL_PATH =
  '/Users/infattah/.agents/skills/improve-codebase-architecture/SKILL.md';

function ensureGeneralDir(): void {
  fs.mkdirSync(GENERAL_DIR, { recursive: true });
}

function readExisting(): HarnessAttachment[] {
  try {
    if (!fs.existsSync(GENERAL_CAPABILITIES_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(GENERAL_CAPABILITIES_PATH, 'utf-8')) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is HarnessAttachment => {
          if (!item || typeof item !== 'object' || typeof (item as HarnessAttachment).id !== 'string')
            return false;
          const attachment = item as HarnessAttachment;
          return !attachment.path || fs.existsSync(attachment.path);
        })
      : [];
  } catch {
    return [];
  }
}

function parseSkillDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^description:\s*(.+)$/m);
    return match?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

export function syncGeneralCapabilities(): HarnessAttachment[] {
  ensureGeneralDir();
  const merged = new Map<string, HarnessAttachment>();
  for (const capability of readExisting()) merged.set(capability.id, capability);

  if (fs.existsSync(IMPROVE_ARCHITECTURE_SKILL_PATH)) {
    merged.set(`skill:${IMPROVE_ARCHITECTURE_SKILL_PATH}`, {
      id: `skill:${IMPROVE_ARCHITECTURE_SKILL_PATH}`,
      name: 'improve-codebase-architecture',
      harness: 'general',
      kind: 'skill',
      path: IMPROVE_ARCHITECTURE_SKILL_PATH,
      source: 'imported',
      required: false,
      risk: ['prompt-only'],
      cost: 'medium',
    });
  }

  const deduped = new Map<string, HarnessAttachment>();
  for (const capability of merged.values()) {
    const key = `${capability.kind}:${capability.name.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || capability.path === IMPROVE_ARCHITECTURE_SKILL_PATH) deduped.set(key, capability);
  }
  const capabilities = [...deduped.values()].sort((a, b) =>
    `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`),
  );
  fs.writeFileSync(GENERAL_CAPABILITIES_PATH, JSON.stringify(capabilities, null, 2) + '\n', 'utf-8');
  return capabilities;
}

export function scanGeneralHarnessHealth(): HarnessHealth {
  const detectedAttachments = syncGeneralCapabilities();
  return {
    harness: 'general',
    status: 'ok',
    summary:
      detectedAttachments.length === 0
        ? 'No universal Omni capabilities registered yet.'
        : `${detectedAttachments.length} universal Omni capability${detectedAttachments.length === 1 ? '' : 'ies'} registered.`,
    warnings: [],
    settingsPath: GENERAL_CAPABILITIES_PATH,
    globallyEnabledExtensions: [],
    globallyEnabledSkills: [],
    globallyEnabledMcpServers: [],
    detectedAttachments,
  };
}

export function generalCapabilitiesPath(): string {
  ensureGeneralDir();
  return GENERAL_CAPABILITIES_PATH;
}

export function improveArchitectureSkillDescription(): string {
  return parseSkillDescription(IMPROVE_ARCHITECTURE_SKILL_PATH);
}
