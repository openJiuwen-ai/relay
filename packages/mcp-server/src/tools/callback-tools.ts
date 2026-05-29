/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * MCP Callback Tools — core callbacks
 * 鉴权: process.env OFFICE_CLAW_INVOCATION_ID + OFFICE_CLAW_CALLBACK_TOKEN
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sendCallbackRequest } from './callback-outbox.js';
import type { ToolResult } from './file-tools.js';
import { errorResult, successResult } from './file-tools.js';

interface CallbackConfig {
  apiUrl: string;
  invocationId: string;
  callbackToken: string;
}

const VALID_RICH_BLOCK_KINDS = new Set([
  'card',
  'diff',
  'checklist',
  'media_gallery',
  'audio',
  'interactive',
  'html_widget',
  'file',
]);

function normalizeRichBlock(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;

  const obj = raw as Record<string, unknown>;
  const rawType = obj['type'];
  if (typeof rawType === 'string' && !('kind' in obj) && VALID_RICH_BLOCK_KINDS.has(rawType)) {
    obj['kind'] = rawType;
    delete obj['type'];
  }

  if (!('v' in obj) && 'kind' in obj) {
    obj['v'] = 1;
  }

  return obj;
}

export function getCallbackConfig(): CallbackConfig | null {
  const apiUrl = process.env['OFFICE_CLAW_API_URL'];
  const invocationId = process.env['OFFICE_CLAW_INVOCATION_ID'];
  const callbackToken = process.env['OFFICE_CLAW_CALLBACK_TOKEN'];
  if (!apiUrl || !invocationId || !callbackToken) return null;
  return { apiUrl, invocationId, callbackToken };
}

export const NO_CONFIG_ERROR =
  'OfficeClaw callback not configured. Missing OFFICE_CLAW_API_URL, OFFICE_CLAW_INVOCATION_ID, or OFFICE_CLAW_CALLBACK_TOKEN environment variables.';
// ============ HTTP helpers ============

export async function callbackPost(
  path: string,
  body: Record<string, unknown>,
  options?: { enableOutbox?: boolean },
): Promise<ToolResult> {
  const config = getCallbackConfig();
  if (!config) return errorResult(NO_CONFIG_ERROR);

  const requestBody = {
    invocationId: config.invocationId,
    callbackToken: config.callbackToken,
    ...body,
  };

  const result = await sendCallbackRequest(
    { apiUrl: config.apiUrl, path, body: requestBody },
    { enableOutbox: options?.enableOutbox === true },
  );
  if (result.ok) return successResult(JSON.stringify(result.data));
  return errorResult(result.error);
}

export async function callbackGet(path: string, params?: Record<string, string>): Promise<ToolResult> {
  const config = getCallbackConfig();
  if (!config) return errorResult(NO_CONFIG_ERROR);

  const query = new URLSearchParams({
    invocationId: config.invocationId,
    callbackToken: config.callbackToken,
    ...params,
  });

  try {
    const response = await fetch(`${config.apiUrl}${path}?${query.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      return errorResult(`Callback failed (${response.status}): ${text}`);
    }
    return successResult(JSON.stringify(await response.json()));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Callback request failed: ${message}`);
  }
}

export const postMessageInputSchema = {
  content: z.string().min(1).describe('The message content to post'),
  replyTo: z.string().optional().describe('Optional message ID to reply to'),
  clientMessageId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Optional idempotency key for at-least-once delivery de-duplication'),
  targetAgents: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Optional explicit target agent IDs (e.g. ["codex","gpt52"]). Merged with @mentions parsed from content. Used for direction rendering in frontend.',
    ),
};

const postMessageRuntimeInputSchema = z.object({
  content: z.string().trim().min(1).max(50000),
  replyTo: z.string().trim().min(1).optional(),
  clientMessageId: z.string().trim().min(1).max(200).optional(),
  targetAgents: z.array(z.string().trim().min(1)).optional(),
});

function normalizeOptionalString(value: unknown): string | undefined | unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTargetAgents(value: unknown): string[] | undefined | unknown {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : undefined;
  }
  return value;
}

