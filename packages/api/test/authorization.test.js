/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authorization System Tests
 * 智能体授权系统 — RuleStore + PendingRequestStore + AuditStore + Manager
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { AuthorizationRuleStore } = await import('../dist/domains/agents/services/stores/ports/AuthorizationRuleStore.js');
const { PendingRequestStore } = await import('../dist/domains/agents/services/stores/ports/PendingRequestStore.js');
const { AuthorizationAuditStore } = await import(
  '../dist/domains/agents/services/stores/ports/AuthorizationAuditStore.js'
);
const { AuthorizationManager } = await import('../dist/domains/agents/services/auth/AuthorizationManager.js');
const { InvocationRegistry } = await import('../dist/domains/agents/services/agents/invocation/InvocationRegistry.js');
const { InvocationRecordStore } = await import('../dist/domains/agents/services/stores/ports/InvocationRecordStore.js');
const { JiuwenPermissionBridge } = await import('../dist/domains/agents/services/auth/JiuwenPermissionBridge.js');

// ---- RuleStore Tests ----

describe('AuthorizationRuleStore', () => {
  test('add and match exact rule', () => {
    const store = new AuthorizationRuleStore();
    store.add({
      agentId: 'codex',
      action: 'git_commit',
      scope: 'global',
      decision: 'allow',
      createdBy: 'user-1',
    });

    const rule = store.match('codex', 'git_commit', 'thread-1');
    assert.ok(rule);
    assert.equal(rule.decision, 'allow');
    assert.equal(rule.agentId, 'codex');
  });

  test('wildcard agentId matches any agent', () => {
    const store = new AuthorizationRuleStore();
    store.add({
      agentId: '*',
      action: 'git_commit',
      scope: 'global',
      decision: 'allow',
      createdBy: 'user-1',
    });

    assert.ok(store.match('codex', 'git_commit', 't1'));
    assert.ok(store.match('opus', 'git_commit', 't1'));
    assert.ok(store.match('gemini', 'git_commit', 't1'));
  });

  test('wildcard action pattern matches prefix', () => {
    const store = new AuthorizationRuleStore();
    store.add({
      agentId: 'codex',
      action: 'git_*',
      scope: 'global',
      decision: 'allow',
      createdBy: 'user-1',
    });

    assert.ok(store.match('codex', 'git_commit', 't1'));
    assert.ok(store.match('codex', 'git_push', 't1'));
    assert.equal(store.match('codex', 'file_delete', 't1'), null);
  });

  test('thread-scoped rule takes priority over global', () => {
    const store = new AuthorizationRuleStore();
    store.add({
      agentId: 'codex',
      action: 'git_commit',
      scope: 'global',
      decision: 'deny',
      createdBy: 'user-1',
    });
    store.add({
      agentId: 'codex',
      action: 'git_commit',
      scope: 'thread',
      threadId: 'thread-special',
      decision: 'allow',
      createdBy: 'user-1',
    });

    const inThread = store.match('codex', 'git_commit', 'thread-special');
    assert.equal(inThread?.decision, 'allow');

    const otherThread = store.match('codex', 'git_commit', 'thread-other');
    assert.equal(otherThread?.decision, 'deny');
  });

  test('no match returns null', () => {
    const store = new AuthorizationRuleStore();
    assert.equal(store.match('codex', 'git_commit', 't1'), null);
  });

  test('remove rule', () => {
    const store = new AuthorizationRuleStore();
    const rule = store.add({
      agentId: 'codex',
      action: 'git_commit',
      scope: 'global',
      decision: 'allow',
      createdBy: 'user-1',
    });

    assert.ok(store.match('codex', 'git_commit', 't1'));
    assert.ok(store.remove(rule.id));
    assert.equal(store.match('codex', 'git_commit', 't1'), null);
  });

  test('list with filter', () => {
    const store = new AuthorizationRuleStore();
    store.add({ agentId: 'codex', action: 'git_commit', scope: 'global', decision: 'allow', createdBy: 'u1' });
    store.add({ agentId: 'opus', action: 'file_delete', scope: 'global', decision: 'deny', createdBy: 'u1' });

    assert.equal(store.list().length, 2);
    assert.equal(store.list({ agentId: 'codex' }).length, 1);
    assert.equal(store.list({ agentId: 'gemini' }).length, 0);
  });

  test('evicts oldest when at capacity', () => {
    const store = new AuthorizationRuleStore({ maxRules: 2 });
    store.add({ agentId: 'codex', action: 'a1', scope: 'global', decision: 'allow', createdBy: 'u1' });
    store.add({ agentId: 'codex', action: 'a2', scope: 'global', decision: 'allow', createdBy: 'u1' });
    store.add({ agentId: 'codex', action: 'a3', scope: 'global', decision: 'allow', createdBy: 'u1' });

    assert.equal(store.size, 2);
    assert.equal(store.match('codex', 'a1', 't1'), null);
    assert.ok(store.match('codex', 'a3', 't1'));
  });
});

