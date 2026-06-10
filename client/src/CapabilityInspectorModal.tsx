import type { HarnessAttachment } from './server-state';
import type { CapabilityGroup } from './CapabilitySurfaceCard';
import { ModalShell } from './ModalShell';

type CapabilityInspectorModalProps = {
  group: CapabilityGroup;
  onClose: () => void;
  onUse: (capability: HarnessAttachment) => void;
};

export function CapabilityInspectorModal({ group, onClose, onUse }: CapabilityInspectorModalProps) {
  return (
    <ModalShell
      titleId="capability-inspector-title"
      className="capability-inspector-modal"
      kicker="Harness Library"
      title={group.title}
      fineprint={
        group.attachable
          ? 'These can be selected by compatible Agent Templates.'
          : 'Visible as library sources; not directly attachable yet.'
      }
      onClose={onClose}
    >
      {group.capabilities.length === 0 ? (
        <div className="empty">No items found.</div>
      ) : (
        <div className="capability-inspector-list">
          {group.capabilities.map((capability) => (
            <article key={capability.id}>
              <div>
                <strong>{capability.name}</strong>
                <span>
                  {capability.harness === 'general' && capability.kind === 'skill'
                    ? 'Universal Skill · Pi-compatible via --skill'
                    : `${capability.harness} · ${capability.kind}`}{' '}
                  · {capability.source}
                </span>
              </div>
              <div className="capability-meta">
                <small>cost {capability.cost}</small>
                <small>risk {capability.risk.join(', ')}</small>
              </div>
              {capability.path && <code>{capability.path}</code>}
              {group.attachable && (
                <div className="capability-row-actions">
                  <button type="button" onClick={() => onUse(capability)}>
                    Use in Pi Template
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
