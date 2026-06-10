import type { ReactNode } from 'react';
import type { ActivityEvent, AgentInstance, TaskRequest } from './server-state';
import { AgentCard, type AgentCardActions } from './AgentCard';
import { ArchiveToggle } from './ArchiveToggle';
import { TaskCard, type TaskAction } from './TaskCard';

type OverviewProps = {
  repositoryCard: ReactNode;
  chatPanel: ReactNode;
  agents: AgentInstance[];
  visibleAgents: AgentInstance[];
  agentActions: AgentCardActions;
  archivedAgentCount: number;
  showArchived: boolean;
  needsAttention: string[];
  tasks: TaskRequest[];
  activity: ActivityEvent[];
  onToggleArchive: () => void;
  onOpenTasks: () => void;
  onSelectTask: (task: TaskRequest) => void;
  onTaskAction: (humanId: string, action: TaskAction) => void;
};

export function Overview({
  repositoryCard,
  chatPanel,
  agents,
  visibleAgents,
  agentActions,
  archivedAgentCount,
  showArchived,
  needsAttention,
  tasks,
  activity,
  onToggleArchive,
  onOpenTasks,
  onSelectTask,
  onTaskAction,
}: OverviewProps) {
  return (
    <>
      {repositoryCard}
      <section className="overview-grid" aria-label="Omni overview">
        <aside className="panel agents-panel">
          <div className="panel-head">
            <h2>Agent Instances</h2>
            <span className="count-pill">
              {visibleAgents.length}
              {archivedAgentCount > 0 && !showArchived ? ` + ${archivedAgentCount} archived` : ''}
            </span>
          </div>
          {agents.length === 0 ? (
            <div className="empty">No Agent Instances yet. Launch Pi to begin.</div>
          ) : (
            <div className="agent-list">
              {visibleAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} {...agentActions} />
              ))}
            </div>
          )}
          {archivedAgentCount > 0 && <ArchiveToggle active={showArchived} onToggle={onToggleArchive} />}
        </aside>
        {chatPanel}
        <aside className="right-rail">
          <section className="panel quiet-panel">
            <div className="panel-head">
              <h2>Needs Attention</h2>
              <span className="count-pill">{needsAttention.length}</span>
            </div>
            {needsAttention.length === 0 ? (
              <div className="empty small">Nothing needs attention.</div>
            ) : (
              <ul className="quiet-list">
                {needsAttention.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel quiet-panel">
            <div className="panel-head">
              <h2>Task Requests</h2>
              <button type="button" onClick={onOpenTasks}>
                Open
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="empty small">No Task Requests.</div>
            ) : (
              <div className="task-list">
                {tasks.slice(-3).map((task) => (
                  <TaskCard key={task.id} task={task} onSelect={onSelectTask} onAction={onTaskAction} />
                ))}
              </div>
            )}
          </section>
          <section className="panel quiet-panel">
            <h2>Activity</h2>
            {activity.length === 0 ? (
              <div className="empty small">No coordination events.</div>
            ) : (
              <ul className="activity-list quiet-list">
                {activity.slice(-8).map((event) => (
                  <li key={event.id}>{event.summary}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </section>
    </>
  );
}
