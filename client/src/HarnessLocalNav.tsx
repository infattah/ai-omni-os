import { harnessTabs, type HarnessTab } from './harness-tabs';

type HarnessLocalNavProps = {
  selected: HarnessTab;
  onSelect: (tab: HarnessTab) => void;
};

export function HarnessLocalNav({ selected, onSelect }: HarnessLocalNavProps) {
  return (
    <nav className="admin-local-nav" aria-label="Harness family navigation">
      {harnessTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={selected === tab.id ? 'active' : ''}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
