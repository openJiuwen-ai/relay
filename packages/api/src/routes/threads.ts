/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Thread API Routes
 * POST   /api/threads     - 创建对话
 * GET    /api/threads      - 列出用户的对话
 * GET    /api/threads/:id  - 获取对话详情
 * PATCH  /api/threads/:id  - 更新标题
 * DELETE /api/threads/:id  - 删除对话
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import { agentIdSchema } from '@openjiuwen/relay-shared';
import { mkdir, readdir, realpath, rm, rmdir, stat } from 'node:fs/promises';
import { parse as parsePath, relative, resolve, win32 } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GovernanceBootstrapService } from '../config/governance/governance-bootstrap.js';
import { GOVERNANCE_PACK_VERSION } from '../config/governance/governance-pack.js';
import type { InvocationTracker } from '../domains/agents/services/agents/invocation/InvocationTracker.js';
import type { TaskProgressStore } from '../domains/agents/services/agents/invocation/TaskProgressStore.js';
import { AuditEventTypes, getEventAuditLog } from '../domains/agents/services/orchestration/EventAuditLog.js';
import type { IBacklogStore } from '../domains/agents/services/stores/ports/BacklogStore.js';
import type { DeliveryCursorStore } from '../domains/agents/services/stores/ports/DeliveryCursorStore.js';
import type { IDraftStore } from '../domains/agents/services/stores/ports/DraftStore.js';
import type { IFeedbackStore } from '../domains/agents/services/stores/ports/FeedbackStore.js';
import type { IMemoryStore } from '../domains/agents/services/stores/ports/MemoryStore.js';
import type { IMessageStore } from '../domains/agents/services/stores/ports/MessageStore.js';
import type { ITaskStore } from '../domains/agents/services/stores/ports/TaskStore.js';
import type { IThreadReadStateStore } from '../domains/agents/services/stores/ports/ThreadReadStateStore.js';
import type {
  IThreadStore,
  ThreadRoutingPolicyV1,
} from '../domains/agents/services/stores/ports/ThreadStore.js';
import { createModuleLogger } from '../infrastructure/logger.js';
import { findMonorepoRoot } from '../utils/monorepo-root.js';
import { pathsEqual, validateProjectPath } from '../utils/project-path.js';
import { resolveUserId } from '../utils/request-identity.js';
import { getMultiMentionOrchestrator } from './callback-multi-mention-routes.js';
import type { IConnectorThreadBindingStore } from '../infrastructure/connectors/ConnectorThreadBindingStore.js';
import type { DynamicTaskStore } from '../infrastructure/scheduler/DynamicTaskStore.js';
import type { TaskRunnerV2 } from '../infrastructure/scheduler/TaskRunnerV2.js';

const log = createModuleLogger('routes/threads');

export interface ThreadsRoutesOptions {
  threadStore: IThreadStore;
  /** Optional: unbind connector chats when a thread is deleted to avoid routing into hidden soft-deleted threads. */
  connectorBindingStore?: IConnectorThreadBindingStore;
  /** Optional: cascade delete messages when thread is deleted */
  messageStore?: IMessageStore;
  /** Optional: cascade delete message feedback when thread is deleted */
  feedbackStore?: IFeedbackStore;
  /** Optional: cascade delete tasks when thread is deleted */
  taskStore?: ITaskStore;
  /** Optional: cascade delete memory when thread is deleted */
  memoryStore?: IMemoryStore;
  /** Optional: cascade delete delivery cursors when thread is deleted */
  deliveryCursorStore?: DeliveryCursorStore;
  /** Optional: protect active invocations from thread deletion (#35) */
  invocationTracker?: InvocationTracker;
  /** #80: cascade delete streaming drafts */
  draftStore?: IDraftStore;
  /** F045: per-agent task progress snapshot store (Redis-backed when available) */
  taskProgressStore?: TaskProgressStore;
  /** F069: per-user/per-thread read state for unread badge persistence */
  readStateStore?: IThreadReadStateStore;
  /** F095 Phase C: validate backlogItemId on thread creation */
  backlogStore?: IBacklogStore;
  /** Optional: cascade delete dynamic schedule tasks when thread is deleted */
  dynamicTaskStore?: DynamicTaskStore;
  /** Optional: unregister dynamic tasks from runtime when thread is deleted */
  taskRunner?: TaskRunnerV2;
}

