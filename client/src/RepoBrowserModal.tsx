import type { DirEntry } from './server-state';
import { ModalShell } from './ModalShell';

type RepoBrowserModalProps = {
  path: string;
  entries: DirEntry[];
  onClose: () => void;
  onUp: () => void;
  onChoose: (path: string) => void;
  onScan: (path: string) => void;
};

export function RepoBrowserModal({ path, entries, onClose, onUp, onChoose, onScan }: RepoBrowserModalProps) {
  return (
    <ModalShell
      titleId="repo-browser-title"
      className="repo-browser-modal"
      kicker="Repository"
      title="Browse Folders"
      fineprint={path || 'Loading home folder…'}
      onClose={onClose}
    >
      <div className="repo-browser-actions">
        <button type="button" onClick={onUp} disabled={!path}>
          Up
        </button>
        <button type="button" onClick={() => onChoose(path)} disabled={!path}>
          Use this folder
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="empty">No child folders found. Use this folder or go up.</div>
      ) : (
        <div className="dir-list">
          {entries.map((entry) => (
            <button
              key={entry.fullPath}
              type="button"
              onDoubleClick={() => onChoose(entry.fullPath)}
              onClick={() => onScan(entry.fullPath)}
            >
              <strong>{entry.name}</strong>
              <small>{entry.fullPath}</small>
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
