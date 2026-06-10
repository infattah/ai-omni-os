import { describe, expect, it } from 'vitest';
import { getHarness, listHarnessNames, negotiateDelivery } from './harness-registry.js';

describe('harness registry delivery capabilities (009)', () => {
  it('marks Pi as push-capable (its extension wakes it)', () => {
    expect(getHarness('pi')?.deliveryCapabilities).toEqual(['push']);
  });

  it('marks cat as doorbell-only', () => {
    expect(getHarness('cat')?.deliveryCapabilities).toEqual(['doorbell']);
  });

  it('negotiates by capability priority, not harness name', () => {
    expect(negotiateDelivery(['doorbell', 'inject'])).toBe('inject');
    expect(negotiateDelivery(['inject', 'await'], { awaitReady: true })).toBe('await');
    expect(negotiateDelivery(['push', 'await', 'inject'], { awaitReady: true })).toBe('push');
    expect(negotiateDelivery(['await', 'inject'])).toBe('inject');
  });

  it('keeps the registered harness names', () => {
    expect(listHarnessNames()).toEqual(expect.arrayContaining(['pi', 'cat', 'claude-code']));
  });
});

describe('claude-code launch recipe', () => {
  it('launches the claude CLI as a terminal doorbell harness with no repo config file', () => {
    const def = getHarness('claude-code');
    expect(def?.command).toBe('claude');
    expect(def?.deliveryCapabilities).toEqual(['doorbell']);
    expect(def?.mcpConfigFilename).toBeNull();
  });

  it('injects only the Omni MCP connector and pre-approves only its tools', () => {
    const args = getHarness('claude-code')!.defaultArgs('claude-1');
    expect(args).toEqual(expect.arrayContaining(['--strict-mcp-config', '--allowedTools', 'mcp__omni']));
    expect(args).not.toEqual(
      expect.arrayContaining(['-p', '--input-format', 'stream-json', '--output-format']),
    );

    const idx = args.indexOf('--mcp-config');
    expect(idx).toBeGreaterThanOrEqual(0);
    const config = JSON.parse(args[idx + 1]);
    expect(Object.keys(config.mcpServers)).toEqual(['omni']);
    expect(config.mcpServers.omni.args[0]).toContain('omni-mcp-connector.ts');
  });
});

describe('stream-json recipe (006)', () => {
  it('leaves terminal harnesses as non-stream-json (raw)', () => {
    expect(getHarness('claude-code')?.streamJson).toBeFalsy();
    expect(getHarness('pi')?.streamJson).toBeFalsy();
    expect(getHarness('cat')?.streamJson).toBeFalsy();
  });
});
