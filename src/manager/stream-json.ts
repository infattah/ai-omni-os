/**
 * Pure helpers for Claude Code's stream-json protocol (`--input-format/--output-format stream-json`),
 * the channel Omni uses to run headless harnesses: parse their output events and frame input.
 *
 * Output events are one JSON object per line. The shapes we care about (stable, public Claude Code
 * stream-json format): `system` (init), `assistant` (message.content text/tool_use blocks), `user`
 * (tool results), `result` (the turn-end / final), and `stream_event` (partial deltas). Anything we
 * don't recognise degrades to 'other' so shape drift never crashes the manager.
 */

export type StreamJsonEvent =
  | { kind: 'assistant-text'; text: string }
  | { kind: 'turn-end'; text?: string }
  | { kind: 'tool' }
  | { kind: 'other' };

export function parseStreamJsonLine(line: string): StreamJsonEvent {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return { kind: 'other' };
  }
  if (!obj || typeof obj !== 'object') return { kind: 'other' };
  const record = obj as Record<string, unknown>;

  if (record.type === 'result') {
    const text = typeof record.result === 'string' ? record.result : undefined;
    return { kind: 'turn-end', text };
  }

  if (record.type === 'assistant') {
    const message = record.message as { content?: unknown } | undefined;
    const content = Array.isArray(message?.content)
      ? (message!.content as Array<Record<string, unknown>>)
      : [];
    const texts = content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string);
    if (texts.length > 0) return { kind: 'assistant-text', text: texts.join('\n') };
    if (content.some((block) => block.type === 'tool_use')) return { kind: 'tool' };
    return { kind: 'other' };
  }

  return { kind: 'other' };
}

export interface StreamJsonSink {
  onText(text: string): void;
  onTurnEnd(text?: string): void;
}

/**
 * Parse one stream-json stdout line and dispatch it: assistant text streams to `onText` (the
 * dashboard's `agent-output` channel), a `result` event fires `onTurnEnd` (the auto-reply / turn
 * boundary). Tool and unrecognised events are dropped. Keeps `InstanceManager` thin and lets the
 * routing be unit-tested without spawning a process.
 */
export function routeStreamJsonLine(line: string, sink: StreamJsonSink): void {
  const event = parseStreamJsonLine(line);
  if (event.kind === 'assistant-text') sink.onText(event.text);
  else if (event.kind === 'turn-end') sink.onTurnEnd(event.text);
}

/**
 * Frame a peer/Dev message as the stream-json user message Claude Code accepts on stdin, verified
 * against a live `claude --input-format stream-json` session. Newline-delimited: one JSON object per
 * line, so the returned string carries no embedded newline.
 */
export function buildStreamJsonUserMessage(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}
