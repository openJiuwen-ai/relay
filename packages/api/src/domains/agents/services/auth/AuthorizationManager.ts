/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authorization Manager
 * 智能体授权系统核心 — 规则匹配 + pending 队列 + inFlightWaiters
 *
 * 两层设计（Codex review P1-3 要求）:
 * - 持久化层: PendingRequestStore (Redis/内存) + RuleStore + AuditStore
 * - 运行时层: inFlightWaiters (Map<requestId, {resolve, timer}>) — 不可序列化
 */

import type {
  AgentId,
  PendingRequestRecord,
  PermissionRequest,
  PermissionResponse,
  RespondScope,
} from '@openjiuwen/relay-shared';
import type { IApprovalRecordStore } from '@openjiuwen/relay-api-server-contracts/storage';
import type { Server as SocketIOServer } from 'socket.io';
import type { InvocationRegistry } from '../agents/invocation/InvocationRegistry.js';
import { getPushNotificationService } from '../push/PushNotificationService.js';
import type { IAuthorizationAuditStore } from '../stores/ports/AuthorizationAuditStore.js';
import type { IAuthorizationRuleStore } from '../stores/ports/AuthorizationRuleStore.js';
import type { IInvocationRecordStore, InvocationStatus } from '../stores/ports/InvocationRecordStore.js';
import type { IPendingRequestStore } from '../stores/ports/PendingRequestStore.js';
import type { JiuwenPermissionBridge } from './JiuwenPermissionBridge.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const OPERATION_SUMMARY_MAX_LENGTH = 500;

