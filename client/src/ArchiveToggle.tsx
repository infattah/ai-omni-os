type ArchiveToggleProps = {
  active: boolean;
  onToggle: () => void;
};

export function ArchiveToggle({ active, onToggle }: ArchiveToggleProps) {
  return (
    <button
      className={`archive-toggle ${active ? 'active' : ''}`}
      type="button"
      aria-label="Hide/Show Archive"
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5h16M6.2 7.5l1.1 11h9.4l1.1-11M9.2 11.5h5.6" />
      </svg>
      {!active && (
        <span className="archive-cross" aria-hidden="true">
          ×
        </span>
      )}
      <span className="archive-tooltip">Hide/Show Archive</span>
    </button>
  );
}
