import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function omniPiConnectorExtensionPath(cwd: string = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, 'src/infra/pi-connector-extension/omni-pi-connector.ts'),
    path.resolve(__dirname, 'pi-connector-extension/omni-pi-connector.ts'),
    path.resolve(__dirname, '../../src/infra/pi-connector-extension/omni-pi-connector.ts'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Omni Pi connector extension not found. Tried: ${candidates.join(', ')}`);
  }

  return found;
}
