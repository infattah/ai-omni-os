import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import {
  InstanceManager,
  buildTerminalScriptCommand,
  tmuxSessionName,
  tmuxWindowName,
  tmuxTargetRef,
  buildTmuxLaunchArgs,
  buildTmuxAttachCommand,
  buildTmuxSendTextArgs,
  buildTmuxSendEnterArgs,
  buildTmuxKillWindowArgs,
  buildTmuxListClientsArgs,
  buildTmuxSwitchClientArgs,
  buildTmuxSelectWindowArgs,
} from './instance-manager.js';

describe('InstanceManager', () => {
  function tmuxCreateOptions() {
    return {
      id: 'tmux1',
      name: 'planner',
      harness: 'cat',
      harnessName: 'pi',
      args: [],
      cwd: '/tmp/repo',
      openTerminal: true,
      tmux: true,
    };
  }

  it('reopens a live tmux session by attaching Terminal.app without creating a duplicate window', () => {
    const childProcess = { spawn: vi.fn(), execSync: vi.fn(), execFileSync: vi.fn() };
    const mgr = new InstanceManager(childProcess as never);

    mgr.reopenTerminal(tmuxCreateOptions());

    expect(childProcess.execSync).toHaveBeenCalled();
    expect(childProcess.spawn).toHaveBeenCalledTimes(1);
    expect(childProcess.spawn.mock.calls[0][0]).toBe('osascript');
    expect(childProcess.spawn.mock.calls.some((call) => call[0] === 'tmux')).toBe(false);
  });

  it('relaunches a tmux agent when its session is gone', () => {
    const childProcess = {
      spawn: vi.fn(),
      execSync: vi.fn(() => {
        throw new Error('missing session');
      }),
      execFileSync: vi.fn(),
    };
    const mgr = new InstanceManager(childProcess as never);

    mgr.reopenTerminal(tmuxCreateOptions());

    const tmuxLaunch = childProcess.spawn.mock.calls.find((call) => call[0] === 'tmux');
    expect(tmuxLaunch?.[1]).toContain('new-session');
    expect(childProcess.spawn.mock.calls.some((call) => call[0] === 'osascript')).toBe(true);
  });

  it('spawns a process with PTY and captures output', async () => {
    const mgr = new InstanceManager();
    const output: string[] = [];

    mgr.create({
      id: 't1',
      name: 't1',
      harness: 'echo',
      args: ['hello pty'],
      cwd: '/tmp',
      openTerminal: false,
    });
    mgr.onOutput('t1', (d) => output.push(d));

    await new Promise((r) => setTimeout(r, 1000));
    expect(output.some((l) => l.includes('hello pty'))).toBe(true);
    mgr.remove('t1');
  });

  it('builds a Terminal script command that passes env vars and cwd through script(1)', () => {
    const command = buildTerminalScriptCommand(
      {
        id: 'env-terminal',
        name: 'env-terminal',
        harness: 'cat',
        args: [],
        cwd: '/tmp/repo with spaces',
        env: { OMNI_RUNTIME_CONFIG: '/tmp/omni/runtime/env-terminal.json' },
        openTerminal: true,
      },
      '/tmp/omni/env-terminal.log',
      '/tmp/omni/env-terminal.done',
    );

    expect(command).toContain('/usr/bin/script -q');
    expect(command).toContain('/bin/bash -lc');
    expect(command).toContain(
      "cd '\\''/tmp/repo with spaces'\\'' && OMNI_RUNTIME_CONFIG='\\''/tmp/omni/runtime/env-terminal.json'\\'' '\\''cat'\\''",
    );
    expect(command).toContain("; touch '/tmp/omni/env-terminal.done'");
    expect(command).not.toContain("script -q '/tmp/omni/env-terminal.log' OMNI_RUNTIME_CONFIG=");
  });

  it('launches Terminal.app through a temp command file so JSON args are not embedded in AppleScript', () => {
    const childProcess = { spawn: vi.fn(), execSync: vi.fn(), execFileSync: vi.fn() };
    const writeFile = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const mgr = new InstanceManager(childProcess as never);
    const opts = {
      id: 'claude-terminal',
      name: 'claude-terminal',
      harness: 'claude',
      args: ['--mcp-config', '{"mcpServers":{"omni":{"url":"http://127.0.0.1:3456/mcp"}}}'],
      cwd: '/tmp/repo',
      openTerminal: true,
      tmux: false,
    };

    mgr.create(opts);

    const commandPath = '/tmp/omni/claude-terminal.command';
    const appleScript = childProcess.spawn.mock.calls[0][1][1];
    expect(appleScript).toContain(`do script "bash '${commandPath}'"`);
    expect(appleScript).not.toContain('--mcp-config');
    expect(appleScript).not.toContain('mcpServers');
    expect(writeFile).toHaveBeenCalledWith(
      commandPath,
      buildTerminalScriptCommand(opts, '/tmp/omni/claude-terminal.log', '/tmp/omni/claude-terminal.done'),
      'utf-8',
    );

    mgr.remove('claude-terminal');
    writeFile.mockRestore();
  });

  it('still launches a simple Terminal.app harness through the command file', () => {
    const childProcess = { spawn: vi.fn(), execSync: vi.fn(), execFileSync: vi.fn() };
    const writeFile = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const mgr = new InstanceManager(childProcess as never);

    mgr.create({
      id: 'pi-terminal',
      name: 'pi-terminal',
      harness: 'pi',
      args: [],
      cwd: '/tmp/repo',
      openTerminal: true,
      tmux: false,
    });

    const commandPath = '/tmp/omni/pi-terminal.command';
    const appleScript = childProcess.spawn.mock.calls[0][1][1];
    expect(appleScript).toContain(`do script "bash '${commandPath}'"`);
    expect(appleScript).toContain('set custom title of newWin to "Omni: pi-terminal"');
    expect(writeFile).toHaveBeenCalledWith(
      commandPath,
      buildTerminalScriptCommand(
        {
          id: 'pi-terminal',
          name: 'pi-terminal',
          harness: 'pi',
          args: [],
          cwd: '/tmp/repo',
          openTerminal: true,
          tmux: false,
        },
        '/tmp/omni/pi-terminal.log',
        '/tmp/omni/pi-terminal.done',
      ),
      'utf-8',
    );

    mgr.remove('pi-terminal');
    writeFile.mockRestore();
  });

  it('passes per-agent environment variables to headless processes', async () => {
    const mgr = new InstanceManager();
    const output: string[] = [];

    mgr.create({
      id: 'env1',
      name: 'env1',
      harness: process.execPath,
      args: ['-e', 'console.log(process.env.OMNI_RUNTIME_CONFIG)'],
      cwd: '/tmp',
      env: { OMNI_RUNTIME_CONFIG: '/tmp/omni/runtime/env1.json' },
      openTerminal: false,
    });
    mgr.onOutput('env1', (d) => output.push(d));

    await new Promise((r) => setTimeout(r, 1000));
    expect(output).toContain('/tmp/omni/runtime/env1.json');
    mgr.remove('env1');
  });

  it('echoes stdin back via sendInput with PTY', async () => {
    const mgr = new InstanceManager();
    const output: string[] = [];

    mgr.create({ id: 't2', name: 't2', harness: 'cat', args: [], cwd: '/tmp', openTerminal: false });
    mgr.onOutput('t2', (d) => output.push(d));
    await new Promise((r) => setTimeout(r, 500));

    mgr.sendInput('t2', 'roundtrip\n');
    await new Promise((r) => setTimeout(r, 1000));
    expect(output.some((l) => l.includes('roundtrip'))).toBe(true);
    mgr.remove('t2');
  });

  it('groups one tmux session per harness, namespaced (isolated) per Repository', () => {
    // Same harness + same Repository → same session (one session per harness), trailing-slash stable.
    expect(tmuxSessionName('claude-code', '/Users/me/proj')).toBe(
      tmuxSessionName('claude-code', '/Users/me/proj/'),
    );
    // Same Repository, different harness → different session (grouped by harness).
    expect(tmuxSessionName('claude-code', '/Users/me/proj')).not.toBe(
      tmuxSessionName('pi', '/Users/me/proj'),
    );
    // Same harness, different Repository → different session (Repositories stay isolated).
    expect(tmuxSessionName('claude-code', '/Users/me/proj')).not.toBe(
      tmuxSessionName('claude-code', '/Users/me/other'),
    );
    // Name carries the harness and is tmux-safe (no '.', ':' or spaces).
    const session = tmuxSessionName('claude-code', '/Users/me/proj');
    expect(session).toMatch(/^omni-claude-code-[a-f0-9]+$/);
    expect(session).not.toMatch(/[.: ]/);
  });

  it('sanitizes window names so dots and colons cannot break tmux targets', () => {
    expect(tmuxWindowName('frontend')).toBe('frontend');
    expect(tmuxWindowName('api.v2')).toBe('api-v2');
    expect(tmuxWindowName('a:b')).toBe('a-b');
  });

  it('creates a session for the first window and adds a window for the rest', () => {
    const create = buildTmuxLaunchArgs('omni-proj-abc123', 'frontend', 'script -q log bash -lc x', false);
    expect(create.slice(0, 4)).toEqual(['new-session', '-d', '-s', 'omni-proj-abc123']);
    expect(create).toContain('script -q log bash -lc x');

    const addWindow = buildTmuxLaunchArgs('omni-proj-abc123', 'backend', 'script -q log bash -lc y', true);
    expect(addWindow.slice(0, 3)).toEqual(['new-window', '-t', 'omni-proj-abc123']);
    expect(addWindow).toContain('-n');
    expect(addWindow).toContain('backend');
  });

  it('builds a Terminal attach command for a harness session', () => {
    expect(buildTmuxAttachCommand('omni-pi-abc123')).toBe("tmux attach -t 'omni-pi-abc123'");
  });

  it('formats a structured tmux target as session:window', () => {
    expect(tmuxTargetRef({ session: 'omni-claude-code-abc123', window: 'reviewer' })).toBe(
      'omni-claude-code-abc123:reviewer',
    );
  });

  it('builds send-keys (literal text then Enter) and kill-window targeting session:window', () => {
    const target = 'omni-claude-code-abc123:frontend';
    expect(buildTmuxSendTextArgs(target, 'hello world')).toEqual([
      'send-keys',
      '-t',
      target,
      '-l',
      '--',
      'hello world',
    ]);
    expect(buildTmuxSendEnterArgs(target)).toEqual(['send-keys', '-t', target, 'Enter']);
    expect(buildTmuxKillWindowArgs(target)).toEqual(['kill-window', '-t', target]);
  });

  it('checks tmux clients to report terminal attachment state', () => {
    const childProcess = {
      spawn: vi.fn(),
      execSync: vi.fn(),
      execFileSync: vi.fn(() => Buffer.from('client1\n')),
    };
    const mgr = new InstanceManager(childProcess as never);

    expect(buildTmuxListClientsArgs('omni-pi-abc123')).toEqual(['list-clients', '-t', 'omni-pi-abc123']);
    expect(mgr.terminalAttached(tmuxCreateOptions())).toBe(true);
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'tmux',
      buildTmuxListClientsArgs(tmuxSessionName('pi', '/tmp/repo')),
      expect.objectContaining({ timeout: 2000 }),
    );
  });

  it('reports a tmux session as detached when list-clients returns no clients', () => {
    const childProcess = { spawn: vi.fn(), execSync: vi.fn(), execFileSync: vi.fn(() => Buffer.from('')) };
    const mgr = new InstanceManager(childProcess as never);

    expect(mgr.terminalAttached(tmuxCreateOptions())).toBe(false);
  });

  it('reuses one attached Terminal client for different harness sessions in the same Repository', () => {
    const repo = '/tmp/repo';
    const piSession = tmuxSessionName('pi', repo);
    const claudeSession = tmuxSessionName('claude-code', repo);
    let terminalOpenedForRepo = false;
    const childProcess = {
      spawn: vi.fn((cmd: string) => {
        if (cmd === 'osascript') terminalOpenedForRepo = true;
      }),
      execSync: vi.fn(() => {
        throw new Error('missing session');
      }),
      execFileSync: vi.fn((cmd: string, args: string[]) => {
        if (cmd === 'tmux' && args[0] === 'list-sessions') {
          return Buffer.from([piSession, claudeSession].join('\n'));
        }
        if (cmd === 'tmux' && args[0] === 'list-clients' && terminalOpenedForRepo) {
          return Buffer.from('client-1\n');
        }
        return Buffer.from('');
      }),
    };
    const mgr = new InstanceManager(childProcess as never);

    mgr.create({ ...tmuxCreateOptions(), id: 'pi1', name: 'pi-one', cwd: repo, harnessName: 'pi' });
    mgr.create({
      ...tmuxCreateOptions(),
      id: 'claude1',
      name: 'claude-one',
      cwd: repo,
      harnessName: 'claude-code',
    });

    expect(childProcess.spawn.mock.calls.filter((call) => call[0] === 'osascript')).toHaveLength(1);
    expect(childProcess.spawn.mock.calls.filter((call) => call[0] === 'tmux')).toHaveLength(2);
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'tmux',
      buildTmuxSwitchClientArgs('client-1', claudeSession),
      expect.objectContaining({ timeout: 2000 }),
    );
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'tmux',
      buildTmuxSelectWindowArgs(`${claudeSession}:${tmuxWindowName('claude-one')}`),
      expect.objectContaining({ timeout: 2000 }),
    );
  });

  it('adds same-harness agents as windows and focuses the new window in the repo Terminal', () => {
    const repo = '/tmp/repo';
    const session = tmuxSessionName('pi', repo);
    const childProcess = {
      spawn: vi.fn(),
      execSync: vi.fn((command: string) => {
        if (command.includes(session)) return Buffer.from('');
        throw new Error('missing session');
      }),
      execFileSync: vi.fn((cmd: string, args: string[]) => {
        if (cmd === 'tmux' && args[0] === 'list-sessions') return Buffer.from(`${session}\n`);
        if (cmd === 'tmux' && args[0] === 'list-clients') return Buffer.from('client-1\n');
        return Buffer.from('');
      }),
    };
    const mgr = new InstanceManager(childProcess as never);

    mgr.create({ ...tmuxCreateOptions(), id: 'pi2', name: 'pi-two', cwd: repo, harnessName: 'pi' });

    const tmuxLaunch = childProcess.spawn.mock.calls.find((call) => call[0] === 'tmux');
    expect(tmuxLaunch?.[1].slice(0, 3)).toEqual(['new-window', '-t', session]);
    expect(childProcess.spawn.mock.calls.some((call) => call[0] === 'osascript')).toBe(false);
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'tmux',
      buildTmuxSelectWindowArgs(`${session}:${tmuxWindowName('pi-two')}`),
      expect.objectContaining({ timeout: 2000 }),
    );
  });

  it('keeps different Repositories isolated to separate Terminal clients', () => {
    const repoA = '/tmp/repo-a';
    const repoB = '/tmp/repo-b';
    const sessionA = tmuxSessionName('pi', repoA);
    const sessionB = tmuxSessionName('pi', repoB);
    const childProcess = {
      spawn: vi.fn(),
      execSync: vi.fn(() => {
        throw new Error('missing session');
      }),
      execFileSync: vi.fn((cmd: string, args: string[]) => {
        if (cmd === 'tmux' && args[0] === 'list-sessions')
          return Buffer.from([sessionA, sessionB].join('\n'));
        if (cmd === 'tmux' && args[0] === 'list-clients' && args[2] === sessionA)
          return Buffer.from('client-a\n');
        return Buffer.from('');
      }),
    };
    const mgr = new InstanceManager(childProcess as never);

    mgr.create({
      ...tmuxCreateOptions(),
      id: 'repo-b-agent',
      name: 'repo-b-agent',
      cwd: repoB,
      harnessName: 'pi',
    });

    expect(childProcess.spawn.mock.calls.filter((call) => call[0] === 'osascript')).toHaveLength(1);
    expect(childProcess.execFileSync).not.toHaveBeenCalledWith(
      'tmux',
      buildTmuxSwitchClientArgs('client-a', sessionB),
      expect.anything(),
    );
  });

  it('puts the five-agent canonical scenario in one repo Terminal with one session per harness', () => {
    const repo = '/tmp/repo';
    const sessions = {
      pi: tmuxSessionName('pi', repo),
      claude: tmuxSessionName('claude-code', repo),
      codex: tmuxSessionName('codex', repo),
    };
    const existingSessions = new Set<string>();
    let terminalOpenedForRepo = false;
    const childProcess = {
      spawn: vi.fn((cmd: string, args: string[]) => {
        if (cmd === 'osascript') terminalOpenedForRepo = true;
        if (cmd === 'tmux' && args[0] === 'new-session') existingSessions.add(args[3]);
      }),
      execSync: vi.fn((command: string) => {
        const session = [...existingSessions].find((name) => command.includes(name));
        if (session) return Buffer.from('');
        throw new Error('missing session');
      }),
      execFileSync: vi.fn((cmd: string, args: string[]) => {
        if (cmd === 'tmux' && args[0] === 'list-sessions')
          return Buffer.from([...existingSessions].join('\n'));
        if (cmd === 'tmux' && args[0] === 'list-clients' && terminalOpenedForRepo)
          return Buffer.from('client-1\n');
        return Buffer.from('');
      }),
    };
    const mgr = new InstanceManager(childProcess as never);

    mgr.create({ ...tmuxCreateOptions(), id: 'pi1', name: 'pi-one', cwd: repo, harnessName: 'pi' });
    mgr.create({ ...tmuxCreateOptions(), id: 'pi2', name: 'pi-two', cwd: repo, harnessName: 'pi' });
    mgr.create({
      ...tmuxCreateOptions(),
      id: 'claude1',
      name: 'claude-one',
      cwd: repo,
      harnessName: 'claude-code',
    });
    mgr.create({
      ...tmuxCreateOptions(),
      id: 'claude2',
      name: 'claude-two',
      cwd: repo,
      harnessName: 'claude-code',
    });
    mgr.create({ ...tmuxCreateOptions(), id: 'codex1', name: 'codex-one', cwd: repo, harnessName: 'codex' });

    expect(childProcess.spawn.mock.calls.filter((call) => call[0] === 'osascript')).toHaveLength(1);
    const tmuxLaunches = childProcess.spawn.mock.calls
      .filter((call) => call[0] === 'tmux')
      .map((call) => call[1]);
    expect(tmuxLaunches.filter((args) => args[0] === 'new-session')).toHaveLength(3);
    expect(tmuxLaunches.filter((args) => args[0] === 'new-window')).toHaveLength(2);
    expect(new Set(tmuxLaunches.filter((args) => args[0] === 'new-session').map((args) => args[3]))).toEqual(
      new Set(Object.values(sessions)),
    );
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'tmux',
      buildTmuxSelectWindowArgs(`${sessions.codex}:${tmuxWindowName('codex-one')}`),
      expect.objectContaining({ timeout: 2000 }),
    );
  });

  it('killAll kills all processes and clears instances', () => {
    const mgr = new InstanceManager();
    mgr.create({ id: 'k1', name: 'k1', harness: 'sleep', args: ['30'], cwd: '/tmp', openTerminal: false });
    mgr.create({ id: 'k2', name: 'k2', harness: 'sleep', args: ['30'], cwd: '/tmp', openTerminal: false });

    expect(mgr.list().length).toBe(2);

    mgr.killAll();
    expect(mgr.list().length).toBe(0);
  });
});