function normalizePostMessageInput(input: {
  content?: unknown;
  message?: unknown;
  text?: unknown;
  replyTo?: unknown;
  clientMessageId?: unknown;
  targetAgents?: unknown;
}): {
  content: unknown;
  replyTo?: unknown;
  clientMessageId?: unknown;
  targetAgents?: unknown;
} {
  const rawContent = typeof input.content === 'string' ? input.content : (input.message ?? input.text ?? input.content);
  const normalizedContent = typeof rawContent === 'string' ? rawContent.trim() : rawContent;
  return {
    content: normalizedContent,
    replyTo: normalizeOptionalString(input.replyTo),
    clientMessageId: normalizeOptionalString(input.clientMessageId),
    targetAgents: normalizeTargetAgents(input.targetAgents),
  };
}

export const getPendingMentionsInputSchema = {
  includeAcked: z
    .boolean()
    .optional()
    .describe('When true, include acknowledged mentions for explicit history review.'),
};

export const ackMentionsInputSchema = {
  upToMessageId: z
    .string()
    .min(1)
    .describe(
      'The message ID up to which mentions have been processed. Must be within the last fetched pending window.',
    ),
};

export const getThreadContextInputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(20)
    .describe('Number of recent messages to retrieve (default: 20)'),
  threadId: z
    .string()
    .min(1)
    .optional()
    .describe('Optional: read messages from a different thread. Omit to read the current thread.'),
  agentId: z.string().min(1).optional().describe("Optional: filter by speaker agentId, or pass 'user' for human messages."),
  keyword: z
    .string()
    .min(1)
    .optional()
    .describe('Optional: filter messages whose content contains this keyword (case-insensitive).'),
};

export const listThreadsInputSchema = {
  limit: z.number().int().min(1).max(200).optional().default(20).describe('Max threads to return (default: 20).'),
  activeSince: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional Unix timestamp in ms; only include threads active at/after this time.'),
  keyword: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('Optional: filter threads whose title or threadId contains this keyword (case-insensitive).'),
};

export const featIndexInputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Max feature entries to return (default: 20, max: 100).'),
  featId: z.string().min(1).optional().describe('Optional exact feature ID match (case-insensitive), e.g. F043.'),
  query: z
    .string()
    .min(1)
    .optional()
    .describe('Optional fuzzy substring search over featId/name/status (case-insensitive).'),
};

export const updateTaskInputSchema = {
  taskId: z.string().min(1).describe('The ID of the task to update'),
  status: z.enum(['todo', 'doing', 'blocked', 'done']).optional().describe('New task status'),
  why: z.string().max(1000).optional().describe('Optional note explaining the status change'),
};

export const crossPostMessageInputSchema = {
  threadId: z.string().min(1).describe('Target thread ID to post into'),
  content: z.string().min(1).describe('The message content to post'),
  replyTo: z.string().optional().describe('Optional message ID to reply to'),
  clientMessageId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Optional idempotency key for at-least-once delivery de-duplication'),
};

export const listTasksInputSchema = {
  threadId: z.string().min(1).optional().describe('Optional thread ID filter'),
  agentId: z.string().min(1).optional().describe('Optional owner agentId filter'),
  status: z.enum(['todo', 'doing', 'blocked', 'done']).optional().describe('Optional task status filter'),
};

export const listSkillsInputSchema = {
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Optional substring filter over skill name, description, category, and triggers.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Maximum number of skills to return. Omit to return all matches.'),
};

export const loadSkillInputSchema = {
  name: z.string().min(1).max(200).describe('Exact skill name to load, e.g. "tdd" or "workspace-navigator".'),
};

export async function handlePostMessage(input: {
  content?: unknown;
  message?: unknown;
  text?: unknown;
  replyTo?: unknown;
  clientMessageId?: unknown;
  targetAgents?: unknown;
}): Promise<ToolResult> {
  const normalizedInput = normalizePostMessageInput(input);
  const parsedInput = postMessageRuntimeInputSchema.safeParse(normalizedInput);
  if (!parsedInput.success) {
    const issues = parsedInput.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    return errorResult(`Invalid input for office_claw_post_message: ${issues}`);
  }

  const validatedInput = parsedInput.data;
  const result = await callbackPost(
    '/api/callbacks/post-message',
    {
      content: validatedInput.content,
      ...(validatedInput.replyTo ? { replyTo: validatedInput.replyTo } : {}),
      clientMessageId: validatedInput.clientMessageId ?? randomUUID(),
      ...(validatedInput.targetAgents?.length ? { targetAgents: validatedInput.targetAgents } : {}),
    },
    { enableOutbox: true },
  );

  return finalizePostMessageResult(result, validatedInput.content);
}

