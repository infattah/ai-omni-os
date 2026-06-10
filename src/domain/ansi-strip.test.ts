import { describe, it, expect } from 'vitest';
import { stripAnsi } from './ansi-strip.js';

describe('stripAnsi', () => {
  it('strips basic SGR color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips cursor positioning sequences', () => {
    expect(stripAnsi('\x1b[1;1H')).toBe('');
  });

  it('strips erase-in-display codes', () => {
    expect(stripAnsi('\x1b[2J')).toBe('');
  });

  it('strips mixed terminal output', () => {
    const raw = '\x1b[?2026h\x1b[?25l\x1b[14;42H\x1b[38;2;128;128;128mhello';
    expect(stripAnsi(raw)).toBe('hello');
  });

  it('strips OSC sequences (like window title)', () => {
    expect(stripAnsi('\x1b]0;OpenCode\x07')).toBe('');
  });

  it('strips complex escape sequences from real terminal capture', () => {
    const complex =
      '\x1b[?2026h\x1b[?25l\x1b[1;1H\x1b[38;2;255;255;255m\x1b[48;2;10;10;10m                                                                                                                        \x1b[2;1H\x1b[38;2;255;255;255m\x1b[48;2;10;10;10m';
    expect(stripAnsi(complex)).toBe(
      '                                                                                                                        ',
    );
  });

  it('handles plain text without modification', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});
