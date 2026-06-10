import type { WorkClaim } from './server-state';

type WorkClaimCardProps = {
  claim: WorkClaim;
  onRelease: (claim: WorkClaim) => void;
};

export function WorkClaimCard({ claim, onRelease }: WorkClaimCardProps) {
  return (
    <article className="claim-card">
      <code>{claim.path}</code>
      <small>@{claim.agentName}</small>
      {claim.note && <p>{claim.note}</p>}
      <button type="button" onClick={() => onRelease(claim)}>
        Release {claim.path}
      </button>
    </article>
  );
}
