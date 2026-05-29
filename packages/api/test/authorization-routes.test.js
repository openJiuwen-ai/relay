/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authorization Routes Tests
 * 智能体授权 HTTP 端点 — callback-auth (猫端) + authorization (用户端)
 *
 * Uses Fastify injection (no real HTTP server).
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';

const { InvocationRegistry } = await import('../dist/domains/agents/services/agents/invocation/InvocationRegistry.js');
const { AuthorizationRuleStore } = await import('../dist/domains/agents/services/stores/ports/AuthorizationRuleStore.js');
const { PendingRequestStore } = await import('../dist/domains/agents/services/stores/ports/PendingRequestStore.js');
const { AuthorizationAuditStore } = await import(
  '../dist/domains/agents/services/stores/ports/AuthorizationAuditStore.js'
);
const { AuthorizationManager } = await import('../dist/domains/agents/services/auth/AuthorizationManager.js');
const {
  JiuwenPermissionBridge,
} = await import('../dist/domains/agents/services/auth/JiuwenPermissionBridge.js');
const { callbackAuthRoutes } = await import('../dist/routes/callback-auth.js');
const { authorizationRoutes } = await import('../dist/routes/authorization.js');

function createMockSocketManager() {
  const events = [];
  return {
    broadcastToRoom(room, event, data) {
      events.push({ room, event, data });
    },
    getEvents() {
      return events;
    },
  };
}

function installHeaderAuth(app) {
  app.addHook('preHandler', (request, _reply, done) => {
    const userId = request.headers['x-user-id'] ?? request.headers['x-office-claw-user'];
    if (typeof userId === 'string' && userId.trim()) {
      request.auth = { userId };
    }
    done();
  });
}

function createLivePending(registry, pendingStore, { userId = 'user-1', agentId, threadId, action, reason }) {
  const { invocationId } = registry.create(userId, agentId, threadId);
  return pendingStore.create({ invocationId, agentId, threadId, action, reason });
}

// ---- Callback Auth Routes (agent-facing) ----

describe('POST /api/callbacks/request-permission', () => {
  let registry;
  let authManager;
  let ruleStore;

  beforeEach(() => {
    registry = new InvocationRegistry();
    ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      timeoutMs: 50,
    });
  });

  async function createApp() {
    const app = Fastify();
    await app.register(callbackAuthRoutes, { registry, authManager });
    return app;
  }

  test('returns granted when allow rule exists', async () => {
    const app = await createApp();
    ruleStore.add({
      agentId: 'codex',
      action: 'git_commit',
      scope: 'global',
      decision: 'allow',
      createdBy: 'user-1',
    });

    const { invocationId, callbackToken } = registry.create('user-1', 'codex', 'thread-1');
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: { invocationId, callbackToken, action: 'git_commit', reason: 'fix bug' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'granted');
  });

  test('returns denied when deny rule exists', async () => {
    const app = await createApp();
    ruleStore.add({
      agentId: 'codex',
      action: 'file_delete',
      scope: 'global',
      decision: 'deny',
      createdBy: 'user-1',
    });

    const { invocationId, callbackToken } = registry.create('user-1', 'codex', 'thread-1');
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: { invocationId, callbackToken, action: 'file_delete', reason: 'cleanup' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).status, 'denied');
  });

  test('returns pending when no rule and timeout', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'codex', 'thread-1');

    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: { invocationId, callbackToken, action: 'git_push', reason: 'deploy' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'pending');
    assert.ok(body.requestId);
  });

  test('rejects invalid credentials', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: { invocationId: 'bad', callbackToken: 'bad', action: 'x', reason: 'y' },
    });

    assert.equal(res.statusCode, 401);
  });

  test('rejects missing fields', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: { invocationId: 'x', callbackToken: 'y' },
    });

    assert.equal(res.statusCode, 400);
  });
});

