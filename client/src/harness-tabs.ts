export type HarnessTab = 'general' | 'pi' | 'codex' | 'claude-code' | 'gemini-cli' | 'opencode';

export const harnessTabs: Array<{ id: HarnessTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'pi', label: 'Pi' },
  { id: 'codex', label: 'Codex' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'opencode', label: 'opencode' },
];