function finalizePostMessageResult(result: ToolResult, content: string): ToolResult {
  // Detect stale_ignored: server returned 200 but message was NOT delivered
  // because a newer invocation for the same thread+agent has superseded this one.
  // The CLI must know this so it doesn't assume the message reached the user.
  if (!result.isError) {
    try {
      const data = JSON.parse((result.content[0] as { text: string }).text);
      if (data?.status === 'stale_ignored') {
        return errorResult(
          'Message was NOT delivered: this invocation has been superseded by a newer one for the same thread. ' +
            'Your message was silently discarded by the server (stale_ignored). ' +
            'Include the message content in your stdout response instead.',
        );
      }
    } catch {
      // parse failure is fine — means result is not a stale_ignored response
    }
  }

  // If post-message failed and content contains @mentions,
  // hint that text-based @mention is always available.
  // Only mention credential issues when the error actually looks like auth failure.
  if (result.isError && /[@＠]/.test(content)) {
    const original = (result.content[0] as { text: string }).text;
    const lower = original.toLowerCase();
    const looksLikeCredentialFailure =
      lower.includes('callback failed (401)') ||
      lower.includes('invalid or expired callback credentials') ||
      lower.includes('callback token');
    const reasonHint = looksLikeCredentialFailure
      ? '这次 callback 凭证校验失败（可能是 token 过期，也可能 invocation/token 不匹配）。'
      : '这次 post-message 调用失败。';
    const hint =
      `\n\n💡 Tip: ${reasonHint}如果你想 @其他智能体，` +
      '不需要用这个 MCP tool——直接在你的回复文本里另起一行写 @智能体名 即可' +
      '（例如另起一行写 @队友名），系统会自动检测并触发。';
    return errorResult(original + hint);
  }

  return result;
}

export async function handleGetPendingMentions(input: { includeAcked?: boolean | undefined }): Promise<ToolResult> {
  return callbackGet('/api/callbacks/pending-mentions', {
    ...(input.includeAcked ? { includeAcked: '1' } : {}),
  });
}

export async function handleAckMentions(input: { upToMessageId: string }): Promise<ToolResult> {
  return callbackPost('/api/callbacks/ack-mentions', {
    upToMessageId: input.upToMessageId,
  });
}

export async function handleGetThreadContext(input: {
  limit?: number | undefined;
  threadId?: string | undefined;
  agentId?: string | undefined;
  keyword?: string | undefined;
}): Promise<ToolResult> {
  const normalizedThreadId = input.threadId?.trim();
  return callbackGet('/api/callbacks/thread-context', {
    ...(input.limit ? { limit: String(input.limit) } : {}),
    ...(normalizedThreadId && normalizedThreadId !== '.' && normalizedThreadId !== './'
      ? { threadId: normalizedThreadId }
      : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.keyword ? { keyword: input.keyword } : {}),
  });
}

export async function handleListThreads(input: {
  limit?: number | undefined;
  activeSince?: number | undefined;
  keyword?: string | undefined;
}): Promise<ToolResult> {
  return callbackGet('/api/callbacks/list-threads', {
    ...(input.limit ? { limit: String(input.limit) } : {}),
    ...(input.activeSince !== undefined ? { activeSince: String(input.activeSince) } : {}),
    ...(input.keyword ? { keyword: input.keyword } : {}),
  });
}

export async function handleFeatIndex(input: {
  limit?: number | undefined;
  featId?: string | undefined;
  query?: string | undefined;
}): Promise<ToolResult> {
  return callbackGet('/api/callbacks/feat-index', {
    ...(input.limit ? { limit: String(input.limit) } : {}),
    ...(input.featId ? { featId: input.featId } : {}),
    ...(input.query ? { query: input.query } : {}),
  });
}

export async function handleUpdateTask(input: {
  taskId: string;
  status?: string | undefined;
  why?: string | undefined;
}): Promise<ToolResult> {
  return callbackPost('/api/callbacks/update-task', {
    taskId: input.taskId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.why ? { why: input.why } : {}),
  });
}

export async function handleCrossPostMessage(input: {
  threadId: string;
  content: string;
  replyTo?: string | undefined;
  clientMessageId?: string | undefined;
}): Promise<ToolResult> {
  const result = await callbackPost(
    '/api/callbacks/post-message',
    {
      threadId: input.threadId,
      allowCrossThread: true,
      content: input.content,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      clientMessageId: input.clientMessageId ?? randomUUID(),
    },
    { enableOutbox: true },
  );

  return finalizePostMessageResult(result, input.content);
}

