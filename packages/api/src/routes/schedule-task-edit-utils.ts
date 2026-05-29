/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { normalizeScheduleTaskLabel } from '@openjiuwen/relay-shared/utils';
import type { IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import type { DynamicTaskDef } from '../infrastructure/scheduler/DynamicTaskStore.js';
import type {
  DisplayCategory,
  SubjectKind,
  TaskDisplayMeta,
  TaskSpec_P1,
  TriggerSpec,
} from '../infrastructure/scheduler/types.js';

export type AnyTaskSpec = TaskSpec_P1<unknown>;

const MIN_INTERVAL_MS = 10_000;
const MIN_ONCE_DELAY_MS = 1_000;
const DISPLAY_CATEGORIES = new Set<DisplayCategory>(['pr', 'repo', 'thread', 'system', 'external']);
const SUBJECT_KINDS = new Set<SubjectKind>(['pr', 'repo', 'thread', 'external', 'none']);

export interface TaskPatch {
  enabled?: boolean;
  trigger?: TriggerSpec;
  params?: Record<string, unknown>;
  display?: Partial<TaskDisplayMeta>;
  deliveryThreadId?: string | null;
}

export interface TemplateGetter {
  get: (id: string) => import('../infrastructure/scheduler/templates/types.js').TaskTemplate | null;
}

export function normalizeTaskPatch(body: unknown): TaskPatch | { error: string } {
  if (!isPlainObject(body)) return { error: 'Request body must be a plain object' };
  const patch: TaskPatch = {};

  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') return { error: 'enabled must be a boolean' };
    patch.enabled = body.enabled;
  }
  if ('trigger' in body) {
    const trigger = normalizeTriggerSpec(body.trigger);
    if ('error' in trigger) return { error: trigger.error };
    patch.trigger = trigger;
  }
  if ('params' in body) {
    if (!isPlainObject(body.params)) return { error: 'params must be a plain object' };
    patch.params = body.params;
  }
  if ('display' in body) {
    const display = normalizeDisplayPatch(body.display);
    if ('error' in display) return { error: display.error };
    patch.display = display;
  }
  if ('deliveryThreadId' in body) {
    if (body.deliveryThreadId !== null && typeof body.deliveryThreadId !== 'string') {
      return { error: 'deliveryThreadId must be a string or null' };
    }
    patch.deliveryThreadId = body.deliveryThreadId === null ? null : body.deliveryThreadId.trim();
  }

  if (Object.keys(patch).length === 0) return { error: 'Request body must include at least one editable field' };
  return patch;
}

export function mergeDynamicTaskDef(existing: DynamicTaskDef, patch: TaskPatch): DynamicTaskDef {
  return {
    ...existing,
    trigger: patch.trigger ?? existing.trigger,
    params: patch.params ?? existing.params,
    display: patch.display ? { ...existing.display, ...patch.display } : existing.display,
    deliveryThreadId: 'deliveryThreadId' in patch ? (patch.deliveryThreadId ?? null) : existing.deliveryThreadId,
    enabled: patch.enabled ?? existing.enabled,
  };
}

export function createDynamicSpec(
  def: DynamicTaskDef,
  templateRegistry: TemplateGetter,
): AnyTaskSpec | { error: string } {
  const template = templateRegistry.get(def.templateId);
  if (!template) return { error: `Template ${def.templateId} not found — task cannot be updated` };
  try {
    const spec = template.createSpec(def.id, {
      trigger: def.trigger,
      params: def.params,
      deliveryThreadId: def.deliveryThreadId,
    }) as AnyTaskSpec;
    spec.display = def.display;
    return spec;
  } catch (err) {
    return { error: `Failed to create updated task spec: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function browserCanAccessThread(
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

export function shouldReplaceRuntime(patch: TaskPatch): boolean {
  return Boolean(patch.trigger || patch.params || patch.display || 'deliveryThreadId' in patch);
}

function normalizeOnceTrigger(trigger: Record<string, unknown>): TriggerSpec | { error: string } {
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
  if (!isPlainObject(trigger)) return { error: 'trigger must be a plain object' };
  const type = typeof trigger.type === 'string' ? trigger.type : undefined;
  if (!type) return { error: 'trigger.type is required' };

  if (type === 'interval') {
    const ms = typeof trigger.ms === 'number' ? trigger.ms : Number.NaN;
    if (!Number.isFinite(ms) || ms < MIN_INTERVAL_MS) {
      return { error: `interval trigger ms must be a finite number >= ${MIN_INTERVAL_MS}` };
    }
    return { type: 'interval', ms };
  }
  if (type === 'cron') {
    const expression = typeof trigger.expression === 'string' ? trigger.expression.trim() : '';
    if (!expression) return { error: 'cron trigger expression must be a non-empty string' };
    const timezone =
      typeof trigger.timezone === 'string' && trigger.timezone.trim().length > 0 ? trigger.timezone.trim() : undefined;
    return timezone ? { type: 'cron', expression, timezone } : { type: 'cron', expression };
  }
  if (type === 'once') return normalizeOnceTrigger(trigger);
  return { error: `Unsupported trigger type: ${type}` };
}

function normalizeDisplayPatch(display: unknown): Partial<TaskDisplayMeta> | { error: string } {
  if (!isPlainObject(display)) return { error: 'display must be a plain object' };
  const patch: Partial<TaskDisplayMeta> = {};

  if ('label' in display) {
    const label = normalizeScheduleTaskLabel(display.label);
    if ('error' in label) return { error: label.error };
    patch.label = label.value;
  }
  if ('category' in display) {
    if (typeof display.category !== 'string' || !DISPLAY_CATEGORIES.has(display.category as DisplayCategory)) {
      return { error: 'display.category is invalid' };
    }
    patch.category = display.category as DisplayCategory;
  }
  if ('description' in display) {
    if (display.description != null && typeof display.description !== 'string') {
      return { error: 'display.description must be a string' };
    }
    patch.description = display.description ?? undefined;
  }
  if ('subjectKind' in display) {
    if (display.subjectKind != null) {
      if (typeof display.subjectKind !== 'string' || !SUBJECT_KINDS.has(display.subjectKind as SubjectKind)) {
        return { error: 'display.subjectKind is invalid' };
      }
      patch.subjectKind = display.subjectKind as SubjectKind;
    } else {
      patch.subjectKind = undefined;
    }
  }

  return patch;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
