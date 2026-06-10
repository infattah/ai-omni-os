export type ManagedStatus = 'active' | 'dead';

export interface CreateOptions {
  id: string;
  name: string;
  /** Executable/command to run (e.g. `claude`). For the harness *family* used to group tmux sessions, see `harnessName`. */
  harness: string;
  /** Harness family name (e.g. `claude-code`) — the tmux session grouping key (ADR 0007). Falls back to `harness`. */
  harnessName?: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  openTerminal?: boolean;
  /**
   * When opening a terminal, launch into tmux instead of Terminal.app (ADR 0007): one tmux session
   * per Repository (keyed off `cwd`), one window per Agent Instance. Ignored when `openTerminal` is
   * false or `streamJson` is set. Defaults to Terminal.app.
   */
  tmux?: boolean;
  /** Run headless and speak Claude Code's stream-json protocol on stdout/stdin (ADR 0006). */
  streamJson?: boolean;
}

export interface ManagedInstanceInfo {
  id: string;
  name: string;
  status: ManagedStatus;
  harness: string;
}

export interface AgentLifecyclePort {
  create(opts: CreateOptions): ManagedInstanceInfo;
  reopenTerminal(opts: CreateOptions): ManagedInstanceInfo;
  terminalAttached(opts: CreateOptions): boolean;
  list(): ManagedInstanceInfo[];
  getStatus(id: string): ManagedStatus | undefined;
  sendInput(id: string, text: string): void;
  onOutput(id: string, listener: (data: string) => void): void;
  /** Fires when a stream-json agent ends a turn (its `result` event); carries the final text. */
  onTurnEnd(id: string, handler: (text?: string) => void): void;
  onExit(id: string, handler: (id: string) => void): void;
  remove(id: string): void;
  killAll(): void;
}
