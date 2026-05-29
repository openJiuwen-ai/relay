/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Single Cat Invocation
 * 单猫调用的核心逻辑，从 AgentRouter 提取。
 *
 * 处理: credentials 创建、session 获取、workingDirectory 解析、
 *       CLI 调用、消息 yield、错误处理、审计日志。
 *
 * 不处理: system prompt 构建（由调用方负责 prepend）、
 *         消息存储（由调用方在 yield 后累积并存储）。
 */

import type { CatalogMemberEntry, CatalogProvider, GatewayIdentity } from '@openjiuwen/relay-api-server-contracts';
import type { CredentialResolutionContext } from '@openjiuwen/relay-core';
import {
  type AgentId,
  type ContextHealth,
  type MessageContent,
  officeClawRegistry,
  resolveEmbeddedRuntimeKind,
} from '@openjiuwen/relay-shared';
import { resolveRuntimeAcpModelProfileById } from '../../../../../config/acp-model-profiles.js';
import { getContextWindowFallback } from '../../../../../config/context-window-sizes.js';
import {
  findProjectModelConfigBinding,
  HUAWEI_MAAS_MODEL_SOURCE_ID,
} from '../../../../../config/model-config-profiles.js';
import { resolveBoundAccountRefForCat } from '../../../../../config/office-claw-account-binding.js';
import { isSessionChainEnabled, toAllAgentConfigs } from '../../../../../config/office-claw-config-loader.js';
import {
  resolveAnthropicCredentialEnv,
  resolveDareCredentialEnv,
  resolveGoogleCredentialEnv,
  resolveOpenAiCredentialEnv,
  resolveOpenCodeCredentialEnv,
  resolveRelayClawCredentialEnv,
} from '../../../../../config/plugins/builtin-credential-resolvers.js';
import { tryGetPluginRegistry } from '../../../../../config/plugins/plugin-registry-singleton.js';
import {
  resolveBuiltinClientForProvider,
  validateRuntimeProviderBinding,
} from '../../../../../config/provider-binding-compat.js';
import {
  resolveRuntimeProviderProfileById,
  resolveRuntimeProviderProfileForClient,
} from '../../../../../config/provider-profiles.js';
import { getSessionStrategy, shouldTakeAction } from '../../../../../config/session-strategy.js';
import { createModuleLogger, userVisibleFields } from '../../../../../infrastructure/logger.js';
import { resolveActiveProjectRoot } from '../../../../../utils/active-project-root.js';
import {
  buildEmbeddedAgentTeamsModelProfile,
  buildEmbeddedAgentTeamsModelProfileFromBinding,
  buildEmbeddedAgentTeamsProviderProfile,
  embeddedAgentTeamsRuntimeAvailable,
  resolveEmbeddedAgentTeamsExecutable,
} from '../../../../../utils/agent-teams-bundle.js';
import { DEFAULT_CLI_TIMEOUT_MS, resolveCliTimeoutMs } from '../../../../../utils/cli-timeout.js';
import { resolveEmbeddedAgentTeamsBinding } from '../../../../../utils/embedded-runtime-bindings.js';
import { findMonorepoRoot, isSameProject } from '../../../../../utils/monorepo-root.js';
import { isUnderAllowedRoot } from '../../../../../utils/project-path.js';
import type { AgentPaneRegistry } from '../../../../terminal/agent-pane-registry.js';
import type { TmuxGateway } from '../../../../terminal/tmux-gateway.js';
import { createPromptDigest } from '../../context/prompt-digest.js';
import { AuditEventTypes, getEventAuditLog } from '../../orchestration/EventAuditLog.js';

const log = createModuleLogger('invoke');

import type { SessionManager } from '../../session/SessionManager.js';
import type { ISessionSealer } from '../../session/SessionSealer.js';
import type { TranscriptSessionInfo, TranscriptWriter } from '../../session/TranscriptWriter.js';
import type { ISessionChainStore } from '../../stores/ports/SessionChainStore.js';
import type { IThreadStore } from '../../stores/ports/ThreadStore.js';
import type { AgentMessage, AgentService, AgentServiceOptions } from '../../types.js';
import type { InvocationRegistry } from '../invocation/InvocationRegistry.js';
import type { ResumeFailureKind } from './invoke-helpers.js';
import {
  classifyResumeFailure,
  extractTaskProgress,
  isCliTimeoutError,
  isMissingClaudeSessionError,
  isPromptTokenLimitExceededError,
  isTransientCliExitCode1,
  preflightRace,
} from './invoke-helpers.js';
import { SessionMutex } from './SessionMutex.js';
import type { TaskProgressItem, TaskProgressStatus, TaskProgressStore } from './TaskProgressStore.js';

/** F118: Module-level singleton — guards per-cliSessionId serialization */
const sessionMutex = new SessionMutex();

/**
 * F089: Race an async iterator's .next() against an AbortSignal.
 * Returns the iterator result, or throws the abort reason if the signal fires first.
 * This is necessary because `for await` blocks on gen.next() and cannot be interrupted.
 */
function abortableNext<T>(iter: AsyncIterator<T>, signal: AbortSignal): Promise<IteratorResult<T>> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
  return new Promise<IteratorResult<T>>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason ?? new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    iter.next().then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

const ANTHROPIC_PROFILE_MODE_KEY = 'OFFICE_CLAW_ANTHROPIC_PROFILE_MODE';
const ANTHROPIC_PROFILE_MODE_API_KEY = 'api_key';

/**
 * F-BLOAT: Context compression detection for non-Claude providers (Codex/Gemini).
 *
 * Track last known context fill per agent:thread. When usedTokens drops >60%
 * between turns, mark for systemPrompt re-injection on the next invocation.
 * This handles the edge case where auto-compact fires before our seal threshold.
 *
 * Note: module-level state — lost on server restart (acceptable, seal handles 95% of cases).
 */
const _prevContextFill = new Map<string, number>();
const _needsReinjection = new Set<string>();

/** @internal Exposed for testing */
export function _resetCompressionDetection(): void {
  _prevContextFill.clear();
  _needsReinjection.clear();
}

/**
 * Shared dependencies for all agent invocations within one AgentRouter
 */
export interface InvocationDeps {
  readonly registry: InvocationRegistry;
  readonly sessionManager: SessionManager;
  readonly catalogProvider: CatalogProvider;
  readonly threadStore: IThreadStore | null;
  readonly apiUrl: string;
  /** F045 Gap #4: Redis-backed task progress snapshots (optional in memory mode/tests) */
  readonly taskProgressStore?: TaskProgressStore;
  /** F24: Session chain store for context health tracking */
  readonly sessionChainStore?: ISessionChainStore;
  /** F24 Phase B: Session sealer for auto-seal when context threshold reached */
  readonly sessionSealer?: ISessionSealer;
  /** F24 Phase C: Transcript writer for event collection + flush on seal */
  readonly transcriptWriter?: TranscriptWriter;
  /** F24 Phase D: Transcript reader for reading sealed session data */
  readonly transcriptReader?: import('../../session/TranscriptReader.js').TranscriptReader;
  /** F065: Task store for bootstrap task snapshot injection */
  readonly taskStore?: import('../../stores/ports/TaskStore.js').ITaskStore;
  /** F073 P4: Workflow SOP store for SOP stage hint injection */
  readonly workflowSopStore?: import('../../stores/ports/WorkflowSopStore.js').IWorkflowSopStore;
  /** F070 Phase 3a: Execution digest store for dispatch backflow */
  readonly executionDigestStore?: import('../../../../projects/execution-digest-store.js').ExecutionDigestStore;
  /** F089 Phase 2: tmux gateway for agent-in-pane execution */
  readonly tmuxGateway?: TmuxGateway;
  /** F089 Phase 2: agent pane registry for observability */
  readonly agentPaneRegistry?: AgentPaneRegistry;
}

/**
 * Per-invocation parameters
 */
export interface InvocationParams {
  readonly agentId: AgentId;
  readonly service: AgentService;
  /** The fully-orchestrated prompt (dynamic context + chain context already prepended by caller) */
  readonly prompt: string;
  /** The current user task text for provider transports that need a clean query field. */
  readonly userPrompt?: string;
  readonly userId: string;
  readonly threadId: string;
  readonly contentBlocks?: readonly MessageContent[];
  readonly uploadDir?: string;
  /** Per-invocation callback env overrides layered on top of the base callback env. */
  readonly callbackEnvOverrides?: Record<string, string>;
  readonly signal?: AbortSignal;
  readonly isLastCat: boolean;
  /** Use protocol-native resume for interrupted sessions when supported by the provider. */
  readonly resumeSession?: boolean;
  /** Static identity prompt — prepended to prompt on new sessions (gated by F-BLOAT logic) */
  readonly systemPrompt?: string;
  readonly gatewayIdentity?: GatewayIdentity;
  /** AskUserQuestion: whether the current channel supports interactive structured questions. */
  readonly interactiveAsk?: boolean;
  /** F108 fix: InvocationRecordStore's parent invocation ID for worklist key alignment */
  readonly parentInvocationId?: string;
  /** F121: The A2A trigger message ID for auto-replyTo */
  readonly a2aTriggerMessageId?: string;
  /** End-to-end trace ID from frontend HTTP request for log correlation. */
  readonly traceId?: string;
}

