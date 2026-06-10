import type { AgentInstance } from './server-state';
import { isActiveAgent } from './server-state';
import { formatHarness } from './harnesses';
import { Dropdown } from './Dropdown';

export type AgentCardActions = {
  onOpen: () => void;
  onMessage: (agent: AgentInstance) => void;
  onResume: (agent: AgentInstance) => void;
  onEditContext: (agent: AgentInstance) => void;
  onArchive: (agent: AgentInstance) => void;
  onUnarchive: (agent: AgentInstance) => void;
  onDelete: (agent: AgentInstance) => void;
};

type AgentCardProps = AgentCardActions & {
  agent: AgentInstance;
  detail?: boolean;
};

export function AgentCard({
  agent,
  detail = false,
  onOpen,
  onMessage,
  onResume,
  onEditContext,
  onArchive,
  onUnarchive,
  onDelete,
}: AgentCardProps) {
  const connected = agent.presence?.connectionStatus ?? 'disconnected';
  const work = agent.presence?.workStatus ?? 'unknown';
  const context = agent.presence?.contextUsedPct;
  const reachable = isActiveAgent(agent);
  const terminalAttached = agent.presence?.terminalAttached ?? agent.status === 'running';
  const showResume = !reachable || !terminalAttached;
  return (
    <article className="agent-card" onClick={onOpen}>
      <div className="agent-card-head">
        <span className={`status-dot ${work === 'blocked' ? 'blocked' : connected}`} />
        <div>
          <strong>@{agent.name}</strong>
          <small>
            {formatHarness(agent.harness)} · {agent.status} · {connected} · {work}
            {typeof context === 'number' ? ` · ctx ${Math.round(context)}%` : ' · ctx unknown'}
          </small>
        </div>
      </div>
      {agent.tags.length > 0 && (
        <div className="chips">
          {agent.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {agent.harnessAttachments && agent.harnessAttachments.length > 0 && (
        <p className="fineprint">
          Attachments: {agent.harnessAttachments.map((attachment) => attachment.name).join(', ')}
        </p>
      )}
      <div className="card-actions" onClick={(event) => event.stopPropagation()}>
        {reachable && (
          <button type="button" onClick={() => onMessage(agent)}>
            Message
          </button>
        )}
        {showResume && (
          <button type="button" aria-label={`Resume ${agent.name}`} onClick={() => onResume(agent)}>
            Resume
          </button>
        )}
        <Dropdown
          ariaLabel={`${agent.name} secondary actions`}
          actionItems={[
            { value: 'edit-context', label: 'Edit Context', onSelect: () => onEditContext(agent) },
            { value: 'resume', label: 'Resume', onSelect: () => onResume(agent) },
            agent.status === 'archived'
              ? { value: 'unarchive', label: `Unarchive ${agent.name}`, onSelect: () => onUnarchive(agent) }
              : { value: 'archive', label: `Archive ${agent.name}`, onSelect: () => onArchive(agent) },
            { value: 'delete', label: `Delete ${agent.name}`, onSelect: () => onDelete(agent) },
          ]}
        />
      </div>
      {detail && agent.presence?.currentTaskId && (
        <p className="fineprint">Current task: {agent.presence.currentTaskId}</p>
      )}
    </article>
  );
}