export async function handleListTasks(input: {
  threadId?: string | undefined;
  agentId?: string | undefined;
  status?: 'todo' | 'doing' | 'blocked' | 'done' | undefined;
}): Promise<ToolResult> {
  return callbackGet('/api/callbacks/list-tasks', {
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.status ? { status: input.status } : {}),
  });
}

export async function handleListSkills(input: {
  query?: string | undefined;
  limit?: number | undefined;
}): Promise<ToolResult> {
  return callbackGet('/api/callbacks/skills/list', {
    ...(input.query ? { query: input.query } : {}),
    ...(input.limit ? { limit: String(input.limit) } : {}),
  });
}

export async function handleLoadSkill(input: { name: string }): Promise<ToolResult> {
  return callbackGet('/api/callbacks/skills/load', {
    name: input.name,
  });
}

/** F22+F96: Create a rich block (card, diff, checklist, media_gallery, audio, interactive) in the current message */
export const createRichBlockInputSchema = {
  block: z
    .string()
    .min(1)
    .describe('JSON string of the rich block object. Must include id, kind, v:1, and kind-specific fields.'),
};

/**
 * #84: Route A → Route B fallback for rich block creation.
 * Tries direct callback first; on failure, falls back to post_message with cc_rich text
 * (which is extracted server-side after #83 fix).
 */
export async function handleCreateRichBlock(input: { block: string }): Promise<ToolResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.block);
  } catch {
    return errorResult('Invalid JSON in block parameter');
  }

  // #85 M2c: normalize before validation (type→kind, auto v:1)
  parsed = normalizeRichBlock(parsed);

  if (!parsed || typeof parsed !== 'object' || !('id' in parsed) || !('kind' in parsed)) {
    return errorResult('Block must include id and kind fields');
  }

  // Route A: direct rich block callback (buffers for invocation response)
  const result = await callbackPost(
    '/api/callbacks/create-rich-block',
    {
      block: parsed,
    },
    { enableOutbox: true },
  );
  if (!result.isError) return result;

  // P1 cloud-review: only fallback to Route B for auth/config failures.
  // Validation errors (400/422) must surface directly, not be silently swallowed.
  const errorText = result.content[0]?.type === 'text' ? result.content[0].text : '';
  const isAuthOrConfigFailure = /\(40[13]\)/.test(errorText) || /not configured/i.test(errorText);
  if (!isAuthOrConfigFailure) return result;

  // Route A auth/config failed — try Route B: cc_rich text via post_message (#83 extracts it server-side)
  const ccRichText = `\`\`\`cc_rich\n${JSON.stringify({ v: 1, blocks: [parsed] })}\n\`\`\``;
  const fallback = await handlePostMessage({
    content: ccRichText,
    clientMessageId: randomUUID(),
  });
  if (!fallback.isError) {
    return successResult(JSON.stringify({ status: 'ok', route: 'B_fallback' }));
  }

  // Both routes failed — return error with embeddable cc_rich hint
  return errorResult(
    `Rich block creation failed (callback token expired or missing). As a workaround, include this in your message text:\n\n${ccRichText}`,
  );
}

export const requestPermissionInputSchema = {
  action: z.string().min(1).describe('The action requiring permission (e.g. "git_commit", "file_delete")'),
  reason: z.string().min(1).describe('Why you need this permission'),
  context: z.string().max(5000).optional().describe('Optional additional context for the request'),
};

export const checkPermissionStatusInputSchema = {
  requestId: z.string().min(1).describe('The requestId returned from a previous request_permission call'),
};

export async function handleRequestPermission(input: {
  action: string;
  reason: string;
  context?: string | undefined;
}): Promise<ToolResult> {
  return callbackPost('/api/callbacks/request-permission', {
    action: input.action,
    reason: input.reason,
    ...(input.context ? { context: input.context } : {}),
  });
}

export async function handleCheckPermissionStatus(input: { requestId: string }): Promise<ToolResult> {
  return callbackGet('/api/callbacks/permission-status', {
    requestId: input.requestId,
  });
}