const createThreadSchema = z
  .object({
    /** Legacy fallback only; preferred identity source is X-Office-Claw-User header. */
    userId: z.string().min(1).max(100).optional(),
    title: z.string().min(1).max(200).optional(),
    projectPath: z.string().min(1).max(500).optional(),
    /** F32-b Phase 2: Thread-level agent preference (validated against officeClawRegistry) */
    preferredCats: z.array(agentIdSchema()).max(10).optional(),
    /** F095 Phase C: Pin thread on creation */
    pinned: z.boolean().optional(),
    /** F095 Phase C: Associate thread with a backlog item at creation */
    backlogItemId: z.string().min(1).max(100).optional(),
  })
  .strict();

const listThreadsSchema = z.object({
  projectPath: z.string().min(1).max(500).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  backlogItemIds: z.string().trim().min(1).max(4000).optional(),
  hasBacklogItemId: z.union([z.boolean(), z.string().trim().min(1).max(8)]).optional(),
  /** F058 Phase G: comma-separated feature IDs to match against thread titles (e.g. "f058,f042") */
  featureIds: z.string().trim().min(1).max(2000).optional(),
  /** F095 Phase D: When true, list soft-deleted threads (trash bin) instead of active threads. */
  deleted: z.union([z.boolean(), z.string().trim().min(1).max(8)]).optional(),
});

const deleteThreadQuerySchema = z.object({
  deleteWorkspace: z.union([z.boolean(), z.string().trim().min(1).max(8)]).optional(),
});

