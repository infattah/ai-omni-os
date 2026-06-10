import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  type HarnessAttachment,
  type AgentTemplate,
  type AgentInstance,
  type TaskRequest,
  type WorkClaim,
  type ServerMessage,
  isActiveAgent,
} from './server-state';
import { useOmniConnection } from './use-omni-connection';
import { HarnessLocalNav } from './HarnessLocalNav';
import { RepositoryCard } from './RepositoryCard';
import { ChatPanel } from './ChatPanel';
import { TaskForm, type TaskFormPayload } from './TaskForm';
import { WorkClaimForm, type WorkClaimFormPayload } from './WorkClaimForm';
import { ModalShell } from './ModalShell';
import { TaskDetailModal } from './TaskDetailModal';
import { RepoBrowserModal } from './RepoBrowserModal';
import { CapabilityInspectorModal } from './CapabilityInspectorModal';
import { LaunchModal } from './LaunchModal';
import { ChatPage } from './ChatPage';
import { AgentsPage } from './AgentsPage';
import { TasksPage } from './TasksPage';
import { Overview } from './Overview';
import { MemoryPage } from './MemoryPage';
import { HarnessPage } from './HarnessPage';
import { TemplatesPage, isStarterTemplate } from './TemplatesPage';
import type { HarnessTab } from './harness-tabs';
import { harnesses } from './harnesses';

type WorkspaceMode = 'overview' | 'agents' | 'chat' | 'tasks' | 'memory';
type AdminMode = 'templates' | 'harness';
type Mode = WorkspaceMode | AdminMode;
const validModes: Mode[] = ['overview', 'agents', 'chat', 'tasks', 'memory', 'templates', 'harness'];

function tokenFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

function validMode(value: string | null): Mode | null {
  return validModes.includes(value as Mode) ? (value as Mode) : null;
}

function SidebarIcon({ name }: { name: 'sidebar' | 'templates' | 'harness' }) {
  if (name === 'templates') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1.8" />
        <rect x="14" y="4" width="6" height="6" rx="1.8" />
        <rect x="4" y="14" width="6" height="6" rx="1.8" />
        <rect x="14" y="14" width="6" height="6" rx="1.8" />
      </svg>
    );
  }
  if (name === 'harness') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 4v4" />
        <path d="M16 4v4" />
        <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
        <path d="M12 17v3" />
        <path d="M9 20h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M10 5v14" />
    </svg>
  );
}

export function initialMode(): Mode {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = validMode(params.get('mode'));
  if (fromUrl) return fromUrl;

  const currentToken = tokenFromLocation();
  const storedToken = window.localStorage.getItem('omni.sessionToken');
  if (currentToken !== storedToken) {
    if (currentToken) window.localStorage.setItem('omni.sessionToken', currentToken);
    else window.localStorage.removeItem('omni.sessionToken');
    return 'overview';
  }

  return validMode(window.localStorage.getItem('omni.mode')) ?? 'overview';
}