// TD091: PR tracking registration — server resolves threadId from invocation record
export const registerPrTrackingInputSchema = {
  repoFullName: z.string().min(1).describe('Repository full name in owner/repo format (e.g. "zts212653/office-claw")'),
  prNumber: z.number().int().positive().describe('PR number'),
  agentId: z
    .string()
    .optional()
    .describe('Deprecated — server auto-resolves from invocation identity. Ignored if provided.'),
};

export async function handleRegisterPrTracking(input: {
  repoFullName: string;
  prNumber: number;
  agentId?: string;
}): Promise<ToolResult> {
  return callbackPost('/api/callbacks/register-pr-tracking', {
    repoFullName: input.repoFullName,
    prNumber: input.prNumber,
    ...(input.agentId ? { agentId: input.agentId } : {}),
  });
}

export const updateWorkflowInputSchema = {
  backlogItemId: z.string().min(1).describe('The backlog item ID to update workflow SOP for'),
  featureId: z.string().min(1).describe('Feature ID (e.g. "F073")'),
  stage: z
    .enum(['kickoff', 'impl', 'quality_gate', 'review', 'merge', 'completion'])
    .optional()
    .describe('Current SOP stage'),
  batonHolder: z
    .string()
    .min(1)
    .optional()
    .describe('Unique handle of the agent currently holding the baton (e.g. "opus", "codex")'),
  nextSkill: z
    .string()
    .nullable()
    .optional()
    .describe('Suggested skill to load next (e.g. "tdd", "quality-gate"), or null'),
  resumeCapsule: z
    .object({
      goal: z.string().optional().describe('What we are building'),
      done: z.array(z.string()).optional().describe('What has been completed'),
      currentFocus: z.string().optional().describe('What we are working on right now'),
    })
    .optional()
    .describe('Resume capsule for cold start / context recovery'),
  checks: z
    .object({
      remoteMainSynced: z.enum(['attested', 'verified', 'unknown']).optional(),
      qualityGatePassed: z.enum(['attested', 'verified', 'unknown']).optional(),
      reviewApproved: z.enum(['attested', 'verified', 'unknown']).optional(),
      visionGuardDone: z.enum(['attested', 'verified', 'unknown']).optional(),
    })
    .optional()
    .describe('SOP checkpoint attestations'),
  expectedVersion: z
    .number()
    .int()
    .optional()
    .describe('CAS: reject if current version does not match (for concurrent update safety)'),
};

export async function handleUpdateWorkflow(input: {
  backlogItemId: string;
  featureId: string;
  stage?: string | undefined;
  batonHolder?: string | undefined;
  nextSkill?: string | null | undefined;
  resumeCapsule?: { goal?: string; done?: string[]; currentFocus?: string } | undefined;
  checks?:
    | {
        remoteMainSynced?: string;
        qualityGatePassed?: string;
        reviewApproved?: string;
        visionGuardDone?: string;
      }
    | undefined;
  expectedVersion?: number | undefined;
}): Promise<ToolResult> {
  const body: Record<string, unknown> = {
    backlogItemId: input.backlogItemId,
    featureId: input.featureId,
  };
  if (input.stage !== undefined) body['stage'] = input.stage;
  if (input.batonHolder !== undefined) body['batonHolder'] = input.batonHolder;
  if (input.nextSkill !== undefined) body['nextSkill'] = input.nextSkill;
  if (input.resumeCapsule !== undefined) body['resumeCapsule'] = input.resumeCapsule;
  if (input.checks !== undefined) body['checks'] = input.checks;
  if (input.expectedVersion !== undefined) body['expectedVersion'] = input.expectedVersion;
  return callbackPost('/api/callbacks/update-workflow-sop', body);
}

// ============ Multi-Mention (F086) ============

export const multiMentionInputSchema = {
  targets: z
    .array(z.string().min(1))
    .min(1)
    .max(3)
    .describe(
      'Agent IDs to invoke in parallel (max 3). Use the agent IDs from your system prompt teammate list. Example: ["assistant","office"]',
    ),
  question: z.string().min(1).max(5000).describe('The question or request for the target agents'),
  callbackTo: z.string().min(1).describe('Agent ID to route all responses back to (required, usually yourself)'),
  context: z.string().max(5000).optional().describe('Additional context to include for the targets'),
  idempotencyKey: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Idempotency key to prevent duplicate dispatches within the same thread'),
  timeoutMinutes: z.number().int().min(3).max(20).optional().describe('Timeout in minutes (default 8, range 3-20)'),
  searchEvidenceRefs: z
    .array(z.string())
    .optional()
    .describe(
      'References to searches you performed before calling this tool (required unless overrideReason provided). Enforces "先搜后问" principle.',
    ),
  overrideReason: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('Why you are skipping search evidence (required if searchEvidenceRefs omitted)'),
  triggerType: z
    .enum(['high-impact', 'cross-domain', 'uncertain', 'info-gap', 'recon'])
    .optional()
    .describe('Which meta-thinking trigger motivated this call'),
};

