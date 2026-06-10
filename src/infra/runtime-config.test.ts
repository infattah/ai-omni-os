import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeRuntimeConfig } from './runtime-config.js';

describe('writeRuntimeConfig', () => {
  it('writes per-agent runtime connection details outside Project Memory', () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), 'omni-runtime-'));

    const result = writeRuntimeConfig({
      runtimeRoot,
      serverUrl: 'http://127.0.0.1:3456',
      sessionToken: 'secret-token',
      agentId: 'agent-1',
      agentName: 'pi-planner',
      harness: 'pi',
      repositoryPath: '/repo',
    });

    expect(result.env.OMNI_RUNTIME_CONFIG).toBe(result.path);
    expect(result.path.startsWith(runtimeRoot)).toBe(true);

    const config = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(config).toMatchObject({
      version: 1,
      serverUrl: 'http://127.0.0.1:3456',
      sessionToken: 'secret-token',
      agent: {
        id: 'agent-1',
        name: 'pi-planner',
        harness: 'pi',
      },
      repositoryPath: '/repo',
    });
  });
});
