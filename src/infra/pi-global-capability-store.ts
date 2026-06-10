import fs from 'fs';
import os from 'os';
import path from 'path';
import type { HarnessAttachment } from '../types.js';

const GLOBAL_PI_DIR = path.join(os.homedir(), '.omni', 'harness', 'pi');
const GLOBAL_PI_CAPABILITIES_PATH = path.join(GLOBAL_PI_DIR, 'capabilities.json');
const PI_SOURCE_REPO = '/tmp/pi-vs-claude-code';
const DISLER_SCAN_ROOT = '/tmp/disler-omni-scan';

function ensureGlobalPiDir(): void {
  fs.mkdirSync(GLOBAL_PI_DIR, { recursive: true });
}

function attachmentId(kind: HarnessAttachment['kind'], filePath: string): string {
  return `${kind}:${filePath}`;
}

function attachmentName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function isUnsupportedPiArtifact(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return new Set([
    'agent-chain.ts',
    'agent-team.ts',
    'coms.ts',
    'coms-net.ts',
    'coms-net-server.ts',
    'cross-agent.ts',
    'pi-pi.ts',
    'subagent-widget.ts',
  ]).has(base);
}

function readExistingGlobalCapabilities(): HarnessAttachment[] {
  try {
    if (!fs.existsSync(GLOBAL_PI_CAPABILITIES_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(GLOBAL_PI_CAPABILITIES_PATH, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HarnessAttachment =>
      Boolean(item && typeof item === 'object' && typeof (item as HarnessAttachment).id === 'string'),
    );
  } catch {
    return [];
  }
}

function walkFiles(root: string, predicate: (filePath: string) => boolean): string[] {
  const results: string[] = [];
  function visit(dir: string): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        entry.name === '.git' ||
        entry.name === 'node_modules' ||
        entry.name === '.venv' ||
        entry.name === 'dist'
      )
        continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && predicate(fullPath)) results.push(fullPath);
    }
  }
  if (fs.existsSync(root)) visit(root);
  return results.sort((a, b) => a.localeCompare(b));
}

function skillName(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^name:\s*(.+)$/m);
    if (content.startsWith('---') && match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    // Fall back to folder name.
  }
  return path.basename(filePath) === 'SKILL.md'
    ? path.basename(path.dirname(filePath))
    : attachmentName(filePath);
}

function scanDislerSkills(): HarnessAttachment[] {
  const roots = [PI_SOURCE_REPO, DISLER_SCAN_ROOT].filter((root) => fs.existsSync(root));
  const seen = new Set<string>();
  const skills: HarnessAttachment[] = [];
  for (const root of roots) {
    for (const filePath of walkFiles(root, (candidate) => path.basename(candidate) === 'SKILL.md')) {
      const id = attachmentId('skill', filePath);
      if (seen.has(id)) continue;
      seen.add(id);
      skills.push({
        id,
        name: skillName(filePath),
        harness: 'pi',
        kind: 'skill',
        path: filePath,
        source: 'imported',
        required: false,
        risk: ['prompt-only'],
        cost: 'unknown',
      });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function scanPiVsClaudeCodeRepo(): HarnessAttachment[] {
  if (!fs.existsSync(PI_SOURCE_REPO)) return [];
  const capabilities: HarnessAttachment[] = [];

  const packageJsonPath = path.join(PI_SOURCE_REPO, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    capabilities.push({
      id: attachmentId('pi-package', PI_SOURCE_REPO),
      name: 'pi-vs-claude-code',
      harness: 'pi',
      kind: 'pi-package',
      path: PI_SOURCE_REPO,
      source: 'imported',
      required: false,
      risk: ['unknown'],
      cost: 'unknown',
    });
  }

  const extensionDir = path.join(PI_SOURCE_REPO, 'extensions');
  if (fs.existsSync(extensionDir)) {
    for (const entry of fs.readdirSync(extensionDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const filePath = path.join(extensionDir, entry.name);
      if (isUnsupportedPiArtifact(filePath)) continue;
      capabilities.push({
        id: attachmentId('pi-extension', filePath),
        name: attachmentName(filePath),
        harness: 'pi',
        kind: 'pi-extension',
        path: filePath,
        source: 'imported',
        required: false,
        risk: ['unknown'],
        cost: 'unknown',
      });
    }
  }

  capabilities.push(...scanDislerSkills());

  const promptRoot = path.join(PI_SOURCE_REPO, '.pi', 'prompts');
  if (fs.existsSync(promptRoot)) {
    for (const filePath of walkFiles(promptRoot, (candidate) => candidate.endsWith('.md'))) {
      capabilities.push({
        id: attachmentId('prompt-template', filePath),
        name: attachmentName(filePath),
        harness: 'pi',
        kind: 'prompt-template',
        path: filePath,
        source: 'imported',
        required: false,
        risk: ['prompt-only'],
        cost: 'low',
      });
    }
  }

  const themeRoot = path.join(PI_SOURCE_REPO, '.pi', 'themes');
  if (fs.existsSync(themeRoot)) {
    for (const filePath of walkFiles(themeRoot, (candidate) => candidate.endsWith('.json'))) {
      capabilities.push({
        id: attachmentId('theme', filePath),
        name: attachmentName(filePath),
        harness: 'pi',
        kind: 'theme',
        path: filePath,
        source: 'imported',
        required: false,
        risk: ['prompt-only'],
        cost: 'low',
      });
    }
  }

  const agentDir = path.join(PI_SOURCE_REPO, '.pi', 'agents');
  if (fs.existsSync(agentDir)) {
    for (const entry of fs.readdirSync(agentDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = path.join(agentDir, entry.name);
      capabilities.push({
        id: attachmentId('command-pack', filePath),
        name: attachmentName(filePath),
        harness: 'pi',
        kind: 'command-pack',
        path: filePath,
        source: 'imported',
        required: false,
        risk: ['prompt-only'],
        cost: 'unknown',
      });
    }
  }

  return capabilities.sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));
}

export function syncGlobalPiCapabilities(): HarnessAttachment[] {
  ensureGlobalPiDir();
  const merged = new Map<string, HarnessAttachment>();
  for (const capability of readExistingGlobalCapabilities()) {
    if (capability.kind === 'command-pack' && capability.path && !capability.path.endsWith('.md')) continue;
    if (capability.path && isUnsupportedPiArtifact(capability.path)) continue;
    merged.set(capability.id, capability);
  }
  for (const capability of scanPiVsClaudeCodeRepo()) merged.set(capability.id, capability);
  const deduped = new Map<string, HarnessAttachment>();
  for (const capability of [...merged.values()].sort((a, b) => {
    const aScore = a.path?.startsWith(PI_SOURCE_REPO) ? 0 : 1;
    const bScore = b.path?.startsWith(PI_SOURCE_REPO) ? 0 : 1;
    return aScore - bScore;
  })) {
    deduped.set(`${capability.kind}:${capability.name.toLowerCase()}`, capability);
  }
  const capabilities = [...deduped.values()].sort((a, b) =>
    `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`),
  );
  fs.writeFileSync(GLOBAL_PI_CAPABILITIES_PATH, JSON.stringify(capabilities, null, 2) + '\n', 'utf-8');
  return capabilities;
}

export function globalPiCapabilitiesPath(): string {
  ensureGlobalPiDir();
  return GLOBAL_PI_CAPABILITIES_PATH;
}
