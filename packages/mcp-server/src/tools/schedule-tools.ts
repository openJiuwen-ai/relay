/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F139 Phase 3A: Schedule MCP Tools (AC-G2)
 *
 * office_claw_list_schedule_templates  — list available task templates
 * office_claw_register_scheduled_task  — create a dynamic scheduled task from template
 * office_claw_set_scheduled_task_enabled — enable/disable a dynamic scheduled task
 * office_claw_remove_scheduled_task    — delete a dynamic scheduled task
 */

import { normalizeScheduleTaskLabel } from '@openjiuwen/relay-shared/utils';
import { z } from 'zod';
import { callbackGet, callbackPost } from './callback-tools.js';
import type { ToolResult } from './file-tools.js';
import { errorResult } from './file-tools.js';

const MIN_INTERVAL_MS = 10_000;
const MIN_ONCE_DELAY_MS = 1_000;

// ─── callbackDelete (schedule-specific) ──────────────────────

async function callbackDelete(path: string): Promise<ToolResult> {
  const { getCallbackConfig, NO_CONFIG_ERROR } = await import('./callback-tools.js');
  const config = getCallbackConfig();
  if (!config) return errorResult(NO_CONFIG_ERROR);

  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-invocation-id': config.invocationId,
        'x-callback-token': config.callbackToken,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      return errorResult(`Delete failed (${response.status}): ${text}`);
    }
    const { successResult: ok } = await import('./file-tools.js');
    return ok(JSON.stringify(await response.json()));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Delete request failed: ${message}`);
  }
}

async function callbackPatch(path: string, body: Record<string, unknown>): Promise<ToolResult> {
  const { getCallbackConfig, NO_CONFIG_ERROR } = await import('./callback-tools.js');
  const config = getCallbackConfig();
  if (!config) return errorResult(NO_CONFIG_ERROR);

  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-invocation-id': config.invocationId,
        'x-callback-token': config.callbackToken,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      return errorResult(`Patch failed (${response.status}): ${text}`);
    }
    const { successResult: ok } = await import('./file-tools.js');
    return ok(JSON.stringify(await response.json()));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Patch request failed: ${message}`);
  }
}

// ─── List registered tasks ──────────────────────────────────

export const listScheduledTasksInputSchema = {};

export async function handleListScheduledTasks(_input: Record<string, never>): Promise<ToolResult> {
  return callbackGet('/api/schedule/tasks');
}

// ─── List templates ──────────────────────────────────────────

export const listScheduleTemplatesInputSchema = {};

export async function handleListScheduleTemplates(_input: Record<string, never>): Promise<ToolResult> {
  return callbackGet('/api/schedule/templates');
}

function validateTriggerConfig(trigger: unknown): string | null {
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
    return 'Invalid trigger JSON — must be a JSON object';
  }

  const record = trigger as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : undefined;
  if (!type) return 'Invalid trigger JSON — trigger.type is required';

  if (type === 'interval') {
    const ms = typeof record.ms === 'number' ? record.ms : Number.NaN;
    if (!Number.isFinite(ms) || ms < MIN_INTERVAL_MS) {
      return `Invalid trigger JSON — interval trigger ms must be a finite number >= ${MIN_INTERVAL_MS}`;
    }
    return null;
  }

  if (type === 'cron') {
    return typeof record.expression === 'string' && record.expression.trim().length > 0
      ? null
      : 'Invalid trigger JSON — cron trigger expression must be a non-empty string';
  }

  if (type === 'once') {
    const delayMs = typeof record.delayMs === 'number' ? record.delayMs : undefined;
    const fireAt = typeof record.fireAt === 'number' ? record.fireAt : undefined;
    if (delayMs != null) {
      return Number.isFinite(delayMs) && delayMs >= MIN_ONCE_DELAY_MS
        ? null
        : `Invalid trigger JSON — once trigger delayMs must be a finite number >= ${MIN_ONCE_DELAY_MS}`;
    }
    if (fireAt != null) {
      return Number.isFinite(fireAt) && fireAt >= Date.now()
        ? null
        : 'Invalid trigger JSON — once trigger fireAt must be a finite epoch ms in the future';
    }
    return 'Invalid trigger JSON — once trigger requires either delayMs or fireAt';
  }

  return `Invalid trigger JSON — unsupported trigger type: ${type}`;
}

