/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Route Helpers
 * Shared types, interfaces, and helper functions for route-serial and route-parallel.
 */

import {
  basename,
  isAbsolute,
} from 'node:path';
import {
  type OfficeClawConfigEntry,
  OFFICE_CLAW_CONFIGS,
  type AgentId,
  officeClawRegistry,
  type MessageContent,
  type RichBlock,
  type RichBlockBase,
} from '@openjiuwen/relay-shared';
import type { GatewayIdentity } from '@openjiuwen/relay-api-server-contracts';
import { getAgentContextBudget } from '../../../../../config/office-claw-budgets.js';
import { estimateTokens } from '../../../../../utils/token-counter.js';
import { formatMessage } from '../../context/ContextAssembler.js';
import { checkContextBudget, type DegradationResult } from '../../orchestration/DegradationPolicy.js';
import { DeliveryCursorStore } from '../../stores/ports/DeliveryCursorStore.js';
import type { IDraftStore } from '../../stores/ports/DraftStore.js';
import type { IMessageStore, StoredMessage, StoredToolEvent } from '../../stores/ports/MessageStore.js';
import { canViewMessage } from '../../stores/visibility.js';
import type { AgentMessage, AgentService } from '../../types.js';
import type { InvocationDeps } from '../invocation/invoke-single-agent.js';

/** Minimal broadcast interface — avoids coupling routing layer to SocketManager concrete class */
export interface RouteBroadcaster {
  broadcastToRoom(room: string, event: string, data: unknown): void;
}

/** Dependencies shared across route strategies */
export interface RouteStrategyDeps {
  services: Record<string, AgentService>;
  invocationDeps: InvocationDeps;
  messageStore: IMessageStore;
  deliveryCursorStore?: DeliveryCursorStore;
  /** #80: Streaming draft persistence store */
  draftStore?: IDraftStore;
  /** F079 Bug 2: Optional broadcaster for real-time vote result delivery */
  socketManager?: RouteBroadcaster;
}

/** Mutable context for tracking persistence failures across the generator boundary.
 *  Caller creates the object, passes it in RouteOptions, and checks after generator exhausts. */
export interface PersistenceContext {
  /** Set to true by route strategies when any messageStore.append() call fails */
  failed: boolean;
  /** Error details for diagnostics */
  errors: Array<{ agentId: string; error: string }>;
  /** F088-P3: Rich blocks consumed during this invocation, for outbound delivery */
  richBlocks?: import('@openjiuwen/relay-shared').RichBlock[];
}

/** Common options for both strategies */
export interface RouteOptions {
  contentBlocks?: readonly MessageContent[] | undefined;
  uploadDir?: string | undefined;
  callbackEnvOverrides?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
  promptTags?: readonly string[] | undefined;
  /** Pre-assembled context (deprecated: use history for per-agent budget) */
  contextHistory?: string | undefined;
  /** Raw thread history for per-agent context assembly */
  history?: StoredMessage[] | undefined;
  /** Current user message ID (enables exact incremental context delivery path) */
  currentUserMessageId?: string | undefined;
  /** Max A2A chain depth for routeSerial (default: MAX_A2A_DEPTH env or 2) */
  maxA2ADepth?: number | undefined;
  /** Queue fairness hook: when true for current thread, routeSerial must stop extending A2A chain. */
  queueHasQueuedMessages?: ((threadId: string) => boolean) | undefined;
  /** A2A dedup hook: skip text-scan @mention if agent already dispatched via callback path. */
  hasQueuedOrActiveAgent?: ((threadId: string, agentId: string) => boolean) | undefined;
  /** ADR-008 S3: When provided, cursor boundaries are collected here instead of acking immediately.
   *  Caller acks after invocation succeeds. If absent, legacy immediate ack behavior. */
  cursorBoundaries?: Map<string, string>;
  /** P1-2: When provided, persistence failures are recorded here instead of silently swallowed.
   *  Caller checks after generator exhausts to determine invocation status. */
  persistenceContext?: PersistenceContext;
  /** F11: Mode-specific system prompt section (appended after identity prompt) */
  modeSystemPrompt?: string | undefined;
  /** F11: Per-agent mode prompt override (takes precedence over modeSystemPrompt) */
  modeSystemPromptByCat?: Record<string, string> | undefined;
  /** Thinking visibility: play = cats don't see each other's thinking, debug = cats share thinking. Default: play */
  thinkingMode?: 'debug' | 'play' | undefined;
  /** F108: Unique invocation ID for WorklistRegistry isolation in concurrent execution.
   *  When provided, worklist is keyed by this ID instead of threadId. */
  parentInvocationId?: string | undefined;
  /** Trusted caller identity passed down to the invocation layer. */
  gatewayIdentity?: GatewayIdentity | undefined;
  /** Thread-scoped agent config view resolved by AgentRouter. */
  configByAgentId?: Record<string, OfficeClawConfigEntry> | undefined;
  /** Explicit interrupted-session resume target for provider integrations that support resume semantics. */
  resumeAgentId?: AgentId | undefined;
  /** AskUserQuestion: whether the current channel supports interactive structured questions. */
  interactiveAsk?: boolean | undefined;
  /** End-to-end trace ID from frontend HTTP request for log correlation. */
  traceId?: string | undefined;
}

