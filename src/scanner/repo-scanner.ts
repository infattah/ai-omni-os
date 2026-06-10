import fs from 'fs';
import path from 'path';

export interface DirEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
}

export class RepoScanner {
  private selectedRepo: string | null = null;

  scan(dirPath: string): DirEntry[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          fullPath: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
        }));
    } catch {
      return [];
    }
  }

  setRepo(repoPath: string): void {
    this.selectedRepo = repoPath;
  }

  getRepo(): string | null {
    return this.selectedRepo;
  }
}
