import { test, expect, type Page } from '@playwright/test';

function displayRepositoryNameForTest(repoPath: string): string {
  const trimmed = repoPath.replace(/\/+$/, '');
  return trimmed.split('/').filter(Boolean).pop() || repoPath;
}

async function selectRepository(
  page: Page,
  repoPath: string,
  options: { acceptSwitchDialog?: boolean } = {},
) {
  await expect(page.getByText('127.0.0.1 · connected')).toBeVisible();
  const acceptSwitchDialog = options.acceptSwitchDialog ?? true;
  const dialogPromise = page
    .waitForEvent('dialog', { timeout: 800 })
    .then(async (dialog) => {
      expect(dialog.message()).toContain('Switch Repository');
      if (acceptSwitchDialog) await dialog.accept();
      else await dialog.dismiss();
    })
    .catch(() => undefined);

  const repoInput = page.getByLabel('Repository path');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await repoInput.fill(repoPath);
    await repoInput.press('Enter');
    await page.waitForTimeout(150);
    if ((await repoInput.inputValue()) === repoPath) break;
  }
  await dialogPromise;
  await expect(repoInput).toHaveValue(repoPath);
}

test.describe('Omni UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?token=e2e-token&mode=overview');
  });

  test('shows the v1 coordination dashboard', async ({ page }) => {
    await expect(page.getByText('Native local coordination')).toBeVisible();
    await expect(page.getByText('127.0.0.1 · connected')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Agent Instances' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '#all' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  });

  test('shows Pi as the enabled v1 harness and later harnesses as coming soon', async ({ page }) => {
    await page.getByLabel('Repository path').fill(`/tmp/omni-playwright-harness-${Date.now()}`);
    await page.getByLabel('Repository path').press('Enter');
    await page.getByRole('button', { name: 'Hire Agent' }).first().click();
    await expect(page.getByRole('heading', { name: 'Hire Agent' })).toBeVisible();
    await page.getByRole('button', { name: 'Agent Harness' }).click();
    const harnessOptions = page.getByRole('listbox');
    await expect(harnessOptions).toContainText('Pi');
    await expect(harnessOptions).toContainText('Codex');
    await expect(harnessOptions).toContainText('Claude Code');
    await expect(harnessOptions).toContainText('Gemini CLI');
    await expect(harnessOptions).toContainText('opencode');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Pi Harness Health')).not.toBeVisible();
    await expect(page.getByText('Context Load Summary')).not.toBeVisible();
    await expect(page.getByText('Agent Capabilities for Pi')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hire Agent' }).last()).toBeVisible();
  });

  test('selects a Repository and shows persisted coordination activity', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-${Date.now()}`;

    await page.getByLabel('Repository path').fill(repoPath);
    await page.getByLabel('Repository path').press('Enter');

    await expect(page.getByText(`Repository selected: ${repoPath}`)).toBeVisible();
  });

  test('opens a folder browser from Browse', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse' }).click();
    await expect(page.getByRole('heading', { name: 'Browse Folders' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use this folder' })).toBeVisible();
  });

  test('keeps the chat composer focused while typing and supports Enter shortcuts', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-chat-focus-${Date.now()}`;

    await selectRepository(page, repoPath);

    const composer = page.getByLabel('Message');
    await composer.click();
    await page.keyboard.type('h');
    await expect(composer).toBeFocused();
    await page.keyboard.type('i');
    await expect(composer).toHaveValue('hi');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('there');
    await expect(composer).toHaveValue('hi\nthere');
    await page.keyboard.press('Enter');
    await expect(composer).toHaveValue('');
    await expect(page.locator('.message').filter({ hasText: 'hi\nthere' })).toBeVisible();
  });

  test('sends messages in Agent direct channels', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-direct-chat-${Date.now()}`;

    await selectRepository(page, repoPath);

    await page.evaluate(() => {
      const socket = new WebSocket('ws://127.0.0.1:3456/?token=e2e-token');
      socket.addEventListener('open', () => {
        socket.send(
          JSON.stringify({
            type: 'create-agent',
            name: 'direct-agent',
            tags: [],
            harness: 'cat',
            openTerminal: false,
          }),
        );
      });
      (window as any).__directSocket = socket;
    });
    await expect(page.getByText('@direct-agent', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Chat' }).click();
    await page.getByRole('button', { name: '@direct-agent' }).click();
    await page.getByLabel('Message').fill('hello direct');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '@direct-agent' })).toBeVisible();
    await expect(page.getByText('hello direct')).toBeVisible();
  });

  test('drives Task lifecycle from the dashboard', async ({ page }) => {
    const repoPath = `/tmp/omni-e2e-task-lifecycle-${Date.now()}`;

    await selectRepository(page, repoPath);

    await page.getByRole('button', { name: 'Tasks' }).click();
    await page.getByRole('button', { name: 'Create Task' }).click();
    await page.getByLabel('Task title').fill('Patch dashboard lifecycle');
    await page.getByLabel('Task target').fill('#all');
    await page.getByRole('button', { name: 'Create Task' }).last().click();

    const taskList = page.locator('.task-list');
    await expect(taskList.getByText('TASK-1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Accept TASK-1' }).click();
    await expect(taskList.getByText('accepted · normal · #all')).toBeVisible();
    await expect(page.getByText('Dev accepted TASK-1')).toBeVisible();

    await page.getByRole('button', { name: 'Block TASK-1' }).click();
    await expect(taskList.getByText('blocked · normal · #all')).toBeVisible();
    await expect(page.getByText('Dev blocked TASK-1')).toBeVisible();

    await page.getByRole('button', { name: 'Complete TASK-1' }).click();
    await expect(taskList.getByText('completed · normal · #all')).toBeVisible();
    await expect(page.getByText('Dev completed TASK-1')).toBeVisible();
  });

  test('confirms Repository switch when active agents exist', async ({ page }) => {
    const firstRepo = `/tmp/omni-playwright-switch-a-${Date.now()}`;
    const secondRepo = `/tmp/omni-playwright-switch-b-${Date.now()}`;

    await selectRepository(page, firstRepo);

    await page.evaluate(() => {
      const socket = new WebSocket('ws://127.0.0.1:3456/?token=e2e-token');
      socket.addEventListener('open', () => {
        socket.send(
          JSON.stringify({
            type: 'create-agent',
            name: 'switch-agent',
            tags: [],
            harness: 'cat',
            openTerminal: false,
          }),
        );
        // Bind presence so the agent counts as active and the switch confirm fires.
        socket.send(
          JSON.stringify({ type: 'connector.register', agentName: 'switch-agent', harness: 'cat' }),
        );
      });
      (window as any).__switchSocket = socket;
    });
    await expect(page.getByText('@switch-agent', { exact: true })).toBeVisible();
    // The disconnected-agents warning entry disappears once the connector registers.
    await expect(page.getByText('@switch-agent disconnected')).not.toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Switch Repository');
      await dialog.dismiss();
    });
    await page.getByLabel('Repository path').fill(secondRepo);
    await page.getByLabel('Repository path').press('Enter');
    await expect(page.getByLabel('Repository path')).toHaveValue(firstRepo);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Switch Repository');
      await dialog.accept();
    });
    await page.getByLabel('Repository path').fill(secondRepo);
    await page.getByLabel('Repository path').press('Enter');
    await expect(page.getByText(`Repository selected: ${secondRepo}`)).toBeVisible();
  });

  test('generates a handoff from the dashboard', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-handoff-${Date.now()}`;

    await selectRepository(page, repoPath);

    await page.getByRole('button', { name: 'Generate Handoff' }).first().click();
    await expect(page.getByText('Generated handoff:')).toBeVisible();
    await expect(page.getByText('Handoff generated:')).toBeVisible();
  });

  test('archives, resumes, and deletes an Agent Instance from the dashboard', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-agent-actions-${Date.now()}`;

    await selectRepository(page, repoPath);

    await page.evaluate(() => {
      const socket = new WebSocket('ws://127.0.0.1:3456/?token=e2e-token');
      socket.addEventListener('open', () => {
        socket.send(
          JSON.stringify({
            type: 'create-agent',
            name: 'actions-agent',
            tags: [],
            harness: 'cat',
            openTerminal: false,
          }),
        );
      });
      (window as any).__actionsSocket = socket;
    });
    await expect(page.getByText('@actions-agent', { exact: true })).toBeVisible();

    await page.getByLabel('actions-agent secondary actions').click();
    await page
      .getByRole('menuitem', { name: 'Archive actions-agent' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByText('Agent archived: actions-agent')).toBeVisible();
    await expect(page.getByText('@actions-agent', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Hide/Show Archive' }).click();
    await expect(page.getByText('cat · archived')).toBeVisible();

    await page.getByRole('button', { name: 'Resume actions-agent' }).first().click();
    await expect(page.getByText('cat · running')).toBeVisible();
    await expect(page.getByText('Agent resumed: actions-agent')).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Delete Agent Instance actions-agent');
      await dialog.accept();
    });
    await page.getByLabel('actions-agent secondary actions').click();
    await page
      .getByRole('menuitem', { name: 'Delete actions-agent' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByText('@actions-agent', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Agent deleted: actions-agent')).toBeVisible();
  });

  test('sidebar Omni title returns to Overview', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-sidebar-home-${Date.now()}`;

    await selectRepository(page, repoPath);
    await page.getByRole('button', { name: 'Harness' }).click();
    await expect(page.getByText('Agent Harness', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Go to Overview' }).click();
    await expect(page.getByRole('heading', { name: displayRepositoryNameForTest(repoPath) })).toBeVisible();
  });

  test('opens Harness from the feature sidebar', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-harness-page-${Date.now()}`;

    await selectRepository(page, repoPath);
    await page.getByRole('button', { name: 'Harness' }).click();
    await expect(page.getByText('Agent Harness', { exact: true })).toBeVisible();
    await expect(page.getByText('Extend Your Agent Harness Capabilities')).toBeVisible();
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pi agent' })).toBeVisible();
    await expect(page.getByText('Skills', { exact: true })).toBeVisible();
    await expect(page.getByText('Extensions', { exact: true })).toBeVisible();
    await expect(page.getByText('Launch Policy')).toBeVisible();
  });

  test('creates a global Agent Template and hires from it', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-template-${Date.now()}`;
    const templateName = `Reviewer Template ${Date.now()}`;

    await selectRepository(page, repoPath);
    await page.getByRole('button', { name: 'Templates' }).click();
    await expect(page.getByText('Agent Templates', { exact: true })).toBeVisible();
    await expect(page.locator('.saved-template').filter({ hasText: 'Pi Planner' })).toBeVisible();
    await page.getByLabel('Template name').fill(templateName);
    await page.getByLabel('Add template tag').fill('reviewer, testing');
    await page.getByLabel('Add template tag').press('Enter');
    await page.getByLabel('Template description').fill('Review changes and report risks.');
    await page.getByRole('button', { name: 'Save' }).click();

    const card = page.locator('.saved-template').filter({ hasText: templateName });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset' }).click();
    await card.getByRole('button', { name: 'Hire' }).click();
    await expect(page.getByRole('heading', { name: 'Hire Agent' })).toBeVisible();
    await expect(page.locator('.launch-modal')).toContainText('reviewer');
    await expect(page.locator('.launch-modal')).toContainText('testing');
    await page.locator('.launch-modal').getByRole('button', { name: 'Close', exact: true }).click();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain(`Delete Agent Template ${templateName}`);
      await dialog.accept();
    });
    await card.getByRole('button', { name: 'Delete' }).click();
    await expect(card).not.toBeVisible();
  });

  test('edits the Project Summary from the dashboard', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-summary-${Date.now()}`;

    await selectRepository(page, repoPath);

    await page.getByRole('button', { name: 'Memory' }).click();
    await page.getByRole('button', { name: 'Edit Project Summary' }).click();
    await expect(page.getByLabel('Project Summary')).toContainText('# Project Summary');
    await page.getByLabel('Project Summary').fill('# Project Summary\n\nEdited in Playwright.\n');
    await page.getByRole('button', { name: 'Save Project Summary' }).click();
    await expect(page.getByText('Saved Project Summary.')).toBeVisible();
    await expect(page.getByText('Project Summary updated by Dev')).toBeVisible();
  });

  test('creates and releases a Work Claim from the dashboard', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-claim-${Date.now()}`;

    await selectRepository(page, repoPath);

    await page.getByRole('button', { name: 'Tasks' }).click();
    await page.getByRole('button', { name: 'Claim Task' }).click();
    await page.getByLabel('Work Claim path').fill('src/server/server.ts');
    await page.getByLabel('Work Claim agent').fill('Dev');
    await page.getByLabel('Work Claim note').fill('Testing claim UI');
    await page.getByRole('button', { name: 'Create Claim' }).click();

    await expect(page.getByText('src/server/server.ts', { exact: true })).toBeVisible();
    await expect(page.getByText('@Dev')).toBeVisible();
    await expect(page.getByText('Testing claim UI')).toBeVisible();
    await expect(page.getByText('Dev claimed src/server/server.ts')).toBeVisible();

    await page.getByRole('button', { name: 'Release src/server/server.ts' }).click();
    await expect(page.getByText('No Work Claims.')).toBeVisible();
    await expect(page.getByText('Dev released src/server/server.ts')).toBeVisible();
  });

  test('creates and cancels a Task Request from the dashboard', async ({ page }) => {
    const repoPath = `/tmp/omni-playwright-work-${Date.now()}`;

    await selectRepository(page, repoPath);

    await page.getByRole('button', { name: 'Tasks' }).click();
    await page.getByRole('button', { name: 'Create Task' }).click();
    await page.getByLabel('Task title').fill('Review auth flow');
    await page.getByRole('button', { name: 'Task Priority' }).click();
    await page.getByRole('option', { name: /^high/ }).click();
    await page.getByRole('button', { name: 'Create Task' }).last().click();

    const taskList = page.locator('.task-list');
    await expect(taskList.getByText('TASK-1', { exact: true })).toBeVisible();
    await expect(taskList.getByText('Review auth flow', { exact: true })).toBeVisible();
    await expect(page.getByText('TASK-1 created: Review auth flow')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel TASK-1' }).click();
    await expect(taskList.getByText('cancelled · high · #all')).toBeVisible();
    await expect(page.getByText('Dev cancelled TASK-1')).toBeVisible();
  });
});
