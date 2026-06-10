import type { ActivityEvent, AgentInstance } from './server-state';
import { formatHarness } from './harnesses';
import { timeAgo } from './time-ago';

type MemoryPageProps = {
  repositoryPath: string;
  summaryOpen: boolean;
  projectSummary: string;
  agents: AgentInstance[];
  activity: ActivityEvent[];
  onLoadProjectSummary: () => void;
  onProjectSummaryChange: (value: string) => void;
  onSaveProjectSummary: () => void;
  onLoadAgentContext: (agentName: string) => void;
  onGenerateHandoff: () => void;
};

export function MemoryPage({
  repositoryPath,
  summaryOpen,
  projectSummary,
  agents,
  activity,
  onLoadProjectSummary,
  onProjectSummaryChange,
  onSaveProjectSummary,
  onLoadAgentContext,
  onGenerateHandoff,
}: MemoryPageProps) {
  const handoffEvents = activity
    .filter((event) => event.kind === 'handoff.generated')
    .slice(-20)
    .reverse();
  const lastHandoff = handoffEvents[0];
  const contextEvents = activity
    .filter((event) => event.kind === 'agent_context.updated')
    .slice(-50)
    .reverse();
  return (
    <section className="memory-grid">
      <div className="panel context-editor memory-main">
        <div className="panel-head">
          <h2>Project Summary</h2>
          <button type="button" onClick={onLoadProjectSummary} disabled={!repositoryPath}>
            Edit Project Summary
          </button>
        </div>
        {summaryOpen ? (
          <>
            <textarea
              aria-label="Project Summary"
              value={projectSummary}
              onChange={(event) => onProjectSummaryChange(event.target.value)}
            />
            <button type="button" onClick={onSaveProjectSummary}>
              Save Project Summary
            </button>
          </>
        ) : (
          <div className="empty">Load the Repository Project Summary to edit it.</div>
        )}
      </div>
      <aside className="memory-card-grid">
        <section className="panel memory-mini-card">
          <h2>Agent Contexts</h2>
          {agents.length === 0 ? (
            <div className="empty small">No agents.</div>
          ) : (
            <div className="agent-context-list agent-context-rows">
              {agents.map((agent) => {
                const agentUpdate = contextEvents.find((event) => event.payload?.agentName === agent.name);
                return (
                  <button key={agent.id} type="button" onClick={() => onLoadAgentContext(agent.name)}>
                    <span>
                      <strong>@{agent.name}</strong>
                      <small>
                        {formatHarness(agent.harness)} · {agent.status}
                      </small>
                    </span>
                    <em>{agentUpdate ? `Updated ${timeAgo(agentUpdate.timestamp)}` : 'Not updated yet'}</em>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <section className="panel memory-mini-card">
          <div className="memory-card-head">
            <h2>Handoffs</h2>
            <button type="button" onClick={onGenerateHandoff} disabled={!repositoryPath}>
              Generate Handoff
            </button>
          </div>
          <div className="memory-card-body handoff-log">
            <div className="handoff-stats">
              <span>{handoffEvents.length} created</span>
              <span>{lastHandoff ? `Last ${timeAgo(lastHandoff.timestamp)}` : 'No handoffs yet'}</span>
            </div>
            {handoffEvents.length === 0 ? (
              <div className="empty small">No handoff logs yet.</div>
            ) : (
              <ul className="quiet-list">
                {handoffEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{timeAgo(event.timestamp)}</strong>
                    <span>{event.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className="panel memory-mini-card">
          <h2>Startup Briefings</h2>
          <div className="memory-card-body">
            <p className="fineprint">Generated briefings are stored in Project Memory for this Repository.</p>
          </div>
        </section>
        <section className="panel memory-mini-card">
          <h2>Recent Activity</h2>
          <ul className="activity-list quiet-list">
            {activity.slice(-12).map((event) => (
              <li key={event.id}>{event.summary}</li>
            ))}
          </ul>
        </section>
      </aside>
    </section>
  );
}
