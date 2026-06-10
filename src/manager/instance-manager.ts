import { spawn, execSync, execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AgentLifecyclePort,
  CreateOptions,
  ManagedInstanceInfo,
  ManagedStatus,
} from '../ports/agent-lifecycle.js';
import { stripAnsi } from '../domain/ansi-strip.js';
import { routeStreamJsonLine, buildStreamJsonUserMessage } from './stream-json.js';

export type ExitHandler = (id: string) => void;
export type TurnEndHandler = (text?: string) => void;

interface ManagedInstance {
  info: ManagedInstanceInfo;
  stdin?: NodeJS.WritableStream;
  streamJson?: boolean;
  pollTimer?: ReturnType<typeof setInterval>;
  exitTimer?: ReturnType<typeof setInterval>;
  outputListeners: Array<(data: string) => void>;
  exitListeners: ExitHandler[];
  turnEndListeners: TurnEndHandler[];
  lineBuffer: string;
  commandPath?: string;
  flushTimer?: ReturnType<typeof setInterval>;
  /** tmux session/window target when launched into tmux (ADR 0007); undefined for Terminal.app. */
  tmuxTarget?: TmuxTarget;
}

const TMP_DIR = '/tmp/omni';
const defaultChildProcess = { spawn, execSync, execFileSync };
type ChildProcessFns = typeof defaultChildProcess;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Escapes a value for interpolation inside a double-quoted AppleScript string literal.
function appleScriptQuote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildTerminalScriptCommand(opts: CreateOptions, logPath: string, donePath: string): string {
  const envPrefix = Object.entries(opts.env ?? {})
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(' ');
  const harnessCmd = [opts.harness, ...opts.args].map(shellQuote).join(' ');
  const commandWithEnv = envPrefix ? `${envPrefix} ${harnessCmd}` : harnessCmd;
  const inner = `cd ${shellQuote(opts.cwd)} && ${commandWithEnv}`;
  return `/usr/bin/script -q ${shellQuote(logPath)} /bin/bash -lc ${shellQuote(inner)}; touch ${shellQuote(donePath)}`;
}

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// --- tmux backend (ADR 0007) -------------------------------------------------
// One tmux session per Agent Harness (namespaced by Repository), one window per Agent Instance. The
// window runs the *same* `script -q <log> bash -lc '<cmd>'; touch <done>` command as the Terminal.app
// backend, so all log-polling / exit-sentinel machinery is reused — tmux only changes launch, send,
// and remove. Topology is decoupled from routing: the hub talks to agents over their identity-bound
// WebSocket Session (ADR 0005), never through tmux, so how windows are grouped never affects A2A or
// cross-harness comms. The only leg that needs the tmux target is the delivery-paste (send-keys).

export interface TmuxTarget {
  session: string;
  window: string;
}

/** Stable Repository hash suffix used in tmux session names. */
export function tmuxRepoHash(repoPath: string): string {
  return createHash('sha1').update(path.resolve(repoPath)).digest('hex').slice(0, 8);
}

/** `session:window` form used for every tmux `-t` target. */
export function tmuxTargetRef(target: TmuxTarget): string {
  return `${target.session}:${target.window}`;
}

/**
 * Deterministic, tmux-safe session name grouping a harness within a Repository (ADR 0007):
 * `omni-<harness>-<repohash>`. Same (harness, repo) → same session; a different harness or a
 * different Repository → a different session, keeping harnesses grouped and Repositories isolated.
 */
export function tmuxSessionName(harnessName: string, repoPath: string): string {
  const safeHarness = (harnessName || 'agent').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 24);
  const hash = tmuxRepoHash(repoPath);
  return `omni-${safeHarness}-${hash}`;
}

/** tmux window name for an Agent Instance. Strips '.'/':' which would break `session:window` targets. */
export function tmuxWindowName(agentName: string): string {
  return agentName.replace(/[.:]/g, '-');
}

/** `tmux` argv to launch the agent: open the session on its first window, add a window thereafter. */
export function buildTmuxLaunchArgs(
  session: string,
  window: string,
  shellCmd: string,
  sessionExists: boolean,
): string[] {
  return sessionExists
    ? ['new-window', '-t', session, '-n', window, shellCmd]
    : ['new-session', '-d', '-s', session, '-n', window, shellCmd];
}