// ---- PendingRequestStore Tests ----

describe('PendingRequestStore', () => {
  test('create and get pending request', () => {
    const store = new PendingRequestStore();
    const record = store.create({
      invocationId: 'inv-1',
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'commit bug fix',
    });

    assert.equal(record.status, 'waiting');
    assert.equal(record.agentId, 'codex');
    assert.ok(record.requestId);

    const fetched = store.get(record.requestId);
    assert.deepEqual(fetched, record);
  });

  test('respond updates status', () => {
    const store = new PendingRequestStore();
    const record = store.create({
      invocationId: 'inv-1',
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'commit fix',
    });

    const updated = store.respond(record.requestId, 'granted', 'global', 'approved');
    assert.ok(updated);
    assert.equal(updated.status, 'granted');
    assert.equal(updated.respondScope, 'global');
    assert.equal(updated.respondReason, 'approved');
    assert.ok(updated.respondedAt);
  });

  test('respond returns null for already resolved', () => {
    const store = new PendingRequestStore();
    const record = store.create({
      invocationId: 'inv-1',
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'fix',
    });

    store.respond(record.requestId, 'granted', 'once');
    const again = store.respond(record.requestId, 'denied', 'once');
    assert.equal(again, null);
  });

  test('listWaiting filters by status and thread', () => {
    const store = new PendingRequestStore();
    store.create({ invocationId: 'i1', agentId: 'codex', threadId: 't1', action: 'a1', reason: 'r1' });
    store.create({ invocationId: 'i2', agentId: 'codex', threadId: 't2', action: 'a2', reason: 'r2' });
    const r3 = store.create({ invocationId: 'i3', agentId: 'opus', threadId: 't1', action: 'a3', reason: 'r3' });
    store.respond(r3.requestId, 'granted', 'once');

    assert.equal(store.listWaiting().length, 2);
    assert.equal(store.listWaiting('t1').length, 1);
    assert.equal(store.listWaiting('t2').length, 1);
  });
});

// ---- AuditStore Tests ----

describe('AuthorizationAuditStore', () => {
  test('append and list entries', () => {
    const store = new AuthorizationAuditStore();
    store.append({
      requestId: 'req-1',
      invocationId: 'inv-1',
      agentId: 'codex',
      threadId: 't1',
      action: 'git_commit',
      reason: 'fix',
      decision: 'allow',
      decidedBy: 'user-1',
    });

    const entries = store.list();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].decision, 'allow');
    assert.equal(entries[0].agentId, 'codex');
  });

  test('list filters by agentId and threadId', () => {
    const store = new AuthorizationAuditStore();
    store.append({
      requestId: 'r1',
      invocationId: 'i1',
      agentId: 'codex',
      threadId: 't1',
      action: 'a',
      reason: 'r',
      decision: 'allow',
    });
    store.append({
      requestId: 'r2',
      invocationId: 'i2',
      agentId: 'opus',
      threadId: 't2',
      action: 'a',
      reason: 'r',
      decision: 'deny',
    });

    assert.equal(store.list({ agentId: 'codex' }).length, 1);
    assert.equal(store.list({ threadId: 't2' }).length, 1);
  });

  test('evicts when at capacity', () => {
    const store = new AuthorizationAuditStore({ maxEntries: 5 });
    for (let i = 0; i < 6; i++) {
      store.append({
        requestId: `r${i}`,
        invocationId: `i${i}`,
        agentId: 'codex',
        threadId: 't1',
        action: 'a',
        reason: 'r',
        decision: 'allow',
      });
    }
    assert.ok(store.size <= 5);
  });
});

// ---- AuthorizationManager Tests ----

