import { useState, type FormEvent } from 'react';

export type WorkClaimFormPayload = {
  path: string;
  agentName: string;
  note: string;
};

type WorkClaimFormProps = {
  repositoryPath: string;
  onSubmit: (payload: WorkClaimFormPayload) => void;
  onCancel: () => void;
};

export function WorkClaimForm({ repositoryPath, onSubmit, onCancel }: WorkClaimFormProps) {
  const [path, setPath] = useState('');
  const [agentName, setAgentName] = useState('Dev');
  const [note, setNote] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!path.trim()) return;
    onSubmit({ path: path.trim(), agentName: agentName.trim() || 'Dev', note: note.trim() });
  }

  return (
    <form className="launch-form" onSubmit={handleSubmit}>
      <label>
        Path
        <input
          aria-label="Work Claim path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="src/server/server.ts"
        />
      </label>
      <label>
        Agent
        <input
          aria-label="Work Claim agent"
          value={agentName}
          onChange={(event) => setAgentName(event.target.value)}
          placeholder="Dev or agent name"
        />
      </label>
      <label>
        Note
        <input
          aria-label="Work Claim note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Short note"
        />
      </label>
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" type="submit" disabled={!repositoryPath || !path.trim()}>
          Create Claim
        </button>
      </div>
    </form>
  );
}
