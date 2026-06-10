import type { FormEvent } from 'react';
import type { AgentTemplate, HarnessAttachment } from './server-state';
import { harnessTabs, type HarnessTab } from './harness-tabs';
import { ComingSoonCards } from './ComingSoonCards';
import { PiMark } from './PiMark';
import { timeAgo } from './time-ago';

export function isStarterTemplate(template: AgentTemplate): boolean {
  return template.id.startsWith('starter-');
}

type TemplatesPageProps = {
  templateTab: HarnessTab;
  templates: AgentTemplate[];
  piTemplateCapabilities: HarnessAttachment[];
  filteredPiCapabilities: HarnessAttachment[];
  toolMcpCapabilities: HarnessAttachment[];
  editingTemplateId: string | null;
  librarySearch: string;
  name: string;
  description: string;
  tagDraft: string;
  tags: string[];
  agentPrompt: string;
  capabilitySearch: string;
  capabilityIds: string[];
  onLibrarySearchChange: (value: string) => void;
  onRefresh: () => void;
  onHire: (template: AgentTemplate) => void;
  onEdit: (template: AgentTemplate) => void;
  onDelete: (template: AgentTemplate) => void;
  onReset: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTagDraftChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onAgentPromptChange: (value: string) => void;
  onToggleCapability: (id: string) => void;
  onCapabilitySearchChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function TemplatesPage({
  templateTab,
  templates,
  piTemplateCapabilities,
  filteredPiCapabilities,
  toolMcpCapabilities,
  editingTemplateId,
  librarySearch,
  name,
  description,
  tagDraft,
  tags,
  agentPrompt,
  capabilitySearch,
  capabilityIds,
  onLibrarySearchChange,
  onRefresh,
  onHire,
  onEdit,
  onDelete,
  onReset,
  onNameChange,
  onDescriptionChange,
  onTagDraftChange,
  onAddTag,
  onRemoveTag,
  onAgentPromptChange,
  onToggleCapability,
  onCapabilitySearchChange,
  onSubmit,
}: TemplatesPageProps) {
  const templatesForTab = templates.filter((template) => template.harness === templateTab);
  const libraryQuery = librarySearch.trim().toLowerCase();
  const visibleTemplatesForTab = libraryQuery
    ? templatesForTab.filter((template) =>
        `${template.name} ${template.description} ${template.tags.join(' ')}`
          .toLowerCase()
          .includes(libraryQuery),
      )
    : templatesForTab;
  const starterTemplateCount = templatesForTab.filter(isStarterTemplate).length;
  const placeholderTitle = harnessTabs.find((tab) => tab.id === templateTab)?.label ?? 'Agent Templates';
  if (templateTab !== 'pi') {
    return (
      <section className="admin-window">
        <ComingSoonCards
          title={`${placeholderTitle} Agent Templates`}
          description={
            templateTab === 'general'
              ? 'Universal Agent Templates can use future universal capabilities from Harness > General.'
              : `${placeholderTitle} templates will attach capabilities from Harness > ${placeholderTitle}.`
          }
          sections={
            templateTab === 'general'
              ? ['Universal Agents', 'Shared Tools', 'Common Context', 'Launch Defaults']
              : ['Template Library', 'Capability Attachments', 'Harness Options', 'Context Load Summary']
          }
        />
      </section>
    );
  }
  const selectedTemplateCapabilities = piTemplateCapabilities.filter((capability) =>
    capabilityIds.includes(capability.id),
  );
  const capabilityNameById = new Map(
    piTemplateCapabilities.map((capability) => [capability.id, capability.name]),
  );
  const tools = toolMcpCapabilities.filter((capability) => capability.kind === 'tool-bridge');
  const mcpServers = toolMcpCapabilities.filter((capability) => capability.kind === 'mcp-server');
  const knowledge = filteredPiCapabilities.filter((capability) =>
    ['skill', 'pi-extension'].includes(capability.kind),
  );
  return (
    <section className="admin-window">
      <section className="templates-grid templates-compose-grid">
        <section className="panel template-library template-library-main">
          <div className="template-library-header">
            <div className="panel-head template-library-title">
              <div className="pi-agent-title">
                <PiMark />
                <div>
                  <p className="section-kicker">Pi selected</p>
                  <h2>Pi Agent Templates</h2>
                </div>
              </div>
              <button type="button" onClick={onRefresh}>
                Refresh
              </button>
            </div>
            <div className="template-library-toolbar">
              <label className="template-search">
                Filter templates
                <input
                  aria-label="Search agent templates"
                  value={librarySearch}
                  onChange={(event) => onLibrarySearchChange(event.target.value)}
                  placeholder="reviewer, planner, frontend"
                />
              </label>
              <div className="template-stats">
                <span>{templatesForTab.length} total</span>
                <span>{starterTemplateCount} starter</span>
                <span>{templatesForTab.length - starterTemplateCount} custom</span>
              </div>
            </div>
          </div>
          {templatesForTab.length === 0 ? (
            <div className="empty template-empty">
              <strong>No Pi Agent Templates saved yet.</strong>
              <span>Create one on the right; it will appear here as a reusable agent card.</span>
            </div>
          ) : visibleTemplatesForTab.length === 0 ? (
            <div className="empty template-empty">
              <strong>No matching templates.</strong>
              <span>Clear the filter to see all Pi Agent Templates.</span>
            </div>
          ) : (
            <div className="template-tile-grid">
              {visibleTemplatesForTab.map((template) => {
                const shownCapabilities = template.capabilityIds
                  .map((id) => capabilityNameById.get(id))
                  .filter(Boolean)
                  .slice(0, 3);
                return (
                  <article key={template.id} className="template-tile saved-template">
                    <div className="template-tile-head">
                      <PiMark />
                      <strong>{template.name}</strong>
                    </div>
                    <p>{template.description || 'No description.'}</p>
                    <div className="template-chip-row">
                      {isStarterTemplate(template) && <span>Starter</span>}
                      {template.tags.slice(0, 3).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <div className="template-capability-row">
                      {shownCapabilities.length === 0 ? (
                        <span>No capabilities attached</span>
                      ) : (
                        shownCapabilities.map((name) => <span key={name}>{name}</span>)
                      )}
                    </div>
                    <small>
                      {template.capabilityIds.length} capabilities · updated {timeAgo(template.updatedAt)}
                    </small>
                    <div className="template-actions">
                      <button type="button" onClick={() => onHire(template)}>
                        Hire
                      </button>
                      <button type="button" onClick={() => onEdit(template)}>
                        Edit
                      </button>
                      {!isStarterTemplate(template) && (
                        <button type="button" onClick={() => onDelete(template)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <aside className="panel template-builder template-builder-side">
          <div className="panel-head">
            <div className="pi-agent-title">
              <PiMark />
              <div>
                <p className="section-kicker">Pi</p>
                <h2>{editingTemplateId ? 'Edit Agent' : 'Create Agent'}</h2>
              </div>
            </div>
            <div className="panel-head-actions">
              <span className="count-pill">{templatesForTab.length} saved</span>
              <button type="button" onClick={onReset}>
                New
              </button>
            </div>
          </div>
          <form className="launch-form" onSubmit={onSubmit}>
            <section className="agent-identity-editor">
              <input
                className="agent-name-input"
                aria-label="Template name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Agent Name"
              />
              <textarea
                className="agent-short-description"
                aria-label="Template description"
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Short description of the agent"
                rows={2}
              />
            </section>
            <fieldset className="tag-editor">
              <legend>Tags</legend>
              <div className="tag-add-row">
                <span aria-hidden="true">◇</span>
                <input
                  aria-label="Add template tag"
                  value={tagDraft}
                  onChange={(event) => onTagDraftChange(event.target.value)}
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
            <label>
              Agent Prompt
              <textarea
                className="agent-prompt-field"
                aria-label="Template agent prompt"
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
                <input aria-label="Search template tools" placeholder="Search harness tools..." />
              </label>
              {tools.length === 0 ? (
                <div className="empty small">
                  No Pi-compatible tools registered yet. Add tools in Harness first.
                </div>
              ) : (
                <div className="attachment-options template-capabilities">
                  {tools.map((capability) => (
                    <label
                      key={capability.id}
                      className={capabilityIds.includes(capability.id) ? 'selected' : ''}
                      title={capability.path}
                    >
                      <input
                        type="checkbox"
                        checked={capabilityIds.includes(capability.id)}
                        onChange={() => onToggleCapability(capability.id)}
                      />
                      <span>
                        <strong>{capability.name}</strong>
                        <small>
                          {capability.harness} · {capability.kind} · cost {capability.cost}
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
                <input aria-label="Search template MCP" placeholder="Search MCP servers..." />
              </label>
              {mcpServers.length === 0 ? (
                <div className="empty small">
                  No Pi-compatible MCP servers registered yet. Add MCP servers in Harness first.
                </div>
              ) : (
                <div className="attachment-options template-capabilities">
                  {mcpServers.map((capability) => (
                    <label
                      key={capability.id}
                      className={capabilityIds.includes(capability.id) ? 'selected' : ''}
                      title={capability.path}
                    >
                      <input
                        type="checkbox"
                        checked={capabilityIds.includes(capability.id)}
                        onChange={() => onToggleCapability(capability.id)}
                      />
                      <span>
                        <strong>{capability.name}</strong>
                        <small>
                          {capability.harness} · {capability.kind} · cost {capability.cost}
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
              <label className="capability-search">
                Search composable capabilities
                <input
                  aria-label="Search template capabilities"
                  value={capabilitySearch}
                  onChange={(event) => onCapabilitySearchChange(event.target.value)}
                  placeholder="diagnose, tdd, architecture"
                />
              </label>
              {knowledge.length === 0 ? (
                <div className="empty small">No matching Pi skills/extensions detected.</div>
              ) : (
                <div className="attachment-options template-capabilities">
                  {knowledge.map((capability) => (
                    <label
                      key={capability.id}
                      className={capabilityIds.includes(capability.id) ? 'selected' : ''}
                      title={capability.path}
                    >
                      <input
                        type="checkbox"
                        checked={capabilityIds.includes(capability.id)}
                        onChange={() => onToggleCapability(capability.id)}
                      />
                      <span>
                        <strong>{capability.name}</strong>
                        <small>
                          {capability.harness === 'general' && capability.kind === 'skill'
                            ? 'Universal Skill · Pi-compatible via --skill'
                            : `${capability.harness} · ${capability.kind}`}{' '}
                          · cost {capability.cost} · risk {capability.risk.join(', ')}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="context-load-card">
              <strong>Context Load Summary</strong>
              <span>
                {selectedTemplateCapabilities.length} selected ·{' '}
                {selectedTemplateCapabilities.filter((capability) => capability.cost === 'high').length} high
                cost · packages are visible but not attachable yet
              </span>
              {selectedTemplateCapabilities.length > 0 && (
                <div className="selected-capability-chips">
                  {selectedTemplateCapabilities.map((capability) => (
                    <button
                      key={capability.id}
                      type="button"
                      onClick={() => onToggleCapability(capability.id)}
                      title="Remove capability"
                    >
                      {capability.name} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onReset}>
                Reset
              </button>
              <button className="primary" type="submit" disabled={!name.trim()}>
                {editingTemplateId ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        </aside>
      </section>
    </section>
  );
}
