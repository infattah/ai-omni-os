import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseStreamJsonLine, routeStreamJsonLine, buildStreamJsonUserMessage } from './stream-json.js';

describe('parseStreamJsonLine', () => {
  it('extracts assistant text', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello team' }] },
    });
    expect(parseStreamJsonLine(line)).toEqual({ kind: 'assistant-text', text: 'Hello team' });
  });

  it('joins multiple assistant text blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'one' },
          { type: 'text', text: 'two' },
        ],
      },
    });
    expect(parseStreamJsonLine(line)).toEqual({ kind: 'assistant-text', text: 'one\ntwo' });
  });

  it('classifies a tool-only assistant message as tool', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'omni_send', input: {} }] },
    });
    expect(parseStreamJsonLine(line).kind).toBe('tool');
  });

  it('treats a result event as turn-end carrying the final text', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success', result: 'done', is_error: false });
    expect(parseStreamJsonLine(line)).toEqual({ kind: 'turn-end', text: 'done' });
  });

  it('treats system/init and partial stream events as other', () => {
    expect(parseStreamJsonLine(JSON.stringify({ type: 'system', subtype: 'init' })).kind).toBe('other');
    expect(parseStreamJsonLine(JSON.stringify({ type: 'stream_event', event: {} })).kind).toBe('other');
  });

  it('degrades gracefully on non-JSON or unknown shapes', () => {
    expect(parseStreamJsonLine('not json').kind).toBe('other');
    expect(parseStreamJsonLine('').kind).toBe('other');
    expect(parseStreamJsonLine(JSON.stringify({ foo: 'bar' })).kind).toBe('other');
  });

  // Captured from a live `claude -p --input-format stream-json --output-format stream-json` run.
  it('classifies every line of the real captured transcript', () => {
    const fixture = readFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname), '__fixtures__/stream-json-transcript.jsonl'),
      'utf-8',
    );
    const kinds = fixture
      .trim()
      .split('\n')
      .map((line) => parseStreamJsonLine(line).kind);
    // system/init -> other, rate_limit_event -> other, assistant -> assistant-text, result -> turn-end
    expect(kinds).toEqual(['other', 'other', 'assistant-text', 'turn-end']);
  });

  it('treats the live rate_limit_event as other (shape drift safety)', () => {
    expect(parseStreamJsonLine(JSON.stringify({ type: 'rate_limit_event', subtype: null })).kind).toBe(
      'other',
    );
  });
});

describe('routeStreamJsonLine', () => {
  it('routes assistant text to onText', () => {
    const texts: string[] = [];
    const ends: Array<string | undefined> = [];
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hello team' }] },
    });
    routeStreamJsonLine(line, { onText: (t) => texts.push(t), onTurnEnd: (t) => ends.push(t) });
    expect(texts).toEqual(['hello team']);
    expect(ends).toEqual([]);
  });

  it('routes a result event to onTurnEnd with its final text', () => {
    const texts: string[] = [];
    const ends: Array<string | undefined> = [];
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'first turn',
      is_error: false,
    });
    routeStreamJsonLine(line, { onText: (t) => texts.push(t), onTurnEnd: (t) => ends.push(t) });
    expect(texts).toEqual([]);
    expect(ends).toEqual(['first turn']);
  });

  it('ignores tool and other events (no callbacks fired)', () => {
    let calls = 0;
    const sink = {
      onText: () => {
        calls += 1;
      },
      onTurnEnd: () => {
        calls += 1;
      },
    };
    routeStreamJsonLine(
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'x', input: {} }] },
      }),
      sink,
    );
    routeStreamJsonLine(JSON.stringify({ type: 'system', subtype: 'init' }), sink);
    routeStreamJsonLine('not json', sink);
    expect(calls).toBe(0);
  });
});

describe('buildStreamJsonUserMessage', () => {
  it('frames a user message in the shape live claude accepts on stdin', () => {
    const frame = buildStreamJsonUserMessage('ping from a peer');
    expect(JSON.parse(frame)).toEqual({
      type: 'user',
      message: { role: 'user', content: 'ping from a peer' },
    });
  });

  it('is a single line (newline-delimited stdin protocol)', () => {
    const frame = buildStreamJsonUserMessage('multi\nline\ntext');
    expect(frame.includes('\n')).toBe(false);
  });
});
