import type { ActivityEvent, TaskRequest, WorkClaim } from './server-state';
import { TaskCard, type TaskAction } from './TaskCard';
import { WorkClaimCard } from './WorkClaimCard';

type TasksPageProps = {
  tasks: TaskRequest[];
  activeClaims: WorkClaim[];
  activity: ActivityEvent[];
  onReleaseClaim: (claim: WorkClaim) => void;
  onSelectTask: (task: TaskRequest) => void;
  onTaskAction: (humanId: string, action: TaskAction) => void;
};

function taskGroupLabel(status: string): string {
  if (status === 'requested') return 'Requested';
  if (status === 'accepted') return 'Accepted / In Progress';
  if (status === 'blocked') return 'Blocked';
  if (status === 'completed') return 'Completed';
  return 'Failed / Rejected / Cancelled';
}

const groups = [
  'Requested',
  'Accepted / In Progress',
  'Blocked',
  'Completed',
  'Failed / Rejected / Cancelled',
];

export function TasksPage({
  tasks,
  activeClaims,
  activity,
  onReleaseClaim,
  onSelectTask,
  onTaskAction,
}: TasksPageProps) {
  return (
    <section className="tasks-mode-grid">
      <aside className="tasks-side-stack">
        <section className="panel tasks-side-card">
          <h2>Work Claims</h2>
          {activeClaims.length === 0 ? (
            <div className="empty small">No Work Claims.</div>
          ) : (
            <div className="work-claim-list">
              {activeClaims.map((claim) => (
                <WorkClaimCard key={claim.id} claim={claim} onRelease={onReleaseClaim} />
              ))}
            </div>
          )}
        </section>
        <section className="panel tasks-side-card">
          <h2>Recent Activity</h2>
          <ul className="activity-list quiet-list">
            {activity.slice(-12).map((event) => (
              <li key={event.id}>{event.summary}</li>
            ))}
          </ul>
        </section>
      </aside>
      <div className="panel tasks-main-card">
        <h2>Task Requests</h2>
        <div className="grouped-tasks">
          {groups.map((group) => {
            const groupTasks = tasks.filter((task) => taskGroupLabel(task.status) === group);
            if (group === 'Failed / Rejected / Cancelled' && groupTasks.length === 0) return null;
            return (
              <section key={group}>
                <h3>{group}</h3>
                {groupTasks.length === 0 ? (
                  <div className="empty small">None</div>
                ) : (
                  <div className="task-list">
                    {groupTasks.map((task) => (
                      <TaskCard key={task.id} task={task} onSelect={onSelectTask} onAction={onTaskAction} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
