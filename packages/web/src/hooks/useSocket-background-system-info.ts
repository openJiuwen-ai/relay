/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { coercePptStudioSlidesUpdate, coercePptStudioStatus } from '@/components/ppt-studio/ppt-studio-types';
import type { TaskProgressItem } from '@/stores/chat-types';
import type {
  BackgroundAgentMessage,
  BackgroundStreamRef,
  HandleBackgroundMessageOptions,
} from './useSocket-background.types';
import { parseSystemInfoContent } from './parse-system-info';

interface SystemInfoConsumeResult {
  consumed: boolean;
  content: string;
  variant: 'info' | 'warning' | 'a2a_followup';
}

function recoverBackgroundStreamingMessage(
  msg: BackgroundAgentMessage,
  options: HandleBackgroundMessageOptions,
): string | undefined {
  const streamKey = `${msg.threadId}::${msg.agentId}`;
  const threadMessages = options.store.getThreadState(msg.threadId).messages;
  for (let i = threadMessages.length - 1; i >= 0; i--) {
    const message = threadMessages[i];
    if (message.type === 'assistant' && message.agentId === msg.agentId && message.isStreaming) {
      options.bgStreamRefs.set(streamKey, { id: message.id, threadId: msg.threadId, agentId: msg.agentId });
      if (msg.metadata) {
        options.store.setThreadMessageMetadata(msg.threadId, message.id, msg.metadata);
      }
      return message.id;
    }
  }
  return undefined;
}