describe('AuthorizationManager', () => {
  function createManager(options) {
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    const invocationRegistry = options?.invocationRegistry ?? new InvocationRegistry();
    const invocationRecordStore = options?.invocationRecordStore ?? new InvocationRecordStore();
    const jiuwenPermissionBridge = options?.jiuwenPermissionBridge;
    const manager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      invocationRegistry,
      invocationRecordStore,
      jiuwenPermissionBridge,
      ...(options?.io ? { io: options.io } : {}),
      timeoutMs: options?.timeoutMs ?? 200,
    });
    return { manager, ruleStore, pendingStore, auditStore, invocationRegistry, invocationRecordStore };
  }

  function createLiveInvocation(
    invocationRegistry,
    { userId = 'user-1', agentId = 'codex', threadId = 'thread-1' } = {},
  ) {
    return invocationRegistry.create(userId, agentId, threadId);
  }

  test('auto-grants when rule matches', async () => {
    const { manager, ruleStore, invocationRegistry } = createManager();
    ruleStore.add({
      agentId: 'codex',
      action: 'git_commit',
      scope: 'global',
      decision: 'allow',
      createdBy: 'user-1',
    });
    const live = createLiveInvocation(invocationRegistry);

    const response = await manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit fix',
    });

    assert.equal(response.status, 'granted');
    assert.equal(response.requestId, undefined);
  });

  test('auto-denies when deny rule matches', async () => {
    const { manager, ruleStore, invocationRegistry } = createManager();
    ruleStore.add({
      agentId: 'codex',
      action: 'file_delete',
      scope: 'global',
      decision: 'deny',
      createdBy: 'user-1',
    });
    const live = createLiveInvocation(invocationRegistry);

    const response = await manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'file_delete',
      reason: 'cleanup',
    });

    assert.equal(response.status, 'denied');
  });

  test('returns pending when no rule and timeout', async () => {
    const { manager, invocationRegistry } = createManager({ timeoutMs: 50 });
    const live = createLiveInvocation(invocationRegistry);

    const response = await manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit fix',
    });

    assert.equal(response.status, 'pending');
    assert.ok(response.requestId);
  });

  test('broadcasts authorization request payload with createdAt', async () => {
    const emitted = [];
    const io = {
      to(room) {
        return {
          emit(event, payload) {
            emitted.push({ room, event, payload });
          },
        };
      },
    };
    const { manager, invocationRegistry } = createManager({ timeoutMs: 20, io });
    const live = createLiveInvocation(invocationRegistry);

    await manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit fix',
    });

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].room, 'thread:thread-1');
    assert.equal(emitted[0].event, 'authorization:request');
    assert.equal(typeof emitted[0].payload.createdAt, 'number');
    assert.ok(emitted[0].payload.createdAt > 0);
  });

  test('respond resolves in-flight waiter before timeout', async () => {
    const { manager, invocationRegistry } = createManager({ timeoutMs: 5000 });
    const live = createLiveInvocation(invocationRegistry);

    const responsePromise = manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit fix',
    });

    // Yield a tick so requestPermission progresses past pendingStore.create()
    await new Promise((r) => setTimeout(r, 10));

    const pending = await manager.getPending('thread-1');
    assert.equal(pending.length, 1);

    await manager.respond(pending[0].requestId, true, 'once', 'user-1', 'go ahead');

    const response = await responsePromise;
    assert.equal(response.status, 'granted');
    assert.equal(response.reason, 'go ahead');
    assert.equal(manager.pendingWaiterCount, 0);
  });

  test('respond with thread scope creates rule', async () => {
    const { manager, ruleStore, invocationRegistry } = createManager({ timeoutMs: 5000 });
    const live = createLiveInvocation(invocationRegistry);

    const responsePromise = manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit',
    });

    await new Promise((r) => setTimeout(r, 10));
    const pending = await manager.getPending();
    await manager.respond(pending[0].requestId, true, 'thread', 'user-1');
    await responsePromise;

    // Rule should be created
    const rule = await ruleStore.match('codex', 'git_commit', 'thread-1');
    assert.ok(rule);
    assert.equal(rule.scope, 'thread');
    assert.equal(rule.decision, 'allow');
  });

  test('respond with once scope does NOT create rule', async () => {
    const { manager, ruleStore, invocationRegistry } = createManager({ timeoutMs: 5000 });
    const live = createLiveInvocation(invocationRegistry);

    const responsePromise = manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit',
    });

    await new Promise((r) => setTimeout(r, 10));
    const pending = await manager.getPending();
    await manager.respond(pending[0].requestId, true, 'once', 'user-1');
    await responsePromise;

    assert.equal(ruleStore.size, 0);
  });

  test('respond after timeout updates record but no waiter', async () => {
    const { manager, invocationRegistry } = createManager({ timeoutMs: 50 });
    const live = createLiveInvocation(invocationRegistry);

    const response = await manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit',
    });

    assert.equal(response.status, 'pending');
    const requestId = response.requestId;

    // Respond after timeout — no waiter but record updates
    const updated = await manager.respond(requestId, true, 'global', 'user-1');
    assert.ok(updated);
    assert.equal(updated.status, 'granted');

    // Query status — should show granted
    const status = await manager.getRequestStatus(requestId);
    assert.equal(status?.status, 'granted');
  });

  test('audit log captures all events', async () => {
    const { manager, auditStore, invocationRegistry } = createManager({ timeoutMs: 50 });
    const live = createLiveInvocation(invocationRegistry);

    await manager.requestPermission('codex', 'thread-1', {
      invocationId: live.invocationId,
      action: 'git_commit',
      reason: 'commit',
    });

    const entries = auditStore.list();
    assert.ok(entries.length >= 1);
    assert.equal(entries[0].action, 'git_commit');
  });

  test('checkRule returns allow/deny/null', async () => {
    const { manager, ruleStore } = createManager();
    assert.equal(await manager.checkRule('codex', 'git_commit', 't1'), null);

    ruleStore.add({ agentId: 'codex', action: 'git_commit', scope: 'global', decision: 'allow', createdBy: 'u1' });
    assert.equal(await manager.checkRule('codex', 'git_commit', 't1'), 'allow');
  });

  test('filters orphaned pending requests when callback invocation is gone', async () => {
    const { manager, pendingStore } = createManager();
    pendingStore.create({
      invocationId: 'orphaned-callback',
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'commit fix',
    });

    const pending = await manager.getPending();
    assert.deepEqual(pending, []);
  });

  test('keeps pending requests when invocation registry is not configured', async () => {
    const pendingStore = new PendingRequestStore();
    const manager = new AuthorizationManager({
      ruleStore: new AuthorizationRuleStore(),
      pendingStore,
      auditStore: new AuthorizationAuditStore(),
      timeoutMs: 200,
    });
    const record = pendingStore.create({
      invocationId: 'legacy-invocation',
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'commit fix',
    });

    const pending = await manager.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].requestId, record.requestId);
  });

  test('keeps callback pending requests when invocation is still live', async () => {
    const { manager, pendingStore, invocationRegistry } = createManager();
    const live = createLiveInvocation(invocationRegistry);
    const record = pendingStore.create({
      invocationId: live.invocationId,
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'commit fix',
    });

    const pending = await manager.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].requestId, record.requestId);
  });

  test('filters callback pending requests whose parent invocation already ended', async () => {
    const invocationRecordStore = new InvocationRecordStore();
    const parent = invocationRecordStore.create({
      threadId: 'thread-1',
      userId: 'user-1',
      targetAgents: ['codex'],
      intent: 'execute',
      idempotencyKey: 'pending-parent',
    });
    invocationRecordStore.update(parent.invocationId, { status: 'failed' });

    const invocationRegistry = new InvocationRegistry();
    const live = invocationRegistry.create('user-1', 'codex', 'thread-1', parent.invocationId);
    const { manager, pendingStore } = createManager({ invocationRegistry, invocationRecordStore });
    pendingStore.create({
      invocationId: live.invocationId,
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'commit fix',
    });

    const pending = await manager.getPending();
    assert.deepEqual(pending, []);
  });

  test('keeps jiuwen bridge pending requests even without callback invocation state', async () => {
    const jiuwenPermissionBridge = new JiuwenPermissionBridge();
    const { manager } = createManager({ jiuwenPermissionBridge });
    jiuwenPermissionBridge.bindAuthorizationManager(manager);

    const bridgeRecord = await jiuwenPermissionBridge.ingestAskUserQuestion({
      agentId: 'codex',
      threadId: 'thread-1',
      invocationId: 'jiuwen-run-1',
      sessionId: 'officeclaw_session_1',
      payload: {
        request_id: 'perm_live_1',
        source: 'permission_interrupt',
        questions: [
          {
            header: '权限审批',
            question: '工具 `git_commit` 需要授权',
            options: [{ label: '本次允许' }, { label: '总是允许' }, { label: '拒绝' }],
          },
        ],
      },
      submitAnswer: async () => {},
    });

    assert.ok(bridgeRecord);
    const pending = await manager.getPending('thread-1');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].requestId, bridgeRecord.localRequestId);
  });
});
