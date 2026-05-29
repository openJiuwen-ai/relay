/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import type { DynamicTaskStore } from '../infrastructure/scheduler/DynamicTaskStore.js';
import { notifyTaskPaused, notifyTaskResumed } from '../infrastructure/scheduler/schedule-notify.js';
import type { TaskRunnerV2 } from '../infrastructure/scheduler/TaskRunnerV2.js';
import type { DeliverOpts } from '../infrastructure/scheduler/types.js';
import { type BrowserUserVerifier, resolveScheduleCaller, type ScheduleAuthError } from './schedule-auth.js';
import {
  type AnyTaskSpec,
  browserCanAccessThread,
  createDynamicSpec,
  mergeDynamicTaskDef,
  normalizeTaskPatch,
  shouldReplaceRuntime,
} from './schedule-task-edit-utils.js';

export interface ScheduleTaskEditRoutesOptions {
  taskRunner: TaskRunnerV2;
  registry?: InvocationRegistry;
  dynamicTaskStore?: DynamicTaskStore;
  threadStore?: IThreadStore;
  templateRegistry?: {
    get: (id: string) => import('../infrastructure/scheduler/templates/types.js').TaskTemplate | null;
  };
  deliver?: (opts: DeliverOpts) => Promise<string>;
  browserUserVerifier?: BrowserUserVerifier;
}

function authError(reply: { status: (code: number) => void }, error: ScheduleAuthError) {
  reply.status(error.statusCode);
  return { error: error.error };
}

function replaceDynamicRuntime(
  taskRunner: TaskRunnerV2,
  spec: AnyTaskSpec,
  dynamicDefId: string,
  enabled: boolean,
): void {
  const replaceDynamic = (taskRunner as { replaceDynamic?: typeof taskRunner.registerDynamic }).replaceDynamic;
  if (replaceDynamic) {
    replaceDynamic.call(taskRunner, spec, dynamicDefId, enabled);
    return;
  }
  taskRunner.unregister(spec.id);
  taskRunner.registerDynamic(spec, dynamicDefId, enabled);
}

export const scheduleTaskEditRoutes: FastifyPluginAsync<ScheduleTaskEditRoutesOptions> = async (app, opts) => {
  const { taskRunner, registry, dynamicTaskStore, threadStore, templateRegistry, deliver, browserUserVerifier } = opts;

  app.patch('/api/schedule/tasks/:id', async (request, reply) => {
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

    const { id } = request.params as { id: string };
    const patch = normalizeTaskPatch(request.body ?? {});
    if ('error' in patch) {
      reply.status(400);
      return { error: patch.error };
    }

    const existingDef = dynamicTaskStore.getById(id);
    if (!existingDef) {
      reply.status(404);
      return { error: 'Dynamic task not found' };
    }

    if (caller.kind === 'browser') {
      const canEditOld = await browserCanAccessThread(threadStore, caller.userId, existingDef.deliveryThreadId);
      if (!canEditOld) {
        reply.status(403);
        return { error: 'Browser caller does not own the target delivery thread' };
      }
      if ('deliveryThreadId' in patch) {
        const canEditNew = await browserCanAccessThread(threadStore, caller.userId, patch.deliveryThreadId);
        if (!canEditNew) {
          reply.status(403);
          return { error: 'Browser caller does not own the new delivery thread' };
        }
      }
    } else {
      if (existingDef.deliveryThreadId && existingDef.deliveryThreadId !== caller.record.threadId) {
        reply.status(403);
        return { error: 'Callback caller cannot edit a task from a different delivery thread' };
      }
      if ('deliveryThreadId' in patch && patch.deliveryThreadId && patch.deliveryThreadId !== caller.record.threadId) {
        reply.status(403);
        return { error: 'Callback caller cannot target a different delivery thread' };
      }
    }

    const updatedDef = mergeDynamicTaskDef(existingDef, patch);
    const requestedBy = caller.kind === 'browser' ? caller.userId : caller.record.userId;
    const replaceRuntime = shouldReplaceRuntime(patch);
    const updatedSpec = replaceRuntime ? createDynamicSpec(updatedDef, templateRegistry) : null;
    if (updatedSpec && 'error' in updatedSpec) {
      reply.status(400);
      return { error: updatedSpec.error };
    }

    if (replaceRuntime) {
      const oldSpec = createDynamicSpec(existingDef, templateRegistry);
      if ('error' in oldSpec) {
        reply.status(500);
        return { error: oldSpec.error };
      }
      const updated = dynamicTaskStore.update(id, updatedDef);
      if (!updated) {
        reply.status(404);
        return { error: 'Dynamic task not found' };
      }
      try {
        replaceDynamicRuntime(taskRunner, updatedSpec as AnyTaskSpec, id, updatedDef.enabled);
      } catch (err) {
        dynamicTaskStore.update(id, existingDef);
        try {
          replaceDynamicRuntime(taskRunner, oldSpec, id, existingDef.enabled);
        } catch (restoreErr) {
          app.log.error({ err: restoreErr }, `[schedule] failed to restore dynamic task after edit failure task=${id}`);
        }
        reply.status(500);
        return { error: `Failed to replace task runtime: ${err instanceof Error ? err.message : String(err)}` };
      }
    } else {
      const updated = dynamicTaskStore.setEnabled(id, updatedDef.enabled);
      if (!updated) {
        reply.status(404);
        return { error: 'Dynamic task not found' };
      }
      const def = dynamicTaskStore.getById(id);
      const toggled = taskRunner.setDynamicEnabled(id, updatedDef.enabled);
      if (!toggled && def) {
        const spec = createDynamicSpec(def, templateRegistry);
        if ('error' in spec) {
          dynamicTaskStore.setEnabled(id, existingDef.enabled);
          reply.status(500);
          return { error: spec.error };
        }
        try {
          taskRunner.registerDynamic(spec, def.id, def.enabled);
        } catch {
          // Already registered — ignore
        }
      }
    }

    app.log.info(`[schedule] updated dynamic task task=${id} requestedBy=${requestedBy}`);
    if (patch.enabled !== undefined && existingDef.enabled !== updatedDef.enabled) {
      if (!updatedDef.enabled) notifyTaskPaused(deliver, updatedDef);
      else notifyTaskResumed(deliver, updatedDef);
    }

    return {
      success: true,
      task: {
        id: updatedDef.id,
        templateId: updatedDef.templateId,
        trigger: updatedDef.trigger,
        params: updatedDef.params,
        display: updatedDef.display,
        deliveryThreadId: updatedDef.deliveryThreadId,
        enabled: updatedDef.enabled,
      },
      enabled: updatedDef.enabled,
    };
  });
};