function stripRelayClawQueryFromSupplementary(orchestratedPrompt: string, query: string): string | undefined {
  const prompt = orchestratedPrompt.trim();
  const cleanQuery = query.trim();
  if (!prompt || !cleanQuery || prompt === cleanQuery) return undefined;

  if (prompt.endsWith(cleanQuery)) {
    const withoutQuery = prompt
      .slice(0, -cleanQuery.length)
      .replace(/(?:\n\n---\n\n)?\s*$/, '')
      .trim();
    return withoutQuery || undefined;
  }

  return prompt;
}

/**
 * Invoke a single agent agent and yield messages.
 *
 * The caller is responsible for:
 * - Building and prepending the system prompt to params.prompt
 * - Accumulating text/metadata from yielded messages
 * - Storing the final response in messageStore
 */
export async function* invokeSingleCat(deps: InvocationDeps, params: InvocationParams): AsyncIterable<AgentMessage> {
  const { registry, sessionManager, threadStore, apiUrl } = deps;
  const { agentId, service, prompt, userId, threadId, isLastCat, signal: callerSignal } = params;

  const { invocationId, callbackToken } = registry.create(
    userId,
    agentId,
    threadId,
    params.parentInvocationId,
    params.a2aTriggerMessageId,
  );

  // F089: Invocation-level hard timeout — independent of NDJSON stream / CLI timeout.
  // Must be > CLI_TIMEOUT_MS to avoid racing the inner timeout.
  // When CLI_TIMEOUT_MS=0 (disable), fall back to DEFAULT (30min) so invocation still has a ceiling.
  const INVOCATION_TIMEOUT_MULTIPLIER = 2;
  const cliTimeoutMs = resolveCliTimeoutMs(undefined);
  const invocationTimeoutMs =
    (cliTimeoutMs > 0 ? cliTimeoutMs : DEFAULT_CLI_TIMEOUT_MS) * INVOCATION_TIMEOUT_MULTIPLIER;
  const invocationAc = new AbortController();
  let invocationTimer: ReturnType<typeof setTimeout> | null = null;
  const resetInvocationTimeout = (): void => {
    if (invocationTimer) clearTimeout(invocationTimer);
    invocationTimer = setTimeout(() => {
      log.error({ invocationId, agentId, threadId, timeoutMs: invocationTimeoutMs }, 'Invocation hard timeout fired');
      invocationAc.abort(new Error('invocation_timeout'));
    }, invocationTimeoutMs);
    invocationTimer.unref();
  };
  resetInvocationTimeout();

  // Merge caller signal (user cancel) with invocation timeout — neither loses semantics.
  const signal: AbortSignal | undefined = callerSignal
    ? AbortSignal.any([callerSignal, invocationAc.signal])
    : invocationAc.signal;

  log.info(
    userVisibleFields('progress', { invocationId, agentId, threadId, userId, traceId: params.traceId }),
    'Created invocation',
  );

  // F22 R2 P1-1: Expose invocationId to caller (route-serial/parallel) so they can
  // use it for RichBlockBuffer.consume() instead of getLatestId() which is wrong
  // under preemption — old invocation A would steal new invocation B's blocks.
  yield {
    type: 'system_info' as const,
    agentId,
    content: JSON.stringify({ type: 'invocation_created', invocationId }),
    timestamp: Date.now(),
  };

  const callbackEnv: Record<string, string> = {
    OFFICE_CLAW_API_URL: apiUrl,
    OFFICE_CLAW_INVOCATION_ID: invocationId,
    OFFICE_CLAW_CALLBACK_TOKEN: callbackToken,
    OFFICE_CLAW_USER_ID: userId,
    OFFICE_CLAW_AGENT_ID: agentId,
    ...(process.env.OFFICE_CLAW_SIGNAL_USER ? { OFFICE_CLAW_SIGNAL_USER: process.env.OFFICE_CLAW_SIGNAL_USER } : {}),
  };

  const auditLog = getEventAuditLog();
  const promptDigest = createPromptDigest(prompt);
  const startTime = Date.now();

  // F118 AC-C5: Flags for finally block fallback audit (must be before any early return)
  let hadError = false;
  let didWriteAudit = false;
  let didComplete = false;
  let didResetRestoreFailures = false;
  let openCodeRuntimeConfigPath: string | undefined;
  const hostProjectRoot = findMonorepoRoot(process.cwd());

  // Shared-state preflight — covers ALL cats (Claude/Codex/Gemini), vendor-agnostic.
  // Three-layer defense model (shared-rules §14):
  //   L1 .githooks/pre-commit = hard block (prevents committing on wrong branch)
  //   L2 this check = see below
  //   L3 CI guard = hard block (prevents merging PRs with shared-state changes)
  //
  // Tests run on feature branches with intentionally unpushed commits. Those suites
  // need to exercise routing/invocation behavior without having local git state turn
  // every invocation into a governance block, so test runners can opt out explicitly.
  if (process.env.OFFICE_CLAW_DISABLE_SHARED_STATE_PREFLIGHT !== '1') {
    // L2 behavior is warn-only during interactive invocation. Hard safety still lives
    // in L1/L3 (`pre-commit` + CI / merge gate); blocking regular chat invocations on
    // local git state made multi-agent routing unusable whenever shared-state lagged.
    try {
      const { checkSharedStatePreflight } = await import('../../../../../config/shared-state-preflight.js');
      const projectRoot = findMonorepoRoot(process.cwd());
      const ssCheck = checkSharedStatePreflight(projectRoot);
      if (!ssCheck.ok) {
        if (ssCheck.unpushedFiles?.length) {
          const msg =
            `Shared-state files committed but not pushed: ${ssCheck.unpushedFiles.join(', ')}. ` +
            'Please `git push` soon so other agents see the latest shared state (shared-rules §14).';
          log.warn({ agentId, unpushedFiles: ssCheck.unpushedFiles }, 'Shared-state preflight: unpushed files');
          yield {
            type: 'system_info' as const,
            agentId,
            content: `⚠️ ${msg}`,
            timestamp: Date.now(),
          };
        }
        if (ssCheck.uncommittedFiles?.length) {
          const msg = `uncommitted shared-state files: ${ssCheck.uncommittedFiles.join(', ')}`;
          log.warn(
            { agentId, uncommittedFiles: ssCheck.uncommittedFiles },
            'Shared-state preflight: uncommitted files',
          );
          yield {
            type: 'system_info' as const,
            agentId,
            content: `⚠️ Shared-state preflight: ${msg}. Please commit+push before continuing (shared-rules §14).`,
            timestamp: Date.now(),
          };
        }
      }
    } catch {
      // Don't block on preflight errors
    }
  }

  // === AGENT_INVOKED 审计 (fire-and-forget, review P2-3) ===
  auditLog
    .append({
      type: AuditEventTypes.AGENT_INVOKED,
      threadId,
      data: {
        agentId,
        userId,
        invocationId,
        promptDigest,
        isLastCat,
        ...(params.traceId ? { traceId: params.traceId } : {}),
      },
    })
    .catch((err) => {
      // P2-2: 打印完整错误信息 + 上下文
      log.warn({ threadId, invocationId, err }, 'CAT_INVOKED audit write failed');
    });

  let hadStreamError = false;
  let lastTasks: TaskProgressItem[] | null = null;
  let terminalTaskProgressStatus: TaskProgressStatus | null = null;
  let terminalInterruptReason: string | null = null;
  let finalizedTaskProgressStatus: TaskProgressStatus | null = null;

  const attachInvocationIdToTaskProgress = (message: AgentMessage): AgentMessage => {
    if (message.type !== 'system_info' || !message.content) return message;
    try {
      const parsed = JSON.parse(message.content) as Record<string, unknown>;
      if (parsed.type !== 'task_progress' || typeof parsed.invocationId === 'string') return message;
      return {
        ...message,
        content: JSON.stringify({ ...parsed, invocationId }),
      };
    } catch {
      return message;
    }
  };

  const maybePersistTaskProgress = async (out: AgentMessage): Promise<void> => {
    if (!deps.taskProgressStore) return;
    if (out.type !== 'system_info' || !out.content) return;
    let tasks: TaskProgressItem[] | null = null;
    try {
      const parsed = JSON.parse(out.content) as { type?: string; tasks?: unknown };
      if (parsed.type !== 'task_progress' || !Array.isArray(parsed.tasks)) return;
      tasks = parsed.tasks as TaskProgressItem[];
      lastTasks = tasks;
    } catch {
      return;
    }

    try {
      await deps.taskProgressStore.setSnapshot({
        threadId,
        agentId,
        tasks,
        status: 'running',
        updatedAt: Date.now(),
        lastInvocationId: invocationId,
      });
    } catch (err) {
      log.warn({ threadId, agentId, invocationId, err }, 'Task progress persist running snapshot failed');
    }
  };

  const finalizeTaskProgress = async (): Promise<void> => {
    if (!deps.taskProgressStore || !lastTasks) return;
    const wasAborted = Boolean(signal?.aborted);

    // Determine the terminal status once per invocation and keep it stable.
    // In particular: if we already reached a successful terminal (`done` without error),
    // later `AbortSignal` flips (client disconnect / iterator.return()) must NOT
    // downgrade the snapshot to `interrupted`.
    const status: TaskProgressStatus =
      terminalTaskProgressStatus ?? (hadError || wasAborted ? 'interrupted' : 'completed');
    const interruptReason =
      terminalInterruptReason ??
      (status === 'interrupted' ? (hadError ? 'error' : wasAborted ? 'aborted' : undefined) : undefined);

    // Once we have persisted a "completed" snapshot, don't downgrade it to
    // "interrupted" just because the request was aborted after completion
    // (e.g. client disconnect / iterator.return()).
    if (finalizedTaskProgressStatus === 'completed' && status === 'interrupted' && !hadError) return;
    // Similarly, don't upgrade an interrupted snapshot back to completed.
    if (finalizedTaskProgressStatus === 'interrupted' && status === 'completed') return;
    if (finalizedTaskProgressStatus === status) return;

    try {
      await deps.taskProgressStore.setSnapshot({
        threadId,
        agentId,
        tasks: lastTasks,
        status,
        updatedAt: Date.now(),
        lastInvocationId: invocationId,
        ...(interruptReason ? { interruptReason } : {}),
      });
      finalizedTaskProgressStatus = status;
    } catch (err) {
      log.warn({ threadId, agentId, invocationId, status, err }, 'Task progress persist final snapshot failed');
    }
  };

  // F118: Declared before try so it's accessible in finally
  let sessionMutexRelease: (() => void) | undefined;

  try {
    let sessionId: string | undefined;
    const sessionChainActive = isSessionChainEnabled(agentId);
    // Session resume is a basic CLI capability independent of chain management.
    // All cats read sessionId so the CLI can --resume/--session into prior context.
    // sessionChain only gates advanced chain management (sealing, bootstrap, digest).
    try {
      sessionId = await preflightRace(sessionManager.get(userId, agentId, threadId), 'sessionManager.get', signal);
    } catch (err) {
      // Redis read failure or preflight timeout — continue without session
      log.warn({ agentId, threadId, invocationId, err }, 'Session get failed (timeout or Redis), proceeding without');
    }

    // R8 P1: Read-side short-circuit — if sessionChainStore has sealed/sealing sessions
    // but NO active session, the previous session was sealed. Discard the persisted CLI
    // sessionId to prevent --resume into a sealed session. This eliminates the race
    // window between fire-and-forget delete and next get().
    // Only applies when chain is non-empty (empty chain = fresh thread, keep sessionId).
    //
    // R11 P1-1: When active record exists, its cliSessionId is the authoritative value.
    // sessionManager.get() may return a stale value if session_init updated the record
    // but sessionManager wasn't re-written. Always align to the active record.
    //
    // F33-fix: Always check chain even when sessionManager returns nothing.
    // The PATCH bind endpoint writes to sessionChainStore but not sessionManager,
    // so a freshly-bound session would be missed if we gate on sessionId being truthy.
    if (deps.sessionChainStore && sessionChainActive) {
      // Reaper: reconcile any sessions stuck in 'sealing' > 5 minutes (best-effort).
      if (deps.sessionSealer) {
        try {
          await preflightRace(deps.sessionSealer.reconcileStuck(agentId, threadId), 'reconcileStuck', signal);
        } catch {
          /* best-effort reconcile — timeout or error */
        }
      }
      try {
        const chain = await preflightRace(
          Promise.resolve(deps.sessionChainStore.getChain(agentId, threadId)),
          'getChain',
          signal,
        );
        if (chain.length > 0) {
          const activeRec = chain.find((s) => s.status === 'active');
          if (!activeRec) {
            // Chain exists but no active session → previous was sealed; don't resume
            sessionId = undefined;
          } else if (activeRec.cliSessionId) {
            // F118 AC-C6: Overflow circuit breaker — too many consecutive restore failures (#86)
            // Note: time-based "stale" check removed — idle sessions are healthy,
            // only repeated restore failures indicate a toxic session.
            const MAX_CONSECUTIVE_FAILURES = 3;
            const isOverflow = (activeRec.consecutiveRestoreFailures ?? 0) >= MAX_CONSECUTIVE_FAILURES;
            if (isOverflow && deps.sessionSealer) {
              let sealOk = false;
              try {
                const result = await preflightRace(
                  deps.sessionSealer.requestSeal({ sessionId: activeRec.id, reason: 'overflow_circuit_breaker' }),
                  'requestSeal',
                  signal,
                );
                sealOk = result.accepted;
                if (sealOk) {
                  // Must finalize to write transcript + digest to disk,
                  // otherwise session recall tools get 404 (no data on disk).
                  deps.sessionSealer.finalize({ sessionId: activeRec.id }).catch((err: unknown) => {
                    log.error({ err, sessionId: activeRec.id }, 'session finalize failed — recall will 404');
                  });
                }
              } catch {
                /* best-effort seal */
              }
              // Only drop sessionId if seal succeeded — otherwise resume with existing
              if (sealOk) {
                sessionId = undefined;
              } else {
                sessionId = activeRec.cliSessionId;
              }
            } else {
              // Active record's cliSessionId is authoritative (includes F33 manual bind)
              sessionId = activeRec.cliSessionId;
            }
          }
        }
      } catch {
        // R9 P1: Fail-closed — if chain store read fails, discard sessionId.
        // Rationale: requestSeal accepted = hard seal boundary. When we can't
        // verify chain state, it's safer to start fresh than risk --resume
        // into a sealed session. Lost resume is recoverable; sealed-session
        // corruption is not.
        sessionId = undefined;
      }
    }

    // F118: Acquire per-cliSessionId mutex to prevent concurrent resume
    if (sessionId) {
      try {
        sessionMutexRelease = await sessionMutex.acquire(sessionId, signal);
      } catch (err) {
        // Abort while queued is not a runtime error — clean exit
        if (signal?.aborted) {
          yield { type: 'done' as const, agentId, isFinal: isLastCat, timestamp: Date.now() };
          didComplete = true; // F118 AC-C5: Abort early exit, not force-return
          return;
        }
        throw err; // unexpected error — let outer catch handle
      }
    }

    // Resolve workingDirectory from thread's projectPath
    let workingDirectory: string | undefined;
    if (threadStore) {
      try {
        const thread = await preflightRace(Promise.resolve(threadStore.get(threadId)), 'threadStore.get', signal);
        if (thread?.projectPath && thread.projectPath !== 'default') {
          // F101: Game threads use virtual projectPaths (e.g. 'games/werewolf') for
          // categorization only — they are not real filesystem directories. Skip them
          // to avoid triggering the F070 governance gate on a non-existent path.
          if (!thread.projectPath.startsWith('games/') && isUnderAllowedRoot(thread.projectPath)) {
            workingDirectory = thread.projectPath;
          }
        }
      } catch {
        // Thread store timeout or error — proceed without workingDirectory
      }
    }
    const workingProjectRoot = workingDirectory ? findMonorepoRoot(workingDirectory) : undefined;

    // Shared-state preflight — covers ALL cats (Claude/Codex/Gemini), vendor-agnostic.
    // Three-layer defense model (shared-rules §14):
    //   L1 .githooks/pre-commit = hard block (prevents committing on wrong branch)
    //   L2 this check = see below
    //   L3 CI guard = hard block (prevents merging PRs with shared-state changes)
    //
    // Scope: only check the host OfficeClaw repo (or its worktrees). External projects /
    // fork playgrounds may be routed by this runtime, but they must not inherit
    // shared-state warnings from the repo that launched the API process.
    if (
      process.env.OFFICE_CLAW_DISABLE_SHARED_STATE_PREFLIGHT !== '1' &&
      (!workingProjectRoot || isSameProject(workingProjectRoot, hostProjectRoot))
    ) {
      // L2 behavior is warn-only during interactive invocation. Hard safety still lives
      // in L1/L3 (`pre-commit` + CI / merge gate); blocking regular chat invocations on
      // local git state made multi-agent routing unusable whenever shared-state lagged.
      try {
        const { checkSharedStatePreflight } = await import('../../../../../config/shared-state-preflight.js');
        const preflightRoot = workingProjectRoot ?? hostProjectRoot;
        const ssCheck = checkSharedStatePreflight(preflightRoot);
        if (!ssCheck.ok) {
          if (ssCheck.unpushedFiles?.length) {
            const msg =
              `Shared-state files committed but not pushed: ${ssCheck.unpushedFiles.join(', ')}. ` +
              'Please `git push` soon so other agents see the latest shared state (shared-rules §14).';
            log.warn(
              { agentId, preflightRoot, unpushedFiles: ssCheck.unpushedFiles },
              'Shared-state preflight: unpushed files',
            );
            yield {
              type: 'system_info' as const,
              agentId,
              content: `⚠️ ${msg}`,
              timestamp: Date.now(),
            };
          }
          if (ssCheck.uncommittedFiles?.length) {
            const msg = `uncommitted shared-state files: ${ssCheck.uncommittedFiles.join(', ')}`;
            log.warn(
              { agentId, preflightRoot, uncommittedFiles: ssCheck.uncommittedFiles },
              'Shared-state preflight: uncommitted files',
            );
            yield {
              type: 'system_info' as const,
              agentId,
              content: `⚠️ Shared-state preflight: ${msg}. Please commit+push before continuing (shared-rules §14).`,
              timestamp: Date.now(),
            };
          }
        }
      } catch {
        // Don't block on preflight errors
      }
    }

    if (workingDirectory && !isSameProject(workingDirectory, hostProjectRoot)) {
      const officeClawRoot = hostProjectRoot;
      const { tryGovernanceBootstrap } = await import('../../../../../config/capabilities/capability-orchestrator.js');
      await tryGovernanceBootstrap(workingDirectory, officeClawRoot);
      const { checkGovernancePreflight } = await import('../../../../../config/governance/governance-preflight.js');
      const preflight = await checkGovernancePreflight(workingDirectory, officeClawRoot);
      if (!preflight.ready) {
        // F070: Structured governance_blocked event — frontend renders actionable card
        yield {
          type: 'system_info',
          agentId,
          content: JSON.stringify({
            type: 'governance_blocked',
            projectPath: workingDirectory,
            reason: preflight.reason,
            invocationId: params.parentInvocationId,
          }),
          timestamp: Date.now(),
        };
        // F070: done with errorCode so routes mark invocation as failed (retryable)
        yield {
          type: 'done',
          agentId,
          isFinal: params.isLastCat,
          errorCode: 'GOVERNANCE_BOOTSTRAP_REQUIRED',
          timestamp: Date.now(),
        };
        didComplete = true;
        return;
      }
    }

    // F070 Phase 2: Inject dispatch mission context for external projects
    let missionPrefix = '';
    let capturedMissionPack: import('@openjiuwen/relay-shared').DispatchMissionPack | undefined;
    if (workingDirectory && !isSameProject(workingDirectory, hostProjectRoot) && threadStore) {
      try {
        const thread = await preflightRace(
          Promise.resolve(threadStore.get(threadId)),
          'threadStore.get:mission',
          signal,
        );
        if (thread && (thread.backlogItemId || thread.phase)) {
          const { buildMissionPack, formatMissionPackPrompt } = await import(
            '../../../../../config/governance/mission-pack.js'
          );
          capturedMissionPack = buildMissionPack({
            title: thread.title ?? undefined,
            phase: thread.phase ?? undefined,
            backlogItemId: thread.backlogItemId ?? undefined,
          });
          missionPrefix = formatMissionPackPrompt(capturedMissionPack);
        }
      } catch {
        // Thread store timeout — proceed without mission context
      }
    }

    // F127 account injection:
    // Members bind to a concrete accountRef (builtin oauth account or generic api_key account).
    // Legacy providerProfileId is still read as a migration fallback.
    let catalogMember: CatalogMemberEntry | null = null;
    if (params.gatewayIdentity) {
      try {
        catalogMember = (await deps.catalogProvider.getMember?.(params.gatewayIdentity, agentId as string)) ?? null;
        if (!catalogMember) {
          const routableMembers = await deps.catalogProvider.listRoutableMembers?.(params.gatewayIdentity);
          if (routableMembers) {
            catalogMember = routableMembers.find((member) => member.agentId === (agentId as string)) ?? null;
          }
          if (!catalogMember) {
            const { catalog } = await deps.catalogProvider.readCatalog(params.gatewayIdentity);
            const fallbackConfig = toAllAgentConfigs(catalog)[agentId as string];
            catalogMember = fallbackConfig
              ? { agentId: agentId as string, config: fallbackConfig, extend: fallbackConfig.extend }
              : null;
          }
        }
      } catch (err) {
        log.warn(
          { err, agentId, invocationId, catalogProviderId: deps.catalogProvider.id },
          'Catalog provider lookup failed; falling back to officeClawRegistry',
        );
      }
    }
    const agentConfig = catalogMember?.config ?? officeClawRegistry.tryGet(agentId as string)?.config;
    const provider = agentConfig?.provider;
    const embeddedRuntimeKind = resolveEmbeddedRuntimeKind({ id: agentId as string, provider });
    const embeddedAcpRuntime = embeddedRuntimeKind === 'agentteams_acp';
    const embeddedAcpExecutablePath =
      agentConfig?.embeddedAcpConfig?.executablePath?.trim() ||
      agentConfig?.embeddedAcpExecutablePath?.trim() ||
      undefined;
    const embeddedAcpConfig = agentConfig?.embeddedAcpConfig;
    const builtinClient = provider ? resolveBuiltinClientForProvider(provider) : null;
    const defaultModel = agentConfig?.defaultModel?.trim() || undefined;
    const configProjectRoot = resolveActiveProjectRoot(process.cwd());
    const rawBoundAccountRef = resolveBoundAccountRefForCat(configProjectRoot, agentId, agentConfig);
    const embeddedAgentTeamsBinding = embeddedAcpRuntime
      ? await resolveEmbeddedAgentTeamsBinding(configProjectRoot, rawBoundAccountRef)
      : null;
    const embeddedModelConfigBinding =
      embeddedAcpRuntime && rawBoundAccountRef && !embeddedAgentTeamsBinding
        ? await findProjectModelConfigBinding(configProjectRoot, rawBoundAccountRef)
        : null;
    const boundAccountRef = embeddedAcpRuntime
      ? (embeddedAgentTeamsBinding?.accountRef ?? embeddedModelConfigBinding?.id)
      : rawBoundAccountRef;
    const modelConfigBinding = embeddedAcpRuntime
      ? embeddedModelConfigBinding
      : boundAccountRef
        ? await findProjectModelConfigBinding(configProjectRoot, boundAccountRef)
        : null;
    if (modelConfigBinding) {
      const isHuaweiMaaSBinding =
        modelConfigBinding.id === HUAWEI_MAAS_MODEL_SOURCE_ID && modelConfigBinding.protocol === 'huawei_maas';
      const isCustomOpenAiBinding = modelConfigBinding.protocol === 'openai';
      if (!isHuaweiMaaSBinding && !isCustomOpenAiBinding) {
        throw new Error(`unsupported model config source "${modelConfigBinding.id}"`);
      }
      if (!embeddedAcpRuntime && provider !== 'dare' && provider !== 'relayclaw') {
        throw new Error(
          `client "${provider ?? 'unknown'}" does not support model config source "${modelConfigBinding.id}"`,
        );
      }
      if (defaultModel && modelConfigBinding.models.length && !modelConfigBinding.models.includes(defaultModel)) {
        throw new Error(`model "${defaultModel}" is not available on provider "${modelConfigBinding.id}"`);
      }
    }
    const resolveRuntimeAccount = async () => {
      if (boundAccountRef && modelConfigBinding) {
        return null;
      }
      if (embeddedAcpRuntime) {
        if (!boundAccountRef) return null;
        if (!embeddedAgentTeamsRuntimeAvailable(configProjectRoot, embeddedAcpExecutablePath)) {
          throw new Error(
            `built-in Agent Teams runtime is not ready: missing ${resolveEmbeddedAgentTeamsExecutable(configProjectRoot, embeddedAcpExecutablePath)}`,
          );
        }
        if (embeddedAgentTeamsBinding) {
          return embeddedAgentTeamsBinding.profile;
        }
        return resolveRuntimeProviderProfileById(configProjectRoot, boundAccountRef);
      }
      if (provider === 'acp') {
        if (!boundAccountRef) return null;
        return resolveRuntimeProviderProfileById(configProjectRoot, boundAccountRef);
      }
      if (!builtinClient) return null;
      const runtime = await resolveRuntimeProviderProfileForClient(configProjectRoot, builtinClient, boundAccountRef);
      if (boundAccountRef && !runtime) {
        throw new Error(`bound account "${boundAccountRef}" not found`);
      }
      return runtime;
    };
    const assertCompatibleRuntimeAccount = <T extends { id: string }>(
      account: (T & Parameters<typeof validateRuntimeProviderBinding>[1]) | null,
    ) => {
      if (!provider || !account) return account;
      const compatibilityError = validateRuntimeProviderBinding(provider, account, defaultModel, {
        embeddedAcpRuntime,
      });
      if (compatibilityError) {
        throw new Error(compatibilityError);
      }
      return account;
    };
    const isExplicitBindingCompatibilityError = (err: unknown): err is Error =>
      err instanceof Error &&
      (/bound provider profile/i.test(err.message) || /model ".+" is not available on provider/i.test(err.message));

    // Resolve account first, then use its protocol for env injection.
    // For API Key accounts, protocol is declared on the account itself.
    // For builtin OAuth accounts, protocol comes from the provider mapping.
    let resolvedAccount: Awaited<ReturnType<typeof resolveRuntimeAccount>> = null;
    try {
      resolvedAccount = assertCompatibleRuntimeAccount(await resolveRuntimeAccount());
    } catch (err) {
      if (isExplicitBindingCompatibilityError(err)) {
        throw err;
      }
      if (boundAccountRef && !modelConfigBinding) {
        throw new Error(`failed to resolve bound account "${boundAccountRef}"`);
      }
    }

    // Determine effective protocol: plugin binding > account.protocol > hardcoded default
    const plugin = provider ? (tryGetPluginRegistry()?.get(provider) ?? null) : null;
    const LEGACY_DEFAULT_PROTOCOL: Record<string, string> = {
      anthropic: 'anthropic',
      opencode: 'anthropic',
      openai: 'openai',
      relayclaw: 'openai',
      google: 'google',
      dare: 'openai',
    };
    const defaultProtocol =
      plugin?.binding?.expectedProtocol ?? (provider ? (LEGACY_DEFAULT_PROTOCOL[provider] ?? null) : null);
    const effectiveProtocol =
      resolvedAccount?.kind !== 'builtin' && resolvedAccount?.protocol
        ? resolvedAccount.protocol
        : (modelConfigBinding?.protocol ?? defaultProtocol);

    if (effectiveProtocol) {
      callbackEnv.OFFICE_CLAW_EFFECTIVE_PROTOCOL = effectiveProtocol;
    }

    const credentialCtx: CredentialResolutionContext = {
      agentId,
      provider: provider!,
      defaultModel,
      resolvedAccount,
      effectiveProtocol,
      configProjectRoot,
      userId,
      agentConfig: agentConfig!,
      boundAccountRef: boundAccountRef ?? null,
      modelConfigBinding: modelConfigBinding ?? null,
    };

    const LEGACY_RESOLVERS: Record<
      string,
      (ctx: CredentialResolutionContext) => Record<string, string> | Promise<Record<string, string>>
    > = {
      anthropic: resolveAnthropicCredentialEnv,
      openai: resolveOpenAiCredentialEnv,
      google: resolveGoogleCredentialEnv,
      dare: resolveDareCredentialEnv,
      opencode: resolveOpenCodeCredentialEnv,
      relayclaw: resolveRelayClawCredentialEnv,
    };

    if (plugin?.resolveCredentialEnv) {
      Object.assign(callbackEnv, await plugin.resolveCredentialEnv(credentialCtx));
    } else if (provider && LEGACY_RESOLVERS[provider]) {
      Object.assign(callbackEnv, await LEGACY_RESOLVERS[provider](credentialCtx));
    }

    let resolvedAcpModelProfile: Awaited<ReturnType<typeof resolveRuntimeAcpModelProfileById>> = null;
    let resolvedProviderProfileForService = resolvedAccount;
    if (embeddedAcpRuntime) {
      resolvedProviderProfileForService = buildEmbeddedAgentTeamsProviderProfile(
        configProjectRoot,
        embeddedAcpExecutablePath,
        embeddedAcpConfig,
      );
      if (modelConfigBinding) {
        resolvedAcpModelProfile = buildEmbeddedAgentTeamsModelProfileFromBinding(
          modelConfigBinding,
          defaultModel ?? '',
          userId,
        );
      } else {
        if (!resolvedAccount) {
          throw new Error(
            'built-in Agent Teams runtime requires a bound model config source or OpenAI-compatible API key provider profile',
          );
        }
        resolvedAcpModelProfile = buildEmbeddedAgentTeamsModelProfile(resolvedAccount, defaultModel ?? '');
      }
    } else if (provider === 'acp' && resolvedAccount?.kind === 'acp') {
      if (resolvedAccount.modelAccessMode === 'clowder_default_profile') {
        const modelProfileRef = resolvedAccount.defaultModelProfileRef?.trim();
        if (!modelProfileRef) {
          throw new Error(`ACP provider "${resolvedAccount.id}" requires a default model profile`);
        }
        resolvedAcpModelProfile = await resolveRuntimeAcpModelProfileById(configProjectRoot, modelProfileRef);
        if (!resolvedAcpModelProfile) {
          throw new Error(`ACP model profile "${modelProfileRef}" not found or missing apiKey`);
        }
      }
    }

    // F-BLOAT: Only inject staticIdentity (systemPrompt) on new sessions for cats
    // that support persistent sessions (sessionChain=true).
    // Cats with sessionChain=false always need it — each turn is effectively new.
    // Note: As of F053, all cats (including Gemini) have sessionChain=true.
    // Exception: compression detected → force re-inject (see _needsReinjection)
    //
    // Injection method:
    // - relayclaw: pass request-scoped system prompt via options.systemPrompt so Jiuwen
    //   can append it to its own system prompt channel without polluting user query.
    // - other providers: prepend to prompt string (universal fallback).
    //   --append-system-prompt proved unreliable across providers.
    const isResume = !!sessionId;
    const canSkipOnResume = isSessionChainEnabled(agentId);
    const compressionKey = `${userId}:${agentId as string}:${threadId}`;
    const forceReinjection = _needsReinjection.delete(compressionKey);
    const injectSystemPrompt = !canSkipOnResume || !isResume || forceReinjection;
    // ACP/open agents read the task prompt more reliably than long static identity.
    // Keep the skill-selection reminder close to the task so they query runtime skills
    // before diving into repository search for compare/handoff requests.
    const acpRuntimeSkillHint =
      provider === 'acp' || embeddedAcpRuntime
        ? 'ACP skill rule: compare-options/decision/handoff tasks use office_claw_list_skills before office_claw_search_evidence, repo grep, or read. If a close match appears, call office_claw_load_skill immediately before other tools. Map: compare/recommend/decision -> collaborative-thinking; structured handoff -> cross-agent-handoff. If empty, retry once with a likely exact skill name.'
        : '';

    // Prepend staticIdentity to prompt when injection is needed
    // F070-P2: missionPrefix (dispatch context) is prepended for external projects
    const promptParts = [acpRuntimeSkillHint, missionPrefix, prompt].filter(
      (part) => typeof part === 'string' && part.trim(),
    );
    const promptWithMission = promptParts.join('\n\n');
    const relayClawQueryPrompt = provider === 'relayclaw' ? params.userPrompt?.trim() || promptWithMission : undefined;
    const relayClawSupplementaryInfo =
      provider === 'relayclaw' && relayClawQueryPrompt
        ? stripRelayClawQueryFromSupplementary(promptWithMission, relayClawQueryPrompt)
        : undefined;
    const relayClawSystemPrompt =
      provider === 'relayclaw'
        ? injectSystemPrompt && params.systemPrompt
          ? params.systemPrompt
          : undefined
        : undefined;
    const effectivePrompt =
      provider === 'relayclaw'
        ? (relayClawQueryPrompt ?? promptWithMission)
        : injectSystemPrompt && params.systemPrompt
          ? `${params.systemPrompt}\n\n---\n\n${promptWithMission}`
          : promptWithMission;

    // Workspace sunset: worktree-scoped tmux panes are disabled until terminal cwd
    // is redesigned around thread/projectPath rather than workspace registry.
    let spawnCliOverride: AgentServiceOptions['spawnCliOverride'];
    if (deps.tmuxGateway && workingDirectory) {
      log.info({ workingDirectory, invocationId }, 'tmux pane spawn skipped after workspace sunset');
    }

    const baseOptions: AgentServiceOptions = {
      callbackEnv,
      ...(params.callbackEnvOverrides ? { callbackEnvOverrides: params.callbackEnvOverrides } : {}),
      auditContext: {
        invocationId,
        threadId,
        userId,
        agentId,
        ...(params.traceId ? { traceId: params.traceId } : {}),
      },
      ...(workingDirectory ? { workingDirectory } : {}),
      ...(params.contentBlocks ? { contentBlocks: params.contentBlocks } : {}),
      ...(params.uploadDir ? { uploadDir: params.uploadDir } : {}),
      ...(signal ? { signal } : {}),
      ...(spawnCliOverride ? { spawnCliOverride } : {}),
      invocationId,
      ...(relayClawSystemPrompt ? { systemPrompt: relayClawSystemPrompt } : {}),
      ...(relayClawSupplementaryInfo ? { supplementaryInfo: relayClawSupplementaryInfo } : {}),
      ...(sessionId ? { cliSessionId: sessionId } : {}),
      ...(params.resumeSession ? { resumeSession: true } : {}),
      ...(params.interactiveAsk ? { interactiveAsk: true } : {}),
      // F118 Phase B: Enable liveness probe with defaults for all CLI providers
      // #774: stallAutoKill — auto-kill on idle-silent stall instead of waiting 30min
      // Cold-start protection is in cli-spawn (firstEventAt guard), so all providers
      // can use the same default stallWarningMs safely.
      livenessProbe: { stallAutoKill: true },
      ...(agentConfig?.cliConfigArgs?.length ? { cliConfigArgs: agentConfig.cliConfigArgs } : {}),
      ...(resolvedProviderProfileForService ? { providerProfile: resolvedProviderProfileForService } : {}),
      ...(resolvedAcpModelProfile ? { acpModelProfile: resolvedAcpModelProfile } : {}),
      ...(params.gatewayIdentity ? { gatewayIdentity: params.gatewayIdentity } : {}),
      ...(catalogMember?.extend ? { memberExtend: catalogMember.extend } : {}),
    };

    let lastErrorMessage: string | undefined;

    const processMessage = async (msg: AgentMessage): Promise<AgentMessage[]> => {
      const outputs: AgentMessage[] = [];

      if (msg.type === 'error') {
        hadStreamError = true;
        lastErrorMessage = msg.error;
      }

      if (msg.type === 'session_init' && msg.sessionId) {
        log.info(
          { cliSessionId: msg.sessionId, threadId, agentId, userId, invocationId },
          'Session init: binding session',
        );
        try {
          await sessionManager.store(userId, agentId, threadId, msg.sessionId);
        } catch {
          // Redis write failure — session won't persist, but chain continues
        }

        // F24: Ensure SessionRecord exists for this session
        if (deps.sessionChainStore && sessionChainActive) {
          try {
            const existing = await deps.sessionChainStore.getActive(agentId, threadId);
            if (existing) {
              if (existing.cliSessionId !== msg.sessionId) {
                // CLI session changed → old context is lost (resume failed / CLI restarted).
                // Use requestSeal + finalize to ensure transcript/digest are written,
                // not bare update(status:'sealed') which skips flush.
                let sealAccepted = false;
                if (deps.sessionSealer) {
                  try {
                    const result = await deps.sessionSealer.requestSeal({
                      sessionId: existing.id,
                      reason: 'cli_session_replaced',
                    });
                    sealAccepted = result.accepted;
                    if (sealAccepted) {
                      deps.sessionSealer.finalize({ sessionId: existing.id }).catch((err: unknown) => {
                        log.error({ err, sessionId: existing.id }, 'session finalize failed — recall will 404');
                      });
                    }
                  } catch {
                    /* best-effort seal */
                  }
                } else {
                  // Fallback: no sealer available — bare update (legacy path)
                  const now = Date.now();
                  await deps.sessionChainStore.update(existing.id, {
                    status: 'sealed',
                    sealReason: 'cli_session_replaced',
                    sealedAt: now,
                    updatedAt: now,
                  });
                  sealAccepted = true;
                }
                // Only create new active record if old one was successfully sealed.
                // Otherwise we'd have two active records — a dirty state.
                if (sealAccepted || !deps.sessionSealer) {
                  await deps.sessionChainStore.create({
                    cliSessionId: msg.sessionId,
                    threadId,
                    agentId,
                    userId,
                  });
                }
              }
            } else {
              // No active session (first invocation or previous was sealed)
              await deps.sessionChainStore.create({
                cliSessionId: msg.sessionId,
                threadId,
                agentId,
                userId,
              });
            }
          } catch {
            // Best-effort — don't break the invocation chain
          }
        }

        // Push session info as system_info for frontend status panel
        // Include sessionSeq if SessionChainStore is available
        let sessionSeq: number | undefined;
        if (deps.sessionChainStore && sessionChainActive) {
          try {
            const activeRec = await deps.sessionChainStore.getActive(agentId, threadId);
            sessionSeq = activeRec != null ? activeRec.seq + 1 : undefined;
          } catch {
            /* best-effort */
          }
        }
        outputs.push({
          type: 'system_info' as const,
          agentId,
          content: JSON.stringify({
            type: 'invocation_metrics',
            kind: 'session_started',
            sessionId: msg.sessionId,
            invocationId,
            ...(sessionSeq !== undefined ? { sessionSeq } : {}),
          }),
          timestamp: Date.now(),
        });
      }

      if (msg.type === 'done') {
        // === AGENT_RESPONDED / AGENT_ERROR 审计 (fire-and-forget) ===
        // P1 fix: when error was yielded during stream, emit AGENT_ERROR instead of CAT_RESPONDED
        const durationMs = Date.now() - startTime;
        const auditType = hadStreamError ? AuditEventTypes.AGENT_ERROR : AuditEventTypes.AGENT_RESPONDED;
        auditLog
          .append({
            type: auditType,
            threadId,
            data: {
              agentId,
              userId,
              invocationId,
              durationMs,
              ...(hadStreamError ? { error: lastErrorMessage ?? 'unknown stream error' } : {}),
              isFinal: isLastCat,
              metadata: msg.metadata,
              ...(params.traceId ? { traceId: params.traceId } : {}),
            },
          })
          .catch((err) => {
            log.warn({ threadId, invocationId, err }, `${auditType} audit write failed`);
          });

        // Increment session messageCount (best-effort).
        // This counter is critical for unseal safety: empty sessions (0 messages)
        // can be displaced, but sessions with messages must not be silently sealed.
        if (deps.sessionChainStore && sessionChainActive) {
          try {
            const activeRec = await deps.sessionChainStore.getActive(agentId, threadId);
            if (activeRec) {
              await deps.sessionChainStore.update(activeRec.id, {
                messageCount: (activeRec.messageCount ?? 0) + 1,
                updatedAt: Date.now(),
              });
            }
          } catch {
            /* best-effort: messageCount miss won't break invocation */
          }
        }

        // Push completion metrics for frontend status panel
        outputs.push({
          type: 'system_info' as const,
          agentId,
          content: JSON.stringify({
            type: 'invocation_metrics',
            kind: 'invocation_complete',
            invocationId,
            durationMs,
            sessionId: msg.metadata?.sessionId,
          }),
          timestamp: Date.now(),
        });

        // F070 Phase 3a: Capture execution digest for external project dispatch (best-effort)
        if (capturedMissionPack && workingDirectory && deps.executionDigestStore) {
          try {
            const { captureExecutionDigest } = await import(
              '../../../../../config/governance/execution-digest-capture.js'
            );
            const digestInput = captureExecutionDigest(
              capturedMissionPack,
              {
                summary: '', // Populated by HandoffDigestGenerator in future enhancement
                filesChanged: [],
                blocked: false,
                hadError: hadStreamError,
              },
              { projectPath: workingDirectory, threadId, agentId: agentId as string, userId },
            );
            deps.executionDigestStore.create(digestInput);
          } catch {
            /* best-effort: digest capture failure doesn't break invocation */
          }
        }

        // F8: Push token usage for frontend cost/token display
        if (msg.metadata?.usage) {
          outputs.push({
            type: 'system_info' as const,
            agentId,
            content: JSON.stringify({
              type: 'invocation_usage',
              agentId,
              usage: msg.metadata.usage,
            }),
            timestamp: Date.now(),
          });

          // F24: Compute and emit context health (only when session chain is enabled)
          if (sessionChainActive) {
            // Use lastTurnInputTokens (per-API-call) for accurate context fill,
            // then fallback to aggregated inputTokens, and finally totalTokens
            // for providers (Gemini CLI) that only expose a total count.
            const windowSize =
              msg.metadata.usage.contextWindowSize ?? getContextWindowFallback(msg.metadata.model ?? '');
            const usedFrom =
              msg.metadata.usage.lastTurnInputTokens != null
                ? 'last_turn'
                : msg.metadata.usage.inputTokens != null
                  ? 'input'
                  : msg.metadata.usage.totalTokens != null
                    ? 'total'
                    : null;
            const usedTokens =
              usedFrom === 'last_turn'
                ? msg.metadata.usage.lastTurnInputTokens!
                : usedFrom === 'input'
                  ? msg.metadata.usage.inputTokens!
                  : usedFrom === 'total'
                    ? msg.metadata.usage.totalTokens!
                    : 0;
            if (windowSize && usedTokens > 0) {
              const source: ContextHealth['source'] =
                msg.metadata.usage.contextWindowSize != null && usedFrom !== 'total' ? 'exact' : 'approx';
              const health: ContextHealth = {
                usedTokens,
                windowTokens: windowSize,
                fillRatio: Math.min(usedTokens / windowSize, 1.0),
                source,
                measuredAt: Date.now(),
              };
              // Update SessionRecord (best-effort): persist health + usage snapshot
              if (deps.sessionChainStore) {
                try {
                  const activeRecord = await deps.sessionChainStore.getActive(agentId, threadId);
                  if (activeRecord) {
                    const u = msg.metadata?.usage!;
                    await deps.sessionChainStore.update(activeRecord.id, {
                      contextHealth: health,
                      lastUsage: {
                        ...(u.inputTokens != null ? { inputTokens: u.inputTokens } : {}),
                        ...(u.outputTokens != null ? { outputTokens: u.outputTokens } : {}),
                        ...(u.cacheReadTokens != null ? { cacheReadTokens: u.cacheReadTokens } : {}),
                        ...(u.costUsd != null ? { costUsd: u.costUsd } : {}),
                      },
                      updatedAt: Date.now(),
                    });
                  }
                } catch {
                  /* best-effort */
                }
              }
              // F-BLOAT: Detect context compression for re-injection on next turn.
              // When usedTokens drops >60% from previous known value, the CLI
              // auto-compacted its context. Flag for systemPrompt re-injection.
              const cKey = `${userId}:${agentId as string}:${threadId}`;
              const prevFill = _prevContextFill.get(cKey);
              _prevContextFill.set(cKey, usedTokens);
              if (prevFill && usedTokens < prevFill * 0.4) {
                _needsReinjection.add(cKey);
              }
              outputs.push({
                type: 'system_info' as const,
                agentId,
                content: JSON.stringify({ type: 'context_health', agentId, health }),
                timestamp: Date.now(),
              });

              // F33: Strategy-driven seal decision (replaces F24 Phase B shouldSeal)
              if (deps.sessionSealer && deps.sessionChainStore) {
                try {
                  // F062-fix:
                  // 1) api_key + approx health can be noisy on third-party gateways
                  // 2) api_key + compress strategy should not be force-sealed here
                  // Keep context_health observability in both cases.
                  const provider =
                    agentConfig?.provider ?? officeClawRegistry.tryGet(agentId as string)?.config.provider;
                  const profileMode = callbackEnv[ANTHROPIC_PROFILE_MODE_KEY];
                  const strategy = getSessionStrategy(agentId as string);
                  const isAnthropicApiKey = provider === 'anthropic' && profileMode === ANTHROPIC_PROFILE_MODE_API_KEY;
                  const skipAutoSealForApproxApiKey = isAnthropicApiKey && health.source === 'approx';
                  const skipAutoSealForApiKeyCompress = isAnthropicApiKey && strategy.strategy === 'compress';
                  if (!skipAutoSealForApproxApiKey && !skipAutoSealForApiKeyCompress) {
                    const activeRecord = await deps.sessionChainStore.getActive(agentId, threadId);
                    const action = shouldTakeAction(
                      health.fillRatio,
                      health.windowTokens,
                      health.usedTokens,
                      activeRecord?.compressionCount ?? 0,
                      strategy,
                    );

                    switch (action.type) {
                      case 'none':
                        break;
                      case 'warn':
                        // warn is already emitted via context_health system_info above
                        break;
                      case 'seal':
                      case 'seal_after_compress': {
                        if (activeRecord) {
                          const sealResult = await deps.sessionSealer.requestSeal({
                            sessionId: activeRecord.id,
                            reason: action.reason,
                          });
                          if (sealResult.accepted) {
                            sessionManager.delete(userId, agentId, threadId).catch(() => {});
                            outputs.push({
                              type: 'system_info' as const,
                              agentId,
                              content: JSON.stringify({
                                type: 'session_seal_requested',
                                agentId,
                                sessionId: activeRecord.id,
                                sessionSeq: activeRecord.seq + 1,
                                reason: action.reason,
                                healthSnapshot: health,
                              }),
                              timestamp: Date.now(),
                            });
                            deps.sessionSealer.finalize({ sessionId: activeRecord.id }).catch((err: unknown) => {
                              log.error(
                                { err, sessionId: activeRecord.id },
                                'session finalize failed — recall will 404',
                              );
                            });
                          }
                        }
                        break;
                      }
                      case 'allow_compress':
                        // Don't seal — let CLI compress. Log for observability.
                        outputs.push({
                          type: 'system_info' as const,
                          agentId,
                          content: JSON.stringify({
                            type: 'strategy_allow_compress',
                            agentId,
                            strategy: strategy.strategy,
                            compressionCount: activeRecord?.compressionCount ?? 0,
                            healthSnapshot: health,
                          }),
                          timestamp: Date.now(),
                        });
                        break;
                    }
                  }
                } catch {
                  /* best-effort: strategy failure doesn't break invocation */
                }
              }
            }
          }
        }

        outputs.push({ ...msg, isFinal: isLastCat });
      } else {
        outputs.push(attachInvocationIdToTaskProgress(msg));

        // F26: Detect task management tools and emit task_progress for frontend
        if (msg.type === 'tool_use' && msg.toolName) {
          const progress = extractTaskProgress(msg.toolName, msg.toolInput);
          if (progress) {
            outputs.push({
              type: 'system_info' as const,
              agentId,
              content: JSON.stringify({ type: 'task_progress', agentId, invocationId, ...progress }),
              timestamp: Date.now(),
            });
          }
        }
      }

      // F24 Phase C: Record event to transcript buffer (best-effort)
      if (deps.transcriptWriter && deps.sessionChainStore && sessionChainActive) {
        try {
          const activeRec = await deps.sessionChainStore.getActive(agentId, threadId);
          if (activeRec) {
            const sessInfo: TranscriptSessionInfo = {
              sessionId: activeRec.id,
              threadId,
              agentId: activeRec.agentId,
              cliSessionId: activeRec.cliSessionId,
              seq: activeRec.seq,
            };
            // Record the raw agent message as a transcript event
            deps.transcriptWriter.appendEvent(sessInfo, msg as unknown as Record<string, unknown>, invocationId);
          }
        } catch {
          /* best-effort */
        }
      }

      return outputs;
    };

    const streamProcessedOutputs = async function* (sourceMsg: AgentMessage | undefined): AsyncIterable<AgentMessage> {
      if (!sourceMsg) return;
      for (const out of await processMessage(sourceMsg)) {
        if (out.type === 'error') {
          hadError = true;
          terminalTaskProgressStatus = 'interrupted';
          terminalInterruptReason = 'error';
        }
        if (out.type === 'system_info' && out.content) {
          try {
            const parsed = JSON.parse(out.content) as { type?: string; interruptReason?: unknown };
            if (parsed.type === 'recoverable_pause') {
              terminalTaskProgressStatus = 'interrupted';
              terminalInterruptReason =
                typeof parsed.interruptReason === 'string' ? parsed.interruptReason : 'recoverable_pause';
            }
          } catch {
            /* ignore malformed system_info payloads */
          }
        }
        await maybePersistTaskProgress(out);
        if (out.type === 'done' && terminalTaskProgressStatus === null) {
          if (hadError) {
            terminalTaskProgressStatus = 'interrupted';
            terminalInterruptReason = 'error';
          } else if (signal?.aborted) {
            terminalTaskProgressStatus = 'interrupted';
            terminalInterruptReason = 'aborted';
          } else {
            terminalTaskProgressStatus = 'completed';
            terminalInterruptReason = null;
          }
        }
        if (out.type === 'done') await finalizeTaskProgress();
        yield out;
      }
    };

    // Self-heal policy (at most one retry total):
    // 1) stale --resume session: "No conversation found with session ID ..."
    // 2) poisoned --resume session: "prompt token count ... exceeds the limit ..."
    // 3) transient CLI bootstrap exit: "CLI 异常退出 (code: 1, signal: none)"
    const initialResumeSessionId = sessionId;
    const shouldTrackGeminiResumeFailures = agentId === 'gemini' && Boolean(initialResumeSessionId);
    const resumeFailureCounts: Partial<Record<ResumeFailureKind, number>> = {};
    const maxAttempts = 2;
    let allowSessionRetry = Boolean(sessionId);
    let allowTransientRetry = true;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const attemptStartedAt = Date.now();
      const options: AgentServiceOptions = {
        ...(sessionId ? { sessionId } : {}),
        ...baseOptions,
      };
      let suppressedMissingSessionError: AgentMessage | undefined;
      let suppressedPromptLimitError: AgentMessage | undefined;
      let suppressedTransientCliError: AgentMessage | undefined;
      let suppressedTimeoutError: AgentMessage | undefined;
      let shouldRetryWithoutSession = false;
      let shouldRetryOnTransientCliExit = false;
      let attemptHasContentOutput = false;
      // Substantive = real model output (text/tool), excludes system_info/session_init/error/done.
      // Used for timeout-retry: system_info (e.g. timeout_diagnostics) must NOT block retry.
      let attemptHasSubstantiveOutput = false;

      // F089: Use abortableNext instead of `for await` so the invocation timeout
      // can break out even when the service generator is stuck on an unresolvable await.
      log.debug(
        { invocationId, agentId, promptLength: effectivePrompt.length, sessionId: options.sessionId, attempt },
        'Dispatching to agent service',
      );
      const serviceIter = service.invoke(effectivePrompt, options)[Symbol.asyncIterator]();
      for (;;) {
        const iterResult = await abortableNext(serviceIter, signal);
        if (iterResult.done) break;
        const msg = iterResult.value;
        resetInvocationTimeout();
        if (msg.type === 'error') {
          log.error(
            {
              invocationId,
              agentId,
              threadId,
              userId,
              sessionId: options.sessionId,
              error: msg.error,
            },
            'Agent service emitted error message',
          );
        }
        if (shouldTrackGeminiResumeFailures && options.sessionId && msg.type === 'error') {
          const failureKind = classifyResumeFailure(msg.error);
          if (failureKind) {
            resumeFailureCounts[failureKind] = (resumeFailureCounts[failureKind] ?? 0) + 1;
          }
        }

        if (allowSessionRetry && msg.type === 'error' && isMissingClaudeSessionError(msg.error)) {
          suppressedMissingSessionError = msg;
          continue;
        }
        if (
          allowSessionRetry &&
          !attemptHasContentOutput &&
          msg.type === 'error' &&
          isPromptTokenLimitExceededError(msg.error)
        ) {
          suppressedPromptLimitError = msg;
          continue;
        }
        if (
          allowTransientRetry &&
          !attemptHasContentOutput &&
          msg.type === 'error' &&
          isTransientCliExitCode1(msg.error)
        ) {
          suppressedTransientCliError = msg;
          continue;
        }
        // #774 self-heal: CLI timeout during session resume with no substantive output
        // → likely stale/unreachable session. Suppress and retry without session.
        // Uses attemptHasSubstantiveOutput (not attemptHasContentOutput) because
        // timeout_diagnostics (system_info) must NOT block the retry path.
        if (
          allowSessionRetry &&
          options.sessionId &&
          !attemptHasSubstantiveOutput &&
          msg.type === 'error' &&
          isCliTimeoutError(msg.error)
        ) {
          suppressedTimeoutError = msg;
          continue;
        }

        if (
          suppressedMissingSessionError ||
          suppressedPromptLimitError ||
          suppressedTransientCliError ||
          suppressedTimeoutError
        ) {
          if (msg.type === 'done') {
            shouldRetryWithoutSession = Boolean(
              suppressedMissingSessionError || suppressedPromptLimitError || suppressedTimeoutError,
            );
            shouldRetryOnTransientCliExit = Boolean(suppressedTransientCliError);
            break;
          }

          if (suppressedMissingSessionError) {
            for await (const out of streamProcessedOutputs(suppressedMissingSessionError)) {
              yield out;
            }
            suppressedMissingSessionError = undefined;
          }
          if (suppressedPromptLimitError) {
            for await (const out of streamProcessedOutputs(suppressedPromptLimitError)) {
              yield out;
            }
            suppressedPromptLimitError = undefined;
          }
          if (suppressedTransientCliError) {
            for await (const out of streamProcessedOutputs(suppressedTransientCliError)) {
              yield out;
            }
            suppressedTransientCliError = undefined;
          }
          if (suppressedTimeoutError) {
            for await (const out of streamProcessedOutputs(suppressedTimeoutError)) {
              yield out;
            }
            suppressedTimeoutError = undefined;
          }
        }

        for await (const out of streamProcessedOutputs(msg)) {
          yield out;
        }
        if (msg.type !== 'error' && msg.type !== 'done' && msg.type !== 'session_init') {
          attemptHasContentOutput = true;
          // Substantive = real model output, excludes system_info (e.g. timeout_diagnostics).
          if (msg.type !== 'system_info') {
            attemptHasSubstantiveOutput = true;
          }
          // F118 AC-C6: Reset consecutive restore failure counter on successful content
          if (deps.sessionChainStore && !didResetRestoreFailures) {
            didResetRestoreFailures = true; // only reset once per invocation
            try {
              const activeRec = await deps.sessionChainStore.getActive(agentId as AgentId, threadId);
              if (activeRec && (activeRec.consecutiveRestoreFailures ?? 0) > 0) {
                await deps.sessionChainStore.update(activeRec.id, {
                  consecutiveRestoreFailures: 0,
                  updatedAt: Date.now(),
                });
              }
            } catch {
              /* best-effort reset */
            }
          }
        }
      }

      if (shouldRetryWithoutSession && attempt + 1 < maxAttempts) {
        if (agentId === 'gemini') {
          log.info(
            {
              agentId,
              threadId,
              invocationId,
              reason: 'missing_session',
              attempt: attempt + 1,
              retryAttempt: attempt + 2,
              elapsedMs: Date.now() - attemptStartedAt,
              hadSessionId: Boolean(options.sessionId),
            },
            'Gemini retrying invoke',
          );
        }
        try {
          await sessionManager.delete(userId, agentId, threadId);
        } catch {
          // Redis delete failure — best-effort only
        }
        // F118 AC-C6: Increment consecutive restore failure counter
        if (deps.sessionChainStore) {
          try {
            const activeRec = await deps.sessionChainStore.getActive(agentId as AgentId, threadId);
            if (activeRec) {
              await deps.sessionChainStore.update(activeRec.id, {
                consecutiveRestoreFailures: (activeRec.consecutiveRestoreFailures ?? 0) + 1,
                updatedAt: Date.now(),
              });
            }
          } catch {
            /* best-effort counter update */
          }
        }
        sessionId = undefined;
        // F118 P2-fix: Clear stale cliSessionId so retry diagnostics don't mis-attribute
        delete baseOptions.cliSessionId;
        // F-BLOAT P1: self-heal drops session → retry is now a fresh session.
        // Must re-inject systemPrompt since baseOptions may have omitted it
        // when the original attempt was a resume (injectSystemPrompt=false).
        if (params.systemPrompt && !baseOptions.systemPrompt) {
          baseOptions.systemPrompt = params.systemPrompt;
        }
        allowSessionRetry = false;
        continue;
      }
      if (shouldRetryOnTransientCliExit && attempt + 1 < maxAttempts) {
        if (agentId === 'gemini') {
          log.info(
            {
              agentId,
              threadId,
              invocationId,
              reason: 'transient_cli_exit',
              attempt: attempt + 1,
              retryAttempt: attempt + 2,
              elapsedMs: Date.now() - attemptStartedAt,
              hadSessionId: Boolean(options.sessionId),
            },
            'Gemini retrying invoke',
          );
        }
        allowTransientRetry = false;
        continue;
      }

      if (suppressedMissingSessionError) {
        for await (const out of streamProcessedOutputs(suppressedMissingSessionError)) {
          yield out;
        }
      }
      if (suppressedPromptLimitError) {
        for await (const out of streamProcessedOutputs(suppressedPromptLimitError)) {
          yield out;
        }
      }
      if (suppressedTransientCliError) {
        for await (const out of streamProcessedOutputs(suppressedTransientCliError)) {
          yield out;
        }
      }
      break;
    }

    if (shouldTrackGeminiResumeFailures && Object.keys(resumeFailureCounts).length > 0) {
      const total = Object.values(resumeFailureCounts).reduce((sum, count) => sum + (count ?? 0), 0);
      for (const out of await processMessage({
        type: 'system_info' as const,
        agentId,
        content: JSON.stringify({
          type: 'resume_failure_stats',
          agentId,
          invocationId,
          sessionId: initialResumeSessionId,
          counts: resumeFailureCounts,
          total,
        }),
        timestamp: Date.now(),
      })) {
        await maybePersistTaskProgress(out);
        yield out;
      }
    }
    didComplete = true; // F118 AC-C5: Normal completion reached
    log.info(
      userVisibleFields('critical', {
        invocationId,
        agentId,
        threadId,
        userId,
        durationMs: Date.now() - startTime,
      }),
      'Invocation completed',
    );
  } catch (err) {
    log.error(
      userVisibleFields('critical', {
        invocationId,
        agentId,
        threadId,
        userId,
        err,
      }),
      'invokeSingleCat crashed before fallback error emission',
    );
    // === AGENT_ERROR 审计 (fire-and-forget, 历史 review P2-3) ===
    const durationMs = Date.now() - startTime;
    auditLog
      .append({
        type: AuditEventTypes.AGENT_ERROR,
        threadId,
        data: {
          agentId,
          userId,
          invocationId,
          durationMs,
          error: err instanceof Error ? err.message : String(err),
          ...(params.traceId ? { traceId: params.traceId } : {}),
        },
      })
      .catch((auditErr) => {
        log.warn({ threadId, invocationId, err: auditErr }, 'AGENT_ERROR audit write failed');
      });

    hadError = true;
    didWriteAudit = true; // F118 AC-C5: Catch block wrote audit, don't double-write in finally
    yield {
      type: 'error' as const,
      agentId,
      error: err instanceof Error ? err.message : String(err),
      timestamp: Date.now(),
    };
    await finalizeTaskProgress();
    yield { type: 'done' as const, agentId, isFinal: isLastCat, timestamp: Date.now() };
  } finally {
    // F089: Clear invocation hard timeout
    if (invocationTimer) clearTimeout(invocationTimer);

    // F118: Release session mutex (idempotent — safe if never acquired)
    sessionMutexRelease?.();

    // F118 AC-C5: Fallback audit for generator .return() path (#99)
    // If generator was force-returned (e.g. AbortController, client disconnect)
    // and the catch block didn't fire, write a fallback AGENT_ERROR audit entry.
    if (!didWriteAudit && !hadError && !didComplete) {
      const durationMs = Date.now() - startTime;
      auditLog
        .append({
          type: AuditEventTypes.AGENT_ERROR,
          threadId,
          data: {
            agentId,
            userId,
            invocationId,
            durationMs,
            error: 'generator_returned_without_completion',
            ...(params.traceId ? { traceId: params.traceId } : {}),
          },
        })
        .catch((auditErr) => {
          log.warn({ threadId, invocationId, err: auditErr }, 'Finally fallback AGENT_ERROR audit write failed');
        });
    }

    await finalizeTaskProgress();

    // F089: Mark agent pane status when invocation completes
    if (deps.agentPaneRegistry?.getByInvocation(invocationId)) {
      if (hadError) {
        deps.agentPaneRegistry.markCrashed(invocationId, null);
      } else {
        deps.agentPaneRegistry.markDone(invocationId, 0);
      }
    }
  }
}
