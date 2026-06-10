import type { TaskRequest } from './server-state';
import { ModalShell } from './ModalShell';

type TaskDetailModalProps = {
  task: TaskRequest;
  onClose: () => void;
};

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  return (
    <ModalShell
      titleId="task-detail-title"
      className="task-detail-modal"
      kicker={`${task.humanId} · ${task.status}`}
      title={task.title}
      fineprint={`${task.target} · ${task.priority}`}
      onClose={onClose}
    >
      <div className="task-detail-body">
        <section>
          <h3>Description</h3>
          <p>{task.details?.trim() || 'No description provided.'}</p>
        </section>
        {task.expectedResult?.trim() && (
          <section>
            <h3>Expected Result</h3>
            <p>{task.expectedResult}</p>
          </section>
        )}
        <dl className="task-detail-meta">
          <div>
            <dt>Status</dt>
            <dd>{task.status}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{task.priority}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{task.target}</dd>
          </div>
        </dl>
      </div>
    </ModalShell>
  );
}