// Headless stream-json path (ADR 0006). Spawn a real short-lived `node` process emitting/echoing
// stream-json so the adapter's stdout-parse and stdin-frame wiring are exercised end to end.
function emitLines(...objs: unknown[]): string {
  const writes = objs
    .map((o) => `process.stdout.write(${JSON.stringify(JSON.stringify(o) + '\n')})`)
    .join(';');
  return `${writes};setTimeout(()=>{},400)`;
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('InstanceManager headless stream-json (006)', () => {
  it('routes assistant text to output listeners and fires turn-end on result', async () => {
    const mgr = new InstanceManager();
    const texts: string[] = [];
    let turnEndText: string | undefined = 'UNSET';

    const script = emitLines(
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi from claude' }] } },
      { type: 'result', subtype: 'success', result: 'hi from claude', is_error: false },
    );
    mgr.create({
      id: 'sj1',
      name: 'sj',
      harness: process.execPath,
      args: ['-e', script],
      cwd: '/tmp',
      openTerminal: false,
      streamJson: true,
    });
    mgr.onOutput('sj1', (d) => texts.push(d));
    mgr.onTurnEnd('sj1', (t) => {
      turnEndText = t;
    });

    await waitFor(() => texts.includes('hi from claude') && turnEndText !== 'UNSET');
    expect(texts).toContain('hi from claude');
    expect(texts.some((t) => t.includes('"type":"system"'))).toBe(false); // raw frames not surfaced
    expect(turnEndText).toBe('hi from claude');
    mgr.remove('sj1');
  });

  it('keeps raw line behaviour for a non-stream-json harness (no turn-end)', async () => {
    const mgr = new InstanceManager();
    const texts: string[] = [];
    let turnEndFired = false;

    mgr.create({
      id: 'raw1',
      name: 'raw',
      harness: process.execPath,
      args: ['-e', 'process.stdout.write("plain log line\\n");setTimeout(()=>{},300)'],
      cwd: '/tmp',
      openTerminal: false,
    });
    mgr.onOutput('raw1', (d) => texts.push(d));
    mgr.onTurnEnd('raw1', () => {
      turnEndFired = true;
    });

    await waitFor(() => texts.includes('plain log line'));
    expect(texts).toContain('plain log line');
    expect(turnEndFired).toBe(false);
    mgr.remove('raw1');
  });
});

describe('InstanceManager stdin push-inject (007)', () => {
  it('writes a stream-json user frame to stdin for a headless stream-json agent', async () => {
    const mgr = new InstanceManager();
    const echoed: string[] = [];

    const script = `let buf='';process.stdin.on('data',d=>{buf+=d.toString();let i;while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(line.trim())process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'GOT:'+line}]}})+'\\n')}});setTimeout(()=>{},1000)`;
    mgr.create({
      id: 'inj1',
      name: 'inject',
      harness: process.execPath,
      args: ['-e', script],
      cwd: '/tmp',
      openTerminal: false,
      streamJson: true,
    });
    mgr.onOutput('inj1', (d) => echoed.push(d));

    mgr.sendInput('inj1', 'wake up, peer here');

    await waitFor(() => echoed.some((e) => e.startsWith('GOT:')));
    const got = echoed.find((e) => e.startsWith('GOT:'))!.slice(4);
    expect(JSON.parse(got)).toEqual({
      type: 'user',
      message: { role: 'user', content: 'wake up, peer here' },
    });
    mgr.remove('inj1');
  });
});
