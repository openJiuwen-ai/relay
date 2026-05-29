/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type RunOutcome =
  | 'SKIP_NO_SIGNAL'
  | 'SKIP_DISABLED'
  | 'SKIP_OVERLAP'
  | 'SKIP_GLOBAL_PAUSE'
  | 'SKIP_TASK_OVERRIDE'
  | 'SKIP_SELF_ECHO'
  | 'SKIP_MISSED_WINDOW'
  | 'RUN_DELIVERED'
  | 'RUN_FAILED';

export interface RunLedgerRow {
  task_id: string;
  subject_key: string;
  outcome: RunOutcome;
  signal_summary: string | null;
  duration_ms: number;
  started_at: string;
  assigned_agent_id: string | null;
  error_summary: string | null;
  task_snapshot_json?: string | null;
}

export interface RunLedgerRecord extends RunLedgerRow {
  id: number;
  task_snapshot_json: string | null;
}

export interface RunLedgerQuery {
  limit: number;
  cursor?: number;
  taskId?: string;
  threadId?: string;
  outcome?: RunOutcome;
  since?: string;
  until?: string;
}

export interface RunStats {
  total: number;
  delivered: number;
  failed: number;
  skipped: number;
}

export interface RunLedgerPort {
  record(row: RunLedgerRow): void;
  query(taskId: string, limit: number): RunLedgerRow[];
  queryBySubject(taskId: string, subjectKey: string, limit: number): RunLedgerRow[];
  queryAll(query: RunLedgerQuery): RunLedgerRecord[];
  getById(id: number): RunLedgerRecord | null;
  deleteById(id: number): boolean;
  stats(taskId: string): RunStats;
}

export interface GlobalControl {
  enabled: boolean;
  reason: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface TaskOverride {
  taskId: string;
  enabled: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface GlobalControlPort {
  getGlobalEnabled(): boolean;
  getGlobalState(): GlobalControl;
  setGlobalEnabled(enabled: boolean, reason: string | null, updatedBy: string): void;
  getTaskOverride(taskId: string): TaskOverride | null;
  setTaskOverride(taskId: string, enabled: boolean, updatedBy: string): void;
  removeTaskOverride(taskId: string): boolean;
  listOverrides(): TaskOverride[];
}

export interface EmissionRecord {
  originTaskId: string;
  threadId: string;
  messageId: string;
  suppressionMs: number;
}

export interface EmissionRow {
  emissionId: string;
  originTaskId: string;
  threadId: string;
  messageId: string;
  suppressionUntil: string;
  createdAt: string;
}

export interface EmissionPort {
  record(emission: EmissionRecord): void;
  isSuppressed(taskId: string, threadId: string): boolean;
  cleanup(): number;
  listActive(): EmissionRow[];
}

export type DisplayCategory = 'pr' | 'repo' | 'thread' | 'system' | 'external';
export type SubjectKind = 'pr' | 'repo' | 'thread' | 'external' | 'none';
export type TriggerSpec =
  | { type: 'interval'; ms: number }
  | { type: 'cron'; expression: string; timezone?: string }
  | { type: 'once'; fireAt: number };

export interface PackTemplateDef {
  templateId: string;
  packId: string;
  label: string;
  description: string;
  category: DisplayCategory;
  subjectKind: SubjectKind;
  defaultTrigger: TriggerSpec;
  paramSchema: Record<string, { type: string; required: boolean; description: string }>;
  builtinTemplateRef: string;
  createdAt?: string;
}

export interface PackTemplatePort {
  install(def: PackTemplateDef): void;
  get(templateId: string): PackTemplateDef | null;
  uninstall(templateId: string): boolean;
  listByPack(packId: string): PackTemplateDef[];
  listAll(): PackTemplateDef[];
}

export interface TaskDisplayMeta {
  label: string;
  category: DisplayCategory;
  description?: string;
  subjectKind?: SubjectKind;
}

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

export interface DynamicTaskPort {
  insert(def: DynamicTaskDef): void;
  getAll(): DynamicTaskDef[];
  getById(id: string): DynamicTaskDef | null;
  remove(id: string): boolean;
  setEnabled(id: string, enabled: boolean): boolean;
  update(
    id: string,
    def: Pick<DynamicTaskDef, 'trigger' | 'params' | 'display' | 'deliveryThreadId' | 'enabled'>,
  ): boolean;
  removeByThreadId(threadId: string): DynamicTaskDef[];
}

export interface SchedulerPersistence {
  ledger: RunLedgerPort;
  globalControlStore: GlobalControlPort;
  emissionStore: EmissionPort;
  packTemplateStore: PackTemplatePort;
  dynamicTaskStore: DynamicTaskPort;
  close?(): void | Promise<void>;
}

export interface SchedulerProviderInput {
  sqlitePath?: string;
}

export interface SchedulerProvider {
  readonly id: string;
  readonly displayName?: string;
  createSchedulerPersistence(input: SchedulerProviderInput): SchedulerPersistence | Promise<SchedulerPersistence>;
  bootstrap?(): Promise<void>;
  shutdown?(): Promise<void>;
}
