/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * RelayClaw Agent Service
 *
 * Thin orchestration layer:
 * - optional sidecar bootstrap
 * - persistent WS connection
 * - request/response streaming
 */

import { createHash, randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import type { AgentId, AgentTaskContextPayload, RelayClawAgentConfig } from '@openjiuwen/relay-shared';
import { createAgentId } from '@openjiuwen/relay-shared';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import { findMonorepoRoot } from '../../../../../utils/monorepo-root.js';
import type { AgentMessage, AgentService, AgentServiceOptions, MessageMetadata, TokenUsage } from '../../types.js';

const log = createModuleLogger('relayclaw-agent');
import { buildLocalUploadPathHints } from './image-cli-bridge.js';
import { extractUploadRefs } from './image-paths.js';
import {
  getJiuwenPermissionBridge,
  type JiuwenAskUserQuestionPayload,
  type JiuwenBridgeAnswerSubmission,
  type JiuwenPermissionBridge,
  type JiuwenUserAnswer,
} from '../../auth/JiuwenPermissionBridge.js';
import { getAskUserQuestionBridge, type AskUserQuestionBridge } from '../../ask/AskUserQuestionBridge.js';
import {
  FrameQueue,
  RelayClawConnectionManager,
  type RelayClawConnection,
  type RelayClawConnectionFactory,
} from './relayclaw-connection.js';
import { buildOfficeClawMcpRequestConfig } from './relayclaw-office-claw-mcp.js';
import {
  DefaultRelayClawSidecarController,
  isSidecarReady,
  type RelayClawSidecarController,
  type RelayClawSidecarControllerDeps,
} from './relayclaw-sidecar.js';
import { isRelayClawTransportErrorText, transformRelayClawChunk } from './relayclaw-event-transform.js';

const DEFAULT_RELAYCLAW_TIMEOUT_MS = 60 * 24 * 7 * 60 * 1000;
const RELAYCLAW_INTERRUPT_ACK_TIMEOUT_MS = 1_500;
const AUTO_APPROVE_PERMISSION_INTERRUPT_ENV = 'OFFICE_CLAW_AUTO_APPROVE_PERMISSION_INTERRUPT';
const ALLOW_ONCE_LABEL = '本次允许';

export interface RelayClawAgentServiceOptions {
  agentId?: AgentId;
  config: RelayClawAgentConfig;
}

export interface RelayClawAgentServiceDeps {
  createConnection?: RelayClawConnectionFactory;
  createSidecarController?: (agentId: AgentId, config: RelayClawAgentConfig) => RelayClawSidecarController;
  sidecarDeps?: RelayClawSidecarControllerDeps;
  permissionBridge?: JiuwenPermissionBridge;
  askUserQuestionBridge?: AskUserQuestionBridge;
}

interface RelayClawScopeDescriptor {
  key: string;
  homeDir?: string;
}

interface RelayClawScopeRuntime {
  scopeKey: string;
  homeDir?: string;
  requestQueues: Map<string, FrameQueue>;
  connection: RelayClawConnection;
  sidecar: RelayClawSidecarController;
  resolvedUrl: string | null;
  disposeRequested: boolean;
  disposeReason: string | null;
}

export interface RelayClawRuntimeHandle {
  scopeKey: string;
  homeDir?: string;
  requestQueues: Map<string, FrameQueue>;
  connection: RelayClawConnection;
  sidecar: RelayClawSidecarController;
  resolvedUrl: string | null;
}

function agentMsg(type: AgentMessage['type'], agentId: AgentId, content?: string): AgentMessage {
  return { type, agentId, content, timestamp: Date.now() };
}

function findTaskStackIndex(stack: AgentTaskContextPayload[], taskId: string): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.id === taskId) return i;
  }
  return -1;
}

function updateRelayClawTaskStack(stack: AgentTaskContextPayload[], message: AgentMessage): void {
  if (message.taskPhase === 'complete' && message.taskContext) {
    const idx = findTaskStackIndex(stack, message.taskContext.id);
    if (idx >= 0) stack.splice(idx);
  } else if (message.taskPhase === 'start' && message.taskContext) {
    stack.push(message.taskContext);
  }
}

