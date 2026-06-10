// Matches ANSI/XTerm/VT100 escape sequences
// Structure: ESC + optional intermediate bytes + (OSC string | CSI params + final byte)
// Both branches require the leading ESC byte
const ANSI_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC/BEL control bytes is the purpose of this regex
  /[\u001b\u009b](?:[[\]()#;?$]*(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007|[[\]()#;?$]*(?:\d{1,4}(?:;\d{0,4})*)?[A-Za-z\x40-\x7e=><~$])/g;

// Filters for common terminal negotiation artifacts that survive ANSI stripping
const NOISE_PATTERNS = [
  /\$p(?:\$p)*/g,
  /=opentui-notifications[^;]*;/g,
  /_Gi=\d+(?:,[a-z]=\d+)*/g,
  /\[?\$[pyrq]\d*/g,
  /;30(?:;\d+)*m/g,
  /\[\??2[05]2[6hl]/g,
  /\[\??12[hl]/g,
  /\u2584(?:\s*[\u2580\u2584\u25a0\u2b1d\u2503]*)+/g,
];

export function stripAnsi(str: string): string {
  let result = str.replace(ANSI_RE, '');
  for (const pattern of NOISE_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}