function normalizeToolLabel(label: unknown): string | { error: string } {
  const result = normalizeScheduleTaskLabel(label);
  if ('error' in result) return { error: result.error.replace('display.label', 'label') };
  return result.value;
}

// ─── Register scheduled task ────────────────────────────────

export const registerScheduledTaskInputSchema = {
  templateId: z
    .string()
    .min(1)
    .describe('Template ID from list_schedule_templates (e.g. "reminder", "web-digest", "repo-activity")'),
  trigger: z
    .string()
    .describe(
      'Trigger config as JSON string. Choose type by intent: ' +
        'interval — "every N hours/minutes" repeating from now, e.g. {"type":"interval","ms":7200000}. interval.ms must be >= 10000 (10s); ' +
        'cron — specific wall-clock times/days, e.g. {"type":"cron","expression":"0 9 * * *","timezone":"Asia/Shanghai"}; ' +
        'once — fire once after delay or at exact time. PREFER delayMs (relative) over fireAt (absolute) because model clocks may drift, e.g. {"type":"once","delayMs":120000}. delayMs must be >= 1000 (1s); fireAt must be a future epoch ms. ' +
        'PREFER interval over cron when user says "every N hours/minutes".',
    ),
  params: z
    .string()
    .optional()
    .describe('Template-specific parameters as JSON string (e.g. {"message":"检查 backlog"})'),
  deliveryThreadId: z
    .string()
    .optional()
    .describe('Thread ID to deliver results to. If omitted, results go to the default channel'),
  label: z
    .string()
    .refine((value) => !('error' in normalizeScheduleTaskLabel(value)), 'label must be at most 64 characters')
    .optional()
    .describe('Human-readable task label (defaults to template label)'),
  category: z.string().optional().describe('Display category: pr | repo | thread | system | external'),
  description: z.string().optional().describe('Short description of this task instance'),
};

export async function handleRegisterScheduledTask(input: {
  templateId: string;
  trigger: string;
  params?: string;
  deliveryThreadId?: string;
  label?: string;
  category?: string;
  description?: string;
}): Promise<ToolResult> {
  let trigger: unknown;
  try {
    trigger = JSON.parse(input.trigger);
  } catch {
    return errorResult('Invalid trigger JSON — must be a valid JSON object');
  }
  {
    const validationError = validateTriggerConfig(trigger);
    if (validationError) return errorResult(validationError);
  }

  let params: Record<string, unknown> = {};
  if (input.params) {
    try {
      const parsed: unknown = JSON.parse(input.params);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return errorResult('Invalid params JSON — must be a JSON object (not null, array, or primitive)');
      }
      params = parsed as Record<string, unknown>;
    } catch {
      return errorResult('Invalid params JSON — must be a valid JSON object');
    }
  }

  // Auto-inject current agent's ID so reminder tasks wake the registering agent, not default opus
  const currentAgentId = process.env['OFFICE_CLAW_AGENT_ID'];
  if (!params.targetAgentId && currentAgentId) {
    params.targetAgentId = currentAgentId;
  }

  const body: Record<string, unknown> = {
    templateId: input.templateId,
    trigger,
    params,
  };

  if (input.deliveryThreadId) body.deliveryThreadId = input.deliveryThreadId;
  if (currentAgentId) body.createdBy = currentAgentId;

  let normalizedLabel: string | undefined;
  if (input.label !== undefined) {
    const label = normalizeToolLabel(input.label);
    if (typeof label !== 'string') return errorResult(label.error);
    normalizedLabel = label;
  }

  if (input.label || input.category || input.description) {
    body.display = {
      label: normalizedLabel ?? input.templateId,
      category: input.category ?? 'system',
      ...(input.description ? { description: input.description } : {}),
    };
  }

  return callbackPost('/api/schedule/tasks', body);
}

// ─── Preview scheduled task (AC-G2: draft step) ────────────

export const previewScheduledTaskInputSchema = {
  templateId: z.string().min(1).describe('Template ID from list_schedule_templates'),
  trigger: z
    .string()
    .describe(
      'Trigger config as JSON string. Choose type by intent: ' +
        'interval — "every N hours/minutes" repeating from now, e.g. {"type":"interval","ms":7200000}. interval.ms must be >= 10000 (10s); ' +
        'cron — specific wall-clock times/days, e.g. {"type":"cron","expression":"0 9 * * *","timezone":"Asia/Shanghai"}; ' +
        'once — fire once after delay or at exact time. PREFER delayMs (relative) over fireAt (absolute) because model clocks may drift, e.g. {"type":"once","delayMs":120000}. delayMs must be >= 1000 (1s); fireAt must be a future epoch ms. ' +
        'PREFER interval over cron when user says "every N hours/minutes".',
    ),
  params: z.string().optional().describe('Template-specific parameters as JSON string'),
  deliveryThreadId: z.string().optional().describe('Thread ID to deliver results to'),
};