function attachRelayClawStreamTaskContext(stack: AgentTaskContextPayload[], message: AgentMessage): AgentMessage {
  if (message.type === 'session_init' || message.type === 'done') return message;
  if (message.taskPhase === 'start' || message.taskPhase === 'complete') return message;
  const top = stack[stack.length - 1];
  if (!top) return message;
  return { ...message, taskContext: top };
}

function resolveRelayClawSessionId(channelId: string, options?: AgentServiceOptions): string {
  const existingSessionId = options?.cliSessionId?.trim() || options?.sessionId?.trim();
  if (existingSessionId) return existingSessionId;

  const auditContext = options?.auditContext;
  if (auditContext?.threadId && auditContext.userId && auditContext.agentId) {
    const digest = createHash('sha256')
      .update(`${auditContext.userId}\n${auditContext.agentId}\n${auditContext.threadId}`)
      .digest('hex')
      .slice(0, 24);
    return `${channelId}_${digest}`;
  }

  return `${channelId}_${Date.now().toString(16)}_${randomUUID().slice(0, 12)}`;
}

function buildRelayClawFilesPayload(
  contentBlocks: AgentServiceOptions['contentBlocks'],
  uploadDir?: string,
): Record<string, unknown> | undefined {
  const uploadRefs = extractUploadRefs(contentBlocks, uploadDir);
  if (uploadRefs.length === 0) return undefined;
  return {
    uploaded: uploadRefs.map((ref, index) => ({
      type: ref.kind,
      name: ref.fileName || basename(ref.path) || `${ref.kind}-${index + 1}`,
      path: ref.path,
    })),
  };
}

function mergeCallbackEnv(options?: AgentServiceOptions): Record<string, string> {
  return {
    ...(options?.callbackEnv ?? {}),
    ...(options?.callbackEnvOverrides ?? {}),
  };
}

function shouldAutoApprovePermissionInterrupt(options?: AgentServiceOptions): boolean {
  return mergeCallbackEnv(options)[AUTO_APPROVE_PERMISSION_INTERRUPT_ENV] === '1';
}

function resolveAllowOnceAnswer(payload: JiuwenAskUserQuestionPayload): JiuwenUserAnswer[] | null {
  const question = Array.isArray(payload.questions) ? payload.questions[0] : undefined;
  const allowOnceLabel = question?.options?.find((option) => option.label === ALLOW_ONCE_LABEL)?.label;
  if (!allowOnceLabel) return null;
  return [{ selected_options: [allowOnceLabel] }];
}

export class RelayClawAgentService implements AgentService {
  private readonly agentId: AgentId;
  private readonly config: RelayClawAgentConfig;
  private readonly createConnection: RelayClawConnectionFactory;
  private readonly createSidecarController: (agentId: AgentId, config: RelayClawAgentConfig) => RelayClawSidecarController;
  private readonly permissionBridge: JiuwenPermissionBridge;
  private readonly askUserQuestionBridge: AskUserQuestionBridge;
  private readonly scopes = new Map<string, RelayClawScopeRuntime>();
  private disposeRequested = false;

