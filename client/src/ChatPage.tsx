import type { ReactNode } from 'react';
import type { AgentInstance } from './server-state';

type ChatPageProps = {
  selectedChannel: string;
  agents: AgentInstance[];
  onSelectChannel: (channel: string) => void;
  chatPanel: ReactNode;
};

export function ChatPage({ selectedChannel, agents, onSelectChannel, chatPanel }: ChatPageProps) {
  return (
    <section className="chat-mode-grid">
      <aside className="panel channel-list">
        <h2>Channels</h2>
        <button
          className={selectedChannel === '#all' ? 'selected' : ''}
          type="button"
          onClick={() => onSelectChannel('#all')}
        >
          #all
        </button>
        {agents.map((agent) => {
          const connected = agent.presence?.connectionStatus ?? 'disconnected';
          const work = agent.presence?.workStatus ?? 'unknown';
          return (
            <button
              key={agent.id}
              className={selectedChannel === `@${agent.name}` ? 'selected' : ''}
              type="button"
              onClick={() => onSelectChannel(`@${agent.name}`)}
            >
              <span className={`status-dot ${work === 'blocked' ? 'blocked' : connected}`} />
              <span>@{agent.name}</span>
            </button>
          );
        })}
      </aside>
      {chatPanel}
    </section>
  );
}
