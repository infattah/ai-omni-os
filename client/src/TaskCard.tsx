import type { KeyboardEvent } from 'react';
import type { TaskRequest } from './server-state';

export type TaskAction = 'accept' | 'reject' | 'block' | 'fail' | 'complete' | 'cancel';

export function isTerminalTask(status: string): boolean {
  return ['completed', 'cancelled', 'failed', 'rejected'].includes(status);
}

type TaskCardProps = {
  task: TaskRequest;
  onSelect: (task: TaskRequest) => void;
  onAction: (humanId: string, action: TaskAction) => void;
};

export function TaskCard({ task, onSelect, onAction }: TaskCardProps) {
  function selectOnKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(task);
    }
  }
  function act(event: { stopPropagation: () => void }, action: TaskAction) {
    event.stopPropagation();
    onAction(task.humanId, action);
  }
  return (
    <article
      className="task-card clickable"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task)}
      onKeyDown={selectOnKey}
    >
      <div className="task-card-head">
        <strong>{task.humanId}</strong>
        <span className={`badge ${task.priority}`}>{task.priority}</span>
      </div>
      <p>{task.title}</p>
      <small>
        {task.status} · {task.priority} · {task.target}
      </small>
      {!isTerminalTask(task.status) && (
        <div className="task-actions" aria-label={`${task.humanId} actions`}>
          {task.status === 'requested' && (
            <>
              <button type="button" onClick={(event) => act(event, 'accept')}>
                Accept {task.humanId}
              </button>
              <button type="button" onClick={(event) => act(event, 'reject')}>
                Reject {task.humanId}
              </button>
            </>
          )}
          {(task.status === 'accepted' || task.status === 'blocked') && (
            <button type="button" onClick={(event) => act(event, 'complete')}>
              Complete {task.humanId}
            </button>
          )}
          {task.status === 'accepted' && (
            <button type="button" onClick={(event) => act(event, 'block')}>
              Block {task.humanId}
            </button>
          )}
          {(task.status === 'accepted' || task.status === 'blocked') && (
            <button type="button" onClick={(event) => act(event, 'fail')}>
              Fail {task.humanId}
            </button>
          )}
          <button type="button" onClick={(event) => act(event, 'cancel')}>
            Cancel {task.humanId}
          </button>
        </div>
      )}
    </article>
  );
}