describe('GET /api/callbacks/permission-status', () => {
  let registry;
  let authManager;

  beforeEach(() => {
    registry = new InvocationRegistry();
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      timeoutMs: 50,
    });
  });

  async function createApp() {
    const app = Fastify();
    await app.register(callbackAuthRoutes, { registry, authManager });
    return app;
  }

  test('returns status for existing request', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'codex', 'thread-1');

    // Create a pending request first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: { invocationId, callbackToken, action: 'git_commit', reason: 'fix' },
    });
    const { requestId } = JSON.parse(createRes.body);

    // Query status
    const res = await app.inject({
      method: 'GET',
      url: `/api/callbacks/permission-status?invocationId=${invocationId}&callbackToken=${callbackToken}&requestId=${requestId}`,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(['waiting', 'pending'].includes(body.status));
    assert.equal(body.action, 'git_commit');
    assert.ok(body.createdAt, 'response must include createdAt (P2 契约修复)');
  });

  test('returns 403 when requestId belongs to different agent/thread', async () => {
    const app = await createApp();
    // Agent A creates a request
    const catA = registry.create('user-1', 'codex', 'thread-1');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: {
        invocationId: catA.invocationId,
        callbackToken: catA.callbackToken,
        action: 'git_commit',
        reason: 'fix',
      },
    });
    const { requestId } = JSON.parse(createRes.body);

    // Agent B (different agent/thread) tries to query it
    const catB = registry.create('user-1', 'opus', 'thread-2');
    const res = await app.inject({
      method: 'GET',
      url: `/api/callbacks/permission-status?invocationId=${catB.invocationId}&callbackToken=${catB.callbackToken}&requestId=${requestId}`,
    });

    assert.equal(res.statusCode, 403);
  });

  test('returns 403 when same agent/thread but different invocation', async () => {
    const app = await createApp();
    // Invocation A creates a request
    const invocA = registry.create('user-1', 'codex', 'thread-1');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/request-permission',
      payload: {
        invocationId: invocA.invocationId,
        callbackToken: invocA.callbackToken,
        action: 'git_commit',
        reason: 'fix',
      },
    });
    const { requestId } = JSON.parse(createRes.body);

    // Invocation B (same agent, same thread, different invocation) tries to query
    const invocB = registry.create('user-1', 'codex', 'thread-1');
    const res = await app.inject({
      method: 'GET',
      url: `/api/callbacks/permission-status?invocationId=${invocB.invocationId}&callbackToken=${invocB.callbackToken}&requestId=${requestId}`,
    });

    assert.equal(res.statusCode, 403, 'same agent+thread but different invocation must be rejected');
  });

  test('returns 404 for nonexistent request', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'codex', 'thread-1');

    const res = await app.inject({
      method: 'GET',
      url: `/api/callbacks/permission-status?invocationId=${invocationId}&callbackToken=${callbackToken}&requestId=nonexistent`,
    });

    assert.equal(res.statusCode, 404);
  });
});

// ---- Authorization Routes (用户-facing) ----

