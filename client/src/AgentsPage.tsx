import { isActiveAgent, type AgentInstance } from './server-state';
import { AgentCard, type AgentCardActions } from './AgentCard';
import { ArchiveToggle } from './ArchiveToggle';

type AgentsPageProps = {
  agents: AgentInstance[];
  visibleAgents: AgentInstance[];
  agentActions: AgentCardActions;
  archivedAgentCount: number;
  showArchived: boolean;
  repositoryPath: string;
  contextAgentName: string;
  contextContent: string;
  onToggleArchive: () => void;
  onHireAgent: () => void;
  onContextChange: (value: string) => void;
  onSaveContext: () => void;
};

export function AgentsPage({
  agents,
  visibleAgents,
  agentActions,
  archivedAgentCount,
  showArchived,
  repositoryPath,
  contextAgentName,
  contextContent,
  onToggleArchive,
  onHireAgent,
  onContextChange,
  onSaveContext,
}: AgentsPageProps) {
  const activeAgents = visibleAgents.filter(isActiveAgent);
  const inactiveAgents = visibleAgents.filter((agent) => !isActiveAgent(agent));
  return (
    <section className="detail-grid">
      <div className="panel agents-panel detail-agents-panel">
        <div className="panel-head">
          <h2>Agent Instances</h2>
          <button className="primary" type="button" onClick={onHireAgent} disabled={!repositoryPath}>
            Hire Agent
          </button>
        </div>
        {agents.length === 0 ? (
          <div className="empty">No Agent Instances yet.</div>
        ) : (
          <div className="agent-list detail-list">
            {activeAgents.length > 0 && <h3>Active</h3>}
            {activeAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} detail {...agentActions} />
            ))}
            {inactiveAgents.length > 0 && <h3>Inactive</h3>}
            {inactiveAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} detail {...agentActions} />
            ))}
          </div>
        )}
        {archivedAgentCount > 0 && <ArchiveToggle active={showArchived} onToggle={onToggleArchive} />}
      </div>
      <div className="panel context-editor">
        <h2>Agent Context</h2>
        {contextAgentName ? (
          <>
            <label>
              Editing @{contextAgentName}
              <textarea
                aria-label="Agent Context"
                value={contextContent}
                onChange={(event) => onContextChange(event.target.value)}
              />
            </label>
            <button type="button" onClick={onSaveContext}>
              Save Agent Context
            </button>
          </>
        ) : (
          <div className="empty">Choose Edit Context from an Agent Instance.</div>
        )}
      </div>
    </section>
  );
}
