/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type Database from 'better-sqlite3';
import type { RunLedgerQuery, RunLedgerRecord, RunLedgerRow, RunStats } from './types.js';

export class RunLedger {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  record(row: RunLedgerRow): void {
    this.db
      .prepare(
        `INSERT INTO task_run_ledger (task_id, subject_key, outcome, signal_summary, duration_ms, started_at, assigned_agent_id, error_summary, task_snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.task_id,
        row.subject_key,
        row.outcome,
        row.signal_summary,
        row.duration_ms,
        row.started_at,
        row.assigned_agent_id,
        row.error_summary ?? null,
        row.task_snapshot_json ?? null,
      );
  }

  query(taskId: string, limit: number): RunLedgerRow[] {
    return this.db
      .prepare(
        `SELECT task_id, subject_key, outcome, signal_summary, duration_ms, started_at, assigned_agent_id, error_summary
         FROM task_run_ledger WHERE task_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(taskId, limit) as RunLedgerRow[];
  }

  /** Phase 2: query runs filtered by exact subject_key */
  queryBySubject(taskId: string, subjectKey: string, limit: number): RunLedgerRow[] {
    return this.db
      .prepare(
        `SELECT task_id, subject_key, outcome, signal_summary, duration_ms, started_at, assigned_agent_id, error_summary
         FROM task_run_ledger WHERE task_id = ? AND subject_key = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(taskId, subjectKey, limit) as RunLedgerRow[];
  }

  queryAll(query: RunLedgerQuery): RunLedgerRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (query.cursor != null) {
      where.push('id < ?');
      params.push(query.cursor);
    }
    if (query.taskId) {
      where.push('task_id = ?');
      params.push(query.taskId);
    }
    if (query.threadId) {
      where.push('(subject_key = ? OR subject_key = ?)');
      params.push(`thread-${query.threadId}`, `thread:${query.threadId}`);
    }
    if (query.outcome) {
      where.push('outcome = ?');
      params.push(query.outcome);
    }
    if (query.since) {
      where.push('started_at >= ?');
      params.push(query.since);
    }
    if (query.until) {
      where.push('started_at <= ?');
      params.push(query.until);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    return this.db
      .prepare(
        `SELECT id, task_id, subject_key, outcome, signal_summary, duration_ms, started_at, assigned_agent_id, error_summary, task_snapshot_json
         FROM task_run_ledger ${whereSql} ORDER BY id DESC LIMIT ?`,
      )
      .all(...params, query.limit) as RunLedgerRecord[];
  }

  getById(id: number): RunLedgerRecord | null {
    return (
      (this.db
        .prepare(
          `SELECT id, task_id, subject_key, outcome, signal_summary, duration_ms, started_at, assigned_agent_id, error_summary, task_snapshot_json
           FROM task_run_ledger WHERE id = ?`,
        )
        .get(id) as RunLedgerRecord | undefined) ?? null
    );
  }

  deleteById(id: number): boolean {
    const result = this.db.prepare('DELETE FROM task_run_ledger WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /** Phase 2: aggregate outcome stats for a task */
  stats(taskId: string): RunStats {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN outcome = 'RUN_DELIVERED' THEN 1 ELSE 0 END) as delivered,
           SUM(CASE WHEN outcome = 'RUN_FAILED' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN outcome IN ('SKIP_NO_SIGNAL','SKIP_DISABLED','SKIP_OVERLAP') THEN 1 ELSE 0 END) as skipped
         FROM task_run_ledger WHERE task_id = ?`,
      )
      .get(taskId) as { total: number; delivered: number; failed: number; skipped: number } | undefined;
    return {
      total: row?.total ?? 0,
      delivered: row?.delivered ?? 0,
      failed: row?.failed ?? 0,
      skipped: row?.skipped ?? 0,
    };
  }
}
