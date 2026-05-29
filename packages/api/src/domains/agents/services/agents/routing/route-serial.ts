/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Serial Route Strategy
 * Cats respond one by one, each seeing previous responses.
 *
 * A2A support: after each agent completes, its response is checked for @mentions.
 * If a mention is detected and depth allows, the mentioned agent is appended to the
 * worklist — extending the chain within the SAME function call. This preserves
 * previousResponses continuity and correct isFinal semantics (Codex P1-1, P1-2).
 *
 * A2A only triggers here in routeSerial; routeParallel never chains (MVP safety boundary).
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
import { getAgentVoice } from '../../../../../config/office-claw-voices.js';
import { createModuleLogger, errorAuditLogger } from '../../../../../infrastructure/logger.js';
import { detectUserMention } from '../../../../../routes/user-mention.js';
import { estimateTokens } from '../../../../../utils/token-counter.js';
import { assembleContext } from '../../context/ContextAssembler.js';
import {
  buildInvocationContext,
  buildStaticIdentity,
  createSystemPromptBuilder,
  type InvocationContext,
} from '../../context/SystemPromptBuilder.js';
import { formatDegradationMessage } from '../../orchestration/DegradationPolicy.js';
import { AuditEventTypes, getEventAuditLog } from '../../orchestration/EventAuditLog.js';
import { buildSessionBootstrap } from '../../session/SessionBootstrap.js';
import { hydrateReplyPreview, type StoredToolEvent } from '../../stores/ports/MessageStore.js';
import type { ThreadRoutingPolicyV1 } from '../../stores/ports/ThreadStore.js';
import { getStreamingTtsRegistry, StreamingTtsChunker } from '../../tts/StreamingTtsChunker.js';
import { getVoiceBlockSynthesizer } from '../../tts/VoiceBlockSynthesizer.js';
import type { AgentMessage, AgentMessageType, MessageMetadata } from '../../types.js';
import { invokeSingleCat } from '../invocation/invoke-single-agent.js';
import { buildMcpCallbackInstructions, needsMcpInjection } from '../invocation/McpPromptInjector.js';
import { getRichBlockBuffer } from '../invocation/RichBlockBuffer.js';
import { resolveDefaultClaudeMcpServerPath } from '../providers/ClaudeAgentService.js';
import { getMaxA2ADepth, parseA2AMentions } from '../routing/a2a-mentions.js';
import { registerWorklist, unregisterWorklist } from '../routing/WorklistRegistry.js';
import { parseSystemInfoContent } from './parse-system-info.js';
import { draftHadUserStopped, type InvocationCompleteMetrics, streamExtraForPersistence } from './stream-extra-persist.js';
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

const log = createModuleLogger('route-serial');