  constructor(options: RelayClawAgentServiceOptions, deps?: RelayClawAgentServiceDeps) {
    this.agentId = options.agentId ?? createAgentId('relayclaw-agent');
    this.config = options.config;
    this.createConnection =
      deps?.createConnection ?? ((requestQueues) => new RelayClawConnectionManager({ requestQueues }));
    this.createSidecarController =
      deps?.createSidecarController ??
      ((agentId, config) => new DefaultRelayClawSidecarController(agentId, config, deps?.sidecarDeps));
    this.permissionBridge = deps?.permissionBridge ?? getJiuwenPermissionBridge();
    this.askUserQuestionBridge = deps?.askUserQuestionBridge ?? getAskUserQuestionBridge();
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    if (this.disposeRequested) {
      yield {
        type: 'error',
        agentId: this.agentId,
        error: 'jiuwen service is reloading; please retry the request',
        timestamp: Date.now(),
      };
      return;
    }

    const signal = buildSignal(this.config.timeoutMs ?? DEFAULT_RELAYCLAW_TIMEOUT_MS, options?.signal);
    const channelId = this.config.channelId ?? 'officeclaw';
    const sessionId = resolveRelayClawSessionId(channelId, options);
    const scope = this.resolveScope(options);
    const runtime = this.getOrCreateScopeRuntime(scope);
    yield { type: 'session_init', agentId: this.agentId, sessionId, timestamp: Date.now() };

    try {
      await this.ensureConnected(runtime, signal, options);
    } catch (err) {
      yield {
        type: 'error',
        agentId: this.agentId,
        error: `jiuwen connection failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
      return;
    }

    const requestId = randomUUID();
    const queue = new FrameQueue();
    runtime.requestQueues.set(requestId, queue);
    const onAbort = () => {
      void (async () => {
        await this.sendInterrupt(runtime, channelId, sessionId, requestId);
      })();
      queue.abort();
    };
    signal.addEventListener('abort', onAbort, { once: true });

    const sendTs = Date.now();
    const taskStack: AgentTaskContextPayload[] = [];
    try {
      const request = buildRequest(requestId, channelId, sessionId, prompt, options);
      log.info(
        { requestId, agentId: this.agentId, sessionId, promptLen: prompt.length, traceId: options?.auditContext?.traceId },
        'jiuwen request sent',
      );
      runtime.connection.send(request);
      yield* this.consumeFrames(runtime, requestId, queue, signal, options, sendTs, taskStack);
    } catch (err) {
      if (options?.signal?.aborted) {
        yield agentMsg('done', this.agentId);
      } else {
        yield {
          type: 'error',
          agentId: this.agentId,
          error: `jiuwen error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      runtime.requestQueues.delete(requestId);
      this.disposeScopeIfIdle(runtime, runtime.disposeReason ?? 'request_completed');
    }
  }

  dispose(): void {
    for (const [scopeKey, runtime] of this.scopes.entries()) {
      log.info({ agentId: this.agentId, scopeKey }, 'relayclaw service disposing scope');
      runtime.connection.close();
      runtime.sidecar.stop('service_disposed');
      runtime.requestQueues.clear();
    }
  }

  listRelayClawRuntimeHandles(): RelayClawRuntimeHandle[] {
    return Array.from(this.scopes.values(), (runtime) => ({
      scopeKey: runtime.scopeKey,
      homeDir: runtime.homeDir,
      requestQueues: runtime.requestQueues,
      connection: runtime.connection,
      sidecar: runtime.sidecar,
      resolvedUrl: runtime.resolvedUrl ?? this.config.url ?? null,
    }));
  }

  async ensureRelayClawRuntimeHandle(options?: AgentServiceOptions): Promise<RelayClawRuntimeHandle> {
    if (this.disposeRequested) {
      throw new Error('jiuwen service is reloading; please retry the request');
    }

    const signal = buildSignal(this.config.timeoutMs ?? DEFAULT_RELAYCLAW_TIMEOUT_MS, options?.signal);
    const scope = this.resolveScope(options);
    const runtime = this.getOrCreateScopeRuntime(scope);
    await this.ensureConnected(runtime, signal, options);
    return {
      scopeKey: runtime.scopeKey,
      homeDir: runtime.homeDir,
      requestQueues: runtime.requestQueues,
      connection: runtime.connection,
      sidecar: runtime.sidecar,
      resolvedUrl: runtime.resolvedUrl ?? this.config.url ?? null,
    };
  }

  private resolveScope(options?: AgentServiceOptions): RelayClawScopeDescriptor {
    if (!this.config.autoStart) {
      return { key: `external:${this.config.url ?? ''}` };
    }

    const callbackEnv = mergeCallbackEnv(options);
    const apiBase = callbackEnv.API_BASE || callbackEnv.OPENAI_BASE_URL || callbackEnv.OPENAI_API_BASE || '';
    const apiKey = callbackEnv.API_KEY || callbackEnv.OPENAI_API_KEY || callbackEnv.OPENROUTER_API_KEY || '';
    const modelName = this.config.modelName?.trim() || '';
    const scopeHash = createHash('sha256').update([apiBase, apiKey, modelName].join('\n')).digest('hex').slice(0, 12);
    const baseHomeDir =
      this.config.homeDir?.trim() || join(findMonorepoRoot(), '.office-claw', 'relayclaw', this.agentId as string);

    return {
      key: `auto:${scopeHash}`,
      homeDir: join(baseHomeDir, `scope-${scopeHash}`),
    };
  }

  private getOrCreateScopeRuntime(scope: RelayClawScopeDescriptor): RelayClawScopeRuntime {
    const existing = this.scopes.get(scope.key);
    if (existing) return existing;

    const requestQueues = new Map<string, FrameQueue>();
    const scopeConfig: RelayClawAgentConfig = {
      ...this.config,
      ...(scope.homeDir ? { homeDir: scope.homeDir } : {}),
    };
    const runtime: RelayClawScopeRuntime = {
      scopeKey: scope.key,
      homeDir: scope.homeDir,
      requestQueues,
      connection: this.createConnection(requestQueues),
      sidecar: this.createSidecarController(this.agentId, scopeConfig),
      resolvedUrl: null,
      disposeRequested: false,
      disposeReason: null,
    };
    this.scopes.set(scope.key, runtime);
    return runtime;
  }

  private disposeScopeIfIdle(runtime: RelayClawScopeRuntime, reason: string): void {
    if (!runtime.disposeRequested) return;

    const activeRequests = runtime.requestQueues.size;
    if (activeRequests > 0) {
      log.warn(
          { agentId: this.agentId, scopeKey: runtime.scopeKey, activeRequests, reason },
          'relayclaw scope disposal deferred until active requests finish',
      );
      return;
    }

    log.info({ agentId: this.agentId, scopeKey: runtime.scopeKey, reason }, 'relayclaw service disposing scope');
    runtime.connection.close();
    runtime.sidecar.stop(reason);
    runtime.requestQueues.clear();
    this.scopes.delete(runtime.scopeKey);
  }

  private async ensureConnected(
    runtime: RelayClawScopeRuntime,
    signal?: AbortSignal,
    options?: AgentServiceOptions,
  ): Promise<void> {
    if (this.config.autoStart) {
      runtime.resolvedUrl = await runtime.sidecar.ensureStarted(options, signal);
    }
    const url = runtime.resolvedUrl ?? this.config.url;
    if (!url) throw new Error('jiuwen WebSocket URL is not configured');
    await runtime.connection.ensureConnected(url, signal);
  }

  private async *consumeFrames(
    runtime: RelayClawScopeRuntime,
    requestId: string,
    queue: FrameQueue,
    signal: AbortSignal,
    options: AgentServiceOptions | undefined,
    sendTs: number | undefined,
    taskStack: AgentTaskContextPayload[],
  ): AsyncIterable<AgentMessage> {
    let sawError = false;
    let streamedText = '';
    let usage: TokenUsage | undefined;
    let frameCount = 0;
    let firstFrameLogged = false;

    while (!signal.aborted) {
      const frame = await queue.take();
      if (frame === null) break;
      frameCount++;
      if (!firstFrameLogged) {
        firstFrameLogged = true;
        const ttfb = sendTs ? Date.now() - sendTs : undefined;
        log.info(
          { requestId, agentId: this.agentId, ttfbMs: ttfb, traceId: options?.auditContext?.traceId },
          'jiuwen first frame received',
        );
      }

      // Extract usage from frame metadata (typically on chat.final frame)
      const payload = frame.payload;
      if (frame.metadata?.usage) {
        const u = frame.metadata.usage as Record<string, unknown>;
        usage = {
          inputTokens: typeof u.input_tokens === 'number' ? u.input_tokens : undefined,
          outputTokens: typeof u.output_tokens === 'number' ? u.output_tokens : undefined,
          totalTokens: typeof u.total_tokens === 'number' ? u.total_tokens : undefined,
        };
        log.info('[USAGE_DEBUG] Received usage from jiuwenclaw frame metadata: %o', usage);
      }

      // Extract usage from chat.usage_metadata event (jiuwenclaw sends this explicitly)
      if (payload?.event_type === 'chat.usage_metadata') {
        const metadataWrapper = payload.metadata as Record<string, unknown> | undefined;
        const usageMeta = metadataWrapper?.usage_metadata as Record<string, unknown> | undefined;
        if (usageMeta) {
          usage = {
            inputTokens: typeof usageMeta.input_tokens === 'number' ? usageMeta.input_tokens : undefined,
            outputTokens: typeof usageMeta.output_tokens === 'number' ? usageMeta.output_tokens : undefined,
            totalTokens: typeof usageMeta.total_tokens === 'number' ? usageMeta.total_tokens : undefined,
          };
          log.info('[USAGE_DEBUG] Received usage from chat.usage_metadata event: %o', usage);
        }
      }
      if (
        payload?.event_type === 'chat.ask_user_question' &&
        options?.auditContext &&
        typeof payload.request_id === 'string' &&
        Array.isArray(payload.questions)
      ) {
        const permissionPayload = payload as unknown as JiuwenAskUserQuestionPayload;
        const autoApproveAnswers = shouldAutoApprovePermissionInterrupt(options)
          ? resolveAllowOnceAnswer(permissionPayload)
          : null;
        if (autoApproveAnswers && this.permissionBridge.isPermissionApprovalPayload(permissionPayload)) {
          const resumedMessages: AgentMessage[] = [];
          await this.resumeJiuwenPermissionInterrupt(
            runtime,
            {
              sessionId:
                typeof payload.session_id === 'string' && payload.session_id.trim().length > 0
                  ? payload.session_id
                  : resolveRelayClawSessionId(this.config.channelId ?? 'officeclaw', options),
              jiuwenRequestId: payload.request_id,
              source: typeof payload.source === 'string' ? payload.source : undefined,
              answers: autoApproveAnswers,
            },
            options,
            taskStack,
            async (message) => {
              resumedMessages.push(message);
            },
          );
          for (const message of resumedMessages) {
            if (message.type === 'done') {
              continue;
            }
            yield message;
            if (message.type === 'text' && message.content) streamedText += message.content;
            if (message.type === 'error') {
              sawError = true;
              break;
            }
          }
          if (sawError) break;
          break;
        }
        const bridged = await this.permissionBridge.ingestAskUserQuestion({
          agentId: this.agentId,
          threadId: options.auditContext.threadId,
          invocationId: options.auditContext.invocationId,
          sessionId:
            typeof payload.session_id === 'string' && payload.session_id.trim().length > 0
              ? payload.session_id
              : resolveRelayClawSessionId(this.config.channelId ?? 'officeclaw', options),
          payload: payload as unknown as JiuwenAskUserQuestionPayload,
          submitAnswer: async (submission, _onMessage) => {
            // Send resume request and forward frames back to the original queue.
            // The original consumeFrames loop is waiting on queue.take() — forwarded frames
            // will be processed there, so the original invocation receives is_complete normally.
            const resumeRequestId = randomUUID();
            const resumeQueue = new FrameQueue();
            runtime.requestQueues.set(resumeRequestId, resumeQueue);
            try {
              const url = runtime.resolvedUrl ?? this.config.url;
              if (!url) throw new Error('jiuwen WebSocket URL is not configured');
              await runtime.connection.ensureConnected(url);
              const officeClawMcp = buildOfficeClawMcpRequestConfig(options);
              runtime.connection.send({
                request_id: resumeRequestId,
                channel_id: this.config.channelId ?? 'officeclaw',
                session_id: submission.sessionId,
                req_method: 'chat.send',
                params: {
                  query: '',
                  request_id: submission.jiuwenRequestId,
                  answers: submission.answers,
                  ...(options?.interactiveAsk ? { interactive_ask: true } : {}),
                  ...(officeClawMcp ? { office_claw_mcp: officeClawMcp } : {}),
                  ...(submission.source ? { source: submission.source } : {}),
                },
                is_stream: true,
                timestamp: Date.now() / 1000,
              });
              while (true) {
                const frame = await resumeQueue.take();
                if (frame === null) break;
                queue.put(frame);
                if (
                  frame.is_complete === true ||
                  frame.payload?.is_complete === true ||
                  frame.payload?.event_type === 'chat.final'
                ) {
                  queue.put(null);
                  break;
                }
              }
            } catch (err) {
              log.error({ err, agentId: this.agentId }, 'jiuwen permission resume frame forwarding failed');
              queue.put(null);
            } finally {
              runtime.requestQueues.delete(resumeRequestId);
            }
          },
        });
        if (bridged) continue;
        const bridgedAskUserQuestion = await this.askUserQuestionBridge.ingestAskUserQuestion({
          agentId: this.agentId,
          threadId: options.auditContext.threadId,
          invocationId: options.auditContext.invocationId,
          sessionId:
            typeof payload.session_id === 'string' && payload.session_id.trim().length > 0
              ? payload.session_id
              : resolveRelayClawSessionId(this.config.channelId ?? 'officeclaw', options),
          payload: payload as unknown as JiuwenAskUserQuestionPayload,
          submitAnswer: async (submission) => {
            await this.submitJiuwenUserAnswer(runtime, submission);
          },
        });
        if (bridgedAskUserQuestion) continue;
      }
      const message = transformRelayClawChunk(frame, this.agentId);
      if (message) {
        updateRelayClawTaskStack(taskStack, message);
        const out = attachRelayClawStreamTaskContext(taskStack, message);
        yield out;
        if (message.type === 'text' && message.content) streamedText += message.content;
        if (message.type === 'error') {
          sawError = true;
          break;
        }
      } else if (payload?.event_type === 'chat.final') {
        const finalText = normalizeRelayClawFinalContent(payload.content);
        const isTransportErrorText = isRelayClawTransportErrorText(finalText);
        if (isTransportErrorText) {
          continue;
        }
        const deltaToEmit = computeFinalTextDelta(streamedText, finalText);
        if (deltaToEmit) {
          streamedText += deltaToEmit;
          const deltaMsg = agentMsg('text', this.agentId, deltaToEmit);
          yield attachRelayClawStreamTaskContext(taskStack, deltaMsg);
        }
        break;
      }

      if (frame.is_complete === true || payload?.is_complete === true) break;
    }

    // Build metadata for done message (consistent with Claude/Codex providers)
    const metadata: MessageMetadata = {
      provider: 'jiuwen',
      model: this.config.modelName ?? 'unknown',
      usage,
    };

      if (!sawError && signal.aborted && !options?.signal?.aborted) {
      sawError = true;
      yield {
        type: 'error',
        agentId: this.agentId,
        error: 'jiuwen request timed out before completion',
        timestamp: Date.now(),
      };
    }

    const durationMs = sendTs ? Date.now() - sendTs : undefined;
    log.info(
      { requestId, agentId: this.agentId, frameCount, durationMs, sawError, usage, traceId: options?.auditContext?.traceId },
      'jiuwen request complete',
    );
    yield { type: 'done', agentId: this.agentId, metadata, timestamp: Date.now() };
  }

  private async submitJiuwenUserAnswer(
    runtime: RelayClawScopeRuntime,
    submission: JiuwenBridgeAnswerSubmission,
  ): Promise<void> {
    const requestId = randomUUID();
    const queue = new FrameQueue();
    runtime.requestQueues.set(requestId, queue);

    try {
      const url = runtime.resolvedUrl ?? this.config.url;
      if (!url) throw new Error('jiuwen WebSocket URL is not configured');
      await runtime.connection.ensureConnected(url);
      runtime.connection.send({
        request_id: requestId,
        channel_id: this.config.channelId ?? 'officeclaw',
        session_id: submission.sessionId,
        req_method: 'chat.user_answer',
        params: {
          request_id: submission.jiuwenRequestId,
          answers: submission.answers,
          ...(submission.source ? { source: submission.source } : {}),
        },
        is_stream: false,
        timestamp: Date.now() / 1000,
      });
      await this.drainControlFrames(queue, 5000);
    } finally {
      runtime.requestQueues.delete(requestId);
    }
  }

  private async resumeJiuwenPermissionInterrupt(
    runtime: RelayClawScopeRuntime,
    submission: JiuwenBridgeAnswerSubmission,
    options: AgentServiceOptions | undefined,
    taskStack: AgentTaskContextPayload[],
    onMessage?: (message: AgentMessage) => Promise<void> | void,
  ): Promise<void> {
    const requestId = randomUUID();
    const queue = new FrameQueue();
    runtime.requestQueues.set(requestId, queue);
    const signal = buildSignal(this.config.timeoutMs ?? DEFAULT_RELAYCLAW_TIMEOUT_MS, options?.signal);
    const sendTs = Date.now();
    const officeClawMcp = buildOfficeClawMcpRequestConfig(options);

    try {
      const url = runtime.resolvedUrl ?? this.config.url;
      if (!url) throw new Error('jiuwen WebSocket URL is not configured');
      await runtime.connection.ensureConnected(url);
      runtime.connection.send({
        request_id: requestId,
        channel_id: this.config.channelId ?? 'officeclaw',
        session_id: submission.sessionId,
        req_method: 'chat.send',
        params: {
          query: '',
          request_id: submission.jiuwenRequestId,
          answers: submission.answers,
          // 权限审批后继续执行需要继承本轮 interactiveAsk；否则 Jiuwen 会按默认 false 处理，
          // 后续 ask_user_question 仅走 text_only，前端不会弹结构化卡片。
          ...(options?.interactiveAsk ? { interactive_ask: true } : {}),
          ...(officeClawMcp ? { office_claw_mcp: officeClawMcp } : {}),
          ...(submission.source ? { source: submission.source } : {}),
        },
        is_stream: true,
        timestamp: Date.now() / 1000,
      });
      for await (const message of this.consumeFrames(runtime, requestId, queue, signal, options, sendTs, taskStack)) {
        if (!onMessage) {
          continue;
        }
        await onMessage(message);
      }
    } finally {
      runtime.requestQueues.delete(requestId);
    }
  }

  private async sendInterrupt(
    runtime: RelayClawScopeRuntime,
    channelId: string,
    sessionId: string,
    sourceRequestId: string,
  ): Promise<void> {
    if (!runtime.connection.isOpen()) return;

    const interruptRequestId = `interrupt_${randomUUID()}`;
    const interruptQueue = new FrameQueue();
    runtime.requestQueues.set(interruptRequestId, interruptQueue);

    try {
      runtime.connection.send({
        request_id: interruptRequestId,
        channel_id: channelId,
        session_id: sessionId,
        req_method: 'chat.interrupt',
        params: {
          intent: 'cancel',
          request_id: sourceRequestId,
        },
        is_stream: false,
        timestamp: Date.now() / 1000,
      });

      const interruptFrame = await Promise.race([
        interruptQueue.take(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), RELAYCLAW_INTERRUPT_ACK_TIMEOUT_MS)),
      ]);

      if (interruptFrame && interruptFrame.ok === false) {
        log.warn(
          { agentId: this.agentId, sessionId, sourceRequestId, interruptRequestId, payload: interruptFrame.payload },
          'jiuwen interrupt request was rejected',
        );
      } else if (interruptFrame) {
        log.info(
          { agentId: this.agentId, sessionId, sourceRequestId, interruptRequestId, payload: interruptFrame.payload },
          'jiuwen interrupt request acknowledged',
        );
      }
    } catch (err) {
      log.warn(
        {
          agentId: this.agentId,
          sessionId,
          sourceRequestId,
          err,
        },
        'jiuwen interrupt request failed',
      );
    } finally {
      runtime.requestQueues.delete(interruptRequestId);
    }
  }

  private async drainControlFrames(queue: FrameQueue, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = Math.max(deadline - Date.now(), 1);
      const frame = await Promise.race([
        queue.take(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
      ]);
      if (frame === null) return;
      if (frame.is_complete === true || frame.payload?.is_complete === true ||
          frame.payload?.event_type === 'chat.final') return;
    }
  }
}

