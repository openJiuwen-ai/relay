/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Schedule Panel API Routes (F139 Phase 2 + Phase 3A + Phase 3B)
 *
 * GET  /api/schedule/tasks              → list registered tasks + summaries
 * GET  /api/schedule/tasks/:id/runs     → run history (optional ?threadId= filter)
 * POST /api/schedule/tasks/:id/trigger  → manual trigger (bypasses governance)
 * GET  /api/schedule/templates          → list available templates (AC-G1)
 * POST /api/schedule/tasks              → create dynamic task (AC-G3)
 * DELETE /api/schedule/tasks/:id        → remove dynamic task (AC-G4)
 * PATCH /api/schedule/tasks/:id         → edit dynamic task (AC-G4+)
 * GET  /api/schedule/control            → global state + task overrides (AC-D1)
 * PATCH /api/schedule/control           → toggle global enabled (AC-D1)
 * PUT  /api/schedule/control/tasks/:id  → set task override (AC-D1)
 * DELETE /api/schedule/control/tasks/:id → remove task override (AC-D1)
 */

import { normalizeScheduleTaskLabel } from '@openjiuwen/relay-shared/utils';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { InvocationRecord, InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import type { DynamicTaskStore } from '../infrastructure/scheduler/DynamicTaskStore.js';
import type { GlobalControlStore } from '../infrastructure/scheduler/GlobalControlStore.js';
import type { PackTemplateStore } from '../infrastructure/scheduler/PackTemplateStore.js';
import { notifyTaskDeleted, notifyTaskRegistered } from '../infrastructure/scheduler/schedule-notify.js';
import type { TaskRunnerV2 } from '../infrastructure/scheduler/TaskRunnerV2.js';
import type { DeliverOpts, TriggerSpec } from '../infrastructure/scheduler/types.js';
import { type BrowserUserVerifier, resolveScheduleCaller, type ScheduleAuthError } from './schedule-auth.js';
import { governanceRoutes } from './schedule-governance.js';
import { scheduleRunsRoutes } from './schedule-runs.js';
import { scheduleTaskEditRoutes } from './schedule-task-edit.js';


const MIN_INTERVAL_MS = 10_000;
const MIN_ONCE_DELAY_MS = 1_000;

/** #415: Normalize once-trigger input — accepts delayMs (relative) or fireAt (absolute) */
function normalizeOnceTrigger(trigger: Record<string, unknown>): TriggerSpec | { error: string } {
  if (trigger.type !== 'once') return trigger as TriggerSpec;
  const delayMs = typeof trigger.delayMs === 'number' ? trigger.delayMs : undefined;
  const fireAt = typeof trigger.fireAt === 'number' ? trigger.fireAt : undefined;
  if (delayMs != null) {
    if (!Number.isFinite(delayMs) || delayMs < MIN_ONCE_DELAY_MS) {
      return { error: `once trigger delayMs must be a finite number >= ${MIN_ONCE_DELAY_MS}` };
    }
    return { type: 'once', fireAt: Date.now() + delayMs };
  }
  if (fireAt != null) {
    if (!Number.isFinite(fireAt) || fireAt < Date.now()) {
      return { error: 'once trigger fireAt must be a finite epoch ms in the future' };
    }
    return { type: 'once', fireAt };
  }
  return { error: 'once trigger requires either delayMs or fireAt' };
}

function normalizeTriggerSpec(trigger: unknown): TriggerSpec | { error: string } {
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
    return { error: 'trigger must be a plain object' };
  }

  const record = trigger as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : undefined;
  if (!type) return { error: 'trigger.type is required' };

  if (type === 'interval') {
    const ms = typeof record.ms === 'number' ? record.ms : Number.NaN;
    if (!Number.isFinite(ms) || ms < MIN_INTERVAL_MS) {
      return { error: `interval trigger ms must be a finite number >= ${MIN_INTERVAL_MS}` };
    }
    return { type: 'interval', ms };
  }

  if (type === 'cron') {
    const expression = typeof record.expression === 'string' ? record.expression.trim() : '';
    if (!expression) return { error: 'cron trigger expression must be a non-empty string' };
    const timezone =
      typeof record.timezone === 'string' && record.timezone.trim().length > 0 ? record.timezone.trim() : undefined;
    return timezone ? { type: 'cron', expression, timezone } : { type: 'cron', expression };
  }

  if (type === 'once') return normalizeOnceTrigger(record);

  return { error: `Unsupported trigger type: ${type}` };
}