export function App() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [repoInput, setRepoInput] = useState('');
  const [repoBrowserOpen, setRepoBrowserOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRequest | null>(null);
  const [agentName, setAgentName] = useState('pi-planner');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentTags, setAgentTags] = useState('planning');
  const [agentTagDraft, setAgentTagDraft] = useState('');
  const [agentHarness, setAgentHarness] = useState('pi');
  const [launchBackend, setLaunchBackend] = useState<'terminal' | 'tmux'>('tmux');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentTemplateId, setAgentTemplateId] = useState<string | null>(null);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [featureSidebarOpen, setFeatureSidebarOpen] = useState(false);
  const [harnessTab, setHarnessTab] = useState<HarnessTab>('pi');
  const [templateTab, setTemplateTab] = useState<HarnessTab>('pi');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('Frontend Builder');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateTags, setTemplateTags] = useState('frontend');
  const [templateTagDraft, setTemplateTagDraft] = useState('');
  const [templateAgentPrompt, setTemplateAgentPrompt] = useState('');
  const [templateLibrarySearch, setTemplateLibrarySearch] = useState('');
  const [templateCapabilitySearch, setTemplateCapabilitySearch] = useState('');
  const [templateCapabilityIds, setTemplateCapabilityIds] = useState<string[]>([]);
  const [inspectedCapabilityGroup, setInspectedCapabilityGroup] = useState<{
    title: string;
    capabilities: HarnessAttachment[];
    attachable: boolean;
  } | null>(null);
  const [composer, setComposer] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('#all');
  const [showArchivedAgents, setShowArchivedAgents] = useState(false);
  const [contextContent, setContextContent] = useState('');
  const [projectSummary, setProjectSummary] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const token = useMemo(tokenFromLocation, []);
  // Connection, server-owned data, and outbound send live in the connection hook. Server state is
  // destructured back into the same names so every read site below is unchanged.
  const { connection, server, send } = useOmniConnection(token, {
    onServerMessage: handleServerMessage,
    onConnectionNotice: setNotice,
  });
  const {
    repositoryPath,
    agents,
    messages,
    activity,
    tasks,
    workClaims,
    harnessHealth,
    agentTemplates,
    launchBackends,
    repoBrowserPath,
    repoBrowserEntries,
    contextAgentName,
  } = server;
  const activeClaims = workClaims.filter((claim) => claim.status === 'active');
  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => Number(isActiveAgent(b)) - Number(isActiveAgent(a))),
    [agents],
  );
  const archivedAgentCount = agents.filter((agent) => agent.status === 'archived').length;
  const visibleAgents = showArchivedAgents
    ? sortedAgents
    : sortedAgents.filter((agent) => agent.status !== 'archived');
  const visibleMessages = messages.filter((message) =>
    selectedChannel === '#all'
      ? message.channelId === '#all'
      : message.channelId === selectedChannel || message.sender === selectedChannel.slice(1),
  );
  const generalCapabilities = (harnessHealth.general?.detectedAttachments ?? []).filter(
    (attachment) => !attachment.required,
  );
  const universalSkills = generalCapabilities.filter((capability) => capability.kind === 'skill');
  const piCapabilities = (harnessHealth.pi?.detectedAttachments ?? []).filter(
    (attachment) => !attachment.required,
  );
  const piTemplateCapabilities = [
    ...piCapabilities.filter((capability) =>
      ['skill', 'pi-extension', 'mcp-server', 'tool-bridge'].includes(capability.kind),
    ),
    ...universalSkills,
  ];
  const skillPluginCapabilities = piTemplateCapabilities.filter((capability) =>
    ['skill', 'pi-extension'].includes(capability.kind),
  );
  const toolMcpCapabilities = piTemplateCapabilities.filter((capability) =>
    ['mcp-server', 'tool-bridge'].includes(capability.kind),
  );
  const templateCapabilityQuery = templateCapabilitySearch.trim().toLowerCase();
  const filteredPiCapabilities = templateCapabilityQuery
    ? piTemplateCapabilities.filter((capability) =>
        `${capability.name} ${capability.kind} ${capability.path ?? ''}`
          .toLowerCase()
          .includes(templateCapabilityQuery),
      )
    : piTemplateCapabilities;
  const isAdminMode = mode === 'harness' || mode === 'templates';
  const workspaceModes: WorkspaceMode[] = ['overview', 'agents', 'chat', 'tasks', 'memory'];
  const needsAttention = [
    ...tasks
      .filter((task) => ['blocked', 'failed'].includes(task.status))
      .map((task) => `${task.humanId} ${task.status}: ${task.title}`),
    ...agents
      .filter((agent) => agent.status === 'running' && agent.presence?.connectionStatus !== 'connected')
      .map((agent) => `@${agent.name} ${agent.presence?.connectionStatus ?? 'disconnected'}`),
    ...agents
      .filter((agent) => agent.presence?.workStatus === 'blocked')
      .map((agent) => `@${agent.name} blocked`),
    ...activity
      .filter((event) => event.kind.includes('failed'))
      .slice(-3)
      .map((event) => event.summary),
  ];

  useEffect(() => {
    window.localStorage.setItem('omni.mode', mode);
  }, [mode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies(visibleMessages): trigger-only dep — scroll to bottom whenever the visible message list changes
  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleMessages]);

  // Non-pure, data-driven UI side-effects, invoked by the connection hook AFTER it has applied the pure
  // data transition. Covers mode changes, notices, modal toggles, the scan-dir follow-up, and the
  // Dev-edited fields the server also seeds. Declared as a function so the hook above can reference it.
  // biome-ignore lint/suspicious/noExplicitAny: deliberate escape hatch for loosely-typed server fields
  function handleServerMessage(msg: ServerMessage & Record<string, any>) {
    if (msg.type === 'state.snapshot') {
      setRepoInput(msg.repository?.path ?? '');
    } else if (msg.type === 'repo-selected') {
      setRepoInput(msg.path ?? '');
      setRepoBrowserOpen(false);
    } else if (msg.type === 'home-dir') {
      if (msg.path) send({ type: 'scan-dir', path: msg.path });
    } else if (msg.type === 'workClaim.failed') {
      setNotice(msg.reason ?? 'Work Claim action failed.');
    } else if (msg.type === 'project.summary') {
      setProjectSummary(msg.content ?? '');
      setSummaryOpen(true);
      setMode('memory');
    } else if (msg.type === 'handoff.generated') {
      setNotice(`Generated handoff: ${msg.path}`);
    } else if (msg.type === 'handoff.failed') {
      setNotice(msg.reason ?? 'Handoff generation failed.');
    } else if (msg.type === 'project.summary.saved') {
      setNotice('Saved Project Summary.');
    } else if (msg.type === 'project.summary.failed') {
      setNotice(msg.reason ?? 'Project Summary action failed.');
    } else if (msg.type === 'agent.context') {
      setContextContent(msg.content ?? '');
      setMode('agents');
    } else if (msg.type === 'agent.context.saved') {
      setNotice(`Saved Agent Context for ${msg.agentName}.`);
    } else if (msg.type === 'agent.context.failed') {
      setNotice(msg.reason ?? 'Agent Context action failed.');
    } else if (msg.type === 'agent-created') {
      setNotice(`Launched Agent Instance ${msg.agent.name}`);
      setLaunchOpen(false);
    } else if (msg.type === 'agent-create-failed') {
      setNotice(msg.reason ?? 'Agent launch failed.');
    }
  }

  function requestRepositorySwitch(nextRepo: string) {
    const trimmedRepo = nextRepo.trim();
    if (!trimmedRepo) return;

    const activeAgents = agents.filter(isActiveAgent);
    if (repositoryPath && trimmedRepo !== repositoryPath && activeAgents.length > 0) {
      const confirmed = window.confirm(
        `Switch Repository from ${repositoryPath} to ${trimmedRepo}? Active Agent Instances will stay in their terminal windows, but Omni will move this dashboard session to the new Repository.`,
      );
      if (!confirmed) {
        setRepoInput(repositoryPath);
        return;
      }
      send({ type: 'handoff.generate' });
    }

    send({ type: 'select-repo', path: trimmedRepo });
  }

  function selectRepository(event: FormEvent) {
    event.preventDefault();
    requestRepositorySwitch(repoInput);
  }

  function openRepoBrowser() {
    setRepoBrowserOpen(true);
    send({ type: 'get-home-dir' });
  }

  function scanRepoDir(path: string) {
    send({ type: 'scan-dir', path });
  }

  function parentDir(path: string) {
    const trimmed = path.replace(/\/+$/, '');
    const index = trimmed.lastIndexOf('/');
    if (index <= 0) return '/';
    return trimmed.slice(0, index);
  }

  function chooseRepositoryFromBrowser(path: string) {
    setRepoInput(path);
    requestRepositorySwitch(path);
  }

  function generateHandoff() {
    send({ type: 'handoff.generate' });
  }

  function archiveAgent(id: string) {
    send({ type: 'archive-agent', id });
  }

  function unarchiveAgent(id: string) {
    send({ type: 'unarchive-agent', id });
  }

  function resumeAgent(agent: AgentInstance) {
    // Every current harness runs in its own terminal window, so resume always reopens one.
    // (Headless harnesses, if ever added, would carry their own recipe flag — not a name check here.)
    send({
      type: 'resume-agent',
      id: agent.id,
      openTerminal: true,
      launchBackend: agent.launchBackend ?? launchBackend,
    });
  }

  function deleteAgent(id: string, name: string) {
    if (
      !window.confirm(
        `Delete Agent Instance ${name}? This removes it from Omni but does not delete Repository files.`,
      )
    )
      return;
    send({ type: 'delete-agent', id });
  }

  function toggleTemplateCapability(id: string) {
    setTemplateCapabilityIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleLaunchCapability(id: string) {
    setSelectedAttachmentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function tagsFromText(value: string): string[] {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function addTag(
    value: string,
    current: string,
    setCurrent: (value: string) => void,
    clearDraft: () => void,
  ) {
    const tags = tagsFromText(value);
    if (tags.length === 0) return;
    setCurrent(Array.from(new Set([...tagsFromText(current), ...tags])).join(', '));
    clearDraft();
  }

  function removeTag(tag: string, current: string, setCurrent: (value: string) => void) {
    setCurrent(
      tagsFromText(current)
        .filter((item) => item !== tag)
        .join(', '),
    );
  }

  function resetTemplateForm() {
    setEditingTemplateId(null);
    setTemplateName('Frontend Builder');
    setTemplateDescription('');
    setTemplateTags('frontend');
    setTemplateAgentPrompt('');
    setTemplateCapabilityIds([]);
    setTemplateCapabilitySearch('');
  }

  function saveAgentTemplate(event: FormEvent) {
    event.preventDefault();
    if (!templateName.trim()) return;
    send({
      type: 'agent.template.save',
      id: editingTemplateId ?? undefined,
      name: templateName.trim(),
      description: templateDescription.trim(),
      harness: templateTab,
      tags: templateTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      capabilityIds: templateCapabilityIds,
      toolMcpIds: templateCapabilityIds.filter((id) =>
        toolMcpCapabilities.some((capability) => capability.id === id),
      ),
      skillPluginIds: templateCapabilityIds.filter((id) =>
        skillPluginCapabilities.some((capability) => capability.id === id),
      ),
      agentPrompt: templateAgentPrompt.trim(),
    });
    setEditingTemplateId(null);
  }

  function editTemplate(template: AgentTemplate) {
    setTemplateTab(template.harness as HarnessTab);
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description);
    setTemplateTags(template.tags.join(', '));
    setTemplateAgentPrompt(template.agentPrompt ?? template.instructions ?? '');
    setTemplateCapabilityIds(template.capabilityIds);
    setTemplateCapabilitySearch('');
  }

  function addCapabilityToPiTemplate(capability: HarnessAttachment) {
    setTemplateTab('pi');
    setMode('templates');
    setTemplateCapabilityIds((current) =>
      current.includes(capability.id) ? current : [...current, capability.id],
    );
    setInspectedCapabilityGroup(null);
  }

  function deleteTemplate(template: AgentTemplate) {
    if (isStarterTemplate(template)) return;
    if (!window.confirm(`Delete Agent Template ${template.name}?`)) return;
    send({ type: 'agent.template.delete', id: template.id });
  }

  function hireFromTemplate(template: AgentTemplate) {
    setAgentName(
      template.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'pi-agent',
    );
    setAgentDescription(template.description ?? '');
    setAgentTags(template.tags.join(', '));
    setAgentHarness(template.harness);
    setAgentPrompt(template.agentPrompt ?? template.instructions ?? '');
    setAgentTemplateId(template.id);
    setSelectedAttachmentIds(template.capabilityIds);
    setLaunchOpen(true);
  }

  function launchAgent(event: FormEvent) {
    event.preventDefault();
    if (!agentName.trim()) return;
    if (!harnesses.find((harness) => harness.id === agentHarness)?.enabled) return;
    send({
      type: 'create-agent',
      name: agentName.trim(),
      tags: agentTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      harness: agentHarness,
      openTerminal: true,
      launchBackend,
      templateId: agentTemplateId ?? undefined,
      description: agentDescription.trim(),
      agentPrompt: agentPrompt.trim(),
      harnessAttachmentIds: agentHarness === 'pi' ? selectedAttachmentIds : [],
    });
    setSelectedAttachmentIds([]);
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!composer.trim()) return;
    send({
      type: 'send-message',
      channelId: selectedChannel,
      content: composer.trim(),
      channelType: selectedChannel === '#all' ? 'group' : 'direct',
    });
    setComposer('');
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    sendMessage();
  }

  function createTask(payload: TaskFormPayload) {
    send({ type: 'task.create', ...payload });
    setTaskModalOpen(false);
  }

  function updateTask(
    humanId: string,
    action: 'accept' | 'reject' | 'block' | 'fail' | 'complete' | 'cancel',
  ) {
    send({ type: `task.${action}`, humanId });
  }

  function loadAgentContext(agentName: string) {
    send({ type: 'agent.context.get', agentName });
  }

  function saveAgentContext() {
    if (!contextAgentName) return;
    send({ type: 'agent.context.save', agentName: contextAgentName, content: contextContent });
  }

  function loadProjectSummary() {
    send({ type: 'project.summary.get' });
  }

  function saveProjectSummary() {
    send({ type: 'project.summary.save', content: projectSummary });
  }

  function createWorkClaim(payload: WorkClaimFormPayload) {
    send({ type: 'workClaim.create', ...payload });
    setClaimModalOpen(false);
  }

  function releaseWorkClaim(claim: WorkClaim) {
    send({ type: 'workClaim.release', path: claim.path, agentName: claim.agentName });
  }

  const agentCardActions = {
    onOpen: () => setMode('agents'),
    onMessage: (agent: AgentInstance) => {
      setSelectedChannel(`@${agent.name}`);
      setMode('chat');
    },
    onResume: (agent: AgentInstance) => resumeAgent(agent),
    onEditContext: (agent: AgentInstance) => loadAgentContext(agent.name),
    onArchive: (agent: AgentInstance) => archiveAgent(agent.id),
    onUnarchive: (agent: AgentInstance) => unarchiveAgent(agent.id),
    onDelete: (agent: AgentInstance) => deleteAgent(agent.id, agent.name),
  };

  const chatPanelProps = {
    selectedChannel,
    messages: visibleMessages,
    composer,
    listRef: messageListRef,
    onComposerChange: setComposer,
    onSubmit: sendMessage,
    onComposerKeyDown: handleComposerKeyDown,
  };

  const repositoryCard = (
    <RepositoryCard
      repositoryPath={repositoryPath}
      repoInput={repoInput}
      agentCount={agents.length}
      taskCount={tasks.length}
      claimCount={activeClaims.length}
      onRepoInputChange={setRepoInput}
      onSubmit={selectRepository}
      onBrowse={openRepoBrowser}
      onGenerateHandoff={generateHandoff}
      onHireAgent={() => setLaunchOpen(true)}
    />
  );

  return (
    <main className={`shell ${featureSidebarOpen ? 'features-open' : ''}`}>
      <aside className="feature-rail" aria-label="Feature sidebar controls">
        <button
          className="feature-rail-button active"
          type="button"
          aria-label="Close/Open Sidebar"
          onClick={() => setFeatureSidebarOpen((value) => !value)}
        >
          <SidebarIcon name="sidebar" />
          <span className="rail-tooltip">Close/Open Sidebar</span>
        </button>
        <button
          className="feature-rail-button feature-rail-secondary"
          type="button"
          aria-label="Templates"
          onClick={() => {
            setFeatureSidebarOpen(true);
            setMode('templates');
          }}
        >
          <SidebarIcon name="templates" />
          <span className="rail-tooltip">Templates</span>
        </button>
        <button
          className="feature-rail-button feature-rail-secondary"
          type="button"
          aria-label="Harness"
          onClick={() => {
            setFeatureSidebarOpen(true);
            setMode('harness');
          }}
        >
          <SidebarIcon name="harness" />
          <span className="rail-tooltip">Harness</span>
        </button>
      </aside>
      {featureSidebarOpen && (
        <aside className="feature-sidebar" aria-label="Feature sidebar">
          <div className="feature-sidebar-head">
            <button
              className="feature-home"
              type="button"
              aria-label="Go to Overview"
              onClick={() => setMode('overview')}
            >
              <p className="section-kicker">Features</p>
              <h2>Omni</h2>
            </button>
            <button
              type="button"
              aria-label="Close/Open Sidebar"
              onClick={() => setFeatureSidebarOpen(false)}
            >
              <SidebarIcon name="sidebar" />
              <span className="rail-tooltip">Close/Open Sidebar</span>
            </button>
          </div>
          <button
            className={mode === 'templates' ? 'selected' : ''}
            type="button"
            onClick={() => setMode('templates')}
          >
            <SidebarIcon name="templates" />
            <span>
              <strong>Templates</strong>
              <small>Global saved agent templates</small>
            </span>
          </button>
          <button
            className={mode === 'harness' ? 'selected' : ''}
            type="button"
            onClick={() => setMode('harness')}
          >
            <SidebarIcon name="harness" />
            <span>
              <strong>Harness</strong>
              <small>Health, capabilities, and launch settings</small>
            </span>
          </button>
        </aside>
      )}
      <header
        className={`topbar ${isAdminMode ? 'admin-topbar' : ''} ${isAdminMode ? 'harness-topbar' : ''}`}
      >
        <div className="brand">
          <span className="app-icon" aria-hidden="true">
            ⌁
          </span>
          <div>
            <strong>
              {mode === 'harness' ? 'Agent Harness' : mode === 'templates' ? 'Agent Templates' : 'Omni'}
            </strong>
            <small>
              {mode === 'harness'
                ? 'Extend Your Agent Harness Capabilities'
                : mode === 'templates'
                  ? 'Compose Agent Harness Templates'
                  : 'Native local coordination'}
            </small>
          </div>
        </div>
        {mode === 'harness' && <HarnessLocalNav selected={harnessTab} onSelect={setHarnessTab} />}
        {mode === 'templates' && <HarnessLocalNav selected={templateTab} onSelect={setTemplateTab} />}
        {!isAdminMode && (
          <nav className="segmented-nav" aria-label="Primary navigation">
            {workspaceModes.map((item) => (
              <button
                key={item}
                className={mode === item ? 'active' : ''}
                type="button"
                onClick={() => setMode(item)}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </nav>
        )}
        <div className="top-actions">
          <span className={`security ${connection}`}>127.0.0.1 · {connection}</span>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}
      {mode !== 'overview' && !isAdminMode && (
        <div className="compact-repo">
          <span>{repositoryPath || 'No Repository selected'}</span>
          {mode === 'tasks' && (
            <div className="compact-repo-actions">
              <button
                className="primary"
                type="button"
                onClick={() => setTaskModalOpen(true)}
                disabled={!repositoryPath}
              >
                Create Task
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() => setClaimModalOpen(true)}
                disabled={!repositoryPath}
              >
                Claim Task
              </button>
            </div>
          )}
          <button type="button" onClick={() => setMode('overview')}>
            Repository
          </button>
        </div>
      )}

      {mode === 'overview' && (
        <Overview
          repositoryCard={repositoryCard}
          chatPanel={<ChatPanel {...chatPanelProps} />}
          agents={agents}
          visibleAgents={visibleAgents}
          agentActions={agentCardActions}
          archivedAgentCount={archivedAgentCount}
          showArchived={showArchivedAgents}
          needsAttention={needsAttention}
          tasks={tasks}
          activity={activity}
          onToggleArchive={() => setShowArchivedAgents((value) => !value)}
          onOpenTasks={() => setMode('tasks')}
          onSelectTask={setSelectedTask}
          onTaskAction={updateTask}
        />
      )}
      {mode === 'agents' && (
        <AgentsPage
          agents={agents}
          visibleAgents={visibleAgents}
          agentActions={agentCardActions}
          archivedAgentCount={archivedAgentCount}
          showArchived={showArchivedAgents}
          repositoryPath={repositoryPath}
          contextAgentName={contextAgentName}
          contextContent={contextContent}
          onToggleArchive={() => setShowArchivedAgents((value) => !value)}
          onHireAgent={() => setLaunchOpen(true)}
          onContextChange={setContextContent}
          onSaveContext={saveAgentContext}
        />
      )}
      {mode === 'chat' && (
        <ChatPage
          selectedChannel={selectedChannel}
          agents={sortedAgents}
          onSelectChannel={setSelectedChannel}
          chatPanel={<ChatPanel {...chatPanelProps} full />}
        />
      )}
      {mode === 'tasks' && (
        <TasksPage
          tasks={tasks}
          activeClaims={activeClaims}
          activity={activity}
          onReleaseClaim={releaseWorkClaim}
          onSelectTask={setSelectedTask}
          onTaskAction={updateTask}
        />
      )}
      {mode === 'templates' && (
        <TemplatesPage
          templateTab={templateTab}
          templates={agentTemplates}
          piTemplateCapabilities={piTemplateCapabilities}
          filteredPiCapabilities={filteredPiCapabilities}
          toolMcpCapabilities={toolMcpCapabilities}
          editingTemplateId={editingTemplateId}
          librarySearch={templateLibrarySearch}
          name={templateName}
          description={templateDescription}
          tagDraft={templateTagDraft}
          tags={tagsFromText(templateTags)}
          agentPrompt={templateAgentPrompt}
          capabilitySearch={templateCapabilitySearch}
          capabilityIds={templateCapabilityIds}
          onLibrarySearchChange={setTemplateLibrarySearch}
          onRefresh={() => send({ type: 'agent.templates.list' })}
          onHire={hireFromTemplate}
          onEdit={editTemplate}
          onDelete={deleteTemplate}
          onReset={resetTemplateForm}
          onNameChange={setTemplateName}
          onDescriptionChange={setTemplateDescription}
          onTagDraftChange={setTemplateTagDraft}
          onAddTag={() =>
            addTag(templateTagDraft, templateTags, setTemplateTags, () => setTemplateTagDraft(''))
          }
          onRemoveTag={(tag) => removeTag(tag, templateTags, setTemplateTags)}
          onAgentPromptChange={setTemplateAgentPrompt}
          onToggleCapability={toggleTemplateCapability}
          onCapabilitySearchChange={setTemplateCapabilitySearch}
          onSubmit={saveAgentTemplate}
        />
      )}
      {mode === 'harness' && (
        <HarnessPage
          harnessTab={harnessTab}
          piCapabilities={piCapabilities}
          generalCapabilities={generalCapabilities}
          universalSkills={universalSkills}
          onInspectGroup={setInspectedCapabilityGroup}
        />
      )}
      {mode === 'memory' && (
        <MemoryPage
          repositoryPath={repositoryPath}
          summaryOpen={summaryOpen}
          projectSummary={projectSummary}
          agents={agents}
          activity={activity}
          onLoadProjectSummary={loadProjectSummary}
          onProjectSummaryChange={setProjectSummary}
          onSaveProjectSummary={saveProjectSummary}
          onLoadAgentContext={loadAgentContext}
          onGenerateHandoff={generateHandoff}
        />
      )}

      {inspectedCapabilityGroup && (
        <CapabilityInspectorModal
          group={inspectedCapabilityGroup}
          onClose={() => setInspectedCapabilityGroup(null)}
          onUse={addCapabilityToPiTemplate}
        />
      )}

      {repoBrowserOpen && (
        <RepoBrowserModal
          path={repoBrowserPath}
          entries={repoBrowserEntries}
          onClose={() => setRepoBrowserOpen(false)}
          onUp={() => scanRepoDir(parentDir(repoBrowserPath))}
          onChoose={chooseRepositoryFromBrowser}
          onScan={scanRepoDir}
        />
      )}

      {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />}

      {taskModalOpen && (
        <ModalShell
          titleId="task-title"
          kicker="Task Request"
          title="Create Task"
          fineprint={repositoryPath || 'Select a Repository first'}
          icon="✓"
          onClose={() => setTaskModalOpen(false)}
        >
          <TaskForm
            repositoryPath={repositoryPath}
            onSubmit={createTask}
            onCancel={() => setTaskModalOpen(false)}
          />
        </ModalShell>
      )}

      {claimModalOpen && (
        <ModalShell
          titleId="claim-title"
          kicker="Work Claim"
          title="Create Claim"
          fineprint={repositoryPath || 'Select a Repository first'}
          icon="⌘"
          onClose={() => setClaimModalOpen(false)}
        >
          <WorkClaimForm
            repositoryPath={repositoryPath}
            onSubmit={createWorkClaim}
            onCancel={() => setClaimModalOpen(false)}
          />
        </ModalShell>
      )}

      {launchOpen && (
        <LaunchModal
          repositoryPath={repositoryPath}
          agentName={agentName}
          agentDescription={agentDescription}
          agentTagDraft={agentTagDraft}
          tags={tagsFromText(agentTags)}
          agentHarness={agentHarness}
          launchBackend={launchBackend}
          launchBackends={launchBackends}
          agentPrompt={agentPrompt}
          toolMcpCapabilities={toolMcpCapabilities}
          skillPluginCapabilities={skillPluginCapabilities}
          selectedAttachmentIds={selectedAttachmentIds}
          onAgentNameChange={setAgentName}
          onAgentDescriptionChange={setAgentDescription}
          onAgentTagDraftChange={setAgentTagDraft}
          onAddTag={() => addTag(agentTagDraft, agentTags, setAgentTags, () => setAgentTagDraft(''))}
          onRemoveTag={(tag) => removeTag(tag, agentTags, setAgentTags)}
          onAgentHarnessChange={setAgentHarness}
          onLaunchBackendChange={setLaunchBackend}
          onAgentPromptChange={setAgentPrompt}
          onToggleCapability={toggleLaunchCapability}
          onSubmit={launchAgent}
          onClose={() => setLaunchOpen(false)}
        />
      )}
    </main>
  );
}