export function consumeBackgroundSystemInfo(
  msg: BackgroundAgentMessage,
  existingRef: BackgroundStreamRef | undefined,
  options: HandleBackgroundMessageOptions,
): SystemInfoConsumeResult {
  let sysContent = msg.content ?? '';
  let sysVariant: 'info' | 'warning' | 'a2a_followup' = 'info';
  let consumed = false;

  try {
    const parsed = parseSystemInfoContent(sysContent);
    if (!parsed) throw new Error('not parseable system_info');
    if (parsed?.type === 'ppt_studio_page') {
      const sessionUpdate = coercePptStudioSlidesUpdate(parsed);
      if (sessionUpdate) {
        options.store.upsertPptStudioSlides(msg.threadId, sessionUpdate);
        consumed = true;
      }
    } else if (parsed?.type === 'ppt_studio_export') {
      const status = coercePptStudioStatus(parsed.status);
      if (status) {
        options.store.setPptStudioStatus(msg.threadId, status);
        consumed = true;
      }
    } else if (parsed?.type === 'invocation_created') {
      const targetCatId = parsed.agentId ?? msg.agentId;
      const invocationId = typeof parsed.invocationId === 'string' ? parsed.invocationId : undefined;
      // #586: Clear stale finalizedBgRef so previous invocation's finalized bubble
      // can't be overwritten by the next invocation's callback.
      const bgStreamKey = `${msg.threadId}::${targetCatId}`;
      options.finalizedBgRefs.delete(bgStreamKey);
      if (targetCatId && invocationId) {
        options.store.setThreadLoading(msg.threadId, true);
        options.store.addThreadActiveInvocation(msg.threadId, invocationId, targetCatId, 'execute');
        options.store.updateThreadAgentStatus(msg.threadId, targetCatId, 'streaming');
        options.store.setThreadAgentInvocation(msg.threadId, targetCatId, {
          invocationId,
          startedAt: Date.now(),
          taskProgress: {
            tasks: [],
            lastUpdate: Date.now(),
            snapshotStatus: 'running',
            lastInvocationId: invocationId,
          },
        });
        const targetId = existingRef?.id ?? recoverBackgroundStreamingMessage(msg, options);
        if (targetId) {
          options.store.setThreadMessageStreamInvocation(msg.threadId, targetId, invocationId);
        }
        consumed = true;
      }
    } else if (parsed?.type === 'invocation_metrics') {
      if (parsed.kind === 'session_started') {
        options.store.setThreadAgentInvocation(msg.threadId, msg.agentId, {
          sessionId: parsed.sessionId,
          invocationId: parsed.invocationId,
          startedAt: Date.now(),
          taskProgress: { tasks: [], lastUpdate: 0 },
          ...(parsed.sessionSeq !== undefined ? { sessionSeq: parsed.sessionSeq, sessionSealed: false } : {}),
        });
      } else if (parsed.kind === 'invocation_complete') {
        const completeInvId = typeof parsed.invocationId === 'string' ? parsed.invocationId : undefined;
        const dur =
          typeof parsed.durationMs === 'number' && Number.isFinite(parsed.durationMs) ? parsed.durationMs : undefined;
        options.store.setThreadAgentInvocation(msg.threadId, msg.agentId, {
          ...(dur !== undefined ? { durationMs: dur } : {}),
          sessionId: parsed.sessionId,
        });
        if (dur !== undefined && dur >= 0 && completeInvId) {
          const threadMsgs = options.store.getThreadState(msg.threadId).messages;
          const hit = threadMsgs.find(
            (m) =>
              m.type === 'assistant' &&
              m.agentId === msg.agentId &&
              m.extra?.stream?.invocationId === completeInvId,
          );
          if (hit) {
            options.store.setThreadMessageStreamExecutionDuration(msg.threadId, hit.id, dur);
          }
        }
      }
      consumed = true;
    } else if (parsed?.type === 'invocation_usage') {
      options.store.setThreadAgentInvocation(msg.threadId, msg.agentId, {
        usage: parsed.usage,
      });
      if (existingRef?.id) {
        options.store.setThreadMessageUsage(msg.threadId, existingRef.id, parsed.usage);
      }
      consumed = true;
    } else if (parsed?.type === 'context_health') {
      const targetCatId = parsed.agentId ?? msg.agentId;
      options.store.setThreadAgentInvocation(msg.threadId, targetCatId, {
        contextHealth: parsed.health,
      });
      consumed = true;
    } else if (parsed?.type === 'rate_limit') {
      const targetCatId = parsed.agentId ?? msg.agentId;
      options.store.setThreadAgentInvocation(msg.threadId, targetCatId, {
        rateLimit: {
          ...(typeof parsed.utilization === 'number' ? { utilization: parsed.utilization } : {}),
          ...(typeof parsed.resetsAt === 'string' ? { resetsAt: parsed.resetsAt } : {}),
        },
      });
      consumed = true;
    } else if (parsed?.type === 'compact_boundary') {
      const targetCatId = parsed.agentId ?? msg.agentId;
      options.store.setThreadAgentInvocation(msg.threadId, targetCatId, {
        compactBoundary: {
          ...(typeof parsed.preTokens === 'number' ? { preTokens: parsed.preTokens } : {}),
        },
      });
      consumed = true;
    } else if (parsed?.type === 'task_progress') {
      const targetCatId = parsed.agentId ?? msg.agentId;
      const currentInvocationId =
        typeof parsed.invocationId === 'string'
          ? parsed.invocationId
          : options.store.getThreadState(msg.threadId).agentInvocations[targetCatId]?.invocationId;
      const tasks = (parsed.tasks ?? []) as TaskProgressItem[];
      options.store.setThreadAgentInvocation(msg.threadId, targetCatId, {
        taskProgress: {
          tasks,
          lastUpdate: Date.now(),
          snapshotStatus: 'running',
          ...(currentInvocationId ? { lastInvocationId: currentInvocationId } : {}),
        },
      });
      consumed = true;
    } else if (parsed?.type === 'web_search') {
      // F045: web_search tool event (privacy: no query, count only) — render as ToolEvent, not raw JSON
      const count = typeof parsed.count === 'number' ? parsed.count : 1;
      let targetId = existingRef?.id;
      if (!targetId) {
        targetId = recoverBackgroundStreamingMessage(msg, options);
      }
      if (!targetId) {
        // Create placeholder assistant bubble if needed (mirrors thinking path)
        const streamKey = `${msg.threadId}::${msg.agentId}`;
        targetId = `bg-web-${Date.now()}-${msg.agentId}-${options.nextBgSeq()}`;
        const invocationId = options.store.getThreadState(msg.threadId).agentInvocations[msg.agentId]?.invocationId;
        options.bgStreamRefs.set(streamKey, { id: targetId, threadId: msg.threadId, agentId: msg.agentId });
        options.store.addMessageToThread(msg.threadId, {
          id: targetId,
          type: 'assistant',
          agentId: msg.agentId,
          content: '',
          ...(msg.metadata ? { metadata: msg.metadata } : {}),
          ...(invocationId ? { extra: { stream: { invocationId } } } : {}),
          timestamp: msg.timestamp,
          isStreaming: true,
          origin: 'stream',
        });
      }

      options.store.appendToolEventToThread(msg.threadId, targetId, {
        id: `bg-web-search-${msg.timestamp}-${options.nextBgSeq()}`,
        type: 'tool_use',
        label: `${msg.agentId} → web_search${count > 1 ? ` x${count}` : ''}`,
        timestamp: msg.timestamp,
      });
      consumed = true;
    } else if (parsed?.type === 'rich_block') {
      // F22: Append rich block — mirror foreground path (useAgentMessages.ts)
      let targetId: string | undefined;

      // Prefer messageId correlation from callback post-message path
      if (parsed.messageId) {
        const found = options.store
          .getThreadState(msg.threadId)
          .messages.find((m: { id: string }) => m.id === parsed.messageId);
        if (found) targetId = found.id;
      }

      // Fallback: most recent callback message from this cat
      if (!targetId) {
        const threadMessages = options.store.getThreadState(msg.threadId).messages;
        for (let i = threadMessages.length - 1; i >= 0; i--) {
          const m = threadMessages[i];
          if (m.type !== 'assistant' || m.agentId !== msg.agentId) continue;
          if (m.origin === 'stream' && m.isStreaming) break;
          if (m.origin === 'callback') {
            targetId = m.id;
            break;
          }
        }
      }

      // Final fallback: recover active stream bubble or create placeholder
      if (!targetId) {
        targetId = existingRef?.id ?? recoverBackgroundStreamingMessage(msg, options);
      }
      if (!targetId) {
        // No existing bubble — create placeholder (mirrors foreground ensureActiveAssistantMessage)
        const streamKey = `${msg.threadId}::${msg.agentId}`;
        targetId = `bg-rich-${Date.now()}-${msg.agentId}-${options.nextBgSeq()}`;
        const invocationId = options.store.getThreadState(msg.threadId).agentInvocations[msg.agentId]?.invocationId;
        options.bgStreamRefs.set(streamKey, { id: targetId, threadId: msg.threadId, agentId: msg.agentId });
        options.store.addMessageToThread(msg.threadId, {
          id: targetId,
          type: 'assistant',
          agentId: msg.agentId,
          content: '',
          ...(msg.metadata ? { metadata: msg.metadata } : {}),
          ...(invocationId ? { extra: { stream: { invocationId } } } : {}),
          timestamp: msg.timestamp,
          isStreaming: true,
          origin: 'stream',
        });
      }

      if (parsed.block) {
        options.store.appendRichBlockToThread(msg.threadId, targetId, parsed.block);
      }
      consumed = true;
    } else if (parsed?.type === 'liveness_warning') {
      // F118 Phase C: Liveness warning — update cat status + invocation snapshot (mirror foreground)
      const level = parsed.level as 'alive_but_silent' | 'suspected_stall';
      options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, level);
      options.store.setThreadAgentInvocation(msg.threadId, msg.agentId, {
        livenessWarning: {
          level,
          state: parsed.state as 'active' | 'busy-silent' | 'idle-silent' | 'dead',
          silenceDurationMs: parsed.silenceDurationMs as number,
          cpuTimeMs: typeof parsed.cpuTimeMs === 'number' ? parsed.cpuTimeMs : undefined,
          processAlive: parsed.processAlive as boolean,
          receivedAt: Date.now(),
        },
      });
      consumed = true;
    } else if (parsed?.type === 'timeout_diagnostics') {
      // F118 AC-C3: Timeout diagnostics — consume silently in background threads.
      // Foreground uses pendingTimeoutDiagRef (React ref) to attach to error messages;
      // background threads don't have that mechanism, so we just suppress the raw JSON.
      consumed = true;
    } else if (parsed?.type === 'warning') {
      // F045: item-level warning — render as readable system message (mirror foreground)
      const warningText = typeof parsed.message === 'string' ? parsed.message : '';
      sysContent = warningText ? `⚠️ ${warningText}` : '⚠️ Warning';
      sysVariant = 'warning';
    } else if (parsed?.type === 'processing_status') {
      // RelayClaw processing heartbeat — keep background cat status fresh without a raw JSON bubble.
      const processingStatus = parsed.status as string;
      if (processingStatus !== 'idle') {
        options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, 'streaming');
      }
      consumed = true;
    } else if (parsed?.type === 'strategy_allow_compress' || parsed?.type === 'resume_failure_stats') {
      // Internal telemetry — suppress to avoid raw JSON bubbles in background threads
      consumed = true;
    } else if (parsed?.type === 'session_seal_requested') {
      if (parsed.agentId) {
        options.store.setThreadAgentInvocation(msg.threadId, parsed.agentId, {
          sessionSeq: parsed.sessionSeq,
          sessionSealed: true,
        });
        const pct = parsed.healthSnapshot?.fillRatio ? Math.round(parsed.healthSnapshot.fillRatio * 100) : '?';
        sysContent = `${parsed.agentId} 的会话 #${parsed.sessionSeq} 已封存（上下文 ${pct}%），下次调用将自动创建新会话`;
      }
    } else if (parsed?.type === 'a2a_followup_available') {
      const mentions = parsed.mentions as Array<{ agentId: string; mentionedBy: string }>;
      if (Array.isArray(mentions) && mentions.length > 0) {
        sysContent = mentions.map((m) => `${m.mentionedBy} @了 ${m.agentId}`).join('、');
        sysVariant = 'a2a_followup';
      }
    } else if (parsed?.type === 'mode_switch_proposal') {
      const by = parsed.proposedBy ?? '智能体';
      sysContent = `${by} 提议切换到 ${parsed.proposedMode} 模式。`;
    } else if (parsed?.type === 'silent_completion') {
      // Bugfix: silent-exit — cat ran tools but produced no text response
      const detail = typeof parsed.detail === 'string' ? parsed.detail : '';
      sysContent = detail || `${msg.agentId} completed without a text response.`;
    } else if (parsed?.type === 'invocation_preempted') {
      // Bugfix: silent-exit — invocation was superseded by a newer request
      sysContent = 'This response was superseded by a newer request.';
    } else if (parsed?.type === 'thinking') {
      // F045: Embed thinking into the assistant bubble (matches foreground path)
      const thinkingText = parsed.text ?? '';
      if (thinkingText) {
        let targetId = existingRef?.id;
        if (!targetId) {
          targetId = recoverBackgroundStreamingMessage(msg, options);
        }
        if (!targetId) {
          // Thinking arrived before any text/tool chunk — create placeholder assistant bubble
          const streamKey = `${msg.threadId}::${msg.agentId}`;
          targetId = `bg-think-${Date.now()}-${msg.agentId}-${options.nextBgSeq()}`;
          const invocationId = options.store.getThreadState(msg.threadId).agentInvocations[msg.agentId]?.invocationId;
          options.bgStreamRefs.set(streamKey, { id: targetId, threadId: msg.threadId, agentId: msg.agentId });
          options.store.addMessageToThread(msg.threadId, {
            id: targetId,
            type: 'assistant',
            agentId: msg.agentId,
            content: '',
            ...(msg.metadata ? { metadata: msg.metadata } : {}),
            ...(invocationId ? { extra: { stream: { invocationId } } } : {}),
            timestamp: msg.timestamp,
            isStreaming: true,
            origin: 'stream',
          });
        }
        options.store.setThreadMessageThinking(msg.threadId, targetId, thinkingText);
      }
      consumed = true;
    }
  } catch {
    // Not JSON; keep original content as user-facing system info.
  }

  return { consumed, content: sysContent, variant: sysVariant };
}