function resolveTriggerSpec(trigger: unknown, fallback: TriggerSpec): TriggerSpec | { error: string } {
  return normalizeTriggerSpec(trigger ?? fallback);
}

export interface ScheduleRoutesOptions {
  taskRunner: TaskRunnerV2;
  registry?: InvocationRegistry;
  dynamicTaskStore?: DynamicTaskStore;
  threadStore?: IThreadStore;
  templateRegistry?: {
    get: (id: string) => import('../infrastructure/scheduler/templates/types.js').TaskTemplate | null;
    list: () => import('../infrastructure/scheduler/templates/types.js').TaskTemplate[];
    register?: (template: import('../infrastructure/scheduler/templates/types.js').TaskTemplate) => void;
    unregister?: (templateId: string) => boolean;
  };
  /** Phase 3B (AC-D1): governance store */
  globalControlStore?: GlobalControlStore;
  /** Phase 3B (AC-D3): pack template store */
  packTemplateStore?: PackTemplateStore;
  /** #415: deliver function for lifecycle notifications */
  deliver?: (opts: DeliverOpts) => Promise<string>;
  /** Verifies that X-Office-Claw-User maps to an active primary-auth session. */
  browserUserVerifier?: BrowserUserVerifier;
}

/** Extract threadId from subjectKey — handles both thread-xxx (real tasks) and thread:xxx formats */
export function extractThreadId(subjectKey: string): string | null {
  if (subjectKey.startsWith('thread-')) return subjectKey.slice(7);
  if (subjectKey.startsWith('thread:')) return subjectKey.slice(7);
  return null;
}

function formatTriggerForLog(trigger: TriggerSpec): string {
  if (trigger.type === 'interval') return `interval:${trigger.ms}ms`;
  if (trigger.type === 'once') return `once:${new Date(trigger.fireAt).toISOString()}`;
  return `cron:${trigger.expression}${trigger.timezone ? `@${trigger.timezone}` : ''}`;
}

function authError(reply: { status: (code: number) => void }, error: ScheduleAuthError) {
  reply.status(error.statusCode);
  return { error: error.error };
}

async function browserCanAccessThread(
  threadStore: IThreadStore | undefined,
  userId: string,
  deliveryThreadId: string | null | undefined,
): Promise<boolean> {
  if (!deliveryThreadId) return true;
  if (!threadStore) return false;
  const thread = await threadStore.get(deliveryThreadId);
  if (!thread) return false;
  return (
    thread.createdBy === userId ||
    thread.createdBy === 'system' ||
    thread.createdBy === 'default' ||
    thread.id === 'default'
  );
}