describe('POST /api/authorization/respond', () => {
  let authManager;
  let ruleStore;
  let pendingStore;
  let auditStore;
  let socketManager;
  let permissionBridge;

  beforeEach(() => {
    ruleStore = new AuthorizationRuleStore();
    pendingStore = new PendingRequestStore();
    auditStore = new AuthorizationAuditStore();
    authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      timeoutMs: 5000,
    });
    socketManager = createMockSocketManager();
    permissionBridge = new JiuwenPermissionBridge();
    permissionBridge.bindAuthorizationManager(authManager);
  });

  async function createApp() {
    const app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, {
      authManager,
      ruleStore,
      auditStore,
      socketManager,
      jiuwenPermissionBridge: permissionBridge,
    });
    return app;
  }

  test('responds to pending request', async () => {
    const app = await createApp();

    // Create pending request directly
    const record = pendingStore.create({
      invocationId: 'inv-1',
      agentId: 'codex',
      threadId: 'thread-1',
      action: 'git_commit',
      reason: 'fix',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/authorization/respond',
      headers: { 'x-user-id': 'user-1' },
      payload: {
        requestId: record.requestId,
        granted: true,
        scope: 'once',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ok');
    assert.equal(body.record.status, 'granted');

    // Should broadcast via Socket.io
    const events = socketManager.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'authorization:response');
  });

  test('accepts X-Office-Claw-User header (frontend default)', async () => {
    const app = await createApp();

    const record = pendingStore.create({
      invocationId: 'inv-frontend',
      agentId: 'codex',
      threadId: 'thread-frontend',
      action: 'git_commit',
      reason: 'frontend approval',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/authorization/respond',
      headers: { 'x-office-claw-user': 'frontend-user' },
      payload: {
        requestId: record.requestId,
        granted: true,
        scope: 'once',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ok');
    assert.equal(body.record.status, 'granted');
  });

  test('returns 404 for nonexistent request', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/authorization/respond',
      headers: { 'x-user-id': 'user-1' },
      payload: { requestId: 'nonexistent', granted: true, scope: 'once' },
    });

    assert.equal(res.statusCode, 404);
  });

  test('returns 401 without x-user-id', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/authorization/respond',
      payload: { requestId: 'x', granted: true, scope: 'once' },
    });

    assert.equal(res.statusCode, 401);
  });

  test('bridges granted authorization decisions back to Jiuwen chat.user_answer', async () => {
    const app = await createApp();
    const submitted = [];

    const created = await permissionBridge.ingestAskUserQuestion({
      agentId: 'codex',
      threadId: 'thread-bridge',
      invocationId: 'inv-bridge',
      sessionId: 'officeclaw_session_bridge',
      payload: {
        request_id: 'perm_approve_bridge',
        questions: [
          {
            header: '权限审批',
            question: '**工具 `shell_command` 需要授权才能执行**',
            options: [
              { label: '本次允许', description: '仅本次授权执行' },
              { label: '总是允许', description: '记住规则' },
              { label: '拒绝', description: '拒绝执行' },
            ],
            multi_select: false,
          },
        ],
      },
      submitAnswer: async (answer) => {
        submitted.push(answer);
      },
    });

    assert.ok(created, 'permission bridge should recognize Jiuwen permission requests');

    const res = await app.inject({
      method: 'POST',
      url: '/api/authorization/respond',
      headers: { 'x-office-claw-user': 'user-bridge' },
      payload: {
        requestId: created.localRequestId,
        granted: true,
        scope: 'global',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0], {
      sessionId: 'officeclaw_session_bridge',
      jiuwenRequestId: 'perm_approve_bridge',
      answers: [{ selected_options: ['总是允许'] }],
    });
  });

  test('bridges Jiuwen authorization even after original invocation completed', async () => {
    permissionBridge.bindInvocationTracker({
      has() {
        return false;
      },
    });
    const app = await createApp();
    const submitted = [];

    const created = await permissionBridge.ingestAskUserQuestion({
      agentId: 'office',
      threadId: 'thread-completed',
      invocationId: 'inv-completed',
      sessionId: 'officeclaw_session_completed',
      payload: {
        request_id: 'perm_after_final',
        source: 'permission_interrupt',
        questions: [
          {
            header: '权限审批',
            question: '**工具 `shell_command` 需要授权才能执行**',
            options: [
              { label: '本次允许', description: '仅本次授权执行' },
              { label: '总是允许', description: '记住规则' },
              { label: '拒绝', description: '拒绝执行' },
            ],
            multi_select: false,
          },
        ],
      },
      submitAnswer: async (answer) => {
        submitted.push(answer);
      },
    });

    assert.ok(created, 'permission bridge should create a local pending authorization');

    const res = await app.inject({
      method: 'POST',
      url: '/api/authorization/respond',
      headers: { 'x-office-claw-user': 'user-bridge' },
      payload: {
        requestId: created.localRequestId,
        granted: true,
        scope: 'once',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0], {
      sessionId: 'officeclaw_session_completed',
      jiuwenRequestId: 'perm_after_final',
      answers: [{ selected_options: ['本次允许'] }],
    });
  });
});

