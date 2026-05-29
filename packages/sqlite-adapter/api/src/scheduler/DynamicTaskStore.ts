/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type Database from 'better-sqlite3';
import type { TaskDisplayMeta, TriggerSpec } from './types.js';

/** Persisted dynamic task definition — user config stored in SQLite */
export interface DynamicTaskDef {
  id: string;
  templateId: string;
  trigger: TriggerSpec;
  params: Record<string, unknown>;
  display: TaskDisplayMeta;
  deliveryThreadId: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

/** CRUD store for dynamic task definitions (Phase 3A AC-G3) */
export class DynamicTaskStore {
  constructor(private db: Database.Database) {}

  insert(def: DynamicTaskDef): void {
    this.db
      .prepare(
        `INSERT INTO dynamic_task_defs (id, template_id, trigger_json, params_json, display_json, delivery_thread_id, enabled, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        def.id,
        def.templateId,
        JSON.stringify(def.trigger),
        JSON.stringify(def.params),
        JSON.stringify(def.display),
        def.deliveryThreadId,
        def.enabled ? 1 : 0,
        def.createdBy,
        def.createdAt,
      );
  }

  getAll(): DynamicTaskDef[] {
    const rows = this.db.prepare('SELECT * FROM dynamic_task_defs ORDER BY created_at DESC').all() as RawRow[];
    return rows.map(todef);
  }

  getById(id: string): DynamicTaskDef | null {
    const row = this.db.prepare('SELECT * FROM dynamic_task_defs WHERE id = ?').get(id) as RawRow | undefined;
    return row ? todef(row) : null;
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM dynamic_task_defs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const result = this.db.prepare('UPDATE dynamic_task_defs SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    return result.changes > 0;
  }

  update(
    id: string,
    def: Pick<DynamicTaskDef, 'trigger' | 'params' | 'display' | 'deliveryThreadId' | 'enabled'>,
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE dynamic_task_defs
         SET trigger_json = ?, params_json = ?, display_json = ?, delivery_thread_id = ?, enabled = ?
         WHERE id = ?`,
      )
      .run(
        JSON.stringify(def.trigger),
        JSON.stringify(def.params),
        JSON.stringify(def.display),
        def.deliveryThreadId,
        def.enabled ? 1 : 0,
        id,
      );
    return result.changes > 0;
  }

  /** 删除指定会话关联的所有定时任务，返回被删除的任务列表 */
  removeByThreadId(threadId: string): DynamicTaskDef[] {
    const tasks = this.db
      .prepare('SELECT * FROM dynamic_task_defs WHERE delivery_thread_id = ?')
      .all(threadId) as RawRow[];
    if (tasks.length === 0) return [];
    this.db.prepare('DELETE FROM dynamic_task_defs WHERE delivery_thread_id = ?').run(threadId);
    return tasks.map(todef);
  }
}

interface RawRow {
  id: string;
  template_id: string;
  trigger_json: string;
  params_json: string;
  display_json: string;
  delivery_thread_id: string | null;
  enabled: number;
  created_by: string;
  created_at: string;
}

function todef(row: RawRow): DynamicTaskDef {
  return {
    id: row.id,
    templateId: row.template_id,
    trigger: JSON.parse(row.trigger_json),
    params: JSON.parse(row.params_json),
    display: JSON.parse(row.display_json),
    deliveryThreadId: row.delivery_thread_id,
    enabled: row.enabled === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
