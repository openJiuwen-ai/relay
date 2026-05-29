/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// ─── V1: Legacy ScheduledTask interface (used by TaskRunner V1 + SummaryCompactionTask) ──

/**
 * Minimal scheduled task interface (V1).
 * MVP: tasks are run by a simple setInterval-based TaskRunner.
 * New tasks should use TaskSpec_P1 + TaskRunnerV2 instead.
 */
export interface ScheduledTask {
  /** Unique task name for logging and dedup */
  name: string;
  /** Interval in milliseconds between ticks */
  intervalMs: number;
  /** Check if this task is enabled (e.g. feature flag) */
  enabled: () => boolean;
  /** Execute one tick. Errors are caught by TaskRunner, never crash the process. */
  execute: () => Promise<void>;
}

// ─── F139: Unified Schedule Abstraction ────────────────────

/** Single work item returned by gate — one per subject */
export interface WorkItem<Signal = unknown> {
  signal: Signal;
  subjectKey: string;
  dedupeKey?: string;
}

/** Typed signal gate result — replaces boolean eligibility checks */
export type GateResult<Signal = unknown> =
  | { run: false; reason: string }
  | { run: true; workItems: WorkItem<Signal>[] };

/** Gate context passed to admission gate */
export interface GateCtx {
  taskId: string;
  lastRunAt: number | null;
  tickCount: number;
}

/** Task profile presets (ADR-022 KD-1) */
export type TaskProfile = 'awareness' | 'poller';

/** Phase 2: Trigger spec — interval, cron, or once (#415) */
export type TriggerSpec =
  | { type: 'interval'; ms: number }
  | { type: 'cron'; expression: string; timezone?: string }
  | { type: 'once'; fireAt: number };

/** Phase 2: Context dimension — session × materialization */
export interface ContextSpec {
  session: 'new-thread' | 'same-thread';
  materialization: 'light' | 'full';
}

/** Run ledger outcome */
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

/** Actor capability namespace (Phase 1b) — NOT roster identity roles */
export type ActorRole = 'memory-curator' | 'repo-watcher' | 'health-monitor';

/** Cost tier hint for actor resolution */
export type CostTier = 'cheap' | 'deep';

/** Actor dimension (Phase 1b) — declares what kind of agent a task needs */
export interface ActorSpec {
  role: ActorRole;
  costTier: CostTier;
}

/** Phase 2.5: Display contract — task declares its own display metadata (KD-8) */
export type DisplayCategory = 'pr' | 'repo' | 'thread' | 'system' | 'external';

/** Phase 2.5: Subject kind for subjectPreview computation (KD-9) */
export type SubjectKind = 'pr' | 'repo' | 'thread' | 'external' | 'none';

/** Phase 2.5: Static display metadata declared by each task (AC-E1) */
export interface TaskDisplayMeta {
  label: string;
  category: DisplayCategory;
  description?: string;
  subjectKind?: SubjectKind;
}

/** Phase 4: options for delivering a message to a thread */
export interface DeliverOpts {
  threadId: string;
  content: string;
  agentId: string;
  userId: string;
}

/** Phase 4: result of fetching web content */
export interface FetchResult {
  text: string;
  title: string;
  url: string;
  method: 'server-fetch' | 'browser';
  truncated: boolean;
}

/** Minimal trigger policy for scheduled invocations */
export interface ScheduleTriggerPolicy {
  readonly priority?: 'urgent' | 'normal';
  readonly reason?: string;
  readonly suggestedSkill?: string;
}

/** Fire-and-forget agent invocation trigger — subset of ConnectorInvokeTrigger */
export interface ScheduleInvokeTrigger {
  trigger(
    threadId: string,
    agentId: string,
    userId: string,
    message: string,
    messageId: string,
    contentBlocks?: readonly unknown[],
    policy?: ScheduleTriggerPolicy,
  ): void;
}

