import fs from 'fs';
import path from 'path';
import os from 'os';

export interface RuntimeConfigInput {
  runtimeRoot?: string;
  serverUrl: string;
  sessionToken: string;
  agentId: string;
  agentName: string;
  harness: string;
  repositoryPath: string;
}

export interface RuntimeConfigResult {
  path: string;
  env: Record<string, string>;
}

export function defaultRuntimeRoot(): string {
  return path.join(os.tmpdir(), 'omni', 'runtime');
}

export function writeRuntimeConfig(input: RuntimeConfigInput): RuntimeConfigResult {
  const runtimeRoot = input.runtimeRoot ?? defaultRuntimeRoot();
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });

  const configPath = path.join(runtimeRoot, `${input.agentId}.json`);
  const config = {
    version: 1,
    serverUrl: input.serverUrl,
    sessionToken: input.sessionToken,
    agent: {
      id: input.agentId,
      name: input.agentName,
      harness: input.harness,
    },
    repositoryPath: input.repositoryPath,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });

  return {
    path: configPath,
    env: {
      OMNI_RUNTIME_CONFIG: configPath,
    },
  };
}