describe('GET /api/authorization/pending', () => {
  test('lists waiting requests', async () => {
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    const invocationRegistry = new InvocationRegistry();
    const authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      invocationRegistry,
      timeoutMs: 5000,
    });
    const socketManager = createMockSocketManager();

    createLivePending(invocationRegistry, pendingStore, { agentId: 'codex', threadId: 't1', action: 'a1', reason: 'r1' });
    createLivePending(invocationRegistry, pendingStore, { agentId: 'opus', threadId: 't2', action: 'a2', reason: 'r2' });

    const app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, { authManager, ruleStore, auditStore, socketManager });

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/pending',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.pending.length, 2);
  });

  test('filters by threadId', async () => {
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    const invocationRegistry = new InvocationRegistry();
    const authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      invocationRegistry,
      timeoutMs: 5000,
    });
    const socketManager = createMockSocketManager();

    createLivePending(invocationRegistry, pendingStore, { agentId: 'codex', threadId: 't1', action: 'a1', reason: 'r1' });
    createLivePending(invocationRegistry, pendingStore, { agentId: 'opus', threadId: 't2', action: 'a2', reason: 'r2' });

    const app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, { authManager, ruleStore, auditStore, socketManager });

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/pending?threadId=t1',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).pending.length, 1);
  });

  test('accepts X-Office-Claw-User header for pending list', async () => {
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    const invocationRegistry = new InvocationRegistry();
    const authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      invocationRegistry,
      timeoutMs: 5000,
    });
    const socketManager = createMockSocketManager();

    createLivePending(invocationRegistry, pendingStore, { agentId: 'codex', threadId: 't1', action: 'a1', reason: 'r1' });

    const app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, { authManager, ruleStore, auditStore, socketManager });

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/pending?threadId=t1',
      headers: { 'x-office-claw-user': 'frontend-user' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).pending.length, 1);
  });

  test('filters stale orphaned requests by default', async () => {
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    const authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      invocationRegistry: new InvocationRegistry(),
      timeoutMs: 5000,
    });
    const socketManager = createMockSocketManager();

    pendingStore.create({
      invocationId: 'missing-invocation',
      agentId: 'codex',
      threadId: 't1',
      action: 'a1',
      reason: 'r1',
    });

    const app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, { authManager, ruleStore, auditStore, socketManager });

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/pending',
      headers: { 'x-office-claw-user': 'frontend-user' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).pending.length, 0);
  });
});

describe('Authorization Rules API', () => {
  let app;
  let ruleStore;

  beforeEach(async () => {
    ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    const authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      timeoutMs: 5000,
    });
    const socketManager = createMockSocketManager();

    app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, { authManager, ruleStore, auditStore, socketManager });
  });

  test('POST /api/authorization/rules creates a rule', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/authorization/rules',
      headers: { 'x-user-id': 'user-1' },
      payload: {
        agentId: 'codex',
        action: 'git_*',
        scope: 'global',
        decision: 'allow',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ok');
    assert.equal(body.rule.agentId, 'codex');
    assert.equal(body.rule.action, 'git_*');
    assert.equal(ruleStore.size, 1);
  });

  test('GET /api/authorization/rules lists rules', async () => {
    ruleStore.add({ agentId: 'codex', action: 'git_commit', scope: 'global', decision: 'allow', createdBy: 'u1' });
    ruleStore.add({ agentId: 'opus', action: 'file_delete', scope: 'global', decision: 'deny', createdBy: 'u1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/rules',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).rules.length, 2);
  });

  test('DELETE /api/authorization/rules/:id removes rule', async () => {
    const rule = ruleStore.add({
      agentId: 'codex',
      action: 'git_commit',
      scope: 'global',
      decision: 'allow',
      createdBy: 'u1',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/authorization/rules/${rule.id}`,
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(ruleStore.size, 0);
  });

  test('DELETE nonexistent rule returns 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/authorization/rules/nonexistent',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(res.statusCode, 404);
  });
});

describe('GET /api/authorization/audit', () => {
  test('returns audit entries', async () => {
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = new PendingRequestStore();
    const auditStore = new AuthorizationAuditStore();
    const authManager = new AuthorizationManager({
      ruleStore,
      pendingStore,
      auditStore,
      timeoutMs: 5000,
    });
    const socketManager = createMockSocketManager();

    auditStore.append({
      requestId: 'r1',
      invocationId: 'i1',
      agentId: 'codex',
      threadId: 't1',
      action: 'git_commit',
      reason: 'fix',
      decision: 'allow',
    });

    const app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, { authManager, ruleStore, auditStore, socketManager });

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/audit',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].action, 'git_commit');
  });
});