export const scheduleRoutes: FastifyPluginAsync<ScheduleRoutesOptions> = async (app, opts) => {
  const {
    taskRunner,
    registry,
    dynamicTaskStore,
    threadStore,
    templateRegistry,
    globalControlStore,
    packTemplateStore,
    deliver,
    browserUserVerifier,
  } = opts;

  // GET /api/schedule/tasks
  app.get('/api/schedule/tasks', async (request, reply) => {
    const { error } = resolveScheduleCaller(request, {
      allowedKinds: ['browser', 'callback'],
      registry,
      browserUserVerifier,
    });
    if (error) return authError(reply, error);
    const summaries = taskRunner.getTaskSummaries();
    const deliveryThreadIdByTaskId = new Map(
      (dynamicTaskStore?.getAll() ?? []).map((def) => [def.id, def.deliveryThreadId]),
    );
    const threadIds = Array.from(
      new Set(
        summaries
          .map((task) => deliveryThreadIdByTaskId.get(task.id) ?? null)
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      ),
    );
    const threadTitleById = new Map<string, string>();
    if (threadStore && threadIds.length > 0) {
      const threads = await Promise.all(threadIds.map((threadId) => threadStore.get(threadId)));
      for (const thread of threads) {
        if (thread?.id) threadTitleById.set(thread.id, thread.title ?? '');
      }
    }
    return {
      tasks: summaries.map((task) => ({
        ...task,
        deliveryThreadId: deliveryThreadIdByTaskId.get(task.id) ?? null,
        threadTitle: threadTitleById.get(deliveryThreadIdByTaskId.get(task.id) ?? '') ?? null,
      })),
    };
  });

  // GET /api/schedule/tasks/:id/runs
  app.get('/api/schedule/tasks/:id/runs', async (request, reply) => {
    const { error } = resolveScheduleCaller(request, { allowedKinds: ['browser'], registry, browserUserVerifier });
    if (error) return authError(reply, error);
    const { id } = request.params as { id: string };
    const { threadId, limit } = request.query as { threadId?: string; limit?: string };
    const maxRows = Math.min(Number(limit) || 50, 200);

    const registered = taskRunner.getRegisteredTasks();
    if (!registered.includes(id)) {
      reply.status(404);
      return { error: 'Task not found' };
    }

    const ledger = taskRunner.getLedger();
    let runs: import('../infrastructure/scheduler/types.js').RunLedgerRow[];

    if (threadId) {
      const hyphenKey = `thread-${threadId}`;
      const colonKey = `thread:${threadId}`;
      const hyphenRuns = ledger.queryBySubject(id, hyphenKey, maxRows);
      const colonRuns = ledger.queryBySubject(id, colonKey, maxRows);
      runs = [...hyphenRuns, ...colonRuns].sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      );
      if (runs.length > maxRows) runs = runs.slice(0, maxRows);
    } else {
      runs = ledger.query(id, maxRows);
    }

    return {
      runs: runs.map((r) => ({
        ...r,
        threadId: extractThreadId(r.subject_key),
      })),
    };
  });

  // POST /api/schedule/tasks/:id/trigger
  app.post('/api/schedule/tasks/:id/trigger', async (request, reply) => {
    const { caller, error } = resolveScheduleCaller(request, {
      allowedKinds: ['browser'],
      registry,
      browserUserVerifier,
    });
    if (error) return authError(reply, error);
    if (!caller || caller.kind !== 'browser') {
      reply.status(500);
      return { error: 'Browser caller resolution failed' };
    }
    const { id } = request.params as { id: string };
    const requestedBy = caller.userId;
    const registered = taskRunner.getRegisteredTasks();
    if (!registered.includes(id)) {
      reply.status(404);
      return { error: 'Task not found' };
    }

    const summary = taskRunner.getTaskSummaries().find((task) => task.id === id);
    const triggerInfo = summary ? formatTriggerForLog(summary.trigger) : 'unknown';
    app.log.info(`[schedule] manual trigger requested task=${id} trigger=${triggerInfo} requestedBy=${requestedBy}`);
    await taskRunner.triggerNow(id, { manual: true });
    app.log.info(`[schedule] manual trigger completed task=${id} trigger=${triggerInfo} requestedBy=${requestedBy}`);
    return { success: true, taskId: id };
  });

  // GET /api/schedule/templates (AC-G1)
  app.get('/api/schedule/templates', async (request, reply) => {
    const { error } = resolveScheduleCaller(request, {
      allowedKinds: ['browser', 'callback'],
      registry,
      browserUserVerifier,
    });
    if (error) return authError(reply, error);
    if (!templateRegistry) return { templates: [] };
    return {
      templates: templateRegistry.list().map((t) => ({
        templateId: t.templateId,
        label: t.label,
        category: t.category,
        description: t.description,
        defaultTrigger: t.defaultTrigger,
        paramSchema: t.paramSchema,
      })),
    };
  });

  // POST /api/schedule/tasks/preview (AC-G2: draft step — validate + preview, no persist)
  app.post('/api/schedule/tasks/preview', async (request, reply) => {
    const { caller, error } = resolveScheduleCaller(request, {
      allowedKinds: ['browser', 'callback'],
      registry,
      browserUserVerifier,
    });
    if (error) return authError(reply, error);
    if (!caller) {
      reply.status(500);
      return { error: 'Schedule caller resolution failed' };
    }
    if (!templateRegistry) {
      reply.status(501);
      return { error: 'Templates not configured' };
    }

    const body = (request.body ?? {}) as {
      templateId?: string;
      trigger?: TriggerSpec;
      params?: Record<string, unknown>;
      display?: { label: string; category: string; description?: string };
      deliveryThreadId?: string;
    };
    if (!body.templateId) {
      reply.status(400);
      return { error: 'Missing templateId' };
    }

    const template = templateRegistry.get(body.templateId);
    if (!template) {
      reply.status(400);
      return { error: `Unknown template: ${body.templateId}` };
    }

    const trigger = resolveTriggerSpec(body.trigger, template.defaultTrigger);
    if ('error' in trigger) {
      reply.status(400);
      return { error: trigger.error };
    }
    const params = body.params ?? {};
    const display = body.display
      ? {
          label: body.display.label,
          category: body.display.category as import('../infrastructure/scheduler/types.js').DisplayCategory,
          description: body.display.description,
        }
      : { label: template.label, category: template.category, description: template.description };

    return {
      draft: {
        templateId: body.templateId,
        templateLabel: template.label,
        trigger,
        params,
        display,
        deliveryThreadId: body.deliveryThreadId ?? (caller.kind === 'callback' ? caller.record.threadId : null),
        paramSchema: template.paramSchema,
      },
    };
  });

  // POST /api/schedule/tasks (AC-G3: create dynamic task)
  app.post('/api/schedule/tasks', async (request, reply) => {
    const { caller, error } = resolveScheduleCaller(request, {
      allowedKinds: ['browser', 'callback'],
      registry,
      browserUserVerifier,
    });
    if (error) return authError(reply, error);
    if (!caller) {
      reply.status(500);
      return { error: 'Schedule caller resolution failed' };
    }
    if (!dynamicTaskStore || !templateRegistry) {
      reply.status(501);
      return { error: 'Dynamic tasks not configured' };
    }

    const body = (request.body ?? {}) as {
      templateId?: string;
      trigger?: TriggerSpec;
      params?: Record<string, unknown>;
      display?: { label: string; category: string; description?: string };
      deliveryThreadId?: string;
      createdBy?: string;
    };
    if (!body.templateId) {
      reply.status(400);
      return { error: 'Missing templateId' };
    }

    const template = templateRegistry.get(body.templateId);
    if (!template) {
      reply.status(400);
      return { error: `Unknown template: ${body.templateId}` };
    }

    const trigger = resolveTriggerSpec(body.trigger, template.defaultTrigger);
    if ('error' in trigger) {
      reply.status(400);
      return { error: trigger.error };
    }
    const params = body.params ?? {};
    const requestedBy = caller.kind === 'browser' ? caller.userId : caller.record.userId;

    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      reply.status(400);
      return { error: 'params must be a plain object' };
    }

    const requestedDeliveryThreadId =
      typeof body.deliveryThreadId === 'string' && body.deliveryThreadId.trim().length > 0
        ? body.deliveryThreadId
        : null;
    let deliveryThreadId = requestedDeliveryThreadId;
    let createdBy = caller.kind === 'browser' ? caller.userId : caller.record.agentId;

    if (caller.kind === 'callback') {
      if (deliveryThreadId && deliveryThreadId !== caller.record.threadId) {
        reply.status(403);
        return { error: 'Callback caller cannot target a different delivery thread' };
      }
      deliveryThreadId = deliveryThreadId ?? caller.record.threadId;
      params.triggerUserId = caller.record.userId;
    } else {
      params.triggerUserId = caller.userId;
      const browserCanCreate = await browserCanAccessThread(threadStore, caller.userId, deliveryThreadId);
      if (!browserCanCreate) {
        reply.status(403);
        return { error: 'Browser caller does not own the target delivery thread' };
      }
      createdBy = caller.userId;
    }

    const id = `dyn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let display: import('../infrastructure/scheduler/types.js').TaskDisplayMeta;
    if (body.display) {
      const label = normalizeScheduleTaskLabel(body.display.label);
      if ('error' in label) {
        reply.status(400);
        return { error: label.error };
      }
      display = {
        label: label.value,
        category: body.display.category as import('../infrastructure/scheduler/types.js').DisplayCategory,
        description: body.display.description,
      };
    } else {
      display = { label: template.label, category: template.category, description: template.description };
    }

    const def = {
      id,
      templateId: body.templateId,
      trigger,
      params,
      display,
      deliveryThreadId,
      enabled: true,
      createdBy: body.createdBy ?? createdBy ?? 'unknown',
      createdAt: new Date().toISOString(),
    };

    app.log.info(
      {
        taskId: id,
        templateId: def.templateId,
        deliveryThreadId: def.deliveryThreadId,
        invocationThreadId: caller.kind === 'callback' ? caller.record.threadId : null,
      },
      '[scheduler] create dynamic task requested',
    );
    if (!def.deliveryThreadId) {
      app.log.warn(
        { taskId: id, templateId: def.templateId },
        '[scheduler] dynamic task created without deliveryThreadId; gate will skip until a thread is provided',
      );
    }

    // Register in runtime first (validates cron expression etc.), then persist
    const spec = template.createSpec(id, { trigger, params, deliveryThreadId: def.deliveryThreadId });
    spec.display = display;
    try {
      taskRunner.registerDynamic(spec, id);
    } catch (err) {
      reply.status(400);
      return { error: `Failed to register task: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Persist — rollback runtime registration on DB failure
    try {
      dynamicTaskStore.insert(def);
    } catch (err) {
      taskRunner.unregister(id);
      reply.status(500);
      return {
        error: `Task registered but DB insert failed (rolled back): ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    app.log.info(
      `[schedule] registered dynamic task task=${id} template=${body.templateId} trigger=${formatTriggerForLog(trigger)} requestedBy=${requestedBy}`,
    );
    notifyTaskRegistered(deliver, def);
    return { success: true, task: { id, ...display, trigger } };
  });

  // DELETE /api/schedule/tasks/:id (AC-G4: remove dynamic task)
  app.delete('/api/schedule/tasks/:id', async (request, reply) => {
    const { caller, error } = resolveScheduleCaller(request, {
      allowedKinds: ['browser', 'callback'],
      registry,
      browserUserVerifier,
    });
    if (error) return authError(reply, error);
    if (!caller) {
      reply.status(500);
      return { error: 'Schedule caller resolution failed' };
    }
    if (!dynamicTaskStore) {
      reply.status(501);
      return { error: 'Dynamic tasks not configured' };
    }

    const { id } = request.params as { id: string };
    const requestedBy = caller.kind === 'browser' ? caller.userId : caller.record.userId;
    // Read def before deletion for notification + logging
    const def = dynamicTaskStore.getById(id);
    if (!def) {
      reply.status(404);
      return { error: 'Dynamic task not found' };
    }
    if (caller.kind === 'browser') {
      const browserCanDelete = await browserCanAccessThread(threadStore, caller.userId, def.deliveryThreadId);
      if (!browserCanDelete) {
        reply.status(403);
        return { error: 'Browser caller does not own the target delivery thread' };
      }
    }
    const removed = dynamicTaskStore.remove(id);
    if (!removed) {
      reply.status(404);
      return { error: 'Dynamic task not found' };
    }

    taskRunner.unregister(id);
    app.log.info(
      `[schedule] deleted dynamic task task=${id} requestedBy=${requestedBy} taskInfo=${JSON.stringify(def)}`,
    );

    // #415: lifecycle notification — task deleted
    if (def) notifyTaskDeleted(deliver, def);
    return { success: true };
  });

  await app.register(scheduleTaskEditRoutes, {
    taskRunner,
    registry,
    browserUserVerifier,
    dynamicTaskStore,
    threadStore,
    templateRegistry,
    deliver,
  });

  // ─── Global run history — extracted for file size ────────────────────
  await app.register(scheduleRunsRoutes, {
    taskRunner,
    registry,
    browserUserVerifier,
  });

  // ─── Governance + Pack Templates (AC-D1/D3) — extracted for file size ──
  await app.register(governanceRoutes, {
    registry,
    browserUserVerifier,
    globalControlStore,
    packTemplateStore,
    templateRegistry,
    dynamicTaskStore,
  });
};
