/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Parallel Route Strategy
 * All cats respond independently to the same message.
 */

import type { OfficeClawConfigEntry, AgentId } from '@openjiuwen/relay-shared';
import {
  getFriendlyAgentErrorMessage,
  classifyError,
  generateErrorSerial,
  TaskRunAccumulator,
} from '@openjiuwen/relay-shared';
import { getAgentContextBudget } from '../../../../../config/office-claw-budgets.js';
import { getConfigSessionStrategy, isSessionChainEnabled } from '../../../../../config/office-claw-config-loader.js';
import { createModuleLogger, errorAuditLogger } from '../../../../../infrastructure/logger.js';
import { estimateTokens } from '../../../../../utils/token-counter.js';
import { assembleContext } from '../../context/ContextAssembler.js';
import {
  buildInvocationContext,
  buildStaticIdentity,
  createSystemPromptBuilder,
  type InvocationContext,
} from '../../context/SystemPromptBuilder.js';
import { formatDegradationMessage } from '../../orchestration/DegradationPolicy.js';
import { buildSessionBootstrap } from '../../session/SessionBootstrap.js';
import type { StoredToolEvent } from '../../stores/ports/MessageStore.js';
import type { ThreadRoutingPolicyV1 } from '../../stores/ports/ThreadStore.js';
import { getVoiceBlockSynthesizer } from '../../tts/VoiceBlockSynthesizer.js';
import type { AgentMessage, AgentMessageType, MessageMetadata } from '../../types.js';
import { invokeSingleCat } from '../invocation/invoke-single-agent.js';
import { buildMcpCallbackInstructions, needsMcpInjection } from '../invocation/McpPromptInjector.js';
import { getRichBlockBuffer } from '../invocation/RichBlockBuffer.js';
import { mergeStreams } from '../invocation/stream-merge.js';
import { resolveDefaultClaudeMcpServerPath } from '../providers/ClaudeAgentService.js';
import { parseA2AMentions } from '../routing/a2a-mentions.js';
import { parseSystemInfoContent } from './parse-system-info.js';
import { draftHadUserStopped, streamExtraForPersistence } from './stream-extra-persist.js';
import { appendGeneratedFileLocationDisclosure } from './generated-file-artifacts.js';
import { extractRichFromText, isValidRichBlock } from './rich-block-extract.js';
import type { RouteOptions, RouteStrategyDeps } from './route-helpers.js';
import {
  assembleIncrementalContext,
  detectContextDegradation,
  getService,
  isUserFacingSystemInfoContent,
  richBlocksFromSendFileToUserTool,
  resolveAgentConfig,
  routeContentBlocksForCat,
  sanitizeInjectedContent,
  stripLeadingDirectAgentMention,
  toStoredToolEvent,
  upsertMaxBoundary,
} from './route-helpers.js';
import { appendThinkingChunk } from './thinking-chunk-merge.js';

const log = createModuleLogger('route-parallel');