/** `tmux send-keys` argv to type literal text into a window (Enter is sent separately, see below). */
export function buildTmuxSendTextArgs(target: string, text: string): string[] {
  return ['send-keys', '-t', target, '-l', '--', text];
}

/** `tmux send-keys` argv to submit the typed line. */
export function buildTmuxSendEnterArgs(target: string): string[] {
  return ['send-keys', '-t', target, 'Enter'];
}

/** `tmux kill-window` argv to close only this agent's window (the session dies with its last window). */
export function buildTmuxKillWindowArgs(target: string): string[] {
  return ['kill-window', '-t', target];
}

/** `tmux list-clients` argv to detect whether a session is currently attached to a terminal. */
export function buildTmuxListClientsArgs(session: string): string[] {
  return ['list-clients', '-t', session];
}

/** `tmux list-sessions` argv to discover all Omni sessions for a Repository. */
export function buildTmuxListSessionsArgs(): string[] {
  return ['list-sessions', '-F', '#{session_name}'];
}

/** `tmux switch-client` argv to move an attached Terminal client to another harness session. */
export function buildTmuxSwitchClientArgs(client: string, session: string): string[] {
  return ['switch-client', '-c', client, '-t', session];
}

/** `tmux select-window` argv to focus a specific agent window inside a session. */
export function buildTmuxSelectWindowArgs(target: string): string[] {
  return ['select-window', '-t', target];
}

/** Shell command a Terminal.app window runs to show a harness's tmux session live. */
export function buildTmuxAttachCommand(session: string): string {
  return `tmux attach -t ${shellQuote(session)}`;
}