function buildSignal(timeoutMs: number, callerSignal?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (callerSignal) signals.push(callerSignal);
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

function decodeQuotedPythonLikeString(raw: string): string {
  return raw
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function normalizeRelayClawFinalContent(rawContent: unknown): string {
  if (typeof rawContent !== 'string') return '';

  const trimmed = rawContent.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.output === 'string') {
        return parsed.output.replace(/^(?:\r?\n)+/, '');
      }
    } catch {
      // Fall through to Python-dict-style extraction.
    }
  }

  if (!trimmed.includes('result_type') || !trimmed.includes('output')) {
    return rawContent.replace(/^(?:\r?\n)+/, '');
  }

  const singleQuoted = rawContent.match(/['"]output['"]\s*:\s*'((?:\\'|[^'])*)'/s);
  if (singleQuoted?.[1] != null) {
    return decodeQuotedPythonLikeString(singleQuoted[1]).replace(/^(?:\r?\n)+/, '');
  }

  const doubleQuoted = rawContent.match(/['"]output['"]\s*:\s*"((?:\\"|[^"])*)"/s);
  if (doubleQuoted?.[1] != null) {
    return decodeQuotedPythonLikeString(doubleQuoted[1]).replace(/^(?:\r?\n)+/, '');
  }

  return rawContent.replace(/^(?:\r?\n)+/, '');
}

function computeFinalTextDelta(streamedText: string, finalText: string): string {
  if (!finalText) return '';
  if (!streamedText) return finalText;
  if (finalText === streamedText) return '';
  if (finalText.startsWith(streamedText)) return finalText.slice(streamedText.length);
  if (streamedText.startsWith(finalText)) return '';
  return `${streamedText.endsWith('\n') ? '' : '\n\n'}${finalText}`;
}

function buildRequest(
  requestId: string,
  channelId: string,
  sessionId: string,
  prompt: string,
  options?: AgentServiceOptions,
): Record<string, unknown> {
  const uploadRefs = extractUploadRefs(options?.contentBlocks, options?.uploadDir);
  const systemPrompt = typeof options?.systemPrompt === 'string' ? options.systemPrompt.trim() : '';
  const supplementaryInfoParts = [
    typeof options?.supplementaryInfo === 'string' ? options.supplementaryInfo.trim() : '',
    buildLocalUploadPathHints(uploadRefs),
  ].filter((part) => part.length > 0);
  const supplementaryInfo = supplementaryInfoParts.join('\n\n');
  const filesPayload = buildRelayClawFilesPayload(options?.contentBlocks, options?.uploadDir);
  const officeClawMcp = buildOfficeClawMcpRequestConfig(options);
  const query = prompt;
  return {
    request_id: requestId,
    channel_id: channelId,
    session_id: sessionId,
    req_method: 'chat.send',
    params: {
      query,
      ...(supplementaryInfo ? { supplementary_info: supplementaryInfo } : {}),
      ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
      mode: 'agent.plan',
      ...(options?.interactiveAsk ? { interactive_ask: true } : {}),
      ...(options?.workingDirectory ? { project_dir: options.workingDirectory } : {}),
      ...(filesPayload ? { files: filesPayload } : {}),
      ...(officeClawMcp ? { office_claw_mcp: officeClawMcp } : {}),
    },
    is_stream: true,
    timestamp: Date.now() / 1000,
  };
}

export const __relayClawInternals = {
  isSidecarReady,
  isRelayClawTransportErrorText,
};
