import Database from 'better-sqlite3';
import type { AgentInstance, Message, AgentGroup, ActivityEvent, TaskRequest, WorkClaim } from '../types.js';
import type { ContextPersistencePort } from '../ports/context-persistence.js';

export class ContextStore implements ContextPersistencePort {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        groupIds TEXT NOT NULL DEFAULT '[]',
        harness TEXT NOT NULL,
        launchBackend TEXT NOT NULL DEFAULT 'tmux',
        cwd TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        createdAt TEXT NOT NULL,
        harnessAttachments TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channelId TEXT NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        mentions TEXT NOT NULL DEFAULT '[]',
        channelType TEXT NOT NULL DEFAULT 'group',
        recipientAgents TEXT NOT NULL DEFAULT '[]',
        inReplyTo TEXT,
        expectsReply INTEGER NOT NULL DEFAULT 0,
        hops INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channelId, timestamp);

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tagFilter TEXT,
        agentIds TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events(timestamp);

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        humanId TEXT NOT NULL UNIQUE,
        requester TEXT NOT NULL,
        target TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        expectedResult TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'requested',
        owner TEXT,
        parentTaskId TEXT,
        filePaths TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(createdAt);

      CREATE TABLE IF NOT EXISTS work_claims (
        id TEXT PRIMARY KEY,
        agentName TEXT NOT NULL,
        path TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_work_claims_path ON work_claims(path, status);
    `);

    this.ensureColumn('agents', 'harnessAttachments', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('agents', 'launchBackend', "TEXT NOT NULL DEFAULT 'tmux'");
    this.ensureColumn('messages', 'inReplyTo', 'TEXT');
    this.ensureColumn('messages', 'expectsReply', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('messages', 'hops', 'INTEGER NOT NULL DEFAULT 0');
  }

  saveAgent(agent: AgentInstance): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents (id, name, tags, groupIds, harness, launchBackend, cwd, status, createdAt, harnessAttachments)
      VALUES (@id, @name, @tags, @groupIds, @harness, @launchBackend, @cwd, @status, @createdAt, @harnessAttachments)
    `);
    stmt.run({
      ...agent,
      tags: JSON.stringify(agent.tags),
      groupIds: JSON.stringify(agent.groupIds),
      launchBackend: agent.launchBackend ?? 'tmux',
      harnessAttachments: JSON.stringify(agent.harnessAttachments ?? []),
    });
  }

  getAgent(id: string): AgentInstance | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return this.hydrateAgent(row);
  }

  listAgents(): AgentInstance[] {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY createdAt ASC').all() as Record<
      string,
      unknown
    >[];
    return rows.map((r) => this.hydrateAgent(r));
  }

  deleteAgent(id: string): void {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
  }

  saveMessage(message: Message): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, channelId, sender, content, mentions, channelType, recipientAgents, inReplyTo, expectsReply, hops, timestamp)
      VALUES (@id, @channelId, @sender, @content, @mentions, @channelType, @recipientAgents, @inReplyTo, @expectsReply, @hops, @timestamp)
    `);
    stmt.run({
      ...message,
      mentions: JSON.stringify(message.mentions),
      recipientAgents: JSON.stringify(message.recipientAgents),
      inReplyTo: message.inReplyTo ?? null,
      expectsReply: message.expectsReply ? 1 : 0,
      hops: message.hops ?? 0,
    });
  }

  getMessages(channelId: string, limit: number = 50, offset: number = 0): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE channelId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?')
      .all(channelId, limit, offset) as Record<string, unknown>[];
    return rows.map((r) => this.hydrateMessage(r));
  }

  getMessage(id: string): Message | undefined {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.hydrateMessage(row) : undefined;
  }

  saveGroup(group: AgentGroup): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO groups (id, name, tagFilter, agentIds)
      VALUES (@id, @name, @tagFilter, @agentIds)
    `);
    stmt.run({
      ...group,
      agentIds: JSON.stringify(group.agentIds),
    });
  }

  getGroup(id: string): AgentGroup | undefined {
    const row = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return this.hydrateGroup(row);
  }

  listGroups(): AgentGroup[] {
    const rows = this.db.prepare('SELECT * FROM groups ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map((r) => this.hydrateGroup(r));
  }

  deleteGroup(id: string): void {
    this.db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  }

  saveActivityEvent(event: ActivityEvent): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO activity_events (id, kind, summary, payload, timestamp)
      VALUES (@id, @kind, @summary, @payload, @timestamp)
    `);
    stmt.run({
      ...event,
      payload: JSON.stringify(event.payload),
    });
  }

  listActivityEvents(limit: number = 100, offset: number = 0): ActivityEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM activity_events ORDER BY timestamp ASC LIMIT ? OFFSET ?')
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map((r) => this.hydrateActivityEvent(r));
  }

  saveTask(task: TaskRequest): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks (id, humanId, requester, target, title, details, expectedResult, priority, status, owner, parentTaskId, filePaths, createdAt, updatedAt)
      VALUES (@id, @humanId, @requester, @target, @title, @details, @expectedResult, @priority, @status, @owner, @parentTaskId, @filePaths, @createdAt, @updatedAt)
    `);
    stmt.run({
      ...task,
      filePaths: JSON.stringify(task.filePaths),
    });
  }

  listTasks(limit: number = 100, offset: number = 0): TaskRequest[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks ORDER BY createdAt ASC LIMIT ? OFFSET ?')
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map((r) => this.hydrateTask(r));
  }

  saveWorkClaim(workClaim: WorkClaim): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO work_claims (id, agentName, path, note, status, createdAt, updatedAt)
      VALUES (@id, @agentName, @path, @note, @status, @createdAt, @updatedAt)
    `);
    stmt.run(workClaim);
  }

  listWorkClaims(limit: number = 100, offset: number = 0): WorkClaim[] {
    const rows = this.db
      .prepare('SELECT * FROM work_claims ORDER BY updatedAt ASC LIMIT ? OFFSET ?')
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map((r) => this.hydrateWorkClaim(r));
  }

  close(): void {
    this.db.close();
  }

  clearAll(): void {
    this.db.exec('DELETE FROM agents');
    this.db.exec('DELETE FROM messages');
    this.db.exec('DELETE FROM groups');
    this.db.exec('DELETE FROM activity_events');
    this.db.exec('DELETE FROM tasks');
    this.db.exec('DELETE FROM work_claims');
  }

  reinit(dbPath: string): void {
    this.db.close();
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!rows.some((row) => row.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private hydrateAgent(row: Record<string, unknown>): AgentInstance {
    return {
      id: row.id as string,
      name: row.name as string,
      tags: JSON.parse((row.tags as string) || '[]'),
      groupIds: JSON.parse((row.groupIds as string) || '[]'),
      harness: row.harness as string,
      launchBackend: row.launchBackend === 'terminal' ? 'terminal' : 'tmux',
      cwd: row.cwd as string,
      status: row.status as AgentInstance['status'],
      harnessAttachments: JSON.parse((row.harnessAttachments as string) || '[]'),
      createdAt: row.createdAt as string,
    };
  }

  private hydrateMessage(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      msg_id: row.id as string,
      channelId: row.channelId as string,
      sender: row.sender as string,
      content: row.content as string,
      mentions: JSON.parse((row.mentions as string) || '[]'),
      channelType: row.channelType as Message['channelType'],
      recipientAgents: JSON.parse((row.recipientAgents as string) || '[]'),
      inReplyTo: (row.inReplyTo as string | undefined) || undefined,
      expectsReply: Boolean(row.expectsReply),
      hops: Number(row.hops ?? 0),
      timestamp: row.timestamp as string,
    };
  }

  private hydrateGroup(row: Record<string, unknown>): AgentGroup {
    return {
      id: row.id as string,
      name: row.name as string,
      tagFilter: row.tagFilter as string | null,
      agentIds: JSON.parse((row.agentIds as string) || '[]'),
    };
  }

  private hydrateTask(row: Record<string, unknown>): TaskRequest {
    return {
      id: row.id as string,
      humanId: row.humanId as string,
      requester: row.requester as string,
      target: row.target as string,
      title: row.title as string,
      details: row.details as string,
      expectedResult: row.expectedResult as string,
      priority: row.priority as TaskRequest['priority'],
      status: row.status as TaskRequest['status'],
      owner: row.owner as string | null,
      parentTaskId: row.parentTaskId as string | null,
      filePaths: JSON.parse((row.filePaths as string) || '[]'),
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    };
  }

  private hydrateWorkClaim(row: Record<string, unknown>): WorkClaim {
    return {
      id: row.id as string,
      agentName: row.agentName as string,
      path: row.path as string,
      note: row.note as string,
      status: row.status as WorkClaim['status'],
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    };
  }

  private hydrateActivityEvent(row: Record<string, unknown>): ActivityEvent {
    return {
      id: row.id as string,
      kind: row.kind as string,
      summary: row.summary as string,
      payload: JSON.parse((row.payload as string) || '{}') as Record<string, unknown>,
      timestamp: row.timestamp as string,
    };
  }
}