function parseOptionalBooleanQuery(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

function isPathWithinRoot(absPath: string, root: string): boolean {
  const rel = relative(root, absPath);
  if (rel === '') return true;
  if (process.platform === 'win32' && win32.isAbsolute(rel)) return false;
  return !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\');
}

function isUnsafeWorkspaceDeletionTarget(absPath: string, monorepoRoot: string): boolean {
  const root = parsePath(absPath).root;
  return pathsEqual(absPath, root) || pathsEqual(absPath, monorepoRoot);
}

/**
 * 删除工作空间目录，但保留 memory 目录（可能被 SQLite 锁定）
 * memory 目录包含 agent 的索引缓存，保留它不影响系统运行
 */
async function deleteWorkspaceExcludingMemory(workspacePath: string): Promise<{ memoryPreserved: boolean }> {
  const entries = await readdir(workspacePath, { withFileTypes: true });
  let memoryPreserved = false;
  for (const entry of entries) {
    if (entry.name === 'memory') {
      // 跳过 memory 目录，保留 SQLite 数据库文件
      memoryPreserved = true;
      continue;
    }
    const entryPath = resolve(workspacePath, entry.name);
    try {
      await rm(entryPath, { recursive: true, force: true });
    } catch {
      // 单个文件/目录删除失败时继续删除其他内容
    }
  }
  // 尝试删除工作空间根目录（如果只剩 memory 目录可能会失败，忽略错误）
  try {
    await rmdir(workspacePath);
  } catch {
    // 目录非空（memory 目录保留）或被锁定，忽略
  }
  return { memoryPreserved };
}

interface ResolvedThreadProjectPath {
  projectPath: string;
  monorepoRoot: string;
  usedDefaultWorkspace: boolean;
}

async function resolveThreadProjectPath(projectPath?: string): Promise<ResolvedThreadProjectPath> {
  if (projectPath && projectPath !== 'default') {
    const validated = await validateProjectPath(projectPath);
    if (validated) {
      return {
        projectPath: validated,
        monorepoRoot: findMonorepoRoot(process.cwd()),
        usedDefaultWorkspace: false,
      };
    }
    log.warn({ projectPath }, 'Invalid projectPath for thread creation, falling back to workspace');
  }

  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const monorepoRoot = findMonorepoRoot(process.cwd());
  const workspacePath = resolve(monorepoRoot, 'workspace', timestamp);
  await mkdir(workspacePath, { recursive: true });

  const [resolvedWorkspacePath, resolvedMonorepoRoot] = await Promise.all([realpath(workspacePath), realpath(monorepoRoot)]);
  if (!isPathWithinRoot(resolvedWorkspacePath, resolvedMonorepoRoot)) {
    throw new Error(`Workspace path escapes monorepo root: ${resolvedWorkspacePath}`);
  }

  const info = await stat(resolvedWorkspacePath);
  if (!info.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${resolvedWorkspacePath}`);
  }

  return {
    projectPath: resolvedWorkspacePath,
    monorepoRoot: resolvedMonorepoRoot,
    usedDefaultWorkspace: true,
  };
}

async function shouldBootstrapGovernance(projectPath: string, monorepoRoot: string): Promise<boolean> {
  const service = new GovernanceBootstrapService(monorepoRoot);
  const entry = await service.getRegistry().get(projectPath);
  return !entry || entry.packVersion !== GOVERNANCE_PACK_VERSION;
}

async function bootstrapGovernanceForProject(projectPath: string, monorepoRoot: string): Promise<void> {
  const service = new GovernanceBootstrapService(monorepoRoot);
  await service.bootstrap(projectPath, { dryRun: false });
}

const threadRoutingRuleSchema = z
  .object({
    avoidCats: z.array(agentIdSchema()).max(10).optional(),
    preferCats: z.array(agentIdSchema()).max(10).optional(),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\r\n]+$/, 'reason must be single-line')
      .optional(),
    expiresAt: z.number().int().positive().optional(),
  })
  .strict();

const threadRoutingPolicySchema = z
  .object({
    v: z.literal(1),
    scopes: z
      .object({
        review: threadRoutingRuleSchema.optional(),
        architecture: threadRoutingRuleSchema.optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

const updateThreadSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    pinned: z.boolean().optional(),
    favorited: z.boolean().optional(),
    thinkingMode: z.enum(['debug', 'play']).optional(),
    /** F32-b Phase 2: Update thread-level agent preference. Empty array clears. */
    preferredCats: z.array(agentIdSchema()).max(10).optional(),
    /** F042: Thread-level routing policy by intent/scope. null clears. */
    routingPolicy: threadRoutingPolicySchema.nullable().optional(),
    /** F092: Voice companion mode toggle. */
    voiceMode: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.pinned !== undefined ||
      data.favorited !== undefined ||
      data.thinkingMode !== undefined ||
      data.preferredCats !== undefined ||
      data.routingPolicy !== undefined ||
      data.voiceMode !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export const threadsRoutes: FastifyPluginAsync<ThreadsRoutesOptions> = async (app, opts) => {
  const { threadStore, messageStore, taskProgressStore } = opts;

  // POST /api/threads - 创建对话
  app.post('/api/threads', async (request, reply) => {
    const parseResult = createThreadSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { userId: legacyUserId, title, projectPath, preferredCats, pinned, backlogItemId } = parseResult.data;
    const userId = resolveUserId(request, { fallbackUserId: legacyUserId });
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    let thread;
    try {
      const resolvedProject = await resolveThreadProjectPath(projectPath);
      if (await shouldBootstrapGovernance(resolvedProject.projectPath, resolvedProject.monorepoRoot)) {
        try {
          await bootstrapGovernanceForProject(resolvedProject.projectPath, resolvedProject.monorepoRoot);
        } catch (bootstrapError) {
          log.warn({ err: bootstrapError, projectPath: resolvedProject.projectPath }, 'Governance bootstrap failed (non-blocking)');
        }
      }
      thread = await threadStore.create(userId, title, resolvedProject.projectPath);
    } catch (error) {
      log.error({ err: error, projectPath }, 'Failed to resolve projectPath for thread creation');
      reply.status(500);
      return { error: 'Failed to prepare workspace for thread creation' };
    }

    // F32-b Phase 2: Set preferred cats if provided at creation time
    if (preferredCats && preferredCats.length > 0) {
      await threadStore.updatePreferredCats(thread.id, preferredCats as AgentId[]);
    }

    // F095 Phase C: Pin thread on creation
    if (pinned) {
      await threadStore.updatePin(thread.id, true);
    }

    // F095 Phase C: Link backlog item on creation (validate existence first)
    if (backlogItemId) {
      if (opts.backlogStore) {
        const item = await opts.backlogStore.get(backlogItemId, userId);
        if (!item) {
          reply.status(400);
          return { error: 'Invalid backlogItemId: backlog item not found or not owned by user' };
        }
      }
      await threadStore.linkBacklogItem(thread.id, backlogItemId);
    }

    // Re-fetch if any post-create mutations applied
    if ((preferredCats && preferredCats.length > 0) || pinned || backlogItemId) {
      thread = (await threadStore.get(thread.id)) ?? thread;
    }

    reply.status(201);
    return thread;
  });

  // GET /api/threads - 列出用户的对话
  app.get('/api/threads', async (request, reply) => {
    const parseResult = listThreadsSchema.safeParse(request.query);
    if (!parseResult.success) {
      return { threads: [] };
    }

    const {
      projectPath,
      q,
      backlogItemIds,
      hasBacklogItemId: hasBacklogItemIdRaw,
      featureIds,
      deleted: deletedRaw,
    } = parseResult.data;
    const hasBacklogItemId = parseOptionalBooleanQuery(hasBacklogItemIdRaw);
    const showDeleted = parseOptionalBooleanQuery(deletedRaw);
    const userId = resolveUserId(request, { defaultUserId: 'default-user' });
    if (!userId) return { threads: [] };

    // F095 Phase D: Return soft-deleted threads when deleted=true
    if (showDeleted) {
      const deletedThreads = await threadStore.listDeleted(userId);
      return { threads: deletedThreads };
    }

    let threads = projectPath ? await threadStore.listByProject(userId, projectPath) : await threadStore.list(userId);

    // F058 Phase G: Match threads by feature IDs in titles
    if (featureIds) {
      const ids = featureIds
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter((id) => /^f\d{2,4}$/i.test(id));
      if (ids.length > 50) {
        reply.status(400);
        return { error: 'Too many featureIds (max 50)' };
      }
      if (ids.length > 0) {
        // Build fuzzy regex per feature ID:
        // f066 matches: f066, f66, F 066, feat66, feat 066, feature66, feature 066, etc.
        const patternsByCanonical = new Map<string, RegExp>();
        for (const fid of ids) {
          const num = Number.parseInt(fid.slice(1), 10);
          // (?:f(?:eat(?:ure)?)?) matches: f, feat, feature
          // \s* allows optional space between prefix and number
          // 0* allows optional leading zeros
          // (?!\d) prevents matching f661 when looking for f66
          patternsByCanonical.set(fid.toUpperCase(), new RegExp(`(?:f(?:eat(?:ure)?)?)\\s*0*${num}(?!\\d)`, 'i'));
        }
        const threadsByFeature: Record<
          string,
          Array<{ id: string; title: string | null; lastActiveAt: number; participants: AgentId[] }>
        > = {};
        for (const thread of threads) {
          const title = thread.title ?? '';
          for (const [canonical, pattern] of patternsByCanonical) {
            if (pattern.test(title)) {
              const arr = threadsByFeature[canonical] ?? [];
              arr.push({
                id: thread.id,
                title: thread.title,
                lastActiveAt: thread.lastActiveAt,
                participants: thread.participants,
              });
              threadsByFeature[canonical] = arr;
            }
          }
        }
        return { threadsByFeature };
      }
    }

    const requestedBacklogIds = backlogItemIds
      ? new Set(
          backlogItemIds
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        )
      : null;

    if (requestedBacklogIds && requestedBacklogIds.size > 50) {
      reply.status(400);
      return { error: 'Too many backlogItemIds (max 50)' };
    }

    if (requestedBacklogIds && requestedBacklogIds.size > 0) {
      threads = threads.filter((thread) => {
        const linkedBacklogId = thread.backlogItemId;
        return !!linkedBacklogId && requestedBacklogIds.has(linkedBacklogId);
      });
    } else if (hasBacklogItemId === true) {
      threads = threads.filter((thread) => !!thread.backlogItemId);
    }

    if (q) {
      const needle = q.toLowerCase();
      threads = threads.filter((thread) => {
        const title = (thread.title ?? '').toLowerCase();
        const fallback = (thread.id === 'default' ? '大厅' : '未命名对话').toLowerCase();
        const project = (thread.projectPath ?? '').toLowerCase();
        return title.includes(needle) || fallback.includes(needle) || project.includes(needle) || thread.id === q;
      });
    }

    // F069: Hydrate unread summaries from read state store
    if (opts.readStateStore && messageStore && threads.length > 0) {
      const summaries = await opts.readStateStore.getUnreadSummaries(
        userId,
        threads.map((t) => t.id),
        messageStore,
      );
      const summaryMap = new Map(summaries.map((s) => [s.threadId, s]));
      return {
        threads: threads.map((t) => {
          const s = summaryMap.get(t.id);
          return { ...t, unreadCount: s?.unreadCount ?? 0, hasUserMention: s?.hasUserMention ?? false, invitedExpertIds: t.invitedExpertIds };
        }),
      };
    }

    return { threads: threads.map((t) => ({ ...t, invitedExpertIds: t.invitedExpertIds })) };
  });

  // GET /api/threads/:id - 获取对话详情
  app.get('/api/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const thread = await threadStore.get(id);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }
    return thread;
  });

  // PATCH /api/threads/:id - 更新标题/置顶/收藏
  app.patch('/api/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = updateThreadSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const thread = await threadStore.get(id);
    if (!thread || thread.deletedAt) {
      reply.status(404);
      return { error: 'Thread not found' };
    }

    const { title, pinned, favorited, thinkingMode, preferredCats, routingPolicy, voiceMode } = parseResult.data;
    if (title !== undefined) await threadStore.updateTitle(id, title);
    if (pinned !== undefined) await threadStore.updatePin(id, pinned);
    if (favorited !== undefined) await threadStore.updateFavorite(id, favorited);
    if (thinkingMode !== undefined) await threadStore.updateThinkingMode(id, thinkingMode);
    if (preferredCats !== undefined) await threadStore.updatePreferredCats(id, preferredCats as AgentId[]);
    if (routingPolicy !== undefined) {
      await threadStore.updateRoutingPolicy(id, routingPolicy as ThreadRoutingPolicyV1 | null);
    }
    if (voiceMode !== undefined) await threadStore.updateVoiceMode(id, voiceMode);

    const updated = await threadStore.get(id);
    if (!updated) {
      reply.status(404);
      return { error: 'Thread not found' };
    }

    return updated;
  });

  // DELETE /api/threads/:id - 删除对话 (with optional workspace delete)
  app.delete('/api/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const queryResult = deleteThreadQuerySchema.safeParse(request.query);
    const deleteWorkspace = queryResult.success ? parseOptionalBooleanQuery(queryResult.data.deleteWorkspace) === true : false;

    // Protect active invocations from deletion (#35)
    // Atomic: guardDelete checks has() + marks "deleting" in one synchronous tick.
    // While guard is held, start() returns pre-aborted controller for this thread.
    const guard = opts.invocationTracker?.guardDelete(id);
    // Also check multi-mention dispatches (P1-2: they run outside InvocationTracker)
    const hasMMDispatches = getMultiMentionOrchestrator().hasActiveDispatches(id);
    if ((guard && !guard.acquired) || hasMMDispatches) {
      if (guard?.acquired) guard.release(); // Release tracker guard if we're blocking on MM
      reply.status(409);
      return {
        error: '智能体正在工作中',
        detail: '请等待智能体完成当前任务后再删除对话',
        code: 'ACTIVE_INVOCATION',
      };
    }

    try {
      const thread = await threadStore.get(id);
      const userId = resolveUserId(request, {});
      const workspaceDeleteRequested = deleteWorkspace;
      let workspaceDeleteAttempted = false;
      let workspaceDeleteSucceeded = false;
      let workspaceDeleteSkippedReason: string | null = workspaceDeleteRequested ? 'missing_project_path' : null;
      let workspaceWasSharedAtDelete = false;
      let workspaceSharedThreadCount = 0;

      if (thread?.projectPath) {
        const sharingUserId = userId ?? thread.createdBy;
        try {
          // 只检查活跃的 thread，已删除的 thread 不应该阻止 workspace 删除
          const activeThreads = await threadStore.list(sharingUserId);
          const sharedThreadIds = new Set(
            activeThreads
              .filter((candidate) => candidate.id !== id && pathsEqual(candidate.projectPath, thread.projectPath))
              .map((candidate) => candidate.id),
          );
          workspaceSharedThreadCount = sharedThreadIds.size;
          workspaceWasSharedAtDelete = workspaceSharedThreadCount > 0;
        } catch (err) {
          log.warn({ err, threadId: id, projectPath: thread.projectPath }, 'Failed to inspect shared workspace usage');
        }
      }

      // F095 Phase D: Soft-delete instead of hard delete — data preserved for trash bin
      const deleted = await threadStore.softDelete(id);
      if (!deleted) {
        reply.status(400);
        return { error: 'Cannot delete this thread' };
      }

      await Promise.resolve(opts.feedbackStore?.deleteByThread(id)).catch((err) => {
        log.error({ err, threadId: id }, 'feedback cleanup failed');
      });

      // 删除与该会话关联的动态定时任务
      if (opts.dynamicTaskStore && opts.taskRunner) {
        try {
          const removedTasks = opts.dynamicTaskStore.removeByThreadId(id);
          for (const task of removedTasks) {
            opts.taskRunner.unregister(task.id);
            log.info({ threadId: id, taskId: task.id, templateId: task.templateId }, 'Dynamic task removed due to thread deletion');
          }
        } catch (err) {
          log.warn({ err, threadId: id }, 'Failed to remove dynamic tasks for thread deletion (non-blocking)');
        }
      }

      if (opts.connectorBindingStore) {
        const bindings = await opts.connectorBindingStore.getByThread(id);
        await Promise.all(bindings.map((binding) => opts.connectorBindingStore!.remove(binding.connectorId, binding.externalChatId)));
      }

      if (workspaceDeleteRequested && thread?.projectPath) {
        const monorepoRoot = findMonorepoRoot(process.cwd());
        if (workspaceWasSharedAtDelete) {
          workspaceDeleteSkippedReason = 'shared_workspace';
        } else {
          try {
            const [resolvedPath, resolvedMonorepoRoot] = await Promise.all([realpath(thread.projectPath), realpath(monorepoRoot)]);
            const info = await stat(resolvedPath);
            if (!info.isDirectory()) {
              workspaceDeleteSkippedReason = 'not_directory';
            } else if (isUnsafeWorkspaceDeletionTarget(resolvedPath, resolvedMonorepoRoot)) {
              workspaceDeleteSkippedReason = 'unsafe_root';
            } else {
              workspaceDeleteAttempted = true;
              // 删除工作空间时排除 memory 目录（可能被 SQLite 锁定）
              const { memoryPreserved } = await deleteWorkspaceExcludingMemory(resolvedPath);
              workspaceDeleteSucceeded = true;
              workspaceDeleteSkippedReason = null;
              if (memoryPreserved) {
                reply.header('x-office-claw-memory-preserved', 'true');
              }
              log.info({ threadId: id, workspacePath: resolvedPath, memoryPreserved }, 'Workspace directory deleted (memory preserved)');
            }
          } catch (err) {
            workspaceDeleteSkippedReason = workspaceDeleteAttempted ? 'delete_failed' : 'path_resolution_failed';
            log.warn({ err, threadId: id, workspacePath: thread.projectPath }, 'Failed to delete workspace');
          }
        }
      }

      reply.header('x-office-claw-workspace-delete-requested', String(workspaceDeleteRequested));
      reply.header('x-office-claw-workspace-delete-attempted', String(workspaceDeleteAttempted));
      reply.header('x-office-claw-workspace-delete-succeeded', String(workspaceDeleteSucceeded));
      reply.header('x-office-claw-workspace-delete-shared', String(workspaceWasSharedAtDelete));
      reply.header('x-office-claw-workspace-delete-shared-count', String(workspaceSharedThreadCount));
      if (workspaceDeleteSkippedReason) {
        reply.header('x-office-claw-workspace-delete-reason', workspaceDeleteSkippedReason);
      }

      // I-2: Audit thread deletion for traceability (best-effort, don't block response)
      void getEventAuditLog()
        .append({
          threadId: id,
          type: AuditEventTypes.THREAD_DELETED,
          data: {
            deletedBy: userId ?? 'unknown',
            threadTitle: thread?.title ?? null,
            projectPath: thread?.projectPath ?? null,
            softDelete: true,
            workspaceDeleteRequested,
            workspaceDeleteAttempted,
            workspaceDeleteSucceeded,
            workspaceDeleteSkippedReason,
            workspaceWasSharedAtDelete,
            workspaceSharedThreadCount,
          },
        })
        .catch((err) => {
          log.warn({ err, threadId: id }, 'Audit log warning');
        });

      reply.status(204);
      return;
    } finally {
      guard?.release();
    }
  });

  // F095 Phase D: POST /api/threads/:id/restore — restore a soft-deleted thread
  app.post<{ Params: { id: string } }>('/api/threads/:id/restore', async (request, reply) => {
    const { id } = request.params;
    const thread = await threadStore.get(id);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }

    const restored = await threadStore.restore(id);
    if (!restored) {
      reply.status(400);
      return { error: 'Thread is not deleted' };
    }

    const updated = await threadStore.get(id);
    return updated;
  });

  // F045: GET /api/threads/:threadId/task-progress — task progress snapshot for page refresh persistence
  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/task-progress', async (request, reply) => {
    const userId = resolveUserId(request, {});
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const { threadId } = request.params;
    const thread = await threadStore.get(threadId);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }

    if (thread.createdBy !== userId && thread.createdBy !== 'system') {
      reply.status(403);
      return { error: 'Access denied' };
    }

    const snapshot = taskProgressStore ? await taskProgressStore.getThreadSnapshots(threadId) : {};
    return { threadId, taskProgress: snapshot };
  });

  // F35: PATCH /api/threads/:id/reveal — reveal all whispers in a thread
  app.patch<{ Params: { id: string } }>('/api/threads/:id/reveal', async (request, reply) => {
    const userId = resolveUserId(request, {});
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const { id } = request.params;
    const thread = await threadStore.get(id);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }

    // Default thread is system-owned; allow any authenticated user to reveal.
    if (thread.createdBy !== userId && thread.createdBy !== 'system') {
      reply.status(403);
      return { error: 'Only the thread owner can reveal whispers' };
    }

    if (!messageStore) {
      reply.status(501);
      return { error: 'Message store not available' };
    }

    const revealed = await messageStore.revealWhispers(id, userId);
    return { revealed };
  });

  // F072: POST /api/threads/read/mark-all — mark all threads as read
  app.post('/api/threads/read/mark-all', async (request, reply) => {
    const userId = resolveUserId(request, {});
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    if (!opts.readStateStore || !messageStore) {
      reply.status(501);
      return { error: 'Read state store or message store not available' };
    }

    const threads = await threadStore.list(userId);
    let advancedCount = 0;

    for (const thread of threads) {
      const messages = await messageStore.getByThread(thread.id);
      if (messages.length === 0) continue;
      const latestId = messages[messages.length - 1]?.id;
      const advanced = await opts.readStateStore.ack(userId, thread.id, latestId);
      if (advanced) advancedCount++;
    }

    return { advancedCount, totalThreads: threads.length };
  });

  // F069: PATCH /api/threads/:id/read — mark thread as read up to messageId
  const readAckSchema = z.object({
    upToMessageId: z.string().min(1).max(100),
  });

  app.patch<{ Params: { id: string } }>('/api/threads/:id/read', async (request, reply) => {
    const userId = resolveUserId(request, {});
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    if (!opts.readStateStore) {
      reply.status(501);
      return { error: 'Read state store not available' };
    }

    const { id } = request.params;
    const thread = await threadStore.get(id);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }

    const parseResult = readAckSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    // P1-3: Validate upToMessageId belongs to this thread
    if (messageStore) {
      const msg = await messageStore.getById(parseResult.data.upToMessageId);
      if (!msg || msg.threadId !== id) {
        reply.status(400);
        return { error: 'upToMessageId does not belong to this thread' };
      }
    }

    const advanced = await opts.readStateStore.ack(userId, id, parseResult.data.upToMessageId);
    return { advanced };
  });

  // F069-R5: POST /api/threads/:id/read/latest — ack to latest real message server-side.
  // Eliminates frontend timing races: the server finds the latest message and acks it
  // in one atomic operation, so the client never needs to guess which ID to send.
  app.post<{ Params: { id: string } }>('/api/threads/:id/read/latest', async (request, reply) => {
    const userId = resolveUserId(request, {});
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    if (!opts.readStateStore) {
      reply.status(501);
      return { error: 'Read state store not available' };
    }

    if (!messageStore) {
      reply.status(501);
      return { error: 'Message store not available' };
    }

    const { id } = request.params;
    const thread = await threadStore.get(id);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }

    const messages = await messageStore.getByThread(id, 1);
    if (messages.length === 0) {
      return { advanced: false, reason: 'no messages' };
    }

    const latestId = messages[messages.length - 1]?.id;
    const advanced = await opts.readStateStore.ack(userId, id, latestId);
    return { advanced, messageId: latestId };
  });
};