function tmuxHasSession(session: string, runExecSync: typeof execSync = execSync): boolean {
  try {
    runExecSync(`tmux has-session -t ${shellQuote(session)}`, { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function tmuxHasAttachedClient(
  session: string,
  runExecFileSync: typeof execFileSync = execFileSync,
): boolean {
  try {
    const output = runExecFileSync('tmux', buildTmuxListClientsArgs(session), {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    return output.toString('utf-8').trim().length > 0;
  } catch {
    return false;
  }
}

function firstTmuxClientName(output: Buffer | string): string | null {
  const firstLine = output
    .toString()
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.split(/\s+/)[0] ?? null;
}

export class InstanceManager implements AgentLifecyclePort {
  private instances = new Map<string, ManagedInstance>();
  private backendAvailability: { terminal: boolean; tmux: boolean } | null = null;

  constructor(private childProcess: ChildProcessFns = defaultChildProcess) {}

  // Which interactive launch backends this machine can actually run. Probed once per server run:
  // tmux needs the binary on PATH, Terminal.app needs a macOS GUI.
  detectLaunchBackends(): { terminal: boolean; tmux: boolean } {
    if (this.backendAvailability) return this.backendAvailability;
    let tmux = false;
    try {
      this.childProcess.execFileSync('tmux', ['-V'], { stdio: 'ignore', timeout: 2000 });
      tmux = true;
    } catch {
      tmux = false;
    }
    this.backendAvailability = { terminal: process.platform === 'darwin', tmux };
    return this.backendAvailability;
  }

  create(opts: CreateOptions): ManagedInstanceInfo {
    ensureTmpDir();
    if (opts.openTerminal) {
      return opts.tmux ? this.createWithTmux(opts) : this.createWithTerminal(opts);
    }
    return this.createHeadless(opts);
  }

  private createHeadless(opts: CreateOptions): ManagedInstanceInfo {
    const proc = this.childProcess.spawn(opts.harness, opts.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: opts.cwd,
      env: { ...(process.env as Record<string, string>), ...(opts.env ?? {}) },
    });

    const managed: ManagedInstance = {
      info: { id: opts.id, name: opts.name, status: 'active', harness: opts.harness },
      stdin: proc.stdin ?? undefined,
      streamJson: opts.streamJson,
      outputListeners: [],
      exitListeners: [],
      turnEndListeners: [],
      lineBuffer: '',
    };

    // stream-json agents: parse each stdout line into events (assistant text → output listeners;
    // result → turn-end). Raw agents keep the line-buffered stripAnsi behaviour.
    const handleStdoutLine = (line: string): void => {
      if (opts.streamJson) {
        routeStreamJsonLine(line, {
          onText: (raw) => {
            const text = raw.trim();
            if (!text) return;
            for (const listener of managed.outputListeners) listener(text);
          },
          onTurnEnd: (text) => {
            for (const handler of managed.turnEndListeners) handler(text);
          },
        });
        return;
      }
      const text = stripAnsi(line).trim();
      if (!text) return;
      for (const listener of managed.outputListeners) listener(text);
    };

    const stdoutBuf = { buffer: '' };
    proc.stdout?.on('data', (data: Buffer) => {
      stdoutBuf.buffer += data.toString('utf-8');
      const lines = stdoutBuf.buffer.split('\n');
      stdoutBuf.buffer = lines.pop() || '';
      for (const line of lines) handleStdoutLine(line);
    });

    const stderrBuf = { buffer: '' };
    proc.stderr?.on('data', (data: Buffer) => {
      stderrBuf.buffer += data.toString('utf-8');
      const lines = stderrBuf.buffer.split('\n');
      stderrBuf.buffer = lines.pop() || '';
      for (const line of lines) {
        const text = stripAnsi(line).trim();
        if (!text) continue;
        for (const listener of managed.outputListeners) {
          listener(text);
        }
      }
    });

    const headlessFlushTimer = setInterval(() => {
      // Don't flush a partial stream-json line as output — it isn't a complete event yet.
      if (!opts.streamJson && stdoutBuf.buffer) {
        const text = stripAnsi(stdoutBuf.buffer).trim();
        if (text) {
          for (const listener of managed.outputListeners) {
            listener(text);
          }
        }
        stdoutBuf.buffer = '';
      }
      if (stderrBuf.buffer) {
        const text = stripAnsi(stderrBuf.buffer).trim();
        if (text) {
          for (const listener of managed.outputListeners) {
            listener(text);
          }
        }
        stderrBuf.buffer = '';
      }
    }, 1000);
    managed.flushTimer = headlessFlushTimer;

    proc.on('exit', () => {
      managed.info.status = 'dead';
      clearInterval(headlessFlushTimer);
      for (const handler of managed.exitListeners) {
        handler(opts.id);
      }
    });

    this.instances.set(opts.id, managed);
    return managed.info;
  }

  private createWithTerminal(opts: CreateOptions): ManagedInstanceInfo {
    const id = opts.id;
    const logPath = path.join(TMP_DIR, `${id}.log`);
    const donePath = path.join(TMP_DIR, `${id}.done`);
    const commandPath = path.join(TMP_DIR, `${id}.command`);

    // Clean up any leftover sentinel
    try {
      fs.unlinkSync(donePath);
    } catch {}
    try {
      fs.unlinkSync(commandPath);
    } catch {}

    // Build the command to run inside Terminal.app via script(1)
    // macOS script syntax: script [-aq] [-F file] [-t time] [file [command ...]]
    const shellCmd = buildTerminalScriptCommand(opts, logPath, donePath);
    fs.writeFileSync(commandPath, shellCmd, 'utf-8');
    const launchCommand = `bash ${shellQuote(commandPath)}`;

    const appleScript = `
      tell application "Terminal"
        activate
        set newWin to (do script "${appleScriptQuote(launchCommand)}")
        set custom title of newWin to "Omni: ${appleScriptQuote(opts.name)}"
      end tell
    `;

    this.childProcess.spawn('osascript', ['-e', appleScript]);

    const managed: ManagedInstance = {
      info: { id, name: opts.name, status: 'active', harness: opts.harness },
      outputListeners: [],
      exitListeners: [],
      turnEndListeners: [],
      lineBuffer: '',
      commandPath,
    };

    this.attachLogPolling(managed, id, logPath, donePath);
    this.instances.set(id, managed);
    return managed.info;
  }

  private createWithTmux(opts: CreateOptions): ManagedInstanceInfo {
    const id = opts.id;
    const logPath = path.join(TMP_DIR, `${id}.log`);
    const donePath = path.join(TMP_DIR, `${id}.done`);

    // Clean up any leftover sentinel
    try {
      fs.unlinkSync(donePath);
    } catch {}

    // Same command the Terminal.app backend runs — script(1) to a log, sentinel on exit — but hosted
    // in a tmux window instead of a Terminal window, so the log-polling tail below is identical.
    const shellCmd = buildTerminalScriptCommand(opts, logPath, donePath);
    const session = tmuxSessionName(opts.harnessName ?? opts.harness, opts.cwd);
    const window = tmuxWindowName(opts.name);

    const sessionExisted = tmuxHasSession(session, this.childProcess.execSync);
    this.childProcess.spawn('tmux', buildTmuxLaunchArgs(session, window, shellCmd, sessionExisted), {
      stdio: 'ignore',
    });
    this.focusTmuxTargetForRepo(opts.cwd, { session, window });

    const managed: ManagedInstance = {
      info: { id, name: opts.name, status: 'active', harness: opts.harness },
      outputListeners: [],
      exitListeners: [],
      turnEndListeners: [],
      lineBuffer: '',
      tmuxTarget: { session, window },
    };

    this.attachLogPolling(managed, id, logPath, donePath);
    this.instances.set(id, managed);
    return managed.info;
  }

  private openTerminalAttachedToTmux(session: string): void {
    const escaped = appleScriptQuote(buildTmuxAttachCommand(session));
    const appleScript = `
      tell application "Terminal"
        activate
        set newWin to (do script "${escaped}")
        set custom title of newWin to "Omni tmux: ${appleScriptQuote(session)}"
      end tell
    `;
    this.childProcess.spawn('osascript', ['-e', appleScript]);
  }

  private repoAttachedClient(repoPath: string): string | null {
    const repoHash = tmuxRepoHash(repoPath);
    const repoSessionPattern = new RegExp(`^omni-.+-${repoHash}$`);
    try {
      const output = this.childProcess.execFileSync('tmux', buildTmuxListSessionsArgs(), {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000,
      });
      const sessions = output
        .toString('utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((session) => repoSessionPattern.test(session));
      for (const session of sessions) {
        try {
          const clients = this.childProcess.execFileSync('tmux', buildTmuxListClientsArgs(session), {
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 2000,
          });
          const client = firstTmuxClientName(clients);
          if (client) return client;
        } catch {}
      }
    } catch {}
    return null;
  }

  private focusTmuxTargetForRepo(repoPath: string, target: TmuxTarget): void {
    const client = this.repoAttachedClient(repoPath);
    if (!client) {
      this.openTerminalAttachedToTmux(target.session);
      return;
    }
    try {
      this.childProcess.execFileSync('tmux', buildTmuxSwitchClientArgs(client, target.session), {
        stdio: 'ignore',
        timeout: 2000,
      });
      this.childProcess.execFileSync('tmux', buildTmuxSelectWindowArgs(tmuxTargetRef(target)), {
        stdio: 'ignore',
        timeout: 2000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[instance-manager] tmux focus failed for ${tmuxTargetRef(target)}: ${msg}`);
      this.openTerminalAttachedToTmux(target.session);
    }
  }

  reopenTerminal(opts: CreateOptions): ManagedInstanceInfo {
    ensureTmpDir();
    const session = tmuxSessionName(opts.harnessName ?? opts.harness, opts.cwd);
    const window = tmuxWindowName(opts.name);
    const liveSession = tmuxHasSession(session, this.childProcess.execSync);

    if (!liveSession) {
      return this.createWithTmux({ ...opts, openTerminal: true, tmux: true });
    }

    let managed = this.instances.get(opts.id);
    if (!managed) {
      const logPath = path.join(TMP_DIR, `${opts.id}.log`);
      const donePath = path.join(TMP_DIR, `${opts.id}.done`);
      managed = {
        info: { id: opts.id, name: opts.name, status: 'active', harness: opts.harness },
        outputListeners: [],
        exitListeners: [],
        turnEndListeners: [],
        lineBuffer: '',
        tmuxTarget: { session, window },
      };
      this.attachLogPolling(managed, opts.id, logPath, donePath);
      this.instances.set(opts.id, managed);
    }

    this.focusTmuxTargetForRepo(opts.cwd, { session, window });
    return managed.info;
  }

  terminalAttached(opts: CreateOptions): boolean {
    if (!opts.tmux) return true;
    const session = tmuxSessionName(opts.harnessName ?? opts.harness, opts.cwd);
    return tmuxHasAttachedClient(session, this.childProcess.execFileSync);
  }

  /**
   * Shared output/exit machinery for the script(1)-backed terminal backends (Terminal.app and tmux):
   * tail the log file into output listeners, flush stale partial lines, and fire exit on the done
   * sentinel or when the underlying `script` process dies (window closed manually).
   */
  private attachLogPolling(managed: ManagedInstance, id: string, logPath: string, donePath: string): void {
    // Poll log file for new output
    let logPos = 0;
    const pollTimer = setInterval(() => {
      try {
        const size = fs.statSync(logPath).size;
        if (size > logPos) {
          const fd = fs.openSync(logPath, 'r');
          const buf = Buffer.alloc(size - logPos);
          fs.readSync(fd, buf, 0, buf.length, logPos);
          fs.closeSync(fd);
          logPos = size;
          managed.lineBuffer += buf.toString('utf-8');
          const lines = managed.lineBuffer.split('\n');
          managed.lineBuffer = lines.pop() || '';
          for (const line of lines) {
            const text = stripAnsi(line).trim();
            if (!text) continue;
            for (const listener of managed.outputListeners) {
              listener(text);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[instance-manager] log poll error for ${id}: ${msg}`);
      }
    }, 200);
    managed.pollTimer = pollTimer;

    // Flush any stale partial line every 2 seconds
    const flushTimer = setInterval(() => {
      if (managed.lineBuffer) {
        const text = stripAnsi(managed.lineBuffer).trim();
        if (text) {
          for (const listener of managed.outputListeners) {
            listener(text);
          }
        }
        managed.lineBuffer = '';
      }
    }, 2000);
    managed.flushTimer = flushTimer;

    // Poll for exit sentinel or process death
    const exitTimer = setInterval(() => {
      if (fs.existsSync(donePath)) {
        managed.info.status = 'dead';
        clearInterval(pollTimer);
        clearInterval(exitTimer);
        if (managed.flushTimer) clearInterval(managed.flushTimer);
        managed.pollTimer = undefined;
        managed.exitTimer = undefined;
        managed.flushTimer = undefined;
        for (const handler of managed.exitListeners) {
          handler(id);
        }
        return;
      }
      // Also check if the script process is still alive
      // (handles manual Terminal window close)
      try {
        this.childProcess.execSync(`pgrep -f "script.*${id}\\.log"`, { stdio: 'ignore', timeout: 1000 });
      } catch {
        // Process not found — agent exited without sentinel (e.g. user closed window)
        managed.info.status = 'dead';
        clearInterval(pollTimer);
        clearInterval(exitTimer);
        if (managed.flushTimer) clearInterval(managed.flushTimer);
        managed.pollTimer = undefined;
        managed.exitTimer = undefined;
        managed.flushTimer = undefined;
        for (const handler of managed.exitListeners) {
          handler(id);
        }
      }
    }, 2000);
    managed.exitTimer = exitTimer;
  }

  onExit(id: string, handler: ExitHandler): void {
    const inst = this.instances.get(id);
    if (inst) {
      inst.exitListeners.push(handler);
    }
  }

  list(): ManagedInstanceInfo[] {
    return Array.from(this.instances.values()).map((m) => m.info);
  }

  getStatus(id: string): ManagedStatus | undefined {
    return this.instances.get(id)?.info.status;
  }

  sendInput(id: string, text: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;

    if (inst.stdin) {
      // Headless stream-json agents are woken by a framed user message on stdin (push-inject); raw
      // harnesses (Pi/cat over a pipe) take the text verbatim.
      inst.stdin.write(inst.streamJson ? buildStreamJsonUserMessage(text) + '\n' : text);
      return;
    }

    if (inst.tmuxTarget) {
      this.sendInputToTmux(tmuxTargetRef(inst.tmuxTarget), text);
      return;
    }

    this.sendInputToTerminal(id, text);
  }

  private sendInputToTmux(target: string, text: string): void {
    // Type the message literally, then submit with Enter — two calls so a literal newline in the
    // text can't be mistaken for the submit key, and so ordering is deterministic.
    const body = text.replace(/\n$/, '');
    try {
      this.childProcess.execFileSync('tmux', buildTmuxSendTextArgs(target, body), {
        stdio: 'ignore',
        timeout: 2000,
      });
      this.childProcess.execFileSync('tmux', buildTmuxSendEnterArgs(target), {
        stdio: 'ignore',
        timeout: 2000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[instance-manager] sendInput to tmux failed for ${target}: ${msg}`);
    }
  }

  onTurnEnd(id: string, handler: TurnEndHandler): void {
    const inst = this.instances.get(id);
    if (inst) {
      inst.turnEndListeners.push(handler);
    }
  }

  private sendInputToTerminal(id: string, text: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;

    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const scriptPath = path.join(TMP_DIR, `${id}.applescript`);
    const script = [
      `try`,
      `  tell application "Terminal"`,
      `    try`,
      `      set win to first window whose custom title contains "Omni: ${inst.info.name}"`,
      `    on error`,
      `      try`,
      `        set win to first window whose custom title contains "Omni:"`,
      `      on error`,
      `        return "ERROR: no Omni window found for ${inst.info.name}"`,
      `      end try`,
      `    end try`,
      `    activate`,
      `    set index of win to 1`,
      `  end tell`,
      `  delay 0.05`,
      `  set oldClipboard to (the clipboard as text)`,
      `  set the clipboard to "${escapedText}"`,
      `  delay 0.05`,
      `  tell application "System Events" to keystroke "v" using command down`,
      `  delay 0.05`,
      `  tell application "System Events" to keystroke return`,
      `  delay 0.05`,
      `  set the clipboard to oldClipboard`,
      `  return "OK"`,
      `on error errMsg`,
      `  return "ERROR: " & errMsg`,
      `end try`,
    ].join('\n');

    try {
      fs.writeFileSync(scriptPath, script, 'utf-8');
      const proc = this.childProcess.spawn('osascript', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      let result = '';
      proc.stdout?.on('data', (d: Buffer) => {
        result += d.toString();
      });
      proc.on('close', (code) => {
        try {
          fs.unlinkSync(scriptPath);
        } catch {}
        if (code !== 0 || result.startsWith('ERROR')) {
          console.error(
            `[instance-manager] sendInput to terminal failed for ${id}: ${result || 'exit code ' + code}`,
          );
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[instance-manager] sendInput to terminal failed for ${id}: ${msg}`);
    }
  }

  onOutput(id: string, listener: (data: string) => void): void {
    const inst = this.instances.get(id);
    if (inst) {
      inst.outputListeners.push(listener);
    }
  }

  remove(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;

    const hadPollTimer = !!inst.pollTimer;
    if (inst.pollTimer) clearInterval(inst.pollTimer);
    if (inst.exitTimer) clearInterval(inst.exitTimer);
    if (inst.flushTimer) clearInterval(inst.flushTimer);

    // Close only this agent's window. tmux: kill-window (the session dies with its last window).
    if (inst.tmuxTarget) {
      try {
        this.childProcess.spawn('tmux', buildTmuxKillWindowArgs(tmuxTargetRef(inst.tmuxTarget)), {
          stdio: 'ignore',
        });
      } catch {}
    } else if (hadPollTimer) {
      const closeScript = path.join(TMP_DIR, `${id}.close.applescript`);
      try {
        fs.writeFileSync(
          closeScript,
          [
            `tell application "Terminal"`,
            `  set win to first window whose custom title contains "Omni: ${inst.info.name}"`,
            `  if win exists then close win`,
            `end tell`,
          ].join('\n'),
          'utf-8',
        );
        this.childProcess.spawn('osascript', [closeScript], { stdio: 'ignore' });
        try {
          fs.unlinkSync(closeScript);
        } catch {}
      } catch {}
    }

    // Cleanup temp files
    try {
      fs.unlinkSync(path.join(TMP_DIR, `${id}.log`));
    } catch {}
    try {
      fs.unlinkSync(path.join(TMP_DIR, `${id}.done`));
    } catch {}
    if (inst.commandPath) {
      try {
        fs.unlinkSync(inst.commandPath);
      } catch {}
    }

    inst.exitListeners = [];
    inst.outputListeners = [];
    inst.turnEndListeners = [];
    this.instances.delete(id);
  }

  killAll(): void {
    for (const [id] of this.instances) {
      this.remove(id);
    }
  }
}