export async function handlePreviewScheduledTask(input: {
  templateId: string;
  trigger: string;
  params?: string;
  deliveryThreadId?: string;
}): Promise<ToolResult> {
  let trigger: unknown;
  try {
    trigger = JSON.parse(input.trigger);
  } catch {
    return errorResult('Invalid trigger JSON');
  }
  {
    const validationError = validateTriggerConfig(trigger);
    if (validationError) return errorResult(validationError);
  }

  let params: Record<string, unknown> = {};
  if (input.params) {
    try {
      params = JSON.parse(input.params);
    } catch {
      return errorResult('Invalid params JSON');
    }
  }

  const body: Record<string, unknown> = {
    templateId: input.templateId,
    trigger,
    params,
  };
  if (input.deliveryThreadId) body.deliveryThreadId = input.deliveryThreadId;

  return callbackPost('/api/schedule/tasks/preview', body);
}

// ─── Update scheduled task ──────────────────────────────────

export const updateScheduledTaskInputSchema = {
  taskId: z.string().min(1).describe('The dynamic task ID to update (e.g. "dyn-1711504800000-abc123")'),
  enabled: z.boolean().optional().describe('Whether the task should be enabled'),
  trigger: z.string().optional().describe('Trigger config as JSON string, same format as register_scheduled_task'),
  params: z.string().optional().describe('Template-specific parameters as JSON string; replaces existing params'),
  deliveryThreadId: z.string().optional().describe('Thread ID to deliver results to'),
  label: z
    .string()
    .refine((value) => !('error' in normalizeScheduleTaskLabel(value)), 'label must be at most 64 characters')
    .optional()
    .describe('Human-readable task label'),
  category: z.string().optional().describe('Display category: pr | repo | thread | system | external'),
  description: z.string().optional().describe('Short description of this task instance'),
};

export async function handleUpdateScheduledTask(input: {
  taskId: string;
  enabled?: boolean;
  trigger?: string;
  params?: string;
  deliveryThreadId?: string;
  label?: string;
  category?: string;
  description?: string;
}): Promise<ToolResult> {
  const body: Record<string, unknown> = {};

  if (input.enabled !== undefined) body.enabled = input.enabled;

  if (input.trigger) {
    let trigger: unknown;
    try {
      trigger = JSON.parse(input.trigger);
    } catch {
      return errorResult('Invalid trigger JSON — must be a valid JSON object');
    }
    const validationError = validateTriggerConfig(trigger);
    if (validationError) return errorResult(validationError);
    body.trigger = trigger;
  }

  if (input.params) {
    try {
      const parsed: unknown = JSON.parse(input.params);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return errorResult('Invalid params JSON — must be a JSON object (not null, array, or primitive)');
      }
      body.params = parsed;
    } catch {
      return errorResult('Invalid params JSON — must be a valid JSON object');
    }
  }

  if (input.deliveryThreadId) body.deliveryThreadId = input.deliveryThreadId;

  let normalizedLabel: string | undefined;
  if (input.label !== undefined) {
    const label = normalizeToolLabel(input.label);
    if (typeof label !== 'string') return errorResult(label.error);
    normalizedLabel = label;
  }

  if (input.label || input.category || input.description) {
    body.display = {
      ...(normalizedLabel ? { label: normalizedLabel } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.description ? { description: input.description } : {}),
    };
  }

  if (Object.keys(body).length === 0) {
    return errorResult(
      'No fields to update — provide enabled, trigger, params, deliveryThreadId, label, category, or description',
    );
  }

  return callbackPatch(`/api/schedule/tasks/${encodeURIComponent(input.taskId)}`, body);
}

// ─── Remove scheduled task ──────────────────────────────────

export const removeScheduledTaskInputSchema = {
  taskId: z.string().min(1).describe('The dynamic task ID to remove (e.g. "dyn-1711504800000-abc123")'),
};

export async function handleRemoveScheduledTask(input: { taskId: string }): Promise<ToolResult> {
  return callbackDelete(`/api/schedule/tasks/${encodeURIComponent(input.taskId)}`);
}

