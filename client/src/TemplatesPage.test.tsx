// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemplatesPage } from './TemplatesPage';
import type { AgentTemplate, HarnessAttachment } from './server-state';

afterEach(cleanup);

function template(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: 'tpl-1',
    name: 'Reviewer',
    description: 'reviews code',
    harness: 'pi',
    tags: ['review'],
    capabilityIds: [],
    agentPrompt: '',
    instructions: '',
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as AgentTemplate;
}
function capability(overrides: Partial<HarnessAttachment> = {}): HarnessAttachment {
  return {
    id: 'c1',
    name: 'diagnose',
    harness: 'pi',
    kind: 'skill',
    source: 'global',
    required: false,
    risk: ['prompt-only'],
    cost: 'low',
    ...overrides,
  };
}

function props(overrides = {}) {
  return {
    templateTab: 'pi' as const,
    templates: [template()],
    piTemplateCapabilities: [capability()],
    filteredPiCapabilities: [capability()],
    toolMcpCapabilities: [] as HarnessAttachment[],
    editingTemplateId: null as string | null,
    librarySearch: '',
    name: 'Frontend Builder',
    description: '',
    tagDraft: '',
    tags: ['frontend'],
    agentPrompt: '',
    capabilitySearch: '',
    capabilityIds: [] as string[],
    onLibrarySearchChange: vi.fn(),
    onRefresh: vi.fn(),
    onHire: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onReset: vi.fn(),
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onTagDraftChange: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onAgentPromptChange: vi.fn(),
    onToggleCapability: vi.fn(),
    onCapabilitySearchChange: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    ...overrides,
  };
}

describe('TemplatesPage', () => {
  it('shows a coming-soon placeholder for non-pi tabs', () => {
    render(<TemplatesPage {...props({ templateTab: 'codex' })} />);
    expect(screen.getByText('Codex Agent Templates')).toBeTruthy();
  });

  it('lists saved Pi templates with hire/edit and the builder form', () => {
    render(<TemplatesPage {...props()} />);
    expect(screen.getByText('Reviewer')).toBeTruthy();
    expect(screen.getByText('Hire')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect((screen.getByLabelText('Template name') as HTMLInputElement).value).toBe('Frontend Builder');
    expect(screen.getByText('frontend')).toBeTruthy();
  });

  it('hires, edits, and deletes a (non-starter) template', () => {
    const onHire = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<TemplatesPage {...props({ onHire, onEdit, onDelete })} />);
    fireEvent.click(screen.getByText('Hire'));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onHire).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-1' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-1' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-1' }));
  });

  it('hides Delete for starter templates', () => {
    render(
      <TemplatesPage {...props({ templates: [template({ id: 'starter-1', name: 'Starter Pack' })] })} />,
    );
    expect(screen.getByText('Hire')).toBeTruthy();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('edits name and submits the builder form; Save toggles to Update when editing', () => {
    const onNameChange = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const { container, rerender } = render(<TemplatesPage {...props({ onNameChange, onSubmit })} />);
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Backend' } });
    expect(onNameChange).toHaveBeenCalledWith('Backend');
    expect(screen.getByText('Save')).toBeTruthy();
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    rerender(<TemplatesPage {...props({ editingTemplateId: 'tpl-1' })} />);
    expect(screen.getByText('Update')).toBeTruthy();
  });
});
