import type { FormEvent, KeyboardEvent, Ref } from 'react';
import type { Message } from './server-state';

type ChatPanelProps = {
  full?: boolean;
  selectedChannel: string;
  messages: Message[];
  composer: string;
  listRef: Ref<HTMLDivElement>;
  onComposerChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

export function ChatPanel({
  full = false,
  selectedChannel,
  messages,
  composer,
  listRef,
  onComposerChange,
  onSubmit,
  onComposerKeyDown,
}: ChatPanelProps) {
  return (
    <section className={`panel chat-panel ${full ? 'full-chat' : ''}`}>
      <div className="panel-head">
        <div>
          <p className="section-kicker">Conversation</p>
          <h2>{selectedChannel}</h2>
        </div>
        <span className="count-pill">{messages.length} messages</span>
      </div>
      <div className="message-list grow" ref={listRef}>
        {messages.length === 0 ? (
          <div className="empty">
            No messages yet. Coordinate with Agent Instances in #all or an Agent direct channel.
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className="message"
              data-initial={message.sender.slice(0, 1).toUpperCase()}
            >
              <header>{message.sender}</header>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          aria-label="Message"
          value={composer}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={`Message ${selectedChannel}`}
          rows={1}
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}