function redactSensitiveText(input: string): string {
  return input
    .replace(/(api[_-]?key|token|password|passwd|pwd|secret)\s*=\s*("[^"]*"|'[^']*'|[^\s&]+)/gi, '$1=***')
    .replace(/(api[_-]?key|token|password|passwd|pwd|secret)\s*:\s*("[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1: ***')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1***');
}

function truncateSummary(input: string): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= OPERATION_SUMMARY_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, OPERATION_SUMMARY_MAX_LENGTH - 1)}...`;
}

function pickContextValue(context: string | undefined): string | null {
  if (!context?.trim()) return null;
  const trimmed = context.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      for (const key of ['command', 'cmd', 'path', 'filePath', 'url', 'input', 'args']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value;
        if (Array.isArray(value) && value.length > 0) return value.map(String).join(' ');
      }
    }
    return null;
  } catch {
    // Plain text context is expected for many permission requests.
  }
  return trimmed;
}

function buildOperationSummary(action: string, context?: string): string | null {
  const value = pickContextValue(context);
  if (!value) return null;
  const lowerAction = action.toLowerCase();
  let prefix = '操作内容';
  if (lowerAction.includes('shell') || lowerAction.includes('command') || lowerAction.includes('exec')) {
    prefix = '执行命令';
  } else if (lowerAction.includes('read')) {
    prefix = '读取文件';
  } else if (lowerAction.includes('write') || lowerAction.includes('edit')) {
    prefix = '写入文件';
  } else if (lowerAction.includes('network') || lowerAction.includes('http') || lowerAction.includes('fetch')) {
    prefix = '访问网络';
  }
  return truncateSummary(`${prefix}：${redactSensitiveText(value)}`);
}

interface InFlightWaiter {
  resolve: (response: PermissionResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface AuthorizationManagerDeps {
  ruleStore: IAuthorizationRuleStore;
  pendingStore: IPendingRequestStore;
  auditStore: IAuthorizationAuditStore;
  approvalRecordStore?: IApprovalRecordStore;
  resolveThreadTitle?: (threadId: string) => Promise<string | null>;
  invocationRegistry?: InvocationRegistry;
  invocationRecordStore?: IInvocationRecordStore;
  jiuwenPermissionBridge?: JiuwenPermissionBridge;
  io?: SocketIOServer;
  timeoutMs?: number;
}

export class AuthorizationManager {
  private inFlightWaiters = new Map<string, InFlightWaiter>();
  private readonly ruleStore: IAuthorizationRuleStore;
  private readonly pendingStore: IPendingRequestStore;
  private readonly auditStore: IAuthorizationAuditStore;
  private readonly approvalRecordStore?: IApprovalRecordStore;
  private readonly resolveThreadTitle?: (threadId: string) => Promise<string | null>;
  private readonly invocationRegistry?: InvocationRegistry;
  private readonly invocationRecordStore?: IInvocationRecordStore;
  private readonly jiuwenPermissionBridge?: JiuwenPermissionBridge;
  private readonly io?: SocketIOServer;
  private readonly timeoutMs: number;

  constructor(deps: AuthorizationManagerDeps) {
    this.ruleStore = deps.ruleStore;
    this.pendingStore = deps.pendingStore;
    this.auditStore = deps.auditStore;
    this.approvalRecordStore = deps.approvalRecordStore;
    this.resolveThreadTitle = deps.resolveThreadTitle;
    this.invocationRegistry = deps.invocationRegistry;
    this.invocationRecordStore = deps.invocationRecordStore;
    this.jiuwenPermissionBridge = deps.jiuwenPermissionBridge;
    if (deps.io) this.io = deps.io;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * 智能体请求权限 — 完整流程:
   * 1. 查规则 → 命中则直接返回
   * 2. 创建 pending record → WebSocket 推送
   * 3. 等待用户审批 (120s) → 返回结果或 pending
   */
  private async getThreadTitleSnapshot(threadId: string): Promise<string | null> {
    if (!this.resolveThreadTitle) return null;
    try {
      return await this.resolveThreadTitle(threadId);
    } catch {
      return null;
    }
  }

  private async recordApprovalEvent(input: {
    requestId: string;
    invocationId: string;
    agentId: AgentId;
    threadId: string;
    action: string;
    context?: string;
    decision: 'allow' | 'deny' | 'pending';
    approvalSource: 'user' | 'rule';
    requestedAt: number;
    decidedAt?: number | null;
    scope?: RespondScope | null;
    decidedBy?: string | null;
    matchedRuleId?: string | null;
  }): Promise<void> {
    if (!this.approvalRecordStore) return;
    try {
      this.approvalRecordStore.record({
        requestId: input.requestId,
        invocationId: input.invocationId,
        agentId: input.agentId,
        threadId: input.threadId,
        threadTitle: await this.getThreadTitleSnapshot(input.threadId),
        action: input.action,
        operationSummary: buildOperationSummary(input.action, input.context),
        decision: input.decision,
        approvalSource: input.approvalSource,
        requestedAt: input.requestedAt,
        ...(input.decidedAt !== undefined ? { decidedAt: input.decidedAt } : {}),
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
        ...(input.matchedRuleId ? { matchedRuleId: input.matchedRuleId } : {}),
      });
    } catch (error) {
      console.warn('[authorization] failed to persist approval record', error);
    }
  }

  async requestPermission(
    agentId: AgentId,
    threadId: string,
    req: Pick<PermissionRequest, 'invocationId' | 'action' | 'reason' | 'context'>,
    userId?: string,
  ): Promise<PermissionResponse> {
    // Step 1: 查规则
    const rule = await this.ruleStore.match(agentId, req.action, threadId);
    if (rule) {
      const decision = rule.decision === 'allow' ? 'granted' : 'denied';
      // Rule matches are decided synchronously at request time, so requestedAt and decidedAt are the same event.
      const now = Date.now();
      await this.auditStore.append({
        requestId: '',
        invocationId: req.invocationId,
        agentId,
        threadId,
        action: req.action,
        reason: req.reason,
        decision: rule.decision,
        matchedRuleId: rule.id,
      });
      await this.recordApprovalEvent({
        requestId: '',
        invocationId: req.invocationId,
        agentId,
        threadId,
        action: req.action,
        context: req.context,
        decision: rule.decision,
        approvalSource: 'rule',
        requestedAt: now,
        decidedAt: now,
        matchedRuleId: rule.id,
      });
      return { status: decision as 'granted' | 'denied' };
    }

    // Step 2: 创建 pending record
    const record = await this.pendingStore.create({
      invocationId: req.invocationId,
      agentId,
      threadId,
      action: req.action,
      reason: req.reason,
      ...(req.context ? { context: req.context } : {}),
    });
    await this.recordApprovalEvent({
      requestId: record.requestId,
      invocationId: req.invocationId,
      agentId,
      threadId,
      action: req.action,
      context: req.context,
      decision: 'pending',
      approvalSource: 'user',
      requestedAt: record.createdAt,
    });

    // WebSocket 推送到前端
    if (this.io) {
      this.io.to(`thread:${threadId}`).emit('authorization:request', {
        requestId: record.requestId,
        agentId,
        threadId,
        action: req.action,
        reason: req.reason,
        createdAt: record.createdAt,
        ...(req.context ? { context: req.context } : {}),
      });
    }

    // Web Push: 即使不在 OfficeClaw 页面也能收到权限请求
    const pushSvc = getPushNotificationService();
    if (pushSvc && userId) {
      pushSvc
        .notifyUser(userId, {
          title: `🔐 ${agentId} 需要权限`,
          body: `${req.action}: ${req.reason}`.slice(0, 120),
          tag: `auth-${record.requestId}`,
          data: { threadId, url: `/?thread=${threadId}`, forceSystemNotification: true },
        })
        .catch(() => {
          /* best-effort */
        });
    }

    // Step 3: 等待用户审批
    return new Promise<PermissionResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.inFlightWaiters.delete(record.requestId);
        // 超时 → 返回 pending + requestId（用户稍后审批）
        void this.auditStore.append({
          requestId: record.requestId,
          invocationId: req.invocationId,
          agentId,
          threadId,
          action: req.action,
          reason: req.reason,
          decision: 'pending',
        });
        resolve({ status: 'pending', requestId: record.requestId });
      }, this.timeoutMs);

      this.inFlightWaiters.set(record.requestId, { resolve, timer });
    });
  }

  async createPendingFromExternalSource(
    input: Pick<PermissionRequest, 'invocationId' | 'action' | 'reason' | 'context'> & {
      agentId: AgentId;
      threadId: string;
    },
  ): Promise<PendingRequestRecord> {
    const record = await this.pendingStore.create({
      invocationId: input.invocationId,
      agentId: input.agentId,
      threadId: input.threadId,
      action: input.action,
      reason: input.reason,
      ...(input.context ? { context: input.context } : {}),
    });
    await this.recordApprovalEvent({
      requestId: record.requestId,
      invocationId: input.invocationId,
      agentId: input.agentId,
      threadId: input.threadId,
      action: input.action,
      context: input.context,
      decision: 'pending',
      approvalSource: 'user',
      requestedAt: record.createdAt,
    });

    if (this.io) {
      this.io.to(`thread:${input.threadId}`).emit('authorization:request', {
        requestId: record.requestId,
        agentId: input.agentId,
        threadId: input.threadId,
        action: input.action,
        reason: input.reason,
        createdAt: record.createdAt,
        ...(input.context ? { context: input.context } : {}),
      });
    }

    return record;
  }

  /**
   * 用户审批 — 更新 record + 可选创建规则 + resolve waiter
   */
  async respond(
    requestId: string,
    granted: boolean,
    scope: RespondScope,
    userId: string,
    reason?: string,
  ): Promise<PendingRequestRecord | null> {
    const decision = granted ? 'granted' : 'denied';

    // 更新 pending record
    const updated = await this.pendingStore.respond(requestId, decision, scope, reason);
    if (!updated) return null;

    // 如果 scope 不是 'once'，创建持久化规则
    if (scope !== 'once') {
      await this.ruleStore.add({
        agentId: updated.agentId,
        action: updated.action,
        scope,
        decision: granted ? 'allow' : 'deny',
        ...(scope === 'thread' ? { threadId: updated.threadId } : {}),
        createdBy: userId,
        ...(reason ? { reason } : {}),
      });
    }

    // 审计日志
    await this.auditStore.append({
      requestId,
      invocationId: updated.invocationId,
      agentId: updated.agentId,
      threadId: updated.threadId,
      action: updated.action,
      reason: updated.reason,
      decision: granted ? 'allow' : 'deny',
      scope,
      decidedBy: userId,
    });
    await this.recordApprovalEvent({
      requestId,
      invocationId: updated.invocationId,
      agentId: updated.agentId,
      threadId: updated.threadId,
      action: updated.action,
      context: updated.context,
      decision: granted ? 'allow' : 'deny',
      approvalSource: 'user',
      requestedAt: updated.createdAt,
      decidedAt: updated.respondedAt ?? Date.now(),
      scope,
      decidedBy: userId,
    });

    // Resolve in-flight waiter（智能体 HTTP 立即返回）
    const waiter = this.inFlightWaiters.get(requestId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.inFlightWaiters.delete(requestId);
      waiter.resolve({
        status: decision as 'granted' | 'denied',
        ...(reason ? { reason } : {}),
      });
    }

    return updated;
  }

  /** 智能体用 requestId 查询结果 */
  async getRequestStatus(requestId: string): Promise<PendingRequestRecord | null> {
    return this.pendingStore.get(requestId);
  }

  /** 前端查询仍可处理的 pending 请求 */
  async getPending(threadId?: string): Promise<PendingRequestRecord[]> {
    const waiting = await this.pendingStore.listWaiting(threadId);
    const actionable = await Promise.all(
      waiting.map(async (record) => ((await this.isPendingActionable(record)) ? record : null)),
    );
    return actionable.filter((record): record is PendingRequestRecord => record !== null);
  }

  /** 查规则 */
  async checkRule(agentId: AgentId, action: string, threadId: string): Promise<'allow' | 'deny' | null> {
    const rule = await this.ruleStore.match(agentId, action, threadId);
    return rule?.decision ?? null;
  }

  /** 测试用: 当前 in-flight waiter 数 */
  get pendingWaiterCount(): number {
    return this.inFlightWaiters.size;
  }

  private async isPendingActionable(record: PendingRequestRecord): Promise<boolean> {
    if (this.jiuwenPermissionBridge?.hasPending(record.requestId)) {
      return true;
    }

    if (!this.invocationRegistry) {
      return true;
    }

    const invocationRecord = this.invocationRegistry.get(record.invocationId);
    if (!invocationRecord) {
      return false;
    }
    if (invocationRecord.agentId !== record.agentId || invocationRecord.threadId !== record.threadId) {
      return false;
    }

    if (!invocationRecord.parentInvocationId || !this.invocationRecordStore) {
      return true;
    }

    const parentRecord = await this.invocationRecordStore.get(invocationRecord.parentInvocationId);
    if (!parentRecord) {
      return true;
    }
    return !isTerminalInvocationStatus(parentRecord.status);
  }
}

function isTerminalInvocationStatus(status: InvocationStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}
