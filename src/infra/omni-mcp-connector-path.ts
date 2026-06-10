import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the generic Omni MCP connector that any MCP-capable harness launches.
 * Mirrors omniPiConnectorExtensionPath: tries the dev source layout first, then locations
 * relative to this compiled module.
 */
export function omniMcpConnectorPath(cwd: string = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, 'src/infra/omni-mcp-connector/omni-mcp-connector.ts'),
    path.resolve(__dirname, 'omni-mcp-connector/omni-mcp-connector.ts'),
    path.resolve(__dirname, '../../src/infra/omni-mcp-connector/omni-mcp-connector.ts'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Omni MCP connector not found. Tried: ${candidates.join(', ')}`);
  }

  return found;
}

/**
 * Absolute path to the project-local tsx binary. tsx is a devDependency (not global), so the
 * connector subprocess is run the same way the server runs in dev. Searches upward from cwd so it
 * resolves whether the server runs from the repo root or a built location.
 */
export function localTsxBinPath(cwd: string = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, 'node_modules/.bin/tsx'),
    path.resolve(__dirname, '../../node_modules/.bin/tsx'),
    path.resolve(__dirname, '../../../node_modules/.bin/tsx'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Local tsx binary not found. Tried: ${candidates.join(', ')}`);
  }

  return found;
}
