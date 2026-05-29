/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ApprovalDecision,
  ApprovalRecordInput,
  ApprovalScope,
  ApprovalSource,
  IApprovalRecordStore,
  ListApprovalRecordsQuery,
  SecurityApprovalRecord,
  SecurityApprovalRecordSettings,
  SecurityApprovalRecordsResponse,
} from '@openjiuwen/relay-api-server-contracts/storage';
import Database from 'better-sqlite3';

export type {
  ApprovalDecision,
  ApprovalRecordInput,
  ApprovalScope,
  ApprovalSource,
  ListApprovalRecordsQuery,
  SecurityApprovalRecord,
  SecurityApprovalRecordSettings,
  SecurityApprovalRecordsResponse,
};

interface ApprovalRecordRow {
  id: string;
  request_id: string;
  invocation_id: string;
  agent_id: string;
  thread_id: string;
  thread_title: string | null;
  action: string;
  operation_summary: string | null;
  decision: ApprovalDecision;
  scope: ApprovalScope | null;
  approval_source: ApprovalSource;
  requested_at: number;
  decided_at: number | null;
  decided_by: string | null;
  matched_rule_id: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_RETENTION_DAYS = 30;
const MAX_OPERATION_SUMMARY_LENGTH = 500;
const MAX_THREAD_TITLE_LENGTH = 200;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(limit), MAX_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset) || !offset || offset <= 0) return 0;
  return Math.trunc(offset);
}

