import type { FormEvent } from 'react';
import type { HarnessAttachment } from './server-state';
import { harnesses } from './harnesses';
import { ModalShell } from './ModalShell';
import { Dropdown } from './Dropdown';

type LaunchModalProps = {
  repositoryPath: string;
  agentName: string;
  agentDescription: string;
  agentTagDraft: string;
  tags: string[];
  agentHarness: string;
  launchBackend: 'terminal' | 'tmux';
  launchBackends: { terminal: boolean; tmux: boolean };
  agentPrompt: string;
  toolMcpCapabilities: HarnessAttachment[];
  skillPluginCapabilities: HarnessAttachment[];
  selectedAttachmentIds: string[];
  onAgentNameChange: (value: string) => void;
  onAgentDescriptionChange: (value: string) => void;
  onAgentTagDraftChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onAgentHarnessChange: (value: string) => void;
  onLaunchBackendChange: (value: 'terminal' | 'tmux') => void;
  onAgentPromptChange: (value: string) => void;
  onToggleCapability: (id: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
};

export function LaunchModal({
  repositoryPath,
  agentName,
  agentDescription,
  agentTagDraft,
  tags,
  agentHarness,
  launchBackend,
  launchBackends,
  agentPrompt,
  toolMcpCapabilities,
  skillPluginCapabilities,
  selectedAttachmentIds,
  onAgentNameChange,
  onAgentDescriptionChange,
  onAgentTagDraftChange,
  onAddTag,
  onRemoveTag,
  onAgentHarnessChange,
  onLaunchBackendChange,
  onAgentPromptChange,
  onToggleCapability,
  onSubmit,
  onClose,
}: LaunchModalProps) {
  const launchBackendOptions: Array<{
    value: 'terminal' | 'tmux';
    label: string;
    hint: string;
    disabled?: boolean;
  }> = [
    {
      value: 'tmux',
      label: 'tmux',
      hint: launchBackends.tmux
        ? 'One tmux session per harness, one window per agent'
        : 'tmux not found — install it (brew install tmux / apt install tmux)',
      disabled: !launchBackends.tmux,
    },
    {
      value: 'terminal',
      label: 'Terminal.app',
      hint: launchBackends.terminal ? 'One macOS Terminal window per agent' : 'Available on macOS only',
      disabled: !launchBackends.terminal,
    },
  ];
  const tools = toolMcpCapabilities.filter((capability) => capability.kind === 'tool-bridge');
  const mcpServers = toolMcpCapabilities.filter((capability) => capability.kind === 'mcp-server');
  return (
    <ModalShell
      titleId="launch-title"
      kicker="Agent Instance"
      title="Hire Agent"
      fineprint={repositoryPath || 'Select a Repository first'}
      icon="⌁"
      onClose={onClose}
    >
      <form className="launch-form" onSubmit={onSubmit}>
        <section className="agent-identity-editor">
          <input
            className="agent-name-input"
            aria-label="Agent name"
            value={agentName}
            onChange={(event) => onAgentNameChange(event.target.value)}
            placeholder="Agent Name"
          />
          <textarea
            className="agent-short-description"
            aria-label="Agent description"
            value={agentDescription}
            onChange={(event) => onAgentDescriptionChange(event.target.value)}
            placeholder="Short description of the agent"
            rows={2}
          />
        </section>
        <fieldset className="tag-editor">
          <legend>Tags</legend>
          <div className="tag-add-row">
            <span aria-hidden="true">◇</span>
            <input
              aria-label="Add agent tag"
              value={agentTagDraft}
              onChange={(event) => onAgentTagDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onAddTag();
                }
              }}
              placeholder="Add a tag..."
            />
          </div>
          <div className="tag-chip-grid">
            {tags.map((tag) => (
              <button key={tag} type="button" onClick={() => onRemoveTag(tag)}>
                {tag} <span>×</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="harness-picker">
          <legend>Agent Harness</legend>
          <Dropdown
            ariaLabel="Agent Harness"
            value={agentHarness}
            options={harnesses.map((harness) => ({
              value: harness.id,
              label: harness.label,
              hint: harness.enabled ? 'Available now' : 'Coming soon',
              disabled: !harness.enabled,
            }))}
            onChange={onAgentHarnessChange}
          />
        </fieldset>
        <fieldset className="harness-picker">
          <legend>Launch Backend</legend>
          <Dropdown
            ariaLabel="Launch Backend"
            value={launchBackend}
            options={launchBackendOptions}
            onChange={(value) => onLaunchBackendChange(value as 'terminal' | 'tmux')}
          />
        </fieldset>
        <label>
          Agent Prompt
          <textarea
            className="agent-prompt-field"
            aria-label="Agent prompt"
            value={agentPrompt}
            onChange={(event) => onAgentPromptChange(event.target.value)}
            placeholder="Describe the agent's role, objective, collaboration behavior, tool-use rules, when to use skills/extensions, and how it should work with Devs and other Agent Instances in Omni."
            rows={8}
          />
        </label>
        <fieldset className="harness-picker attachment-picker">
          <legend>Tools</legend>
          <label className="capability-search">
            Add Tools
            <input aria-label="Search agent tools" placeholder="Search harness tools..." />
          </label>
          {tools.length === 0 ? (
            <div className="empty small">No Pi-compatible tools registered yet.</div>
          ) : (
            <div className="attachment-options template-capabilities">
              {tools.map((capability) => (
                <label
                  key={capability.id}
                  className={selectedAttachmentIds.includes(capability.id) ? 'selected' : ''}
                >
                  <input
                    type="checkbox"
                    checked={selectedAttachmentIds.includes(capability.id)}
                    onChange={() => onToggleCapability(capability.id)}
                  />
                  <span>
                    <strong>{capability.name}</strong>
                    <small>
                      {capability.harness} · {capability.kind}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="harness-picker attachment-picker">
          <legend>MCP</legend>
          <label className="capability-search">
            Add MCP
            <input aria-label="Search agent MCP" placeholder="Search MCP servers..." />
          </label>
          {mcpServers.length === 0 ? (
            <div className="empty small">No Pi-compatible MCP servers registered yet.</div>
          ) : (
            <div className="attachment-options template-capabilities">
              {mcpServers.map((capability) => (
                <label
                  key={capability.id}
                  className={selectedAttachmentIds.includes(capability.id) ? 'selected' : ''}
                >
                  <input
                    type="checkbox"
                    checked={selectedAttachmentIds.includes(capability.id)}
                    onChange={() => onToggleCapability(capability.id)}
                  />
                  <span>
                    <strong>{capability.name}</strong>
                    <small>
                      {capability.harness} · {capability.kind}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="harness-picker attachment-picker">
          <legend>Knowledge</legend>
          <p className="fineprint">Skills, Extensions, and Plugins attached to this harness.</p>
          <div className="attachment-options template-capabilities">
            {skillPluginCapabilities.map((capability) => (
              <label
                key={capability.id}
                className={selectedAttachmentIds.includes(capability.id) ? 'selected' : ''}
              >
                <input
                  type="checkbox"
                  checked={selectedAttachmentIds.includes(capability.id)}
                  onChange={() => onToggleCapability(capability.id)}
                />
                <span>
                  <strong>{capability.name}</strong>
                  <small>
                    {capability.harness === 'general' && capability.kind === 'skill'
                      ? 'Universal Skill · Pi-compatible via --skill'
                      : `${capability.harness} · ${capability.kind}`}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            type="submit"
            disabled={!repositoryPath || !harnesses.find((harness) => harness.id === agentHarness)?.enabled}
          >
            Hire Agent
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
