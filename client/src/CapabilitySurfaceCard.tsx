import type { HarnessAttachment } from './server-state';

export type CapabilityGroup = {
  title: string;
  capabilities: HarnessAttachment[];
  attachable: boolean;
};

type CapabilitySurfaceCardProps = CapabilityGroup & {
  empty: string;
  onInspect: (group: CapabilityGroup) => void;
};

export function CapabilitySurfaceCard({
  title,
  capabilities,
  attachable,
  empty,
  onInspect,
}: CapabilitySurfaceCardProps) {
  return (
    <button
      className="capability-card active capability-surface-card"
      type="button"
      onClick={() => onInspect({ title, capabilities, attachable })}
    >
      <strong>{title}</strong>
      <span>
        {capabilities.length} {capabilities.length === 1 ? 'item' : 'items'}
      </span>
      {capabilities.length === 0 ? (
        <small>{empty}</small>
      ) : (
        <div className="mini-list">
          {capabilities.slice(0, 5).map((capability) => (
            <small key={capability.id}>{capability.name}</small>
          ))}
        </div>
      )}
      <em>{attachable ? 'Selectable in Templates' : 'Library source only'}</em>
    </button>
  );
}
