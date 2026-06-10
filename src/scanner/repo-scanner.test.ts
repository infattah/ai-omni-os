import { describe, it, expect } from 'vitest';
import { RepoScanner } from './repo-scanner.js';
import * as os from 'os';
import * as fs from 'fs';

describe('RepoScanner', () => {
  const scanner = new RepoScanner();

  it('scans a directory and returns subdirectories', () => {
    const home = os.homedir();
    const entries = scanner.scan(home);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.isDirectory)).toBe(true);
  });

  it('sets and gets selected repo', () => {
    scanner.setRepo('/tmp/test-repo');
    expect(scanner.getRepo()).toBe('/tmp/test-repo');
  });

  it('returns empty array for non-existent directory', () => {
    const entries = scanner.scan('/nonexistent-path-12345');
    expect(entries).toEqual([]);
  });
});
