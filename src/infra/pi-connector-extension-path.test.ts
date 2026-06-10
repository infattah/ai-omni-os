import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { omniPiConnectorExtensionPath } from './pi-connector-extension-path.js';

describe('omniPiConnectorExtensionPath', () => {
  it('resolves to an absolute existing connector extension path in dev mode', () => {
    const extensionPath = omniPiConnectorExtensionPath();

    expect(extensionPath).toContain('omni-pi-connector.ts');
    expect(extensionPath.startsWith('/')).toBe(true);
    expect(existsSync(extensionPath)).toBe(true);
  });
});