export async function* routeSerial(
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
    queueHasQueuedMessages,
    hasQueuedOrActiveAgent,
    configByAgentId,
  } = options;
  const promptBuilder = createSystemPromptBuilder(configByAgentId);
  const previousResponses: { agentId: AgentId; content: string }[] = [];
  const thinkingMode = options.thinkingMode ?? 'play';
  // P2-3 fix: also consider default MCP server path (ClaudeAgentService has fallback resolution)
  const mcpServerPath = process.env.OFFICE_CLAW_MCP_SERVER_PATH || resolveDefaultClaudeMcpServerPath();
  const incrementalMode = Boolean(currentUserMessageId && deps.deliveryCursorStore);

  // Worklist pattern: starts with targetAgents, may grow via A2A mentions
  // F27: Register worklist so callback A2A can push targets here
  // F108: Key by parentInvocationId for concurrent isolation
  const worklist = [...targetAgents];
  const maxDepth = options.maxA2ADepth ?? getMaxA2ADepth();
  const worklistEntry = registerWorklist(threadId, worklist, maxDepth, options.parentInvocationId);
  let a2aDepthWarningEmitted = false;

  let index = 0;
  // done-guarantee: Track whether we yielded a done(isFinal=true) so the finally block can
  // synthesize one if the loop exits early (e.g. signal.aborted break at top of while).
  let yieldedFinalDone = false;
  // F27: Track how many worklist entries have had a2a_handoff emitted
  let handoffEmitted = targetAgents.length; // Original targets don't get handoff events
  // F042 Wave 3: Fetch thread participant activity once before loop (threadId doesn't change).
  let activeParticipants: { agentId: AgentId; lastMessageAt: number; messageCount: number }[] = [];
  if (deps.invocationDeps.threadStore) {
    try {
      activeParticipants = await deps.invocationDeps.threadStore.getParticipantsWithActivity(threadId);
    } catch {
      /* best-effort: activity fetch failure does not block invocation */
    }
  }
  // F042: Fetch thread routingPolicy once before loop (threadId doesn't change).
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

  try {
    while (index < worklist.length) {
      if (signal?.aborted) break;
      const agentId = worklist[index]!;

      // Only pass images/uploads for the first agent (user's original target)
      const isOriginalTarget = index < targetAgents.length;
      const targetContentBlocks = isOriginalTarget ? routeContentBlocksForCat(agentId, contentBlocks) : undefined;
      const targetUploadDir = targetContentBlocks ? uploadDir : undefined;

      let prompt = message;
      if (!incrementalMode && previousResponses.length > 0) {
        const contextParts = previousResponses.map((r) => `[${r.agentId} responded: ${r.content}]`);
        prompt = `${message}\n\n${contextParts.join('\n')}`;
      }

      // Build identity: static goes in -p content (+ systemPrompt as defense-in-depth), dynamic in -p only
      const agentConfig: OfficeClawConfigEntry | undefined = resolveAgentConfig(agentId as string, configByAgentId);
      const isRelayClaw = agentConfig?.provider === 'relayclaw';
      const teammates = [...new Set(worklist.filter((id) => id !== agentId))];
      const directMessageFrom = worklistEntry.a2aFrom.get(agentId);
      const streamReplyTo = worklistEntry.a2aTriggerMessageId.get(agentId);
      const streamReplyPreview = streamReplyTo
        ? await hydrateReplyPreview(deps.messageStore, streamReplyTo)
        : undefined;
      let mentionRoutingFeedback = null;
      if (deps.invocationDeps.threadStore) {
        try {
          mentionRoutingFeedback = await deps.invocationDeps.threadStore.consumeMentionRoutingFeedback(threadId, agentId);
        } catch (feedbackErr) {
          log.warn({ agentId: agentId as string, err: feedbackErr }, 'consumeMentionRoutingFeedback failed');
        }
      }
      // MCP documentation: Claude's MCP_TOOLS_SECTION → staticIdentity (in -p content).
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
        mode: worklist.length > 1 ? 'serial' : 'independent',
        chainIndex: index + 1,
        chainTotal: worklist.length,
        teammates,
        mcpAvailable,
        runtimeClock: { nowMs: Date.now() },
        ...(promptTags && promptTags.length > 0 ? { promptTags } : {}),
        a2aEnabled: worklistEntry.a2aCount < maxDepth,
        ...(directMessageFrom ? { directMessageFrom } : {}),
        ...(mentionRoutingFeedback ? { mentionRoutingFeedback } : {}),
        ...(activeParticipants.length > 0 ? { activeParticipants } : {}),
        ...(routingPolicy ? { routingPolicy } : {}),
        ...(sopStageHint ? { sopStageHint } : {}),
        ...(voiceMode ? { voiceMode } : {}),
        ...(bootcampState ? { bootcampState, threadId } : {}),
      }, isRelayClaw ? { compactRelayContext: true } : undefined);

      // F24 Phase E: Bootstrap context for Session #2+
      let bootstrapContext = '';
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
            bootstrapContext = bootstrap.text;
          }
        } catch {
          // Best-effort: bootstrap failure doesn't block invocation
        }
      }

      let deliveryBoundaryId: string | undefined;
      if (incrementalMode) {
        // Serial incremental mode depends on AgentRouter having appended current user message first.
        // We still explicitly include `message` when that message is not present in unseen rows.

        // A+ fix: calculate effective context budget by deducting ALL system parts from maxPromptTokens.
        // Without this, context (up to maxContextTokens=160k) + system parts (~15-20k) can exceed maxPromptTokens.
        const agentModePromptForBudget = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
        const incBudget = getAgentContextBudget(agentId as string);
        const incSystemTokens = estimateTokens(
          [staticIdentity, invocationContext, agentModePromptForBudget, bootstrapContext, mcpInstructions]
            .filter(Boolean)
            .join('\n'),
        );
        const incMessageTokens = estimateTokens(message);
        const effectiveContextBudget = Math.min(
          Math.max(0, incBudget.maxPromptTokens - incSystemTokens - incMessageTokens - 200),
          incBudget.maxContextTokens,
        );

        const inc = await assembleIncrementalContext(
          deps,
          userId,
          threadId,
          agentId,
          currentUserMessageId,
          thinkingMode,
          { effectiveMaxContextTokens: effectiveContextBudget, cursorBoundaries: options.cursorBoundaries },
        );
        deliveryBoundaryId = inc.boundaryId;
        if (inc.degradation) {
          yield {
            type: 'system_info' as AgentMessageType,
            agentId,
            content: inc.degradation,
            timestamp: Date.now(),
          } as AgentMessage;
        }
        const agentModePrompt = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
        const parts = [invocationContext, agentModePrompt, bootstrapContext, mcpInstructions].filter(Boolean);
        if (inc.contextText) parts.push(inc.contextText);
        // F35 fix: only inject raw message when it was genuinely absent from unseen rows.
        // If it was present but filtered out (e.g. whisper), injecting would leak private content.
        if (!inc.includesCurrentUserMessage && !inc.currentMessageFilteredOut) parts.push(message);
        prompt = parts.join('\n\n---\n\n');
      } else {
        // Per-agent context budget (Phase 4.0): assemble context with agent-specific limits
        let agentContextHistory = contextHistory; // fallback to legacy pre-assembled
        if (history && history.length > 0 && !contextHistory) {
          const budget = getAgentContextBudget(agentId as string);
          // F8: token-based budget — estimate non-context tokens, remainder goes to context
          // A+ fix: include agentModePrompt + bootstrapContext in system parts estimate (P2-1)
          const agentModePromptLegacyForBudget = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
          const systemPartsTokens = estimateTokens(
            [staticIdentity, invocationContext, agentModePromptLegacyForBudget, bootstrapContext, mcpInstructions]
              .filter(Boolean)
              .join('\n'),
          );
          const promptTokens = estimateTokens(prompt);
          const budgetForContext = Math.max(0, budget.maxPromptTokens - systemPartsTokens - promptTokens - 200);
          const { contextText, messageCount } = assembleContext(history, {
            maxMessages: budget.maxMessages,
            maxContentLength: budget.maxContentLengthPerMsg,
            maxTotalTokens: Math.min(budgetForContext, budget.maxContextTokens),
          });
          agentContextHistory = contextText || undefined;

          // Degradation check: notify user if context was truncated (count budget or char budget)
          const degradation = detectContextDegradation(history.length, messageCount, budget);
          if (degradation?.degraded) {
            yield {
              type: 'system_info' as AgentMessageType,
              agentId,
              content: formatDegradationMessage(degradation),
              timestamp: Date.now(),
            } as AgentMessage;
          }
        }

        const agentModePromptLegacy = modeSystemPromptByCat?.[agentId as string] ?? modeSystemPrompt;
        if (invocationContext || agentModePromptLegacy || mcpInstructions || bootstrapContext) {
          const parts = [invocationContext, agentModePromptLegacy, bootstrapContext, mcpInstructions].filter(Boolean);
          if (agentContextHistory) parts.push(agentContextHistory);
          prompt = `${parts.join('\n\n---\n\n')}\n\n---\n\n${prompt}`;
        } else if (agentContextHistory) {
          prompt = `${agentContextHistory}\n\n---\n\n${prompt}`;
        }
      }

      let textContent = '';
      let thinkingContent = '';
      let firstMetadata: MessageMetadata | undefined;
      let doneMsg: AgentMessage | undefined;
      let hadError = false;
      let sawUserFacingSystemInfo = false;
      // Collect error text separately for system-message persistence (F5 reload)
      let collectedErrorText = '';
      const collectedToolEvents: StoredToolEvent[] = [];
      const taskRunAccum = new TaskRunAccumulator();
      // F060: Collect rich blocks emitted inline via system_info (not MCP buffer)
      const streamRichBlocks: import('@openjiuwen/relay-shared').RichBlock[] = [];
      // F22 R2 P1-1: Capture own invocationId from stream (not getLatestId)
      let ownInvocationId: string | undefined;
      let invocationStartedAt: number | undefined;
      let lastInvocationCompleteMetrics: InvocationCompleteMetrics | undefined;
      // F111 Phase B: Streaming TTS chunker for real-time voice (voiceMode only)
      let voiceChunker: StreamingTtsChunker | undefined;

      // #80: Draft flush state — periodic persistence for F5 recovery
      let lastFlushTime = Date.now();
      let lastFlushLen = 0;
      let lastFlushToolLen = 0;
      let lastFlushThinkingLen = 0;
      let hadErrorTransformed = false; // Track if error was transformed in stream loop
      const FLUSH_INTERVAL_MS = 200;
      const FLUSH_CHAR_DELTA = 2000;
      const noop = () => {};

      // Issue #83: Independent keepalive timer — touch draft every 60s during long tool calls.
      // Stream events alone can't keep draft alive when tools execute silently for >300s.
      const KEEPALIVE_INTERVAL_MS = 60_000;
      let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

      // Always pass isLastCat:false — we set isFinal AFTER A2A detection
      log.debug(
        { agentId: agentId as string, threadId, promptLength: prompt.length, index, worklistSize: worklist.length },
        'Invoking agent via invokeSingleCat',
      );
      for await (const msg of invokeSingleCat(deps.invocationDeps, {
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
        ...(options.parentInvocationId ? { parentInvocationId: options.parentInvocationId } : {}),
        ...(options.interactiveAsk ? { interactiveAsk: true } : {}),
        ...(options.resumeAgentId === agentId ? { resumeSession: true } : {}),
        ...(options.traceId ? { traceId: options.traceId } : {}),
        // F121: Pass A2A trigger message ID for auto-replyTo threading
        ...(worklistEntry.a2aTriggerMessageId.get(agentId)
          ? { a2aTriggerMessageId: worklistEntry.a2aTriggerMessageId.get(agentId) }
          : {}),
        isLastCat: false,
      })) {
        // F39 bugfix: stop yielding after cancel (pipe buffer may still drain)
        if (signal?.aborted) break;

        if (msg.type === 'system_info' && msg.content) {
          try {
            const parsed = parseSystemInfoContent(msg.content);
            if (
              parsed &&
              parsed.type === 'invocation_metrics' &&
              parsed.kind === 'invocation_complete' &&
              typeof parsed.invocationId === 'string' &&
              typeof parsed.durationMs === 'number' &&
              Number.isFinite(parsed.durationMs)
            ) {
              lastInvocationCompleteMetrics = {
                invocationId: parsed.invocationId,
                durationMs: parsed.durationMs,
              };
            }
          } catch {
            /* ignore */
          }
        }

        // F22 R2 P1-1: Capture invocationId from the initial system_info.
        // Keep forwarding this boundary event so frontend can reset stale task progress.
        if (msg.type === 'system_info' && msg.content && !ownInvocationId) {
          try {
            const parsed = parseSystemInfoContent(msg.content);
            if (!parsed) throw new Error('not parseable system_info');
            if (parsed.type === 'invocation_created' && typeof parsed.invocationId === 'string') {
              ownInvocationId = parsed.invocationId;
              if (invocationStartedAt === undefined) {
                invocationStartedAt =
                  typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) ? msg.timestamp : Date.now();
              }
              // F111 Phase B: Start streaming TTS when we have an invocationId
              if (voiceMode && deps.socketManager) {
                const ttsRegistry = getStreamingTtsRegistry();
                if (ttsRegistry) {
                  voiceChunker = new StreamingTtsChunker({
                    agentId: agentId as string,
                    invocationId: ownInvocationId!,
                    threadId,
                    voiceConfig: getAgentVoice(agentId as string),
                    broadcaster: deps.socketManager,
                    ttsRegistry,
                    signal,
                  });
                }
              }
              // Issue #83: Start keepalive timer once we have an invocationId.
              // This ensures draft TTL is renewed even during long silent tool calls.
              if (deps.draftStore && !keepaliveTimer) {
                const keepInvId = ownInvocationId!;
                keepaliveTimer = setInterval(() => {
                  deps.draftStore!.touch(userId, threadId, keepInvId)?.catch?.(noop);
                }, KEEPALIVE_INTERVAL_MS);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        }
        if (msg.type === 'text' && msg.content) {
          if (taskRunAccum.isTaskScopedText(msg)) {
            taskRunAccum.appendText(msg, msg.content);
          } else {
            textContent += msg.content;
          }
          voiceChunker?.feed(msg.content);
        }
        // F045: Accumulate thinking blocks for persistence (F5 recovery)
        if (msg.type === 'system_info' && msg.content) {
          if (isUserFacingSystemInfoContent(msg.content)) {
            sawUserFacingSystemInfo = true;
          }
          try {
            const parsed = parseSystemInfoContent(msg.content);
            if (!parsed) throw new Error('not parseable system_info');
            if (parsed.type === 'thinking' && typeof parsed.text === 'string') {
              const mergeStrategy = parsed.mergeStrategy === 'append' ? 'append' : 'paragraph';
              thinkingContent = appendThinkingChunk(thinkingContent, parsed.text, mergeStrategy);
              taskRunAccum.appendThinking(msg, parsed.text, mergeStrategy);
            }
            // F060: Collect inline rich_block for persistence (P1 fix)
            if (parsed.type === 'rich_block' && parsed.block && isValidRichBlock(parsed.block)) {
              streamRichBlocks.push(parsed.block);
            }
          } catch {
            /* ignore parse errors */
          }
        }
        // Accumulate tool events for persistence (before draft flush so current event is available)
        const toolEvt = toStoredToolEvent(msg);
        if (toolEvt) {
          collectedToolEvents.push(toolEvt);
          streamRichBlocks.push(...richBlocksFromSendFileToUserTool(msg));
        }

        if (msg.taskPhase === 'start' || msg.taskPhase === 'complete') {
          taskRunAccum.onBoundary(msg);
        } else {
          // Assistant formal content uses textContent; task-scoped `type=text` is routed to taskRuns only.
          if (toolEvt) {
            taskRunAccum.appendTool(msg, { ...toolEvt });
          }
        }

      // #80: Draft flush — paced persistence for F5 recovery.
      // Scheme A (strong consistency mode): persist text/thinking before those
      // chunks are yielded to frontend, minimizing visible-but-unpersisted gap.
        if (deps.draftStore && ownInvocationId) {
          const now = Date.now();
          const charDelta = textContent.length - lastFlushLen;
        const thinkingDelta = thinkingContent.length - lastFlushThinkingLen;
        const thinkingUpdated = msg.type === 'system_info' && thinkingDelta > 0;
          const taskBoundary = msg.taskPhase === 'start' || msg.taskPhase === 'complete';
          const neverFlushed = lastFlushLen === 0 && lastFlushToolLen === 0;
          if (
          (msg.type === 'text' && charDelta > 0) ||
          thinkingUpdated ||
          taskBoundary ||
          ((msg.type === 'tool_use' || msg.type === 'tool_result') &&
            (neverFlushed || now - lastFlushTime >= FLUSH_INTERVAL_MS))
          ) {
          try {
            const taskRunsDraft = taskRunAccum.toExtra();
            await deps.draftStore.upsert({
              userId,
              threadId,
              invocationId: ownInvocationId,
              agentId,
              content: textContent,
              ...(collectedToolEvents.length > 0 ? { toolEvents: collectedToolEvents } : {}),
              ...(thinkingContent ? { thinking: thinkingContent } : {}),
              ...(taskRunsDraft ? { taskRuns: taskRunsDraft } : {}),
              updatedAt: now,
            });
          } catch {
            /* best-effort */
          }
            lastFlushTime = now;
            lastFlushLen = textContent.length;
            lastFlushToolLen = collectedToolEvents.length;
          lastFlushThinkingLen = thinkingContent.length;
        } else if (now - lastFlushTime >= FLUSH_INTERVAL_MS) {
          // Heartbeat for non-content events: keep draft alive during long silent phases.
          if (
            textContent.length > lastFlushLen ||
            collectedToolEvents.length > lastFlushToolLen ||
            thinkingContent.length > lastFlushThinkingLen
          ) {
            try {
              const taskRunsDraftHb = taskRunAccum.toExtra();
              await deps.draftStore.upsert({
                userId,
                threadId,
                invocationId: ownInvocationId,
                agentId,
                content: textContent,
                ...(collectedToolEvents.length > 0 ? { toolEvents: collectedToolEvents } : {}),
                ...(thinkingContent ? { thinking: thinkingContent } : {}),
                ...(taskRunsDraftHb ? { taskRuns: taskRunsDraftHb } : {}),
                updatedAt: now,
              });
            } catch {
              /* best-effort */
            }
            lastFlushLen = textContent.length;
            lastFlushToolLen = collectedToolEvents.length;
            lastFlushThinkingLen = thinkingContent.length;
          } else {
              try {
                await deps.draftStore.touch(userId, threadId, ownInvocationId);
              } catch {
                /* best-effort */
              }
          }
          lastFlushTime = now;
          }
        }

        if (msg.type === 'error') {
          hadError = true;
          const rawError = msg.error ?? '';

          // 收集原始错误（用于日志/审计）
          if (rawError) {
            collectedErrorText += `${collectedErrorText ? '\n' : ''}${rawError}`;
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

          // 累积到 textContent（和正常 text 一样，用于持久化）
          textContent += friendlyMessage;
          hadErrorTransformed = true; // 标记已转换

          // 构造转换后的消息
          const transformedMsg = {
            type: 'text' as const,
            agentId: msg.agentId,
            content: friendlyMessage,
            timestamp: msg.timestamp,
            metadata: msg.metadata,
            origin: 'stream' as const,
            ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
            ...(streamReplyPreview ? { replyPreview: streamReplyPreview } : {}),
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

          // Error text is persisted on message.content; do not duplicate into taskRuns segments.

          // yield 转换后的消息（而不是原始 error）
          yield transformedMsg;
          continue; // ✅ 跳过后面的逻辑，但不影响后续消息处理
        }
        // F070: done with errorCode (e.g. GOVERNANCE_BOOTSTRAP_REQUIRED) is an error
        // state — mark hadError so we don't fall through to silent_completion.
        if (msg.type === 'done' && msg.errorCode) {
          hadError = true;
        }
        if (msg.metadata && !firstMetadata) {
          firstMetadata = msg.metadata;
        }
        if (msg.type === 'done') {
          doneMsg = msg; // Buffer — yield after A2A detection
        } else {
          // Tag CLI stdout text with origin: 'stream' (thinking/internal)
          yield msg.type === 'text'
            ? {
                ...msg,
                origin: 'stream' as const,
                ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
                ...(streamReplyPreview ? { replyPreview: streamReplyPreview } : {}),
              }
            : msg;
        }
      }

      // Issue #83: Stop keepalive timer — streaming loop has exited.
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = undefined;
      }

      // F111 Phase B: Flush remaining buffered text and send voice_stream_end
      let voiceTotalChunks = 0;
      if (voiceChunker) {
        try {
          voiceTotalChunks = await voiceChunker.flush();
        } catch (err) {
          log.error({ err }, 'Voice chunker flush failed');
        }
        if (deps.socketManager && voiceChunker.hasStarted()) {
          const aborted = signal?.aborted ?? false;
          deps.socketManager.broadcastToRoom(`thread:${threadId}`, 'voice_stream_end', {
            type: 'voice_stream_end',
            agentId: agentId as string,
            invocationId: ownInvocationId ?? '',
            threadId,
            totalChunks: aborted ? -1 : voiceTotalChunks,
          });
        }
        voiceChunker = undefined;
      }

      let a2aMentions: AgentId[] = [];

      // F22: Consume MCP-buffered rich blocks BEFORE the text/empty branch —
      // blocks must be persisted even when the agent emits no text (cloud Codex P1).
      const bufferedBlocks = getRichBlockBuffer().consume(threadId, agentId as string, ownInvocationId);

      const draftUserStoppedForStream = await draftHadUserStopped(deps.draftStore, userId, threadId, ownInvocationId);
      const streamStoppedPersist = { userStopped: draftUserStoppedForStream };

      // F061: Detect @co-creator mentions in agent response for browser notification
      let mentionsUser = false;

      if (textContent) {
        const sanitized = sanitizeInjectedContent(textContent);

        // F22: Extract cc_rich blocks from text (Route B fallback for non-MCP cats)
        const { cleanText, blocks: textBlocks } = extractRichFromText(sanitized);
        let allRichBlocks = [...bufferedBlocks, ...textBlocks, ...streamRichBlocks];

        // F34-b: Resolve voice blocks (audio with text, no url) — Route B path.
        // Route A blocks were already resolved in the callback handler.
        // F111: When voiceMode is active, skip full synthesis so audio blocks
        // arrive at the frontend with text but no url — the frontend will use
        // /api/tts/stream for chunked streaming playback (<2s first-audio).
        if (!voiceMode) {
          const voiceSynth = getVoiceBlockSynthesizer();
          if (voiceSynth && allRichBlocks.some((b) => b.kind === 'audio' && 'text' in b)) {
            try {
              allRichBlocks = await voiceSynth.resolveVoiceBlocks(allRichBlocks, agentId as string);
            } catch (err) {
              log.error({ agentId: agentId as string, err }, 'Voice block synthesis failed');
            }
          }
        }
        const storedContent = appendGeneratedFileLocationDisclosure(cleanText, allRichBlocks);

        // In play mode, CLI stream output (thinking) is hidden from other cats.
        // Only share previousResponses in debug mode where cats see each other's thinking.
        // Important: push after review gate mutation so downstream cats see invalid-review marker.
        if (!incrementalMode && thinkingMode === 'debug') {
          previousResponses.push({ agentId, content: storedContent });
        }

        // A2A mention detection (Codex P1-3: only after full text accumulated)
        // Line-start @mention = always actionable (no keyword gate)
        a2aMentions = parseA2AMentions(storedContent, agentId);
        if (a2aMentions.length === 0 && storedContent.includes('@')) {
          log.debug(
            { threadId, agentId, contentLen: storedContent.length },
            'A2A text-scan: @ found in content but no mention parsed (check if @ is at line start)',
          );
        }

        const storedTimestamp = invocationStartedAt ?? Date.now();

        // F061: Detect @co-creator mentions in agent response for browser notification
        mentionsUser = storedContent ? detectUserMention(storedContent) : false;

        // Store with actual mentions — degrade on failure to ensure done reaches frontend
        // (Codex review P1-2: Redis failure must not block done yield)
        let storedMsgId: string | undefined;
        const streamPersist = streamExtraForPersistence(ownInvocationId, lastInvocationCompleteMetrics, streamStoppedPersist);
        try {
          const storedMsg = await deps.messageStore.append({
            userId,
            agentId,
            content: storedContent,
            mentions: a2aMentions,
            origin: 'stream',
            timestamp: storedTimestamp,
            threadId,
            ...(mentionsUser ? { mentionsUser } : {}),
            ...(thinkingContent ? { thinking: thinkingContent } : {}),
            ...(firstMetadata ? { metadata: firstMetadata } : {}),
            ...(collectedToolEvents.length > 0 ? { toolEvents: collectedToolEvents } : {}),
            ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
            extra: {
              ...(allRichBlocks.length > 0 ? { rich: { v: 1 as const, blocks: allRichBlocks } } : {}),
              ...(streamPersist ? { stream: streamPersist } : {}),
              ...(taskRunAccum.toExtra() ? { taskRuns: taskRunAccum.toExtra()! } : {}),
            },
          });
          storedMsgId = storedMsg.id;
          // F088-P3: Stash rich blocks for outbound delivery
          if (options.persistenceContext && allRichBlocks.length > 0) {
            options.persistenceContext.richBlocks = allRichBlocks;
          }
          // #80: Clean up draft only after successful append (guard: keep draft if append fails)
          if (deps.draftStore && ownInvocationId) {
            deps.draftStore.delete(userId, threadId, ownInvocationId)?.catch?.(noop);
          }
          // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
          if (deps.invocationDeps.threadStore) {
            try {
              await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, agentId);
            } catch (activityErr) {
              log.warn({ agentId: agentId as string, err: activityErr }, 'updateParticipantActivity failed');
            }
          }
        } catch (err) {
          log.error({ agentId: agentId as string, err }, 'messageStore.append failed, degrading');
          if (options.persistenceContext) {
            options.persistenceContext.failed = true;
            options.persistenceContext.errors.push({
              agentId: agentId as string,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // A2A: extend worklist if mention found + depth allows + queue fairness gate
        // F27: dedup only against pending (not-yet-executed) tail — cats that already ran
        // can be re-enqueued for another round (e.g. A→B→A review ping-pong).
        let queuedMessagesPending = false;
        if (queueHasQueuedMessages) {
          try {
            queuedMessagesPending = queueHasQueuedMessages(threadId);
          } catch {
            queuedMessagesPending = false;
          }
        }

        // Diagnostic: log when A2A text-scan gate blocks (previously silent)
        if (a2aMentions.length > 0) {
          if (queuedMessagesPending) {
            log.info(
              { threadId, agentId, a2aMentions, a2aCount: worklistEntry.a2aCount },
              'A2A text-scan blocked: user messages pending in queue (fairness gate)',
            );
          } else if (worklistEntry.a2aCount >= maxDepth) {
            log.info(
              { threadId, agentId, a2aMentions, a2aCount: worklistEntry.a2aCount, maxDepth },
              'A2A text-scan blocked: depth limit reached',
            );
            if (!a2aDepthWarningEmitted) {
              a2aDepthWarningEmitted = true;
              yield {
                type: 'system_info' as AgentMessageType,
                agentId,
                content: JSON.stringify({
                  type: 'warning',
                  message: `智能体间链式调用已达到最大深度限制：${maxDepth}，调用停止`,
                }),
                timestamp: Date.now(),
              } as AgentMessage;
            }
          } else if (signal?.aborted) {
            log.info({ threadId, agentId, a2aMentions }, 'A2A text-scan blocked: signal aborted');
          }
        }

        if (a2aMentions.length > 0 && worklistEntry.a2aCount < maxDepth && !signal?.aborted && !queuedMessagesPending) {
          const pendingTail = worklist.slice(index + 1);
          const pendingOriginalTargets = targetAgents.slice(index + 1);
          for (const nextAgent of a2aMentions) {
            if (worklistEntry.a2aCount >= maxDepth) break;
            // A2A cross-path dedup: skip if this agent was already dispatched via callback (InvocationQueue)
            if (hasQueuedOrActiveAgent && hasQueuedOrActiveAgent(threadId, nextAgent)) {
              log.info(
                { threadId, agentId: nextAgent, fromAgent: agentId },
                'A2A text-scan dedup: agent already in InvocationQueue, skipping',
              );
              continue;
            }
            if (pendingTail.includes(nextAgent)) {
              // Keep original user-selected targets replying to user, not to another agent.
              if (!pendingOriginalTargets.includes(nextAgent)) {
                worklistEntry.a2aFrom.set(nextAgent, agentId);
                // F121: response-text path — set trigger message for auto-replyTo
                if (storedMsgId) worklistEntry.a2aTriggerMessageId.set(nextAgent, storedMsgId);
              }
              continue;
            }

            worklist.push(nextAgent);
            worklistEntry.a2aCount++;
            pendingTail.push(nextAgent); // Keep dedup view in sync
            worklistEntry.a2aFrom.set(nextAgent, agentId);
            // F121: response-text path — set trigger message for auto-replyTo
            if (storedMsgId) worklistEntry.a2aTriggerMessageId.set(nextAgent, storedMsgId);
          }
        }

        // F27: Emit a2a_handoff for ALL new A2A targets (both response-text and callback-pushed).
        // We track which targets have already been announced to avoid duplicate handoff events.
        for (let wi = handoffEmitted; wi < worklist.length; wi++) {
          const pendingAgent = worklist[wi]!;
          if (wi < targetAgents.length) continue; // Skip original targets — not A2A

          // === A2A_HANDOFF 审计 (fire-and-forget, Codex review P2-3) ===
          const auditLog = getEventAuditLog();
          auditLog
            .append({
              type: AuditEventTypes.A2A_HANDOFF,
              threadId,
              data: {
                fromAgent: agentId,
                toAgent: pendingAgent,
                userId,
                a2aDepth: worklistEntry.a2aCount,
                maxDepth,
              },
            })
            .catch((err) => {
              log.warn({ threadId, fromAgent: agentId, toAgent: pendingAgent, err }, 'A2A_HANDOFF audit write failed');
            });

          const nextConfig: OfficeClawConfigEntry | undefined = resolveAgentConfig(
            pendingAgent as string,
            configByAgentId,
          );
          yield {
            type: 'a2a_handoff' as AgentMessageType,
            agentId,
            content: `${agentConfig?.displayName ?? agentId} → ${nextConfig?.displayName ?? pendingAgent}`,
            timestamp: Date.now(),
          } as AgentMessage;
        }
        handoffEmitted = worklist.length;
      } else if (!hadError) {
        // No text content and no error.
        // Persist only when we have non-text payload (tool/thinking/rich).
        // Purely empty turns should not create blank chat bubbles.
        const noTextBlocks = [...bufferedBlocks, ...streamRichBlocks];
        const hasRichBlocks = noTextBlocks.length > 0;
        const shouldPersistNoTextMessage =
          hasRichBlocks || collectedToolEvents.length > 0 || Boolean(thinkingContent?.trim().length > 0);

        log.debug(
          {
            agentId: agentId as string,
            threadId,
            hasRichBlocks,
            sawUserFacingSystemInfo,
            toolCount: collectedToolEvents.length,
            shouldPersist: shouldPersistNoTextMessage,
            thinkingLen: thinkingContent?.length ?? 0,
          },
          'Cat produced no text — evaluating silent_completion',
        );
        // Diagnostic: if agent ran tools but produced no text, emit a system_info so the
        // user sees *something* instead of a silent vanish (bugfix: silent-exit P1).
        if (collectedToolEvents.length > 0 && !hasRichBlocks && !sawUserFacingSystemInfo) {
          yield {
            type: 'system_info' as AgentMessageType,
            agentId,
            content: JSON.stringify({
              type: 'silent_completion',
              detail: `${agentConfig?.displayName ?? (agentId as string)} completed with tool calls but no text response.`,
              toolCount: collectedToolEvents.length,
            }),
            timestamp: Date.now(),
          } as AgentMessage;
        }

        if (shouldPersistNoTextMessage) {
          try {
            const streamPersistNt = streamExtraForPersistence(ownInvocationId, lastInvocationCompleteMetrics, streamStoppedPersist);
            await deps.messageStore.append({
              userId,
              agentId,
              content: appendGeneratedFileLocationDisclosure('', noTextBlocks),
              mentions: [],
              origin: 'stream',
              timestamp: invocationStartedAt ?? Date.now(),
              threadId,
              ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
              ...(thinkingContent ? { thinking: thinkingContent } : {}),
              ...(firstMetadata ? { metadata: firstMetadata } : {}),
              ...(collectedToolEvents.length > 0 ? { toolEvents: collectedToolEvents } : {}),
              extra: {
                ...(noTextBlocks.length > 0 ? { rich: { v: 1 as const, blocks: noTextBlocks } } : {}),
                ...(streamPersistNt ? { stream: streamPersistNt } : {}),
                ...(taskRunAccum.toExtra() ? { taskRuns: taskRunAccum.toExtra()! } : {}),
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
            if (deps.draftStore && ownInvocationId) {
              deps.draftStore.delete(userId, threadId, ownInvocationId)?.catch?.(noop);
            }
            // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
            if (deps.invocationDeps.threadStore) {
              try {
                await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, agentId);
              } catch (activityErr) {
                log.warn({ agentId: agentId as string, err: activityErr }, 'updateParticipantActivity failed');
              }
            }
          } catch (err) {
            log.error({ agentId: agentId as string, err }, 'messageStore.append failed, degrading');
            if (options.persistenceContext) {
              options.persistenceContext.failed = true;
              options.persistenceContext.errors.push({
                agentId: agentId as string,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } else if (!sawUserFacingSystemInfo) {
          yield {
            type: 'system_info' as AgentMessageType,
            agentId,
            content: JSON.stringify({
              type: 'silent_completion',
              detail: `${agentConfig?.displayName ?? (agentId as string)} completed without textual output.`,
              toolCount: 0,
            }),
            timestamp: Date.now(),
          } as AgentMessage;
          // No persisted message for fully silent turns.
          if (deps.draftStore && ownInvocationId) {
            deps.draftStore.delete(userId, threadId, ownInvocationId)?.catch?.(noop);
          }
        } else if (deps.draftStore && ownInvocationId) {
          deps.draftStore.delete(userId, threadId, ownInvocationId)?.catch?.(noop);
        }
      } else if (collectedToolEvents.length > 0) {
        // hadError && textContent === '' but toolEvents exist — persist tool record so
        // refreshing the page still shows what the agent attempted before the error.
        try {
          const streamPersistTools = streamExtraForPersistence(ownInvocationId, lastInvocationCompleteMetrics, streamStoppedPersist);
          await deps.messageStore.append({
            userId,
            agentId,
            content: '',
            mentions: [],
            origin: 'stream',
            timestamp: invocationStartedAt ?? Date.now(),
            threadId,
            ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
            ...(firstMetadata ? { metadata: firstMetadata } : {}),
            toolEvents: collectedToolEvents,
            ...(streamPersistTools || taskRunAccum.toExtra()
              ? {
                  extra: {
                    ...(streamPersistTools ? { stream: streamPersistTools } : {}),
                    ...(taskRunAccum.toExtra() ? { taskRuns: taskRunAccum.toExtra()! } : {}),
                  },
                }
              : {}),
          });
          // #80: Clean up draft only after successful append
          if (deps.draftStore && ownInvocationId) {
            deps.draftStore.delete(userId, threadId, ownInvocationId)?.catch?.(noop);
          }
          // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
          if (deps.invocationDeps.threadStore) {
            try {
              await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, agentId);
            } catch (activityErr) {
              log.warn({ agentId: agentId as string, err: activityErr }, 'updateParticipantActivity failed');
            }
          }
        } catch (err) {
          log.error({ agentId: agentId as string, err }, 'messageStore.append (error+tools) failed, degrading');
          if (options.persistenceContext) {
            options.persistenceContext.failed = true;
            options.persistenceContext.errors.push({
              agentId: agentId as string,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } else {
        // hadError && textContent === '' && no toolEvents → clean up draft only
        if (deps.draftStore && ownInvocationId) {
          deps.draftStore.delete(userId, threadId, ownInvocationId)?.catch?.(noop);
        }
        // Update activity for error-only responses (no text/tools branch handles it)
        if (deps.invocationDeps.threadStore) {
          try {
            await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, agentId);
          } catch (activityErr) {
            log.warn({ agentId: agentId as string, err: activityErr }, 'updateParticipantActivity failed');
          }
        }
      }

      // 降级逻辑：仅在错误未被流式循环转换时触发
      // 这种情况理论上不应该发生，但保留作为安全网
      if (collectedErrorText && !hadErrorTransformed) {
        log.warn(
          { agentId: agentId as string, collectedErrorText },
          'Error not transformed in stream loop — fallback persistence',
        );
        const errorKind = classifyError(collectedErrorText);
        const errorSerial = generateErrorSerial();
        const friendlyMessage = getFriendlyAgentErrorMessage({
          agentId: agentId as string,
          error: collectedErrorText,
        }, errorSerial);

        // 写入独立 error 日志
        errorAuditLogger.error({
          serial: errorSerial,
          agentId: agentId as string,
          errorKind,
          rawError: collectedErrorText,
          threadId,
          traceId: options.traceId,
          timestamp: Date.now(),
        }, `Agent error [${errorSerial}] (fallback path)`);

        const errorFallback = {
          v: 1 as const,
          kind: errorKind,
          rawError: collectedErrorText,
          timestamp: Date.now(),
          serial: errorSerial,
        };

        try {
          const streamPersistFb = streamExtraForPersistence(ownInvocationId, lastInvocationCompleteMetrics, streamStoppedPersist);
          await deps.messageStore.append({
            userId, // ← 改为 userId（而非 'system'）
            agentId, // ← 改为 agentId（而非 null）
            content: friendlyMessage, // ← 友好消息（而非 "Error: ..."）
            mentions: [],
            origin: 'stream',
            timestamp: invocationStartedAt ?? Date.now(),
            threadId,
            extra: {
              errorFallback,
              ...(streamPersistFb ? { stream: streamPersistFb } : {}),
              ...(taskRunAccum.toExtra() ? { taskRuns: taskRunAccum.toExtra()! } : {}),
            },
          });
        } catch (err) {
          log.error({ agentId: agentId as string, err }, 'messageStore.append (error fallback) failed');
        }

        yield {
          type: 'text' as AgentMessageType,
          agentId,
          content: friendlyMessage,
          origin: 'stream',
          extra: {
            errorFallback,
            ...(taskRunAccum.toExtra() ? { taskRuns: taskRunAccum.toExtra()! } : {}),
          },
          timestamp: Date.now(),
        } as AgentMessage;
      }

      // Ack cursor regardless of hadError: messages were assembled into the prompt
      // and delivered to the agent. Not acking causes infinite re-delivery on subsequent
      // rounds (bug: "砚砚每次都疯狂回之前的消息").
      if (incrementalMode && deliveryBoundaryId) {
        if (options.cursorBoundaries) {
          // ADR-008 S3: defer ack — caller acks after invocation succeeds
          upsertMaxBoundary(options.cursorBoundaries, agentId, deliveryBoundaryId);
        } else if (deps.deliveryCursorStore) {
          // Legacy: ack immediately (deprecated route() path)
          try {
            await deps.deliveryCursorStore.ackCursor(userId, agentId, threadId, deliveryBoundaryId);
          } catch (err) {
            log.error({ agentId: agentId as string, err }, 'ackCursor failed');
          }
        }
      }

      // Yield buffered done with correct isFinal (evaluated AFTER worklist may have grown)
      // MUST always reach here regardless of append success (Codex review P1-2)
      if (doneMsg) {
        const isFinal = index === worklist.length - 1;
        yield { ...doneMsg, ...(mentionsUser ? { mentionsUser } : {}), isFinal };
        if (isFinal) yieldedFinalDone = true;
      }

      // F27: Advance executedIndex so pushToWorklist knows which cats are done
      worklistEntry.executedIndex = index + 1;
      index++;
    }
  } finally {
    // F27: Always unregister worklist, even on error/abort.
    // Pass owner ref so preempting new invocation's worklist is not deleted (Codex R1 P1-1)
    unregisterWorklist(threadId, worklistEntry, options.parentInvocationId);

    // done-guarantee safety net: If loop exited without yielding a final done
    // (e.g. signal.aborted break at top of while, or provider threw before done),
    // synthesize one so the frontend always receives isFinal=true and clears its timer.
    if (!yieldedFinalDone && worklist.length > 0) {
      const lastAgentId = worklist[Math.min(index, worklist.length - 1)]!;
      yield {
        type: 'done' as AgentMessageType,
        agentId: lastAgentId,
        isFinal: true,
        timestamp: Date.now(),
      } as AgentMessage;
    }
  }
}
