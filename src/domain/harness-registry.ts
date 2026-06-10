import { omniPiConnectorExtensionPath } from '../infra/pi-connector-extension-path.js';
import { omniMcpConnectorPath, localTsxBinPath } from '../infra/omni-mcp-connector-path.js';

export type DeliveryCapability = 'push' | 'await' | 'inject' | 'doorbell';
export type NegotiatedDelivery = 'push' | 'await' | 'inject' | 'doorbell' | 'none';

export interface HarnessDefinition {
  name: string;
  command: string;
  defaultArgs(name: string): string[];
  mcpConfigFilename: string | null;
  mcpConfigContent(mcpUrl: string): string | null;
  deliveryCapabilities: DeliveryCapability[];
  /**
   * Whether this harness speaks Claude Code's stream-json protocol. When true it runs **headless**
   * (no Terminal.app): `InstanceManager` parses its stdout as stream-json events and frames stdin as
   * stream-json user messages (push-inject). The domain branches on this flag, never on the name.
   */
  streamJson?: boolean;
}

const harnesses = new Map<string, HarnessDefinition>();

function register(def: HarnessDefinition) {
  harnesses.set(def.name, def);
}

register({
  name: 'pi',
  command: 'pi',
  defaultArgs() {
    return ['-e', omniPiConnectorExtensionPath()];
  },
  mcpConfigFilename: null,
  mcpConfigContent() {
    return null;
  },
  deliveryCapabilities: ['push'],
});

register({
  name: 'cat',
  command: 'cat',
  defaultArgs() {
    return [];
  },
  mcpConfigFilename: null,
  mcpConfigContent() {
    return null;
  },
  deliveryCapabilities: ['doorbell'],
});

register({
  name: 'claude-code',
  command: 'claude',
  defaultArgs() {
    // Inject ONLY the Omni connector and ignore the Dev's other global MCP servers
    // (--strict-mcp-config) to protect Token Budget; pre-approve ONLY the local-hub tools
    // (--allowedTools mcp__omni) so coordination is hands-off without permission prompts.
    // The connector inherits OMNI_RUNTIME_CONFIG, so this config is identical for every agent
    // and no file is written into the Dev's Repository.
    const mcpConfig = JSON.stringify({
      mcpServers: {
        omni: {
          command: localTsxBinPath(),
          args: [omniMcpConnectorPath()],
        },
      },
    });
    return ['--mcp-config', mcpConfig, '--strict-mcp-config', '--allowedTools', 'mcp__omni'];
  },
  mcpConfigFilename: null,
  mcpConfigContent() {
    return null;
  },
  deliveryCapabilities: ['doorbell'],
});

export function negotiateDelivery(
  capabilities: DeliveryCapability[],
  options: { awaitReady?: boolean } = {},
): NegotiatedDelivery {
  if (capabilities.includes('push')) return 'push';
  if (options.awaitReady && capabilities.includes('await')) return 'await';
  if (capabilities.includes('inject')) return 'inject';
  if (capabilities.includes('doorbell')) return 'doorbell';
  return 'none';
}

export function getHarness(name: string): HarnessDefinition | undefined {
  return harnesses.get(name);
}

export function listHarnessNames(): string[] {
  return Array.from(harnesses.keys());
}