export interface IncrementalContextResult {
  contextText: string;
  boundaryId?: string;
  includesCurrentUserMessage: boolean;
  /** True when the current user message exists in unseen but was filtered out
   *  (e.g. whisper not intended for this agent). Callers must NOT inject the raw
   *  message text as fallback when this is true — doing so would leak whisper content. */
  currentMessageFilteredOut: boolean;
  /** GAP-1: User-facing message when incremental batch was truncated by budget cap */
  degradation?: string;
}

/**
 * Keep cursor boundary monotonic within one invocation.
 * When the same agent is invoked multiple times (A2A re-entry), later passes may
 * observe fewer relevant messages and produce an older boundary; this helper
 * prevents regressing the deferred ack boundary.
 *
 * Assumes message IDs are lexicographically monotonic (timestamp+seq prefix).
 */
export function upsertMaxBoundary(cursorBoundaries: Map<string, string>, agentId: string, boundaryId: string): void {
  const current = cursorBoundaries.get(agentId);
  if (!current || boundaryId > current) {
    cursorBoundaries.set(agentId, boundaryId);
  }
}

/** Get the agent service for a given agent ID */
export function getService(services: Record<string, AgentService>, agentId: AgentId): AgentService {
  const service = services[agentId];
  if (!service) throw new Error(`Unknown agent ID: ${agentId as string}`);
  return service;
}

export function resolveAgentConfig(
  agentId: string,
  configByAgentId?: Record<string, OfficeClawConfigEntry>,
): OfficeClawConfigEntry | undefined {
  if (configByAgentId?.[agentId]) return configByAgentId[agentId];
  return officeClawRegistry.tryGet(agentId)?.config ?? OFFICE_CLAW_CONFIGS[agentId];
}

export function detectContextDegradation(
  historyCount: number,
  includedCount: number,
  budget: ReturnType<typeof getAgentContextBudget>,
): DegradationResult | null {
  // Existing count-based degradation logic
  const byCount = checkContextBudget(historyCount, budget);
  if (byCount.degraded) return byCount;

  // Additional char-budget degradation: history count is within budget, but content still got truncated.
  const maxCountCandidate = Math.min(historyCount, budget.maxMessages);
  if (includedCount < maxCountCandidate) {
    return {
      degraded: true,
      strategy: 'truncated',
      reason: `Token 预算限制，历史从 ${maxCountCandidate} 条截断到 ${includedCount} 条`,
      adjustedMaxMessages: includedCount,
    };
  }

  return null;
}

