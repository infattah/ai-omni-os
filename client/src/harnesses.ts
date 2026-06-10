// Shared Agent Harness config + display helper. Lives in its own module so both the dashboard shell and
// extracted view components can use it without importing from App.
export const harnesses = [
  { id: 'pi', label: 'Pi', enabled: true },
  { id: 'codex', label: 'Codex', enabled: false },
  { id: 'claude-code', label: 'Claude Code', enabled: true },
  { id: 'gemini-cli', label: 'Gemini CLI', enabled: false },
  { id: 'opencode', label: 'opencode', enabled: false },
];

export function formatHarness(harness: string): string {
  return harnesses.find((item) => item.id === harness)?.label ?? harness;
}