export const dispatchAgentTaskInputSchema = {
  target: z
    .string()
    .min(1)
    .describe('Target agent name, alias, or agentId. Prefer the customer-visible agent name.'),
  task: z.string().min(1).max(10000).describe('Task content to dispatch to the target agent'),
  awaitResponse: z
    .boolean()
    .optional()
    .describe('When true, wait for the target agent to finish and return its response (default: true).'),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .optional()
    .describe('How long to wait for the target agent response before returning a timeout error.'),
  idempotencyKey: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Optional idempotency key to deduplicate repeated dispatch requests within the same thread.'),
};

export async function handleMultiMention(input: {
  targets: string[];
  question: string;
  callbackTo: string;
  context?: string | undefined;
  idempotencyKey?: string | undefined;
  timeoutMinutes?: number | undefined;
  searchEvidenceRefs?: string[] | undefined;
  overrideReason?: string | undefined;
  triggerType?: 'high-impact' | 'cross-domain' | 'uncertain' | 'info-gap' | 'recon' | undefined;
}): Promise<ToolResult> {
  // Client-side validation: searchEvidenceRefs or overrideReason required
  if (!input.searchEvidenceRefs?.length && !input.overrideReason) {
    return errorResult(
      'multi_mention requires searchEvidenceRefs (what did you search first?) ' +
        'or overrideReason (why are you skipping search?). ' +
        'This enforces the "先搜后问" principle — search before asking.',
    );
  }

  return callbackPost('/api/callbacks/multi-mention', {
    targets: input.targets,
    question: input.question,
    callbackTo: input.callbackTo,
    ...(input.context ? { context: input.context } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.timeoutMinutes !== undefined ? { timeoutMinutes: input.timeoutMinutes } : {}),
    ...(input.searchEvidenceRefs ? { searchEvidenceRefs: input.searchEvidenceRefs } : {}),
    ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
    ...(input.triggerType ? { triggerType: input.triggerType } : {}),
  });
}