/** Phase 1b+2: context passed to execute — carries actor resolution + context spec */
export interface ExecuteContext {
  /** Cat resolved by ActorResolver, or null if no actor spec / no match */
  assignedAgentId: string | null;
  /** Phase 2: session × materialization context, if task declares one */
  context?: ContextSpec;
  /** Phase 4: deliver message to a thread */
  deliver?: (opts: DeliverOpts) => Promise<string>;
  /** Phase 4: fetch web content with browser-automation routing */
  fetchContent?: (url: string) => Promise<FetchResult>;
  /** Phase 4b: invoke a agent to handle a scheduled task (fire-and-forget) */
  invokeTrigger?: ScheduleInvokeTrigger;
}

/**
 * Phase 1a TaskSpec — six dimensions minus Context (Phase 2).
 * Gate returns workItems[] for per-subject execute + ledger.
 * Lease is task-level in Phase 1a; subject-level lease deferred to Phase 1b.
 */
export interface TaskSpec_P1<Signal = unknown> {
  id: string;
  profile: TaskProfile;
  trigger: TriggerSpec;
  admission: {
    gate: (ctx: GateCtx) => Promise<GateResult<Signal>>;
  };
  run: {
    overlap: 'skip';
    timeoutMs: number;
    execute: (signal: Signal, subjectKey: string, ctx: ExecuteContext) => Promise<void>;
  };
  state: {
    runLedger: 'sqlite';
  };
  outcome: {
    whenNoSignal: 'drop' | 'record';
  };
  enabled: () => boolean;
  /** Phase 1b: actor resolution — which agent capability this task needs */
  actor?: ActorSpec;
  /** Phase 2: context dimension — session × materialization */
  context?: ContextSpec;
  /** Phase 2.5: display metadata — label, category, description, subjectKind (AC-E1) */
  display?: TaskDisplayMeta;
}

/** Run ledger stats summary */
export interface RunStats {
  total: number;
  delivered: number;
  failed: number;
  skipped: number;
}

/** Phase 3A: task source — builtin (code-registered) vs dynamic (user-registered) */
export type TaskSource = 'builtin' | 'dynamic';

/** Schedule panel task summary (API response shape) */
export interface ScheduleTaskSummary {
  id: string;
  profile: TaskProfile;
  trigger: TriggerSpec;
  enabled: boolean;
  /** Phase 3B (AC-D1): effective enabled state considering global pause + task overrides */
  effectiveEnabled: boolean;
  actor?: ActorSpec;
  context?: ContextSpec;
  lastRun: RunLedgerRow | null;
  runStats: RunStats;
  /** Phase 2.5: display metadata from TaskSpec (AC-E2) */
  display?: TaskDisplayMeta;
  /** Phase 2.5: human-readable subject preview, computed by backend (AC-E2) */
  subjectPreview: string | null;
  /** Phase 3A: builtin vs dynamic task (AC-G4) */
  source: TaskSource;
  /** Phase 3A: dynamic_task_defs.id for CRUD (only for dynamic tasks) */
  dynamicTaskId?: string;
}

export interface TaskRunSnapshot {
  version: 1;
  id: string;
  source: TaskSource;
  templateId: string | null;
  label: string | null;
  category: DisplayCategory | null;
  description: string | null;
  enabled: boolean;
  effectiveEnabled: boolean;
  trigger: TriggerSpec;
  deliveryThreadId: string | null;
  threadTitle: string | null;
}

/** Run ledger row */
export interface RunLedgerRow {
  task_id: string;
  subject_key: string;
  outcome: RunOutcome;
  signal_summary: string | null;
  duration_ms: number;
  started_at: string;
  /** Phase 1b: which agent was assigned to handle this run */
  assigned_agent_id: string | null;
  /** Phase 3A: human-readable failure reason (AC-F3) */
  error_summary: string | null;
  task_snapshot_json?: string | null;
}

export interface RunLedgerRecord extends RunLedgerRow {
  id: number;
  task_snapshot_json: string | null;
}

export interface RunLedgerQuery {
  taskId?: string;
  threadId?: string;
  outcome?: RunOutcome;
  since?: string;
  until?: string;
  limit: number;
  cursor?: number;
}
