/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { TaskRunnerV2 } from '../infrastructure/scheduler/TaskRunnerV2.js';
import type {
  RunLedgerQuery,
  RunLedgerRecord,
  RunOutcome,
  TaskRunSnapshot,
} from '../infrastructure/scheduler/types.js';
import { type BrowserUserVerifier, resolveScheduleCaller, type ScheduleAuthError } from './schedule-auth.js';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const RUN_OUTCOMES = new Set<RunOutcome>([
  'SKIP_NO_SIGNAL',
  'SKIP_DISABLED',
  'SKIP_OVERLAP',
  'SKIP_GLOBAL_PAUSE',
  'SKIP_TASK_OVERRIDE',
  'SKIP_SELF_ECHO',
  'SKIP_MISSED_WINDOW',
  'RUN_DELIVERED',
  'RUN_FAILED',
]);

export interface ScheduleRunsRoutesOptions {
  taskRunner: TaskRunnerV2;
  registry?: InvocationRegistry;
  browserUserVerifier?: BrowserUserVerifier;
}

interface ScheduleRunsQueryParams {
  limit?: string;
  cursor?: string;
  taskId?: string;
  threadId?: string;
  outcome?: string;
  since?: string;
  until?: string;
}

type TaskMetadata = Omit<TaskRunSnapshot, 'version'>;

function authError(reply: { status: (code: number) => void }, error: ScheduleAuthError) {
  reply.status(error.statusCode);
  return { error: error.error };
}

function parsePositiveInt(value: string | undefined, name: string): number | { error: string } | undefined {
  if (value == null || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return { error: `${name} must be a positive integer` };
  return parsed;
}

function parseLimit(value: string | undefined): number | { error: string } {
  if (value == null || value.trim() === '') return DEFAULT_LIMIT;
  const parsed = parsePositiveInt(value, 'limit');
  if (typeof parsed === 'object' || parsed == null) return parsed ?? DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseIsoTime(value: string | undefined, name: string): string | { error: string } | undefined {
  if (value == null || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (Number.isNaN(Date.parse(trimmed))) return { error: `${name} must be a valid ISO date string` };
  return trimmed;
}

function parseOutcome(value: string | undefined): RunOutcome | { error: string } | undefined {
  if (value == null || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (!RUN_OUTCOMES.has(trimmed as RunOutcome)) return { error: `Unsupported outcome: ${trimmed}` };
  return trimmed as RunOutcome;
}

function extractThreadId(subjectKey: string): string | null {
  if (subjectKey.startsWith('thread-')) return subjectKey.slice(7);
  if (subjectKey.startsWith('thread:')) return subjectKey.slice(7);
  return null;
}

function parseQuery(raw: ScheduleRunsQueryParams): RunLedgerQuery | { error: string } {
  const limit = parseLimit(raw.limit);
  if (typeof limit === 'object') return limit;

  const cursor = parsePositiveInt(raw.cursor, 'cursor');
  if (typeof cursor === 'object') return cursor;

  const outcome = parseOutcome(raw.outcome);
  if (typeof outcome === 'object') return outcome;

  const since = parseIsoTime(raw.since, 'since');
  if (typeof since === 'object') return since;

  const until = parseIsoTime(raw.until, 'until');
  if (typeof until === 'object') return until;

  const taskId = raw.taskId?.trim();
  const threadId = raw.threadId?.trim();

  return {
    limit: limit + 1,
    cursor,
    taskId: taskId || undefined,
    threadId: threadId || undefined,
    outcome,
    since,
    until,
  };
}

function isTaskSnapshot(value: unknown): value is TaskRunSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<TaskRunSnapshot>;
  return (
    snapshot.version === 1 &&
    typeof snapshot.id === 'string' &&
    (snapshot.source === 'builtin' || snapshot.source === 'dynamic') &&
    (typeof snapshot.templateId === 'string' || snapshot.templateId === null) &&
    (typeof snapshot.label === 'string' || snapshot.label === null) &&
    (typeof snapshot.category === 'string' || snapshot.category === null) &&
    (typeof snapshot.description === 'string' || snapshot.description === null) &&
    typeof snapshot.enabled === 'boolean' &&
    typeof snapshot.effectiveEnabled === 'boolean' &&
    typeof snapshot.trigger === 'object' &&
    snapshot.trigger !== null &&
    (typeof snapshot.deliveryThreadId === 'string' || snapshot.deliveryThreadId === null) &&
    (typeof snapshot.threadTitle === 'string' || snapshot.threadTitle === null)
  );
}

function parseTaskSnapshot(value: string | null | undefined): TaskMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isTaskSnapshot(parsed)) return null;
    return {
      id: parsed.id,
      source: parsed.source,
      templateId: parsed.templateId,
      label: parsed.label,
      category: parsed.category,
      description: parsed.description,
      enabled: parsed.enabled,
      effectiveEnabled: parsed.effectiveEnabled,
      trigger: parsed.trigger,
      deliveryThreadId: parsed.deliveryThreadId,
      threadTitle: parsed.threadTitle,
    };
  } catch {
    return null;
  }
}

function toResponseRun(run: RunLedgerRecord) {
  return {
    id: run.id,
    taskId: run.task_id,
    subjectKey: run.subject_key,
    threadId: extractThreadId(run.subject_key),
    outcome: run.outcome,
    signalSummary: run.signal_summary,
    durationMs: run.duration_ms,
    startedAt: run.started_at,
    assignedAgentId: run.assigned_agent_id,
    errorSummary: run.error_summary,
    task: parseTaskSnapshot(run.task_snapshot_json),
  };
}

export const scheduleRunsRoutes: FastifyPluginAsync<ScheduleRunsRoutesOptions> = async (app, opts) => {
  const { taskRunner, registry, browserUserVerifier } = opts;

  app.get('/api/schedule/runs', async (request, reply) => {
    const { error } = resolveScheduleCaller(request, { allowedKinds: ['browser'], registry, browserUserVerifier });
    if (error) return authError(reply, error);

    const parsed = parseQuery((request.query ?? {}) as ScheduleRunsQueryParams);
    if ('error' in parsed) {
      reply.status(400);
      return { error: parsed.error };
    }

    const pageLimit = parsed.limit - 1;
    const rows = taskRunner.getLedger().queryAll(parsed);
    const hasMore = rows.length > pageLimit;
    const pageRows = hasMore ? rows.slice(0, pageLimit) : rows;
    return {
      runs: pageRows.map(toResponseRun),
      nextCursor: hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null,
      hasMore,
    };
  });

  app.delete('/api/schedule/runs/:id', async (request, reply) => {
    const { error } = resolveScheduleCaller(request, { allowedKinds: ['browser'], registry, browserUserVerifier });
    if (error) return authError(reply, error);

    const { id: rawId } = request.params as { id?: string };
    const id = parsePositiveInt(rawId, 'id');
    if (typeof id === 'object' || id == null) {
      reply.status(400);
      return { error: typeof id === 'object' ? id.error : 'id must be a positive integer' };
    }

    const ledger = taskRunner.getLedger();
    const run = ledger.getById(id);
    if (!run) {
      reply.status(404);
      return { error: 'Schedule run not found' };
    }

    if (!ledger.deleteById(id)) {
      reply.status(404);
      return { error: 'Schedule run not found' };
    }

    app.log.info(`[schedule] deleted run ledger record id=${id} task=${run.task_id}`);
    return { success: true };
  });
};