export async function* routeParallel(
  deps: RouteStrategyDeps,
  targetAgents: AgentId[],
  message: string,
  userId: string,
  threadId: string,
  options: RouteOptions = {},
): AsyncIterable<AgentMessage> {
  const {
    contentBlocks,
    uploadDir,
    signal,
    promptTags,
    contextHistory,
    history,
    currentUserMessageId,
    modeSystemPrompt,
    modeSystemPromptByCat,
    configByAgentId,
  } = options;
  const promptBuilder = createSystemPromptBuilder(configByAgentId);
  const thinkingMode = options.thinkingMode ?? 'play';
  // P2-3 fix: also consider default MCP server path (ClaudeAgentService has fallback resolution)
  const mcpServerPath = process.env.OFFICE_CLAW_MCP_SERVER_PATH || resolveDefaultClaudeMcpServerPath();
  const incrementalMode = Boolean(currentUserMessageId && deps.deliveryCursorStore);

  const degradationMsgs: AgentMessage[] = [];
  const boundaryByCat = new Map<AgentId, string | undefined>();

  // F042 Wave 3: Fetch thread participant activity once (shared across all cats).
  let activeParticipants: { agentId: AgentId; lastMessageAt: number; messageCount: number }[] = [];
  if (deps.invocationDeps.threadStore) {
    try {
      activeParticipants = await deps.invocationDeps.threadStore.getParticipantsWithActivity(threadId);
    } catch {
      /* best-effort */
    }
  }
  // F042: Fetch thread routingPolicy once (shared across all cats).
  let routingPolicy: ThreadRoutingPolicyV1 | undefined;
  // F073 P4: SOP stage hint from workflow-sop (告示牌 — info only, cats decide actions)
  let sopStageHint: { stage: string; suggestedSkill: string | null; featureId: string } | undefined;
  // F092: Voice companion mode
  let voiceMode: boolean | undefined;
  // F087: Bootcamp state for CVO onboarding
  let bootcampState: InvocationContext['bootcampState'];
  if (deps.invocationDeps.threadStore) {
    try {
      const thread = await deps.invocationDeps.threadStore.get(threadId);
      routingPolicy = thread?.routingPolicy;
      voiceMode = thread?.voiceMode;
      bootcampState = thread?.bootcampState;
      // F073 P4: Read workflow-sop if thread is linked to a backlog item
      if (thread?.backlogItemId && deps.invocationDeps.workflowSopStore) {
        try {
          const sop = await deps.invocationDeps.workflowSopStore.get(thread.backlogItemId);
          if (sop) {
            sopStageHint = {
              stage: sop.stage,
              suggestedSkill: sop.nextSkill,
              featureId: sop.featureId,
            };
          }
        } catch {
          /* best-effort: SOP hint failure does not block invocation */
        }
      }
    } catch {
      /* best-effort */
    }
  }

  const streams = await Promise.all(
    targetAgents.map(async (agentId) => {
      const agentConfig: OfficeClawConfigEntry | undefined = resolveAgentConfig(agentId as string, configByAgentId);
      const isRelayClaw = agentConfig?.provider === 'relayclaw';
      const teammates = targetAgents.filter((id) => id !== agentId);
      // Build identity: static goes in -p content (+ systemPrompt as defense-in-depth), dynamic in -p only.
      // Non-Claude HTTP callback instructions → per-message (session history may be lost on compress).
      const mcpAvailable = (agentConfig?.mcpSupport ?? false) && !!mcpServerPath;
      const staticIdentity = promptBuilder.buildStaticIdentity(agentId, {
        mcpAvailable,
        ...(isRelayClaw
          ? { omitMagicWords: true, omitRichBlockToolLine: true, omitRichBlockReference: true }
          : {}),
      });
      // F041: inject HTTP callback only when MCP is NOT actually available (fallback)
      const mcpInstructions = needsMcpInjection(mcpAvailable)
        ? buildMcpCallbackInstructions({
            currentAgentId: agentId as string,
            teammates: teammates.map((id) => id as string),
          })
        : '';
      const invocationContext = promptBuilder.buildInvocationContext({
        agentId,
        mode: 'parallel',
        teammates,
        mcpAvailable,
        runtimeClock: { nowMs: Date.now() },
        ...(promptTags && promptTags.length > 0 ? { promptTags } : {}),
        ...(activeParticipants.length > 0 ? { activeParticipants } : {}),
        ...(routingPolicy ? { routingPolicy } : {}),
        ...(sopStageHint ? { sopStageHint } : {}),
        ...(voiceMode ? { voiceMode } : {}),
        ...(bootcampState ? { bootcampState, threadId } : {}),
      }, isRelayClaw ? { compactRelayContext: true } : undefined);

      const targetContentBlocks = routeContentBlocksForCat(agentId, contentBlocks);
      const targetUploadDir = targetContentBlocks ? uploadDir : undefined;

      // F24 Phase E: Bootstrap context for Session #2+
      let bootstrapCtx = '';
      if (
        isSessionChainEnabled(agentId) &&
        deps.invocationDeps.sessionChainStore &&
        deps.invocationDeps.transcriptReader
      ) {
        try {
          const bootstrapDepth = getConfigSessionStrategy(agentId)?.handoff?.bootstrapDepth;
          const bootstrap = await buildSessionBootstrap(
            {
              sessionChainStore: deps.invocationDeps.sessionChainStore,
              transcriptReader: deps.invocationDeps.transcriptReader,
              ...(deps.invocationDeps.taskStore ? { taskStore: deps.invocationDeps.taskStore } : {}),
              ...(deps.invocationDeps.threadStore ? { threadStore: deps.invocationDeps.threadStore } : {}),
              ...(bootstrapDepth ? { bootstrapDepth } : {}),
            },
            agentId,
            threadId,
          );
          if (bootstrap) {
            bootstrapCtx = bootstrap.text;
          }
        } catch {
          // Best-effort: bootstrap failure doesn't block invocation
        }
      }

      let prompt: string;
      if (incrementalMode) {
        // A+ fix: calculate effective context budget by deducting ALL system parts from maxPromptTokens.
        const parAgentModePromptForBudget = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
        const parIncBudget = getAgentContextBudget(agentId as string);
        const parIncSystemTokens = estimateTokens(
          [staticIdentity, invocationContext, parAgentModePromptForBudget, bootstrapCtx, mcpInstructions]
            .filter(Boolean)
            .join('\n'),
        );
        const parIncMessageTokens = estimateTokens(message);
        const parEffectiveContextBudget = Math.min(
          Math.max(0, parIncBudget.maxPromptTokens - parIncSystemTokens - parIncMessageTokens - 200),
          parIncBudget.maxContextTokens,
        );

        const inc = await assembleIncrementalContext(
          deps,
          userId,
          threadId,
          agentId,
          currentUserMessageId,
          thinkingMode,
          { effectiveMaxContextTokens: parEffectiveContextBudget, cursorBoundaries: options.cursorBoundaries },
        );
        boundaryByCat.set(agentId, inc.boundaryId);
        if (inc.degradation) {
          degradationMsgs.push({
            type: 'system_info' as AgentMessageType,
            agentId,
            content: inc.degradation,
            timestamp: Date.now(),
          } as AgentMessage);
        }
        const parAgentModePrompt = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
        const parts = [invocationContext, parAgentModePrompt, bootstrapCtx, mcpInstructions].filter(Boolean);
        if (inc.contextText) parts.push(inc.contextText);
        // F35 fix: only inject raw message when it was genuinely absent from unseen rows.
        // If it was present but filtered out (e.g. whisper), injecting would leak private content.
        if (!inc.includesCurrentUserMessage && !inc.currentMessageFilteredOut) parts.push(message);
        prompt = parts.join('\n\n---\n\n');
      } else {
        // Per-agent context budget (Phase 4.0)
        let agentContextHistory = contextHistory;
        if (history && history.length > 0 && !contextHistory) {
          const budget = getAgentContextBudget(agentId as string);
          // F8: token-based budget — estimate non-context tokens, remainder goes to context
          // A+ fix: include agentModePrompt + bootstrapCtx in system parts estimate (P2-1)
          const parAgentModePromptLegacyForBudget = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
          const parSystemTokens = estimateTokens(
            [staticIdentity, invocationContext, parAgentModePromptLegacyForBudget, bootstrapCtx, mcpInstructions]
              .filter(Boolean)
              .join('\n'),
          );
          const parPromptTokens = estimateTokens(message);
          const budgetForContext = Math.max(0, budget.maxPromptTokens - parSystemTokens - parPromptTokens - 200);
          const { contextText, messageCount } = assembleContext(history, {
            maxMessages: budget.maxMessages,
            maxContentLength: budget.maxContentLengthPerMsg,
            maxTotalTokens: Math.min(budgetForContext, budget.maxContextTokens),
          });
          agentContextHistory = contextText || undefined;

          // Degradation check: notify user if context was truncated (count budget or char budget)
          const degradation = detectContextDegradation(history.length, messageCount, budget);
          if (degradation?.degraded) {
            degradationMsgs.push({
              type: 'system_info' as AgentMessageType,
              agentId,
              content: formatDegradationMessage(degradation),
              timestamp: Date.now(),
            } as AgentMessage);
          }
        }

        const parAgentModePromptLegacy = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
        if (invocationContext || parAgentModePromptLegacy || mcpInstructions || bootstrapCtx) {
          const parts = [invocationContext, parAgentModePromptLegacy, bootstrapCtx, mcpInstructions].filter(Boolean);
          if (agentContextHistory) parts.push(agentContextHistory);
          prompt = `${parts.join('\n\n---\n\n')}\n\n---\n\n${message}`;
        } else if (agentContextHistory) {
          prompt = `${agentContextHistory}\n\n---\n\n${message}`;
        } else {
          prompt = message;
        }
      }

      return invokeSingleCat(deps.invocationDeps, {
        agentId,
        service: getService(deps.services, agentId),
        prompt,
        userPrompt: stripLeadingDirectAgentMention(message, agentId, configByAgentId),
        userId,
        threadId,
        ...(targetContentBlocks ? { contentBlocks: targetContentBlocks } : {}),
        ...(targetUploadDir ? { uploadDir: targetUploadDir } : {}),
        ...(options.callbackEnvOverrides ? { callbackEnvOverrides: options.callbackEnvOverrides } : {}),
        ...(signal ? { signal } : {}),
        ...(staticIdentity ? { systemPrompt: staticIdentity } : {}),
        ...(options.gatewayIdentity ? { gatewayIdentity: options.gatewayIdentity } : {}),
        ...(options.interactiveAsk ? { interactiveAsk: true } : {}),
        ...(options.resumeAgentId === agentId ? { resumeSession: true } : {}),
        ...(options.traceId ? { traceId: options.traceId } : {}),
        isLastCat: false,
      });
    }),
  );

  // Yield degradation notifications before streaming starts (BACKLOG #32)
  for (const dm of degradationMsgs) {
    yield dm;
  }

  const agentText = new Map<string, string>();
  const agentTaskRunAccum = new Map<string, TaskRunAccumulator>();
  const agentThinking = new Map<string, string>();
  const agentMeta = new Map<string, MessageMetadata>();
  const agentSawUserFacingSystemInfo = new Map<string, boolean>();
  const agentToolEvents = new Map<string, StoredToolEvent[]>();
  // F060: Collect inline rich blocks per agent from system_info stream
  const agentStreamRichBlocks = new Map<string, import('@openjiuwen/relay-shared').RichBlock[]>();
  const agentErrorText = new Map<string, string>();
  const agentHadError = new Set<string>();
  const agentErrorTransformed = new Set<string>();
  // F22 R2 P1-1: Capture own invocationId per agent from stream
  const agentInvocationId = new Map<string, string>();
  const agentInvocationStartedAt = new Map<string, number>();
  const agentInvocationComplete = new Map<string, { invocationId: string; durationMs: number }>();
  let completedCount = 0;
  let yieldedFinalDone = false;

  // #80: Per-agent draft flush state
  const agentFlushTime = new Map<string, number>();
  const agentFlushLen = new Map<string, number>();
  const agentFlushToolLen = new Map<string, number>();
  const FLUSH_INTERVAL_MS = 2000;
  const FLUSH_CHAR_DELTA = 2000;
  const noop = () => {};

  // Issue #83: Independent keepalive timer — touch draft every 60s during long tool calls.
  const KEEPALIVE_INTERVAL_MS = 60_000;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  // Track which cats have had their keepalive started
  let keepaliveStarted = false;

  for await (const msg of mergeStreams(streams, (idx, err) => {
    log.error({ streamIndex: idx, err }, 'Parallel stream error');
  })) {
    // F22 R2 P1-1: Capture invocationId from the initial system_info per agent.
    // Keep forwarding this boundary event so frontend can reset stale task progress.
    if (msg.type === 'system_info' && msg.content && msg.agentId && !agentInvocationId.has(msg.agentId)) {
      try {
        const parsed = parseSystemInfoContent(msg.content);
        if (!parsed) throw new Error('not parseable system_info');
        if (parsed.type === 'invocation_created' && typeof parsed.invocationId === 'string') {
          agentInvocationId.set(msg.agentId, parsed.invocationId);
          if (!agentInvocationStartedAt.has(msg.agentId)) {
            agentInvocationStartedAt.set(
              msg.agentId,
              typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) ? msg.timestamp : Date.now(),
            );
          }
          // #80 fix: seed flush baseline so interval triggers after FLUSH_INTERVAL_MS
          agentFlushTime.set(msg.agentId, Date.now());
          // Issue #83: Start a single keepalive timer that touches all active drafts.
          if (deps.draftStore && !keepaliveStarted) {
            keepaliveStarted = true;
            keepaliveTimer = setInterval(() => {
              for (const [, invId] of agentInvocationId) {
                deps.draftStore!.touch(userId, threadId, invId)?.catch?.(noop);
              }
            }, KEEPALIVE_INTERVAL_MS);
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
    if (msg.type === 'text' && msg.content && msg.agentId) {
      let acc = agentTaskRunAccum.get(msg.agentId);
      if (!acc) {
        acc = new TaskRunAccumulator();
        agentTaskRunAccum.set(msg.agentId, acc);
      }
      if (acc.isTaskScopedText(msg)) {
        acc.appendText(msg, msg.content);
      } else {
        agentText.set(msg.agentId, (agentText.get(msg.agentId) ?? '') + msg.content);
      }
    }
    // F045: Accumulate thinking blocks per agent for persistence (F5 recovery)
    if (msg.type === 'system_info' && msg.content && msg.agentId) {
      if (isUserFacingSystemInfoContent(msg.content)) {
        agentSawUserFacingSystemInfo.set(msg.agentId, true);
      }
      try {
        const parsed = parseSystemInfoContent(msg.content);
        if (!parsed) throw new Error('not parseable system_info');
        if (parsed.type === 'thinking' && typeof parsed.text === 'string') {
          const prev = agentThinking.get(msg.agentId) ?? '';
          const mergeStrategy = parsed.mergeStrategy === 'append' ? 'append' : 'paragraph';
          agentThinking.set(msg.agentId, appendThinkingChunk(prev, parsed.text, mergeStrategy));
          let acc = agentTaskRunAccum.get(msg.agentId);
          if (!acc) {
            acc = new TaskRunAccumulator();
            agentTaskRunAccum.set(msg.agentId, acc);
          }
          acc.appendThinking(msg, parsed.text, mergeStrategy);
        }
        // F060: Collect inline rich_block for persistence (P1 fix)
        if (parsed.type === 'rich_block' && parsed.block && isValidRichBlock(parsed.block)) {
          const arr = agentStreamRichBlocks.get(msg.agentId) ?? [];
          arr.push(parsed.block);
          agentStreamRichBlocks.set(msg.agentId, arr);
        }
        if (
          parsed.type === 'invocation_metrics' &&
          parsed.kind === 'invocation_complete' &&
          typeof parsed.invocationId === 'string' &&
          typeof parsed.durationMs === 'number' &&
          Number.isFinite(parsed.durationMs)
        ) {
          agentInvocationComplete.set(msg.agentId, {
            invocationId: parsed.invocationId,
            durationMs: parsed.durationMs,
          });
        }
      } catch {
        /* ignore parse errors */
      }
    }
    if (msg.type === 'error' && msg.agentId) {
      agentHadError.add(msg.agentId);
      const rawError = msg.error ?? '';

      // 收集原始错误（用于日志/审计）
      if (rawError) {
        const prev = agentErrorText.get(msg.agentId) ?? '';
        agentErrorText.set(msg.agentId, `${prev}${prev ? '\n' : ''}${rawError}`);
      }

      // ✨ 转换为友好的 text 消息
      const errorKind = classifyError(rawError);
      const errorSerial = generateErrorSerial();
      const friendlyMessage = getFriendlyAgentErrorMessage({
        agentId: msg.agentId,
        error: rawError,
        errorCode: msg.errorCode,
        metadata: msg.metadata,
      }, errorSerial);

      // 写入独立 error 日志（运维可通过序列号快速定位）
      errorAuditLogger.error({
        serial: errorSerial,
        agentId: msg.agentId,
        errorKind,
        rawError,
        threadId,
        traceId: options.traceId,
        timestamp: msg.timestamp,
      }, `Agent error [${errorSerial}]`);

      // 累积到 agentText（和正常 text 一样，用于持久化）
      const prevText = agentText.get(msg.agentId) ?? '';
      agentText.set(msg.agentId, prevText + friendlyMessage);
      agentErrorTransformed.add(msg.agentId); // 标记已转换

      // 构造转换后的消息
      const transformedMsg = {
        type: 'text' as const,
        agentId: msg.agentId,
        content: friendlyMessage,
        timestamp: msg.timestamp,
        metadata: msg.metadata,
        origin: 'stream' as const,
        extra: {
          errorFallback: {
            v: 1 as const,
            kind: errorKind,
            rawError,
            timestamp: msg.timestamp,
            serial: errorSerial,
          },
        },
      };

      // yield 转换后的消息（而不是原始 error）
      yield transformedMsg;
      continue; // ✅ 跳过后面的逻辑
    }
    // F070: done with errorCode (e.g. GOVERNANCE_BOOTSTRAP_REQUIRED) is an error
    // state — mark agentHadError so we don't fall through to silent_completion.
    if (msg.type === 'done' && msg.errorCode && msg.agentId) {
      agentHadError.add(msg.agentId);
    }
    // Accumulate tool events per agent
    const toolEvt = toStoredToolEvent(msg);
    if (toolEvt && msg.agentId) {
      const arr = agentToolEvents.get(msg.agentId) ?? [];
      arr.push(toolEvt);
      agentToolEvents.set(msg.agentId, arr);
      const blocks = richBlocksFromSendFileToUserTool(msg);
      if (blocks.length > 0) {
        const rich = agentStreamRichBlocks.get(msg.agentId) ?? [];
        rich.push(...blocks);
        agentStreamRichBlocks.set(msg.agentId, rich);
      }
    }
    if (msg.agentId) {
      let acc = agentTaskRunAccum.get(msg.agentId);
      if (!acc) {
        acc = new TaskRunAccumulator();
        agentTaskRunAccum.set(msg.agentId, acc);
      }
      if (msg.taskPhase === 'start' || msg.taskPhase === 'complete') {
        acc.onBoundary(msg);
      } else {
        // Task-scoped stream text is accumulated in taskRuns; formal body uses agentText only when not in-task.
        if (toolEvt) {
          acc.appendTool(msg, { ...toolEvt });
        }
      }
    }
    if (msg.metadata && msg.agentId && !agentMeta.has(msg.agentId)) {
      agentMeta.set(msg.agentId, msg.metadata);
    }

    // #80: Draft flush — fire-and-forget periodic persistence per agent
    if (deps.draftStore && msg.agentId && agentInvocationId.has(msg.agentId)) {
      const invId = agentInvocationId.get(msg.agentId)!;
      const now = Date.now();
      const lastFlush = agentFlushTime.get(msg.agentId) ?? now;
      const lastLen = agentFlushLen.get(msg.agentId) ?? 0;
      const curText = agentText.get(msg.agentId) ?? '';
      const charDelta = curText.length - lastLen;

      const lastToolLen = agentFlushToolLen.get(msg.agentId) ?? 0;
      const curTools = agentToolEvents.get(msg.agentId);
      const curToolLen = curTools?.length ?? 0;

      const neverFlushedCat = lastLen === 0 && lastToolLen === 0;
      const taskRunsDraft = agentTaskRunAccum.get(msg.agentId)?.toExtra();
      if (
        msg.type === 'text' &&
        charDelta > 0 &&
        (neverFlushedCat || now - lastFlush >= FLUSH_INTERVAL_MS || charDelta >= FLUSH_CHAR_DELTA)
      ) {
        const curThinking = agentThinking.get(msg.agentId);
        deps.draftStore
          .upsert({
            userId,
            threadId,
            invocationId: invId,
            agentId: msg.agentId as AgentId,
            content: curText,
            ...(curTools && curToolLen > 0 ? { toolEvents: curTools } : {}),
            ...(curThinking ? { thinking: curThinking } : {}),
            ...(taskRunsDraft ? { taskRuns: taskRunsDraft } : {}),
            updatedAt: now,
          })
          ?.catch?.(noop);
        agentFlushTime.set(msg.agentId, now);
        agentFlushLen.set(msg.agentId, curText.length);
        agentFlushToolLen.set(msg.agentId, curToolLen);
      } else if (
        (msg.type === 'tool_use' || msg.type === 'tool_result') &&
        // Cloud R7 P1: bypass interval for the very first flush — tool-first invocations
        // must create a draft immediately, not wait 2s for the interval gate.
        (neverFlushedCat || now - lastFlush >= FLUSH_INTERVAL_MS)
      ) {
        // Cloud R6 P1: upsert when there's unsaved text OR new tool events —
        // tool-first invocations (no text yet) must still create a draft record.
        if (curText.length > lastLen || curToolLen > lastToolLen) {
          const curThinkingTool = agentThinking.get(msg.agentId);
          deps.draftStore
            .upsert({
              userId,
              threadId,
              invocationId: invId,
              agentId: msg.agentId as AgentId,
              content: curText,
              ...(curTools && curToolLen > 0 ? { toolEvents: curTools } : {}),
              ...(curThinkingTool ? { thinking: curThinkingTool } : {}),
              ...(taskRunsDraft ? { taskRuns: taskRunsDraft } : {}),
              updatedAt: now,
            })
            ?.catch?.(noop);
          agentFlushLen.set(msg.agentId, curText.length);
          agentFlushToolLen.set(msg.agentId, curToolLen);
        } else {
          deps.draftStore.touch(userId, threadId, invId)?.catch?.(noop);
        }
        agentFlushTime.set(msg.agentId, now);
      } else if (msg.taskPhase === 'start' || msg.taskPhase === 'complete') {
        const curThinkingTb = agentThinking.get(msg.agentId);
        const tr = agentTaskRunAccum.get(msg.agentId)?.toExtra();
        deps.draftStore
          .upsert({
            userId,
            threadId,
            invocationId: invId,
            agentId: msg.agentId as AgentId,
            content: curText,
            ...(curTools && curToolLen > 0 ? { toolEvents: curTools } : {}),
            ...(curThinkingTb ? { thinking: curThinkingTb } : {}),
            ...(tr ? { taskRuns: tr } : {}),
            updatedAt: now,
          })
          ?.catch?.(noop);
        agentFlushTime.set(msg.agentId, now);
      }
    }

    if (msg.type === 'done' && msg.agentId) {
      completedCount++;
      // F22: Consume MCP-buffered rich blocks BEFORE text/empty branch —
      // blocks must be persisted even when the agent emits no text (cloud Codex P1).
      const ownInvId = agentInvocationId.get(msg.agentId);
      // Issue #83 P2 fix: Remove completed agent from keepalive set.
      // Without this, the shared keepalive timer would touch() a deleted draft,
      // recreating an orphan Redis hash key via HSET.
      agentInvocationId.delete(msg.agentId);
      const bufferedBlocks = getRichBlockBuffer().consume(threadId, msg.agentId, ownInvId);
      const text = agentText.get(msg.agentId);
      if (text) {
        const meta = agentMeta.get(msg.agentId);
        const sanitized = sanitizeInjectedContent(text);
        // F22: Extract cc_rich blocks from text + merge with buffered
        const { cleanText, blocks: textBlocks } = extractRichFromText(sanitized);
        let allRichBlocks = [...bufferedBlocks, ...textBlocks, ...(agentStreamRichBlocks.get(msg.agentId) ?? [])];
        // F34-b: synthesize text-only audio blocks (voice messages)
        // F111: skip synthesis in voiceMode — frontend streams via /api/tts/stream
        if (!voiceMode) {
          const voiceSynth = getVoiceBlockSynthesizer();
          if (voiceSynth && allRichBlocks.some((b) => b.kind === 'audio' && 'text' in b)) {
            try {
              allRichBlocks = await voiceSynth.resolveVoiceBlocks(allRichBlocks, msg.agentId as string);
            } catch (err) {
              log.error({ agentId: msg.agentId, err }, 'Voice block synthesis failed');
            }
          }
        }
        const storedContent = appendGeneratedFileLocationDisclosure(cleanText, allRichBlocks);
        const agentTools = agentToolEvents.get(msg.agentId);
        // A2A only triggers in routeSerial; routeParallel stores mentions
        // but never chains (MVP safety boundary — see Phase 3.9 design doc)
        const mentions = parseA2AMentions(storedContent, msg.agentId as AgentId);
        if (mentions.length === 0 && storedContent.includes('@')) {
          log.debug(
            { threadId, agentId: msg.agentId, contentLen: storedContent.length },
            '[route-parallel] @ found in content but no A2A mention parsed (parallel never chains)',
          );
        } else if (mentions.length > 0) {
          log.debug(
            { threadId, agentId: msg.agentId, mentions },
            '[route-parallel] A2A mentions detected (stored only, not chained)',
          );
        }

        const thinking = agentThinking.get(msg.agentId);
        const parallelTaskRuns = agentTaskRunAccum.get(msg.agentId)?.toExtra();
        const draftStoppedPar = await draftHadUserStopped(deps.draftStore, userId, threadId, ownInvId);
        const streamPar = streamExtraForPersistence(ownInvId, agentInvocationComplete.get(msg.agentId), {
          userStopped: draftStoppedPar,
        });
        try {
          await deps.messageStore.append({
            userId,
            agentId: msg.agentId as AgentId,
            content: storedContent,
            mentions,
            origin: 'stream',
            timestamp: agentInvocationStartedAt.get(msg.agentId) ?? Date.now(),
            threadId,
            ...(thinking ? { thinking } : {}),
            ...(meta ? { metadata: meta } : {}),
            ...(agentTools && agentTools.length > 0 ? { toolEvents: agentTools } : {}),
            extra: {
              ...(allRichBlocks.length > 0 ? { rich: { v: 1 as const, blocks: allRichBlocks } } : {}),
              ...(streamPar ? { stream: streamPar } : {}),
              ...(parallelTaskRuns ? { taskRuns: parallelTaskRuns } : {}),
            },
          });
          // F088-P3: Stash rich blocks for outbound delivery
          if (options.persistenceContext && allRichBlocks.length > 0) {
            options.persistenceContext.richBlocks = [
              ...(options.persistenceContext.richBlocks ?? []),
              ...allRichBlocks,
            ];
          }
          // #80: Clean up draft only after successful append
          if (deps.draftStore && ownInvId) {
            deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
          }
          // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
          if (deps.invocationDeps.threadStore) {
            try {
              await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, msg.agentId as AgentId);
            } catch (activityErr) {
              log.warn({ agentId: msg.agentId, err: activityErr }, 'updateParticipantActivity failed');
            }
          }
        } catch (err) {
          log.error({ agentId: msg.agentId, err }, 'messageStore.append failed, degrading');
          if (options.persistenceContext) {
            options.persistenceContext.failed = true;
            options.persistenceContext.errors.push({
              agentId: msg.agentId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } else if (!agentHadError.has(msg.agentId)) {
        // No text content and no error.
        // Persist only when there is non-text payload (tool/thinking/rich).
        // Purely empty turns should not create blank chat bubbles.
        const meta = agentMeta.get(msg.agentId);
        const agentTools = agentToolEvents.get(msg.agentId);
        const thinking = agentThinking.get(msg.agentId);
        const noTextBlocks = [...bufferedBlocks, ...(agentStreamRichBlocks.get(msg.agentId) ?? [])];
        const hasRichBlocks = noTextBlocks.length > 0;
        const sawUserFacingSystemInfo = agentSawUserFacingSystemInfo.get(msg.agentId) === true;
        const shouldPersistNoTextMessage =
          hasRichBlocks || (agentTools?.length ?? 0) > 0 || Boolean(thinking?.trim().length ?? 0);

        // Diagnostic: if agent ran tools but produced no text, emit a system_info so the
        // user sees *something* instead of a silent vanish (bugfix: silent-exit P1).
        if (agentTools && agentTools.length > 0 && !hasRichBlocks && !sawUserFacingSystemInfo) {
          yield {
            type: 'system_info' as AgentMessageType,
            agentId: msg.agentId,
            content: JSON.stringify({
              type: 'silent_completion',
              detail: `${msg.agentId} completed with tool calls but no text response.`,
              toolCount: agentTools.length,
            }),
            timestamp: Date.now(),
          } as AgentMessage;
        }

        if (shouldPersistNoTextMessage) {
          const parallelTaskRunsNt = agentTaskRunAccum.get(msg.agentId)?.toExtra();
          const draftStoppedNt = await draftHadUserStopped(deps.draftStore, userId, threadId, ownInvId);
          const streamParNt = streamExtraForPersistence(ownInvId, agentInvocationComplete.get(msg.agentId), {
            userStopped: draftStoppedNt,
          });
          try {
            await deps.messageStore.append({
              userId,
              agentId: msg.agentId as AgentId,
              content: appendGeneratedFileLocationDisclosure('', noTextBlocks),
              mentions: [],
              origin: 'stream',
              timestamp: agentInvocationStartedAt.get(msg.agentId) ?? Date.now(),
              threadId,
              ...(thinking ? { thinking } : {}),
              ...(meta ? { metadata: meta } : {}),
              ...(agentTools && agentTools.length > 0 ? { toolEvents: agentTools } : {}),
              extra: {
                ...(noTextBlocks.length > 0 ? { rich: { v: 1 as const, blocks: noTextBlocks } } : {}),
                ...(streamParNt ? { stream: streamParNt } : {}),
                ...(parallelTaskRunsNt ? { taskRuns: parallelTaskRunsNt } : {}),
              },
            });
            // F088-P3: Stash rich blocks for outbound delivery (no-text branch)
            if (options.persistenceContext && noTextBlocks.length > 0) {
              options.persistenceContext.richBlocks = [
                ...(options.persistenceContext.richBlocks ?? []),
                ...noTextBlocks,
              ];
            }
            // #80: Clean up draft only after successful append
            if (deps.draftStore && ownInvId) {
              deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
            }
            // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
            if (deps.invocationDeps.threadStore) {
              try {
                await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, msg.agentId as AgentId);
              } catch (activityErr) {
                log.warn({ agentId: msg.agentId, err: activityErr }, 'updateParticipantActivity failed');
              }
            }
          } catch (err) {
            log.error({ agentId: msg.agentId, err }, 'messageStore.append failed, degrading');
            if (options.persistenceContext) {
              options.persistenceContext.failed = true;
              options.persistenceContext.errors.push({
                agentId: msg.agentId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } else if (!sawUserFacingSystemInfo) {
          yield {
            type: 'system_info' as AgentMessageType,
            agentId: msg.agentId,
            content: JSON.stringify({
              type: 'silent_completion',
              detail: `${msg.agentId} completed without textual output.`,
              toolCount: 0,
            }),
            timestamp: Date.now(),
          } as AgentMessage;
          // No persisted message for fully silent turns.
          if (deps.draftStore && ownInvId) {
            deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
          }
        } else if (deps.draftStore && ownInvId) {
          deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
        }
      } else {
        // hadError but toolEvents exist — persist tool record so refresh shows what was attempted
        const agentTools = agentToolEvents.get(msg.agentId);
        if (agentTools && agentTools.length > 0) {
          const meta = agentMeta.get(msg.agentId);
          const thinking = agentThinking.get(msg.agentId);
          const parallelTaskRunsErr = agentTaskRunAccum.get(msg.agentId)?.toExtra();
          const draftStoppedErr = await draftHadUserStopped(deps.draftStore, userId, threadId, ownInvId);
          const streamParErr = streamExtraForPersistence(ownInvId, agentInvocationComplete.get(msg.agentId), {
            userStopped: draftStoppedErr,
          });
          try {
            await deps.messageStore.append({
              userId,
              agentId: msg.agentId as AgentId,
              content: '',
              mentions: [],
              origin: 'stream',
              timestamp: agentInvocationStartedAt.get(msg.agentId) ?? Date.now(),
              threadId,
              ...(thinking ? { thinking } : {}),
              ...(meta ? { metadata: meta } : {}),
              toolEvents: agentTools,
              ...(streamParErr || parallelTaskRunsErr
                ? {
                    extra: {
                      ...(streamParErr ? { stream: streamParErr } : {}),
                      ...(parallelTaskRunsErr ? { taskRuns: parallelTaskRunsErr } : {}),
                    },
                  }
                : {}),
            });
            // #80: Clean up draft only after successful append
            if (deps.draftStore && ownInvId) {
              deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
            }
            // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
            if (deps.invocationDeps.threadStore) {
              try {
                await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, msg.agentId as AgentId);
              } catch (activityErr) {
                log.warn({ agentId: msg.agentId, err: activityErr }, 'updateParticipantActivity failed');
              }
            }
          } catch (err) {
            log.error({ agentId: msg.agentId, err }, 'messageStore.append (error+tools) failed, degrading');
            if (options.persistenceContext) {
              options.persistenceContext.failed = true;
              options.persistenceContext.errors.push({
                agentId: msg.agentId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }

      // 降级逻辑：仅在错误未被流式循环转换时触发
      // 这种情况理论上不应该发生，但保留作为安全网
      const errorText = agentErrorText.get(msg.agentId);
      if (errorText && !agentErrorTransformed.has(msg.agentId)) {
        log.warn({ agentId: msg.agentId, errorText }, 'Error not transformed in stream loop — fallback persistence');
        const errorKind = classifyError(errorText);
        const errorSerial = generateErrorSerial();
        const friendlyMessage = getFriendlyAgentErrorMessage({
          agentId: msg.agentId,
          error: errorText,
        }, errorSerial);

        // 写入独立 error 日志
        errorAuditLogger.error({
          serial: errorSerial,
          agentId: msg.agentId,
          errorKind,
          rawError: errorText,
          threadId,
          traceId: options.traceId,
          timestamp: Date.now(),
        }, `Agent error [${errorSerial}] (fallback path)`);

        const errorFallback = {
          v: 1 as const,
          kind: errorKind,
          rawError: errorText,
          timestamp: Date.now(),
          serial: errorSerial,
        };

        const parallelTaskRunsFb = agentTaskRunAccum.get(msg.agentId)?.toExtra();
        try {
          await deps.messageStore.append({
            userId, // ← 改为 userId（而非 'system'）
            agentId: msg.agentId, // ← 改为 agentId（而非 null）
            content: friendlyMessage, // ← 友好消息（而非 "Error: ..."）
            mentions: [],
            origin: 'stream',
            timestamp: agentInvocationStartedAt.get(msg.agentId) ?? Date.now(),
            threadId,
            extra: {
              errorFallback,
              ...(parallelTaskRunsFb ? { taskRuns: parallelTaskRunsFb } : {}),
            },
          });
        } catch (err) {
          log.error({ agentId: msg.agentId, err }, 'messageStore.append (error fallback) failed');
        }

        yield {
          type: 'text' as AgentMessageType,
          agentId: msg.agentId as AgentId,
          content: friendlyMessage,
          origin: 'stream',
          extra: {
            errorFallback,
            ...(parallelTaskRunsFb ? { taskRuns: parallelTaskRunsFb } : {}),
          },
          timestamp: Date.now(),
        } as AgentMessage;
      }

      // Ack cursor regardless of error: messages were assembled into the prompt
      // and delivered to the agent. Not acking causes infinite re-delivery.
      if (incrementalMode) {
        const boundaryId = boundaryByCat.get(msg.agentId as AgentId);
        if (boundaryId) {
          if (options.cursorBoundaries) {
            // ADR-008 S3: defer ack — caller acks after invocation succeeds
            upsertMaxBoundary(options.cursorBoundaries, msg.agentId, boundaryId);
          } else if (deps.deliveryCursorStore) {
            // Legacy: ack immediately
            try {
              await deps.deliveryCursorStore.ackCursor(userId, msg.agentId as AgentId, threadId, boundaryId);
            } catch (err) {
              log.error({ agentId: msg.agentId, err }, 'ackCursor failed');
            }
          }
        }
      }

      const isFinal = completedCount === targetAgents.length;

      // F5: When all parallel cats are done, emit follow-up hints for A2A mentions
      if (isFinal) {
        const followupMentions: Array<{ agentId: string; mentionedBy: string }> = [];
        for (const [cid, text] of agentText.entries()) {
          const ms = parseA2AMentions(text, cid as AgentId);
          for (const target of ms) {
            followupMentions.push({ agentId: target, mentionedBy: cid });
          }
        }
        if (followupMentions.length > 0) {
          yield {
            type: 'system_info' as AgentMessageType,
            agentId: msg.agentId as AgentId,
            content: JSON.stringify({
              type: 'a2a_followup_available',
              mentions: followupMentions,
            }),
            timestamp: Date.now(),
          };
        }
      }

      yield { ...msg, isFinal };
      if (isFinal) yieldedFinalDone = true;
    } else {
      yield msg;
    }
  }

  // done-guarantee safety net: synthesize final done if loop exited without one
  if (!yieldedFinalDone && targetAgents.length > 0) {
    yield {
      type: 'done' as AgentMessageType,
      agentId: targetAgents[targetAgents.length - 1]!,
      isFinal: true,
      timestamp: Date.now(),
    } as AgentMessage;
  }

  // Issue #83: Stop keepalive timer — streaming loop has exited.
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = undefined;
  }
}