/** Truncate a string for tool event detail preview */
export function truncateDetail(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/** Default cap for tool_use detail (keeps Redis/history payloads small). */
const TOOL_USE_DETAIL_MAX = 5000;

/**
 * `send_file_to_user` carries many long absolute paths — a 200-char cap produces invalid JSON
 * and breaks `parseSendFileToUserFromDetail` after history refresh.
 */
const SEND_FILE_TO_USER_DETAIL_MAX = 512 * 1024;

/** Build a StoredToolEvent from a streaming AgentMessage */
export function toStoredToolEvent(msg: AgentMessage): StoredToolEvent | null {
  if (msg.type === 'tool_use') {
    const toolName = msg.toolName ?? 'unknown';
    let detail: string | undefined;
    if (msg.toolInput) {
      try {
        const raw = JSON.stringify(msg.toolInput);
        const maxLen = toolName === 'send_file_to_user' ? SEND_FILE_TO_USER_DETAIL_MAX : TOOL_USE_DETAIL_MAX;
        detail = truncateDetail(raw, maxLen);
      } catch {
        detail = '[unserializable]';
      }
    }
    return {
      id: `tool-${msg.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'tool_use',
      label: `${msg.agentId as string} → ${toolName}`,
      ...(detail ? { detail } : {}),
      timestamp: msg.timestamp,
      // F142: Preserve toolCallId for precise tool_use/result pairing
      ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
    };
  }
  if (msg.type === 'tool_result') {
    const raw = (msg.content ?? '').trimEnd();
    const detail = raw.length > 0 ? truncateDetail(raw, 220) : '(no output)';
    return {
      id: `toolr-${msg.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'tool_result',
      label: `${msg.agentId as string} ← ${msg.toolName ?? 'result'}`,
      detail,
      timestamp: msg.timestamp,
      // F142: Preserve toolCallId for precise tool_use/result pairing
      ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
    };
  }
  return null;
}

export function richBlocksFromSendFileToUserTool(msg: AgentMessage): RichBlock[] {
  if (msg.type !== 'tool_use') return [];
  const toolName = msg.toolName ?? '';
  if (!toolName.split(/[.@/]/).includes('send_file_to_user') && !toolName.endsWith('send_file_to_user')) return [];

  const paths = extractSendFilePaths(msg.toolInput);
  return paths
    .filter((filePath) => isAbsolute(filePath))
    .map((filePath, index) => ({
      id: `send-file-${msg.timestamp}-${index}`,
      kind: 'file' as const,
      v: 1 as const,
      url: filePath,
      fileName: basename(filePath),
    }));
}

function extractSendFilePaths(input: unknown): string[] {
  const parsed = parseSendFileInput(input);
  if (!parsed) return [];
  const values: unknown[] = [];
  const list = parsed.abs_file_path_list;
  if (Array.isArray(list)) values.push(...list);
  for (const key of ['abs_file_path', 'file_path', 'abs_path', 'path']) {
    if (typeof parsed[key] === 'string') values.push(parsed[key]);
  }
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function parseSendFileInput(input: unknown): Record<string, unknown> | null {
  let current = input;
  for (let i = 0; i < 3; i++) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      return current as Record<string, unknown>;
    }
    if (typeof current !== 'string') return null;
    try {
      current = JSON.parse(current);
    } catch {
      return null;
    }
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

const USER_FACING_SYSTEM_INFO_TYPES = new Set([
  'a2a_followup_available',
  'invocation_preempted',
  'mode_switch_proposal',
  'session_seal_requested',
  'silent_completion',
  'warning',
]);

/**
 * Return true when a system_info payload already produces a user-visible notice in the UI.
 * Route strategies use this to avoid appending a misleading silent_completion after an
 * actionable blocker/warning has already been surfaced.
 */
export function isUserFacingSystemInfoContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { type?: unknown };
    return typeof parsed.type === 'string' && USER_FACING_SYSTEM_INFO_TYPES.has(parsed.type);
  } catch {
    return true;
  }
}

export function sanitizeInjectedContent(content: string): string {
  const lines = content.split('\n');
  const kept: string[] = [];
  let skippingHistoryEnvelope = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHistoryHeader = line.startsWith('[对话历史 - 最近 ') || line.startsWith('[对话历史增量 - 未发送过 ');

    if (!skippingHistoryEnvelope && isHistoryHeader) {
      // Drop known injected history envelopes only.
      skippingHistoryEnvelope = true;
      continue;
    }

    if (skippingHistoryEnvelope) {
      // Use unique terminator to avoid false matches with markdown `---`
      if (trimmed === '[/对话历史]' || trimmed === '---') {
        skippingHistoryEnvelope = false;
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join('\n').trim();
}

const DIRECT_MENTION_CONTINUATION_RE = /^[a-zA-Z0-9_]/;
const DIRECT_MENTION_SEPARATOR_RE = /^[\s,.:;!?()[\]{}<>，。！？、：；（）【】《》「」『』〈〉-]+/;

/**
 * Remove the current agent's leading @mention so provider query fields receive only the user task.
 * Keeps the original message unchanged when the mention is not a true line-start/direct address.
 */
export function stripLeadingDirectAgentMention(
  message: string,
  agentId: AgentId,
  configByAgentId?: Record<string, OfficeClawConfigEntry>,
): string {
  const config = resolveAgentConfig(agentId as string, configByAgentId);
  const patterns = [...(config?.mentionPatterns ?? [])].sort((a, b) => b.length - a.length);
  if (patterns.length === 0) return message.trim();

  let remaining = message.trimStart();
  let matched = false;

  while (remaining.length > 0) {
    const lowerRemaining = remaining.toLowerCase();
    const matchedPattern = patterns.find((pattern) => {
      const lowerPattern = pattern.toLowerCase();
      if (!lowerRemaining.startsWith(lowerPattern)) return false;
      const rest = remaining.slice(pattern.length);
      return !DIRECT_MENTION_CONTINUATION_RE.test(rest);
    });
    if (!matchedPattern) break;

    matched = true;
    remaining = remaining.slice(matchedPattern.length).replace(DIRECT_MENTION_SEPARATOR_RE, '').trimStart();
  }

  const trimmedOriginal = message.trim();
  if (!matched) return trimmedOriginal;
  return remaining || trimmedOriginal;
}

/**
 * Route content blocks to the target agent.
 * All cats receive the full content blocks including images —
 * each AgentService (Claude/Codex/Gemini) handles image paths
 * via its own CLI bridge (--add-dir / --image / --include-directories).
 */
export function routeContentBlocksForCat(
  _agentId: AgentId,
  contentBlocks: readonly MessageContent[] | undefined,
): readonly MessageContent[] | undefined {
  return contentBlocks ?? undefined;
}

/**
 * F22: Summarize rich blocks for context injection.
 * Replaces verbose rich block JSON with compact digests so cats know
 * what was previously rendered without wasting tokens.
 */
function digestRichBlock(b: RichBlock): string {
  switch (b.kind) {
    case 'card':
      return `[卡片: ${b.title ?? '无标题'}]`;
    case 'diff':
      return `[代码 diff: ${b.filePath ?? '未知文件'}]`;
    case 'checklist':
      return `[清单: ${b.title ?? `${Array.isArray(b.items) ? b.items.length : 0} 项`}]`;
    case 'media_gallery':
      return `[图片: ${Array.isArray(b.items) ? b.items.length : 0} 张]`;
    default:
      return `[富块: ${(b as RichBlockBase).kind}]`;
  }
}

export function digestRichBlocks(msg: StoredMessage): string {
  if (!msg.extra?.rich?.blocks?.length) return msg.content;
  const digests = msg.extra.rich.blocks.map(digestRichBlock);
  return `${msg.content}\n${digests.join(' ')}`;
}

export async function fetchAfterCursor(
  messageStore: IMessageStore,
  threadId: string,
  afterId: string | undefined,
  userId: string,
): Promise<StoredMessage[]> {
  return messageStore.getByThreadAfter(threadId, afterId, undefined, userId);
}

/** Options for caller-specified budget overrides */
export interface IncrementalContextOptions {
  /**
   * When provided, overrides budget.maxContextTokens for the token-trim pass.
   * The routing layer should calculate this as:
   *   maxPromptTokens - systemPartsTokens - messageTokens - guard
   * so the assembled context + system parts never exceed the model's input limit.
   */
  effectiveMaxContextTokens?: number;
  /** In-flight cursor boundaries collected during the current invocation before durable ack. */
  cursorBoundaries?: Map<string, string>;
}

export async function assembleIncrementalContext(
  deps: RouteStrategyDeps,
  userId: string,
  threadId: string,
  agentId: AgentId,
  currentUserMessageId?: string,
  thinkingMode?: 'debug' | 'play',
  options?: IncrementalContextOptions,
): Promise<IncrementalContextResult> {
  if (!deps.deliveryCursorStore) {
    return { contextText: '', includesCurrentUserMessage: false, currentMessageFilteredOut: false };
  }

  const durableCursor = await deps.deliveryCursorStore.getCursor(userId, agentId, threadId);
  const pendingCursor = options?.cursorBoundaries?.get(agentId as string);
  const cursor = pendingCursor && (!durableCursor || pendingCursor > durableCursor) ? pendingCursor : durableCursor;
  const unseen = await fetchAfterCursor(deps.messageStore, threadId, cursor, userId);

  // Debug mode: cats see all whispers (full transparency). Play mode: cats only see their own whispers.
  const viewer = (thinkingMode ?? 'play') === 'play' ? { type: 'agent' as const, agentId } : { type: 'user' as const };
  const relevant = unseen.filter((m) => {
    // System-generated messages (persisted error badges) are display-only — never enter prompt
    if (m.userId === 'system') return false;
    // F35: Exclude whispers not intended for this agent (play mode only)
    if (!canViewMessage(m, viewer)) return false;
    // Exclude own messages (only include user messages and other cats' messages)
    // F052 fix: exempt cross-posted messages — same agentId from another thread must be visible
    if (!m.extra?.crossPost && m.agentId !== null && m.agentId === agentId) return false;
    // In play mode, hide other cats' stream (thinking) messages.
    // Legacy messages (no origin) are visible for backward compatibility —
    // all new writes are tagged, so untagged = legacy callback data.
    if ((thinkingMode ?? 'play') === 'play' && m.agentId !== null && m.origin === 'stream') return false;
    return true;
  });

  // F35 fix: detect when the current message was present but filtered out by visibility
  // (e.g. whisper not intended for this agent). Must NOT fallback-inject in that case.
  // Computed on `unseen` — independent of budget cap (砚砚 review: don't mix budget and visibility semantics).
  const currentMessageFilteredOut = Boolean(
    currentUserMessageId &&
      !relevant.some((m) => m.id === currentUserMessageId) &&
      unseen.some((m) => m.id === currentUserMessageId),
  );

  // GAP-1: Unconditional budget cap — protects both first-time cats (cursor=undefined)
  // and stale cursor scenarios where large unseen batches accumulate.
  const budget = getAgentContextBudget(agentId as string);
  const wasCapped = relevant.length > budget.maxMessages;
  const capped = wasCapped ? relevant.slice(-budget.maxMessages) : relevant;

  // Metadata must be based on the FINAL capped set, not pre-cap `relevant`
  const includesCurrentUserMessage = Boolean(currentUserMessageId && capped.some((m) => m.id === currentUserMessageId));

  if (capped.length === 0) {
    return cursor
      ? { contextText: '', boundaryId: cursor, includesCurrentUserMessage, currentMessageFilteredOut }
      : { contextText: '', includesCurrentUserMessage, currentMessageFilteredOut };
  }

  const truncateLimit = budget.maxContentLengthPerMsg;
  const lines = capped.map((m) => {
    // F22: Digest rich blocks into compact summaries for context
    const contentWithDigest = digestRichBlocks(m);
    const cleanContent = sanitizeInjectedContent(contentWithDigest);
    const normalized: StoredMessage = cleanContent === m.content ? m : { ...m, content: cleanContent };
    const rendered = formatMessage(normalized, { truncate: truncateLimit });
    return `[${m.id}] ${rendered}`;
  });

  // 第二刀: Aggregate token budget — trim oldest lines until within effective token limit.
  // A+ fix: routing layer can pass effectiveMaxContextTokens (= maxPromptTokens minus system parts)
  // to prevent the assembled context + system prompt from exceeding the model's input limit.
  const effectiveTokenBudget = options?.effectiveMaxContextTokens ?? budget.maxContextTokens;

  // effectiveMaxContextTokens === 0 means system parts already exhausted the entire prompt budget.
  // Return empty context with degradation rather than skipping the trim (old behavior of `> 0` guard).
  if (effectiveTokenBudget <= 0) {
    const zeroBudgetDegradation = `⚠️ 增量上下文预算耗尽: 系统提示已占满 prompt 预算，${capped.length} 条未读消息全部丢弃`;
    const zeroBoundaryId = capped[capped.length - 1]?.id;
    return {
      contextText: '',
      boundaryId: zeroBoundaryId,
      includesCurrentUserMessage: false,
      currentMessageFilteredOut,
      degradation: zeroBudgetDegradation,
    };
  }

  let tokenTrimmed = false;
  let tokenTrimStart = 0;
  if (effectiveTokenBudget > 0) {
    const perLineTokens = lines.map((l) => estimateTokens(l));
    const totalTokens = perLineTokens.reduce((a, b) => a + b, 0);
    if (totalTokens > effectiveTokenBudget) {
      tokenTrimmed = true;
      // Scan from oldest: accumulate tokens to drop until remainder fits budget
      let dropTokens = 0;
      for (let i = 0; i < perLineTokens.length - 1; i++) {
        dropTokens += perLineTokens[i];
        if (totalTokens - dropTokens <= effectiveTokenBudget) {
          tokenTrimStart = i + 1;
          break;
        }
      }
      if (totalTokens - dropTokens > effectiveTokenBudget) {
        // Even after dropping all but one message, the last message alone may exceed
        // maxContextTokens (e.g. a single huge message). We still keep it because
        // returning empty context is worse — the agent gets no context at all. The
        // degradation notice below will flag this situation so the agent knows the
        // context was force-trimmed.
        tokenTrimStart = perLineTokens.length - 1;
      }
    }
  }

  const finalLines = tokenTrimmed ? lines.slice(tokenTrimStart) : lines;
  const finalCapped = tokenTrimmed ? capped.slice(tokenTrimStart) : capped;

  // Recompute metadata on FINAL post-token-trim set
  const finalIncludesCurrentUserMessage = tokenTrimmed
    ? Boolean(currentUserMessageId && finalCapped.some((m) => m.id === currentUserMessageId))
    : includesCurrentUserMessage;

  if (finalCapped.length === 0) {
    return cursor
      ? { contextText: '', boundaryId: cursor, includesCurrentUserMessage: false, currentMessageFilteredOut }
      : { contextText: '', includesCurrentUserMessage: false, currentMessageFilteredOut };
  }

  let degradation: string | undefined;
  if (wasCapped && tokenTrimmed) {
    degradation = `⚠️ 增量上下文已截断: 未读消息 ${relevant.length} 条经 maxMessages(${budget.maxMessages}) 和 token 预算(${effectiveTokenBudget}) 双重截断，已保留最近 ${finalCapped.length} 条`;
  } else if (wasCapped) {
    degradation = `⚠️ 增量上下文已截断: 未读消息 ${relevant.length} 条超出预算 ${budget.maxMessages}，已保留最近 ${finalCapped.length} 条`;
  } else if (tokenTrimmed) {
    degradation = `⚠️ 增量上下文 token 预算截断: ${capped.length} 条消息超出 token 预算(${effectiveTokenBudget})，已保留最近 ${finalCapped.length} 条`;
  }

  const boundaryId = finalCapped[finalCapped.length - 1]?.id;
  return {
    contextText: `[对话历史增量 - 未发送过 ${finalCapped.length} 条]\n${finalLines.join('\n')}\n[/对话历史]`,
    boundaryId,
    includesCurrentUserMessage: finalIncludesCurrentUserMessage,
    currentMessageFilteredOut,
    degradation,
  };
}
