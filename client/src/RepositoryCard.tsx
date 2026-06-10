import type { FormEvent } from 'react';

function displayRepositoryName(repoPath: string): string {
  if (!repoPath) return 'Select a Repository';
  const trimmed = repoPath.replace(/\/+$/, '');
  const name = trimmed.split('/').filter(Boolean).pop();
  return name || repoPath;
}

type RepositoryCardProps = {
  repositoryPath: string;
  repoInput: string;
  agentCount: number;
  taskCount: number;
  claimCount: number;
  onRepoInputChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onBrowse: () => void;
  onGenerateHandoff: () => void;
  onHireAgent: () => void;
};

export function RepositoryCard({
  repositoryPath,
  repoInput,
  agentCount,
  taskCount,
  claimCount,
  onRepoInputChange,
  onSubmit,
  onBrowse,
  onGenerateHandoff,
  onHireAgent,
}: RepositoryCardProps) {
  return (
    <section className="repo-command-card">
      <div>
        <p className="section-kicker">Repository active</p>
        <h2 title={repositoryPath || undefined}>{displayRepositoryName(repositoryPath)}</h2>
        <p className="repo-meta">
          {repositoryPath ? repositoryPath : 'No Repository selected'} · {agentCount} Agent Instances ·{' '}
          {taskCount} Task Requests · {claimCount} Work Claims
        </p>
      </div>
      <form className="repo-form" onSubmit={onSubmit}>
        <input
          aria-label="Repository path"
          value={repoInput}
          onChange={(event) => onRepoInputChange(event.target.value)}
          placeholder="/Users/you/project"
        />
        <button type="button" onClick={onBrowse}>
          Browse
        </button>
      </form>
      <div className="repo-actions">
        <button type="button" onClick={onGenerateHandoff} disabled={!repositoryPath}>
          Generate Handoff
        </button>
        <button className="primary" type="button" onClick={onHireAgent} disabled={!repositoryPath}>
          Hire Agent
        </button>
      </div>
    </section>
  );
}