function truncate(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function approvalLabel(record: Pick<SecurityApprovalRecord, 'decision' | 'scope' | 'approvalSource'>): string {
  if (record.approvalSource === 'rule') {
    return record.decision === 'deny' ? '规则自动拒绝' : '规则自动允许';
  }
  if (record.decision === 'pending') return '待审批';
  if (record.decision === 'deny') return '拒绝';
  if (record.scope === 'global') return '始终允许';
  if (record.scope === 'thread') return '本会话允许';
  return '本次允许';
}

function mapRow(row: ApprovalRecordRow): SecurityApprovalRecord {
  const record: SecurityApprovalRecord = {
    id: row.id,
    requestId: row.request_id,
    invocationId: row.invocation_id,
    agentId: row.agent_id as SecurityApprovalRecord['agentId'],
    threadId: row.thread_id,
    threadTitle: row.thread_title,
    action: row.action,
    operationSummary: row.operation_summary,
    decision: row.decision,
    approvalSource: row.approval_source,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    scope: row.scope,
    decidedBy: row.decided_by,
    matchedRuleId: row.matched_rule_id,
    approvalLabel: '',
  };
  return { ...record, approvalLabel: approvalLabel(record) };
}

function createRecordId(now: number): string {
  return `${now.toString(36)}-${randomUUID()}`;
}

function ensureParentDir(sqlitePath: string): void {
  if (sqlitePath !== ':memory:') {
    mkdirSync(dirname(sqlitePath), { recursive: true });
  }
}

export class SqliteApprovalRecordStore implements IApprovalRecordStore {
  private readonly db: Database.Database;
  private lastCleanupAt = 0;

  constructor(sqlitePath: string) {
    ensureParentDir(sqlitePath);
    this.db = new Database(sqlitePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.applySchema();
  }

  close(): void {
    this.db.close();
  }

  record(input: ApprovalRecordInput): SecurityApprovalRecord {
    const existing = input.requestId
      ? (this.db
          .prepare('SELECT id FROM authorization_approval_records WHERE request_id = ? ORDER BY created_at DESC LIMIT 1')
          .get(input.requestId) as { id: string } | undefined)
      : undefined;

    if (existing) {
      this.update(existing.id, input);
      const row = this.getRowById(existing.id);
      if (!row) throw new Error('Approval record update failed');
      return mapRow(row);
    }

    const now = Date.now();
    const id = createRecordId(now);
    const requestedAt = input.requestedAt;
    const decidedAt = input.decidedAt ?? null;
    const eventTime = decidedAt ?? requestedAt;
    this.db
      .prepare(
        `INSERT INTO authorization_approval_records (
          id, request_id, invocation_id, agent_id, thread_id, thread_title, action, operation_summary,
          decision, scope, approval_source, requested_at, decided_at, decided_by, matched_rule_id, event_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.requestId,
        input.invocationId,
        input.agentId,
        input.threadId,
        truncate(input.threadTitle, MAX_THREAD_TITLE_LENGTH),
        input.action,
        truncate(input.operationSummary, MAX_OPERATION_SUMMARY_LENGTH),
        input.decision,
        input.scope ?? null,
        input.approvalSource,
        requestedAt,
        decidedAt,
        input.decidedBy ?? null,
        input.matchedRuleId ?? null,
        eventTime,
        now,
      );
    this.cleanupExpiredIfNeeded();
    return mapRow(this.getRowById(id)!);
  }

  list(query: ListApprovalRecordsQuery = {}): SecurityApprovalRecordsResponse {
    this.cleanupExpiredIfNeeded();

    const settings = this.getSettings();
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (settings.autoCleanupEnabled) {
      where.push('event_time >= ?');
      params.push(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
    }

    if (!query.includeRuleMatched) {
      where.push('approval_source = ?');
      params.push('user');
    }

    const threadQuery = query.threadQuery?.trim().toLowerCase();
    if (threadQuery) {
      where.push(
        "(LOWER(COALESCE(thread_title, '')) LIKE ? OR ((thread_title IS NULL OR thread_title = '') AND LOWER(thread_id) LIKE ?))",
      );
      params.push(`%${threadQuery}%`, `%${threadQuery}%`);
    }

    const countWhereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalCount = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM authorization_approval_records ${countWhereSql}`).get(...params) as {
        count: number;
      }
    ).count;

    const pageWhereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT id, request_id, invocation_id, agent_id, thread_id, thread_title, action, operation_summary,
                decision, scope, approval_source, requested_at, decided_at, decided_by, matched_rule_id
         FROM authorization_approval_records
         ${pageWhereSql}
         ORDER BY event_time DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, offset) as ApprovalRecordRow[];

    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      records: pageRows.map(mapRow),
      pageInfo: {
        hasMore,
        ...(hasMore
          ? {
              nextOffset: offset + pageRows.length,
            }
          : {}),
      },
      totalCount,
      retention: {
        autoCleanupEnabled: settings.autoCleanupEnabled,
        retentionDays: settings.autoCleanupEnabled ? settings.retentionDays : null,
      },
    };
  }

  getSettings(): SecurityApprovalRecordSettings {
    const raw = this.getSetting('autoCleanupEnabled');
    return {
      autoCleanupEnabled: raw == null ? true : raw === 'true',
      retentionDays: DEFAULT_RETENTION_DAYS,
    };
  }

  updateSettings(input: { autoCleanupEnabled: boolean }): SecurityApprovalRecordSettings {
    this.db
      .prepare(
        `INSERT INTO authorization_approval_settings (key, value)
         VALUES ('autoCleanupEnabled', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(input.autoCleanupEnabled ? 'true' : 'false');
    if (input.autoCleanupEnabled) this.cleanupExpired();
    return this.getSettings();
  }

  private update(id: string, input: ApprovalRecordInput): void {
    const requestedAt = input.requestedAt;
    const decidedAt = input.decidedAt ?? null;
    const eventTime = decidedAt ?? requestedAt;
    this.db
      .prepare(
        `UPDATE authorization_approval_records
         SET invocation_id = ?, agent_id = ?, thread_id = ?, thread_title = ?, action = ?, operation_summary = ?,
             decision = ?, scope = ?, approval_source = ?, requested_at = ?, decided_at = ?, decided_by = ?,
             matched_rule_id = ?, event_time = ?
         WHERE id = ?`,
      )
      .run(
        input.invocationId,
        input.agentId,
        input.threadId,
        truncate(input.threadTitle, MAX_THREAD_TITLE_LENGTH),
        input.action,
        truncate(input.operationSummary, MAX_OPERATION_SUMMARY_LENGTH),
        input.decision,
        input.scope ?? null,
        input.approvalSource,
        requestedAt,
        decidedAt,
        input.decidedBy ?? null,
        input.matchedRuleId ?? null,
        eventTime,
        id,
      );
    this.cleanupExpiredIfNeeded();
  }

  private getRowById(id: string): ApprovalRecordRow | null {
    return (
      (this.db
        .prepare(
          `SELECT id, request_id, invocation_id, agent_id, thread_id, thread_title, action, operation_summary,
                  decision, scope, approval_source, requested_at, decided_at, decided_by, matched_rule_id
           FROM authorization_approval_records WHERE id = ?`,
        )
        .get(id) as ApprovalRecordRow | undefined) ?? null
    );
  }

  private getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM authorization_approval_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  private cleanupExpiredIfNeeded(): void {
    if (!this.getSettings().autoCleanupEnabled) return;
    const now = Date.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.cleanupExpired(now);
  }

  private cleanupExpired(now = Date.now()): void {
    this.lastCleanupAt = now;
    const cutoff = now - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM authorization_approval_records WHERE event_time < ?').run(cutoff);
  }

  private applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS authorization_approval_records (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        invocation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        thread_title TEXT,
        action TEXT NOT NULL,
        operation_summary TEXT,
        decision TEXT NOT NULL,
        scope TEXT,
        approval_source TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        decided_at INTEGER,
        decided_by TEXT,
        matched_rule_id TEXT,
        event_time INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_approval_records_request_id
        ON authorization_approval_records(request_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_approval_records_event_time
        ON authorization_approval_records(event_time DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_approval_records_source_time
        ON authorization_approval_records(approval_source, event_time DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_approval_records_thread_title
        ON authorization_approval_records(thread_title);
      CREATE TABLE IF NOT EXISTS authorization_approval_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
}

export function createSqliteApprovalRecordStore(sqlitePath: string): SqliteApprovalRecordStore {
  return new SqliteApprovalRecordStore(sqlitePath);
}
