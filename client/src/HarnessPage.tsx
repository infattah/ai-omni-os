import type { HarnessAttachment } from './server-state';
import { harnessTabs, type HarnessTab } from './harness-tabs';
import { CapabilitySurfaceCard, type CapabilityGroup } from './CapabilitySurfaceCard';
import { ComingSoonCards } from './ComingSoonCards';
import { PiMark } from './PiMark';

const placeholderHarnessSections: Record<Exclude<HarnessTab, 'general' | 'pi'>, string[]> = {
  codex: ['MCP Servers', 'Tools', 'Profiles', 'Sandbox / Approvals', 'Instructions', 'Settings / Health'],
  'claude-code': ['Agents', 'Commands', 'MCP Servers', 'Hooks', 'Permissions', 'Memory'],
  'gemini-cli': ['Extensions', 'Tools', 'MCP Servers', 'Memory', 'Settings / Health'],
  opencode: ['Agents', 'Commands', 'Plugins', 'MCP Servers', 'Tools', 'Settings / Health'],
};

type HarnessPageProps = {
  harnessTab: HarnessTab;
  piCapabilities: HarnessAttachment[];
  generalCapabilities: HarnessAttachment[];
  universalSkills: HarnessAttachment[];
  onInspectGroup: (group: CapabilityGroup) => void;
};

function PiHarnessContent({
  piCapabilities,
  onInspectGroup,
}: {
  piCapabilities: HarnessAttachment[];
  onInspectGroup: (group: CapabilityGroup) => void;
}) {
  const packages = piCapabilities.filter((capability) => capability.kind === 'pi-package');
  const extensions = piCapabilities.filter((capability) => capability.kind === 'pi-extension');
  const skills = piCapabilities.filter((capability) => capability.kind === 'skill');
  const prompts = piCapabilities.filter((capability) => capability.kind === 'prompt-template');
  const themes = piCapabilities.filter((capability) => capability.kind === 'theme');
  const agentPresets = piCapabilities.filter((capability) => capability.kind === 'command-pack');
  return (
    <section className="harness-grid">
      <div className="panel harness-main">
        <div className="panel-head pi-agent-head">
          <div className="pi-agent-title">
            <PiMark />
            <h2>Pi agent</h2>
          </div>
          <span className="count-pill">Omni global library</span>
        </div>
        <div className="capability-card-grid">
          <CapabilitySurfaceCard
            title="Packages"
            capabilities={packages}
            attachable={false}
            empty="No Pi packages registered."
            onInspect={onInspectGroup}
          />
          <CapabilitySurfaceCard
            title="Skills"
            capabilities={skills}
            attachable
            empty="No Pi skills detected."
            onInspect={onInspectGroup}
          />
          <CapabilitySurfaceCard
            title="Extensions"
            capabilities={extensions}
            attachable
            empty="No Pi extensions found."
            onInspect={onInspectGroup}
          />
          <CapabilitySurfaceCard
            title="Agent Presets"
            capabilities={agentPresets}
            attachable={false}
            empty="No Pi agent presets found."
            onInspect={onInspectGroup}
          />
          <CapabilitySurfaceCard
            title="Prompt Templates"
            capabilities={prompts}
            attachable={false}
            empty="No Pi prompt templates found."
            onInspect={onInspectGroup}
          />
          <CapabilitySurfaceCard
            title="Themes"
            capabilities={themes}
            attachable={false}
            empty="No Pi themes found."
            onInspect={onInspectGroup}
          />
        </div>
      </div>
      <aside className="panel harness-side">
        <h2>Launch Policy</h2>
        <p className="fineprint">
          Harness manages Omni-known Pi capabilities. Templates and launches attach only the relevant
          capabilities per Agent Instance.
        </p>
        <div className="harness-policy-list">
          <div>
            <strong>Required</strong>
            <span>Omni Connector for managed agents</span>
          </div>
          <div>
            <strong>Active now</strong>
            <span>Pi Skills and Pi Extensions can be selected for Pi templates</span>
          </div>
          <div>
            <strong>Advisory</strong>
            <span>Harness Health warns only; Omni does not edit Pi config automatically</span>
          </div>
        </div>
      </aside>
    </section>
  );
}

function GeneralHarnessContent({
  generalCapabilities,
  universalSkills,
  onInspectGroup,
}: {
  generalCapabilities: HarnessAttachment[];
  universalSkills: HarnessAttachment[];
  onInspectGroup: (group: CapabilityGroup) => void;
}) {
  return (
    <section className="harness-grid">
      <div className="panel harness-main">
        <div className="panel-head">
          <div>
            <p className="section-kicker">Universal</p>
            <h2>General capabilities</h2>
          </div>
          <span className="count-pill">{generalCapabilities.length} registered</span>
        </div>
        <div className="capability-card-grid">
          <CapabilitySurfaceCard
            title="Universal Skills"
            capabilities={universalSkills}
            attachable
            empty="No universal skills registered."
            onInspect={onInspectGroup}
          />
          {['Shared Tools', 'Function Calls', 'Persistent Memory'].map((section) => (
            <section key={section} className="capability-card disabled">
              <strong>{section}</strong>
              <span>Coming soon</span>
            </section>
          ))}
        </div>
      </div>
      <aside className="panel harness-side">
        <h2>General Policy</h2>
        <p className="fineprint">
          General is for universal Omni capabilities that can be reused by multiple Agent Harnesses without
          being globally enabled in any one CLI.
        </p>
        <div className="harness-policy-list">
          <div>
            <strong>Stored in Omni</strong>
            <span>Registered under ~/.omni/harness/general/</span>
          </div>
          <div>
            <strong>Attach selectively</strong>
            <span>
              Future templates can combine universal capabilities with harness-specific capabilities.
            </span>
          </div>
        </div>
      </aside>
    </section>
  );
}

export function HarnessPage({
  harnessTab,
  piCapabilities,
  generalCapabilities,
  universalSkills,
  onInspectGroup,
}: HarnessPageProps) {
  const placeholderTitle = harnessTabs.find((tab) => tab.id === harnessTab)?.label ?? 'Harness';
  return (
    <section className="admin-window">
      {harnessTab === 'general' && (
        <GeneralHarnessContent
          generalCapabilities={generalCapabilities}
          universalSkills={universalSkills}
          onInspectGroup={onInspectGroup}
        />
      )}
      {harnessTab === 'pi' && (
        <PiHarnessContent piCapabilities={piCapabilities} onInspectGroup={onInspectGroup} />
      )}
      {harnessTab !== 'general' && harnessTab !== 'pi' && (
        <ComingSoonCards
          title={placeholderTitle}
          description={`${placeholderTitle} capability management will use this harness's native concepts. Launch support is not enabled in v1.`}
          sections={placeholderHarnessSections[harnessTab]}
        />
      )}
    </section>
  );
}