export async function handleDispatchAgentTask(input: {
  target: string;
  task: string;
  awaitResponse?: boolean | undefined;
  timeoutMs?: number | undefined;
  idempotencyKey?: string | undefined;
}): Promise<ToolResult> {
  const config = getCallbackConfig();
  if (!config) return errorResult(NO_CONFIG_ERROR);

  const result = await sendCallbackRequest(
    {
      apiUrl: config.apiUrl,
      path: '/api/callbacks/dispatch-agent-task',
      body: {
        invocationId: config.invocationId,
        callbackToken: config.callbackToken,
        target: input.target,
        task: input.task,
        ...(input.awaitResponse !== undefined ? { awaitResponse: input.awaitResponse } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    },
    { enableOutbox: false },
  );

  if (!result.ok) return errorResult(result.error);

  const body = result.data as
    | {
        ok?: boolean;
        status?: string;
        errorCode?: string;
        message?: string;
      }
    | undefined;

  if (!body || typeof body !== 'object') {
    return errorResult('Dispatch agent task returned an invalid response payload.');
  }

  if (body.ok === false) {
    return errorResult(
      `Dispatch agent task failed (${body.errorCode ?? 'unknown_error'}): ${body.message ?? 'unknown error'}`,
    );
  }

  return successResult(JSON.stringify(body));
}


export const callbackTools = [
  {
    name: 'office_claw_dispatch_agent_task',
    description:
      'Reliably dispatch a task to another agent by customer-visible name and optionally wait for its response. ' +
      'Use this when the task must actually be queued and tracked, not just notified. ' +
      'This avoids stale callback loss from post_message-style handoff. ' +
      'When awaitResponse=true, the target agent should return its evaluation or revision guidance and finish, ' +
      'instead of synchronously dispatching back to the caller inside the same invocation. ' +
      'For multi-round review-and-revise workflows, the caller should inspect the returned result, ' +
      'revise the artifact if needed, and then start the next round explicitly. ' +
      'GOTCHA: Treat the returned structured status as the source of truth; do not assume success just because the tool was called.',
    inputSchema: dispatchAgentTaskInputSchema,
    handler: handleDispatchAgentTask,
  },
  {
    name: 'office_claw_post_message',
    description:
      'Post a proactive async message to the OfficeClaw chat mid-task in the CURRENT thread (e.g. progress updates, sharing results). ' +
      'To simply @mention another agent at the end of your response, use @agent-name in your reply text instead — it is free and never expires. ' +
      'GOTCHA: This tool uses callback credentials that expire — if it fails with 401, fall back to inline @mention in your response text. ' +
      'GOTCHA: Do NOT use this for routine replies — only for mid-task proactive messages when you need to share something before your response completes.',
    inputSchema: postMessageInputSchema,
    handler: handlePostMessage,
  },
  {
    name: 'office_claw_get_pending_mentions',
    description:
      'Get recent messages that @-mention you. Use at session start to check if anyone is trying to get your attention. ' +
      'TIP: Call this early in your session, then call ack_mentions after processing to avoid seeing the same mentions next session.',
    inputSchema: getPendingMentionsInputSchema,
    handler: handleGetPendingMentions,
  },
  {
    name: 'office_claw_ack_mentions',
    description:
      'Acknowledge that you have processed mentions up to a specific message ID. ' +
      'Call this AFTER processing mentions from get_pending_mentions to avoid seeing them again in future sessions. ' +
      'GOTCHA: Pass the message ID of the LAST mention you processed, not the first.',
    inputSchema: ackMentionsInputSchema,
    handler: handleAckMentions,
  },
  {
    name: 'office_claw_get_thread_context',
    description:
      'Get recent conversation messages for context. Use to understand what has been discussed recently in a thread. ' +
      'Pass threadId to read a DIFFERENT thread (cross-thread context); omit to read the current thread. ' +
      'Use keyword filter to find specific topics without reading all messages. ' +
      'TIP: For searching across ALL threads/sessions, use search_evidence instead — this tool only reads one thread.',
    inputSchema: getThreadContextInputSchema,
    handler: handleGetThreadContext,
  },
  // D15: office_claw_search_messages removed — superseded by search_evidence + get_thread_context
  {
    name: 'office_claw_list_threads',
    description:
      'List thread summaries for discovery. Use when you need to find a thread by keyword or see recent activity. ' +
      'Returns thread IDs, titles, and activity timestamps. ' +
      'Use activeSince (Unix ms) to filter to recently active threads. Use keyword to search by title.',
    inputSchema: listThreadsInputSchema,
    handler: handleListThreads,
  },
  {
    name: 'office_claw_feat_index',
    description:
      'Lookup feature index entries by featId or query. Returns featId, name, status, and linked threadIds. ' +
      'Use when you need to find which thread(s) a feature is discussed in, or check feature status. ' +
      'PARAM GUIDE: featId = exact match (e.g. "F043"), query = fuzzy substring over all fields.',
    inputSchema: featIndexInputSchema,
    handler: handleFeatIndex,
  },
  {
    name: 'office_claw_cross_post_message',
    description:
      'Post a message to a specific thread by threadId (cross-thread notification). ' +
      'Use when you need to notify a different thread about something relevant. ' +
      'GOTCHA: Requires threadId — use list_threads or feat_index to find the right thread first.',
    inputSchema: crossPostMessageInputSchema,
    handler: handleCrossPostMessage,
  },
  {
    name: 'office_claw_list_tasks',
    description:
      'List tasks with optional threadId/agentId/status filters for global task discovery. ' +
      'Use when you need to see what tasks exist, who owns them, or what is blocked. ' +
      'TIP: Filter by status="blocked" to find tasks that need attention.',
    inputSchema: listTasksInputSchema,
    handler: handleListTasks,
  },
  {
    name: 'office_claw_list_skills',
    description:
      'List OfficeClaw shared skills that are currently installed for runtime use. ' +
      'Use when you need to discover which skills exist, search by intent, or answer "what skills are available?". ' +
      'For planning/TDD/compare-options/worktree tasks, use this before search_evidence/grep/read and load a close match immediately. ' +
      'Shared ACP/open-agent skills are discovered here at runtime — do not assume a local skill directory exists. ' +
      'If an intent query is empty, retry once with a shorter intent phrase or a likely exact skill name.',
    inputSchema: listSkillsInputSchema,
    handler: handleListSkills,
  },
  {
    name: 'office_claw_load_skill',
    description:
      'Load one OfficeClaw shared skill by exact name. ' +
      'Returns the full SKILL.md plus the skill directory and related file paths. ' +
      'Call this before using a skill; ACP/open agents should not assume the skill is preinstalled locally.',
    inputSchema: loadSkillInputSchema,
    handler: handleLoadSkill,
  },
  {
    name: 'office_claw_update_task',
    description:
      'Update the status of a task you own. Use to mark tasks as doing/blocked/done. ' +
      'GOTCHA: You can only update tasks assigned to you (your agentId). ' +
      'TIP: Include a "why" note when marking as blocked — it helps others understand the situation.',
    inputSchema: updateTaskInputSchema,
    handler: handleUpdateTask,
  },
  {
    name: 'office_claw_create_rich_block',
    description:
      'Create a rich block (card, diff, checklist, media_gallery, audio, or interactive) attached to the current message. ' +
      'Use card for status/decisions, diff for code changes, checklist for todos, media_gallery for images, audio for voice, interactive for user selection/confirmation. ' +
      'GOTCHA: The block JSON must use "kind" (NOT "type") and include "v": 1 and a unique "id". ' +
      "GOTCHA: Call get_rich_block_rules first if you haven't loaded the full schema yet in this session. " +
      'If callback auth fails, falls back to cc_rich text encoding automatically.',
    inputSchema: createRichBlockInputSchema,
    handler: handleCreateRichBlock,
  },
  {
    name: 'office_claw_request_permission',
    description:
      'Request permission from the user before performing a sensitive action (e.g. git_commit, file_delete). ' +
      'Returns granted/denied immediately if a rule exists, or pending with a requestId if the user needs to approve. ' +
      'WORKFLOW: request_permission → if pending → wait → check_permission_status with the returned requestId.',
    inputSchema: requestPermissionInputSchema,
    handler: handleRequestPermission,
  },
  {
    name: 'office_claw_check_permission_status',
    description:
      'Check the status of a previously submitted permission request. ' +
      'Use the requestId returned from request_permission. Returns granted/denied/pending.',
    inputSchema: checkPermissionStatusInputSchema,
    handler: handleCheckPermissionStatus,
  },
  {
    name: 'office_claw_register_pr_tracking',
    description:
      'Register a PR for email review notification routing. Call right after `gh pr create` ' +
      'so that cloud Codex review emails are automatically routed to your current thread. ' +
      'The server resolves threadId and agentId from your invocation identity — you only need repoFullName and prNumber. ' +
      'GOTCHA: Must be called in the same session that created the PR, while callback credentials are still valid.',
    inputSchema: registerPrTrackingInputSchema,
    handler: handleRegisterPrTracking,
  },
  {
    name: 'office_claw_update_workflow',
    description:
      'Update the SOP workflow stage for a Feature (Mission Hub bulletin board). ' +
      'Use to record current stage, baton holder, resume capsule, and checks. ' +
      'This is information sharing, not flow control — cats decide their own actions. ' +
      'STAGE VALUES: kickoff → impl → quality_gate → review → merge → completion. ' +
      'TIP: Always set resumeCapsule when updating stage — it helps the next agent cold-start.',
    inputSchema: updateWorkflowInputSchema,
    handler: handleUpdateWorkflow,
  },
  {
    name: 'office_claw_multi_mention',
    description:
      'Invoke up to 3 agents in parallel to gather perspectives on a question. ' +
      'targets must use agent IDs (e.g. "assistant", "office", "agentteams"), NOT display names. ' +
      'All responses are automatically routed back to callbackTo (usually yourself). ' +
      "REQUIRES: searchEvidenceRefs (list what you searched first) OR overrideReason (why you're skipping search). " +
      'This enforces the "先搜后问" principle — always search before asking other agents. ' +
      'Use this instead of multiple @mentions when you need structured multi-agent collaboration with guaranteed response aggregation. ' +
      'GOTCHA: callbackTo is usually your own agent ID so responses come back to you.',
    inputSchema: multiMentionInputSchema,
    handler: handleMultiMention,
  },
] as const;