// ─── Enable/disable scheduled task ─────────────────────────

export const setScheduledTaskEnabledInputSchema = {
  taskId: z.string().min(1).describe('The dynamic task ID to update (e.g. "dyn-1711504800000-abc123")'),
  enabled: z.boolean().describe('Whether the task should be enabled. false pauses the task without deleting it.'),
};

export async function handleSetScheduledTaskEnabled(input: { taskId: string; enabled: boolean }): Promise<ToolResult> {
  return callbackPatch(`/api/schedule/tasks/${encodeURIComponent(input.taskId)}`, { enabled: input.enabled });
}

// ─── Tool definitions ───────────────────────────────────────

export const scheduleTools = [
  {
    name: 'office_claw_list_scheduled_tasks',
    description:
      'List all currently registered scheduled tasks (both builtin and user-created dynamic tasks). ' +
      'Returns task IDs, labels, triggers, last run info, and enabled state. ' +
      'Use this to check what tasks are active before registering or removing tasks.',
    inputSchema: listScheduledTasksInputSchema,
    handler: handleListScheduledTasks,
  },
  {
    name: 'office_claw_list_schedule_templates',
    description:
      'List available schedule task templates. Each template defines a reusable task type (e.g. reminder, web-digest, repo-activity) ' +
      'with its parameter schema and default trigger. Use this to discover what kinds of scheduled tasks can be created. ' +
      'When a task fires, it wakes a agent via invokeTrigger — the woken agent has FULL capabilities (rich blocks, search, image generation, etc.).',
    inputSchema: listScheduleTemplatesInputSchema,
    handler: handleListScheduleTemplates,
  },
  {
    name: 'office_claw_preview_scheduled_task',
    description:
      'Preview a scheduled task BEFORE creating it (draft step). Returns a draft with resolved template info, trigger, and params ' +
      'WITHOUT persisting anything. Show this draft to the user for confirmation before calling register_scheduled_task. ' +
      'REQUIRED: Always preview first, then register only after user confirms.',
    inputSchema: previewScheduledTaskInputSchema,
    handler: handlePreviewScheduledTask,
  },
  {
    name: 'office_claw_register_scheduled_task',
    description:
      'Create a new scheduled task from a template (confirm step). The task will be persisted and run automatically on schedule. ' +
      'Supports recurring (cron/interval) and one-shot (once) triggers. Once tasks auto-retire after execution. ' +
      'When the task fires, a agent is woken with full capabilities — it can send rich blocks (images, audio, cards), search the web, generate content, etc. ' +
      'IMPORTANT: You MUST call preview_scheduled_task first and get user confirmation before calling this. ' +
      'trigger and params must be JSON strings, not objects.',
    inputSchema: registerScheduledTaskInputSchema,
    handler: handleRegisterScheduledTask,
  },
  {
    name: 'office_claw_update_scheduled_task',
    description:
      'Update a dynamic scheduled task by task ID. Supports changing enabled state, trigger, params, delivery thread, label, category, and description. ' +
      'Use set_scheduled_task_enabled for simple pause/resume, and this tool when editing task configuration. ' +
      'trigger and params must be JSON strings, not objects.',
    inputSchema: updateScheduledTaskInputSchema,
    handler: handleUpdateScheduledTask,
  },
  {
    name: 'office_claw_set_scheduled_task_enabled',
    description:
      'Enable or disable a dynamic scheduled task by task ID without deleting it. ' +
      'Use enabled=false when the user asks to cancel, stop, pause, or disable a scheduled task; this preserves the task record and prevents future runs. ' +
      'Use enabled=true to resume it. Call remove_scheduled_task only when the user explicitly asks to delete/remove the task permanently.',
    inputSchema: setScheduledTaskEnabledInputSchema,
    handler: handleSetScheduledTaskEnabled,
  },
  {
    name: 'office_claw_remove_scheduled_task',
    description:
      'Permanently delete a user-created dynamic scheduled task by its task ID. ' +
      'Do NOT use this when the user asks to cancel, stop, pause, or disable a scheduled task; use office_claw_set_scheduled_task_enabled with enabled=false instead. ' +
      'Only call this when the user explicitly asks to delete/remove the task record permanently. Does not work for builtin system tasks.',
    inputSchema: removeScheduledTaskInputSchema,
    handler: handleRemoveScheduledTask,
  },
] as const;
