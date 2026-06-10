import fs from 'fs';
import os from 'os';
import path from 'path';
import type { HarnessAttachment, HarnessHealth } from '../types.js';
import { syncGlobalPiCapabilities } from './pi-global-capability-store.js';

const PI_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');
const PI_SETTINGS_PATH = path.join(PI_AGENT_DIR, 'settings.json');
const PI_EXTENSIONS_DIR = path.join(PI_AGENT_DIR, 'extensions');
const PI_SKILL_DIRS = [path.join(os.homedir(), '.pi', 'skills'), path.join(PI_AGENT_DIR, 'skills')];
const OMNI_CONNECTOR_LABEL = 'Omni Pi Connector';

function readJson(filePath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function attachmentId(kind: HarnessAttachment['kind'], filePath: string): string {
  return `${kind}:${filePath}`;
}

function attachmentName(filePath: string): string {
  const parsed = path.parse(filePath);
  if (parsed.name === 'index') return path.basename(path.dirname(filePath));
  return parsed.name;
}

function isUnsafeNetworkExtension(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return base === 'coms-net.ts' || base === 'coms-net-server.ts';
}

export function scanPiExtensionAttachments(): HarnessAttachment[] {
  const candidates: string[] = [];
  try {
    if (!fs.existsSync(PI_EXTENSIONS_DIR)) return [];
    for (const entry of fs.readdirSync(PI_EXTENSIONS_DIR, { withFileTypes: true })) {
      const fullPath = path.join(PI_EXTENSIONS_DIR, entry.name);
      if (entry.isFile() && entry.name.endsWith('.ts')) {
        candidates.push(fullPath);
      } else if (entry.isDirectory()) {
        const indexPath = path.join(fullPath, 'index.ts');
        if (fs.existsSync(indexPath)) candidates.push(indexPath);
      }
    }
  } catch {
    return [];
  }

  return candidates
    .filter((filePath) => !isUnsafeNetworkExtension(filePath))
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => ({
      id: attachmentId('pi-extension', filePath),
      name: attachmentName(filePath),
      harness: 'pi',
      kind: 'pi-extension',
      path: filePath,
      source: 'detected',
      required: false,
      risk: isUnsafeNetworkExtension(filePath) ? ['network'] : ['unknown'],
      cost: 'unknown',
    }));
}

export function scanPiSkillAttachments(): HarnessAttachment[] {
  const candidates: string[] = [];
  for (const skillDir of PI_SKILL_DIRS) {
    try {
      if (!fs.existsSync(skillDir)) continue;
      for (const entry of fs.readdirSync(skillDir, { withFileTypes: true })) {
        const fullPath = path.join(skillDir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.md')) candidates.push(fullPath);
        if (entry.isDirectory()) {
          const skillPath = path.join(fullPath, 'SKILL.md');
          if (fs.existsSync(skillPath)) candidates.push(skillPath);
        }
      }
    } catch {}
  }

  return Array.from(new Set(candidates))
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => ({
      id: attachmentId('skill', filePath),
      name:
        path.basename(filePath) === 'SKILL.md'
          ? path.basename(path.dirname(filePath))
          : attachmentName(filePath),
      harness: 'pi',
      kind: 'skill',
      path: filePath,
      source: 'detected',
      required: false,
      risk: ['prompt-only'],
      cost: 'unknown',
    }));
}

export function scanPiHarnessHealth(): HarnessHealth {
  const settings = readJson(PI_SETTINGS_PATH);
  const globallyEnabledExtensions = asStringArray(settings.extensions);
  const globallyEnabledSkills = asStringArray(settings.skills);
  const globallyEnabledMcpServers = asStringArray(settings.mcpServers ?? settings.mcp ?? settings.servers);
  const warnings: string[] = [];

  if (globallyEnabledExtensions.length > 1) {
    warnings.push(
      `${globallyEnabledExtensions.length} Pi extensions are globally enabled and may be loaded into every Pi Agent Instance.`,
    );
  }
  if (globallyEnabledSkills.length > 0) {
    warnings.push(
      `${globallyEnabledSkills.length} Pi skill path${globallyEnabledSkills.length === 1 ? '' : 's'} are globally enabled and may add context to every Pi Agent Instance.`,
    );
  }
  if (globallyEnabledMcpServers.length > 0) {
    warnings.push(
      `${globallyEnabledMcpServers.length} Pi MCP/server entries are globally enabled and may add tools to every Pi Agent Instance.`,
    );
  }

  const status = warnings.length > 0 ? 'warning' : 'ok';
  return {
    harness: 'pi',
    status,
    summary:
      status === 'ok'
        ? 'Pi global configuration looks light.'
        : 'Pi global configuration may add capabilities to every Pi Agent Instance.',
    warnings,
    settingsPath: PI_SETTINGS_PATH,
    globallyEnabledExtensions,
    globallyEnabledSkills,
    globallyEnabledMcpServers,
    detectedAttachments: [
      {
        id: 'pi-extension:omni-connector',
        name: OMNI_CONNECTOR_LABEL,
        harness: 'pi',
        kind: 'pi-extension',
        source: 'omni',
        required: true,
        risk: ['prompt-only'],
        cost: 'low',
      },
      ...scanPiExtensionAttachments(),
      ...scanPiSkillAttachments(),
      ...syncGlobalPiCapabilities(),
    ],
  };
}
