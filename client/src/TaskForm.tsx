import { useState, type FormEvent } from 'react';
import type { TaskRequest } from './server-state';
import { Dropdown } from './Dropdown';

export type TaskFormPayload = {
  title: string;
  details: string;
  target: string;
  priority: TaskRequest['priority'];
};

type TaskFormProps = {
  repositoryPath: string;
  onSubmit: (payload: TaskFormPayload) => void;
  onCancel: () => void;
};

const priorities: TaskRequest['priority'][] = ['low', 'normal', 'high', 'urgent'];

function priorityHint(priority: TaskRequest['priority']): string {
  if (priority === 'low') return 'Can wait';
  if (priority === 'normal') return 'Standard request';
  if (priority === 'high') return 'Needs attention';
  return 'Immediate attention';
}

export function TaskForm({ repositoryPath, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [target, setTarget] = useState('#all');
  const [priority, setPriority] = useState<TaskRequest['priority']>('normal');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), details: details.trim(), target: target.trim() || '#all', priority });
  }

  return (
    <form className="launch-form" onSubmit={handleSubmit}>
      <label>
        Title
        <input
          aria-label="Task title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Task title"
        />
      </label>
      <label>
        Description
        <textarea
          aria-label="Task description"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Describe the task, context, constraints, and desired outcome."
          rows={4}
        />
      </label>
      <label>
        Target
        <input
          aria-label="Task target"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="#all or @agent"
        />
      </label>
      <fieldset className="harness-picker priority-picker">
        <legend>Priority</legend>
        <Dropdown
          ariaLabel="Task Priority"
          value={priority}
          options={priorities.map((option) => ({ value: option, label: option, hint: priorityHint(option) }))}
          onChange={(value) => setPriority(value as TaskRequest['priority'])}
        />
      </fieldset>
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" type="submit" disabled={!repositoryPath || !title.trim()}>
          Create Task
        </button>
      </div>
    </form>
  );
}
