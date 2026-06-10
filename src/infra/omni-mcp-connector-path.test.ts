import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { omniMcpConnectorPath, localTsxBinPath } from './omni-mcp-connector-path.js';

describe('omniMcpConnectorPath', () => {
  it('resolves to an absolute existing connector path in dev mode', () => {
    const connectorPath = omniMcpConnectorPath();

    expect(connectorPath).toContain('omni-mcp-connector.ts');
    expect(connectorPath.startsWith('/')).toBe(true);
    expect(existsSync(connectorPath)).toBe(true);
  });
});

describe('localTsxBinPath', () => {
  it('resolves to the project-local tsx binary that exists', () => {
    const tsxPath = localTsxBinPath();

    expect(tsxPath.endsWith('/node_modules/.bin/tsx')).toBe(true);
    expect(tsxPath.startsWith('/')).toBe(true);
    expect(existsSync(tsxPath)).toBe(true);
  });
});
