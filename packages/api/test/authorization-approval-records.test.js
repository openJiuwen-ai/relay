/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Security approval records tests
 * 安全护栏审批记录 — SQLite 持久化 + HTTP 查询接口
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Fastify from 'fastify';
import { createSqliteApprovalRecordStore } from '@openjiuwen/relay-storage-sqlite/authorization';

const { AuthorizationRuleStore } = await import('../dist/domains/agents/services/stores/ports/AuthorizationRuleStore.js');
const { PendingRequestStore } = await import('../dist/domains/agents/services/stores/ports/PendingRequestStore.js');
const { AuthorizationAuditStore } = await import(
  '../dist/domains/agents/services/stores/ports/AuthorizationAuditStore.js'
);
const { AuthorizationManager } = await import('../dist/domains/agents/services/auth/AuthorizationManager.js');
const { authorizationRoutes } = await import('../dist/routes/authorization.js');

function createMockSocketManager() {
  return {
    broadcastToRoom() {},
    broadcastAgentMessage() {},
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

function createAuthManager(approvalRecordStore, options = {}) {
  const ruleStore = new AuthorizationRuleStore();
  const pendingStore = new PendingRequestStore();
  const auditStore = new AuthorizationAuditStore();
  const authManager = new AuthorizationManager({
    ruleStore,
    pendingStore,
    auditStore,
    approvalRecordStore,
    resolveThreadTitle: async (threadId) => options.threadTitles?.[threadId] ?? null,
    timeoutMs: options.timeoutMs ?? 5000,
  });
  return { authManager, ruleStore, pendingStore, auditStore };
}

describe('Security approval records persistence', () => {
  test('records user approval metadata without storing reason or raw context fields', async () => {
    const approvalRecordStore = createSqliteApprovalRecordStore(':memory:');
    const { authManager } = createAuthManager(approvalRecordStore, {
      threadTitles: {
        'thread-1': '部署发布会话',
      },
    });

    const responsePromise = authManager.requestPermission('codex', 'thread-1', {
      invocationId: 'inv-1',
      action: 'shell_command',
      reason: '需要执行部署命令',
      context: JSON.stringify({ command: 'deploy --token=secret-value --target prod' }),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const pending = await authManager.getPending('thread-1');
    assert.equal(pending.length, 1);

    await authManager.respond(pending[0].requestId, true, 'once', 'user-1', '批准执行');
    await responsePromise;

    const result = approvalRecordStore.list({ includeRuleMatched: true });
    assert.equal(result.totalCount, 1);
    assert.equal(result.records[0].threadTitle, '部署发布会话');
    assert.equal(result.records[0].decision, 'allow');
    assert.equal(result.records[0].approvalLabel, '本次允许');
    assert.equal(result.records[0].operationSummary, '执行命令：deploy --token=*** --target prod');
    assert.equal(Object.hasOwn(result.records[0], 'reason'), false);
    assert.equal(Object.hasOwn(result.records[0], 'context'), false);

    approvalRecordStore.close();
  });

  test('records rule-matched approvals with rule labels', async () => {
    const approvalRecordStore = createSqliteApprovalRecordStore(':memory:');
    const { authManager, ruleStore } = createAuthManager(approvalRecordStore, {
      threadTitles: {
        'thread-rule': '规则审批会话',
      },
    });
    ruleStore.add({
      agentId: 'codex',
      action: 'shell_command',
      scope: 'global',
      decision: 'allow',
      createdBy: 'user-1',
    });
    ruleStore.add({
      agentId: 'codex',
      action: 'delete_file',
      scope: 'global',
      decision: 'deny',
      createdBy: 'user-1',
    });

    const allowResponse = await authManager.requestPermission('codex', 'thread-rule', {
      invocationId: 'inv-rule-allow',
      action: 'shell_command',
      reason: '命中允许规则',
      context: JSON.stringify({ command: 'curl -H "Authorization: Bearer abc:def,ghi" https://example.test' }),
    });
    const denyResponse = await authManager.requestPermission('codex', 'thread-rule', {
      invocationId: 'inv-rule-deny',
      action: 'delete_file',
      reason: '命中拒绝规则',
      context: JSON.stringify({ path: 'D:\\tmp\\danger.txt' }),
    });

    assert.equal(allowResponse.status, 'granted');
    assert.equal(denyResponse.status, 'denied');

    const result = approvalRecordStore.list({ includeRuleMatched: true });
    assert.equal(result.totalCount, 2);
    const allowRecord = result.records.find((record) => record.invocationId === 'inv-rule-allow');
    const denyRecord = result.records.find((record) => record.invocationId === 'inv-rule-deny');
    assert.ok(allowRecord);
    assert.ok(denyRecord);
    assert.equal(allowRecord.approvalSource, 'rule');
    assert.equal(allowRecord.approvalLabel, '规则自动允许');
    assert.equal(allowRecord.requestedAt, allowRecord.decidedAt);
    assert.equal(allowRecord.operationSummary, '执行命令：curl -H "Authorization: Bearer *** https://example.test');
    assert.equal(denyRecord.approvalSource, 'rule');
    assert.equal(denyRecord.approvalLabel, '规则自动拒绝');

    approvalRecordStore.close();
  });
});

describe('Security approval records routes', () => {
  async function createApp() {
    const approvalRecordStore = createSqliteApprovalRecordStore(':memory:');
    const { authManager, ruleStore, auditStore } = createAuthManager(approvalRecordStore);
    const app = Fastify();
    installHeaderAuth(app);
    await app.register(authorizationRoutes, {
      authManager,
      ruleStore,
      auditStore,
      socketManager: createMockSocketManager(),
      approvalRecordStore,
    });
    return { app, approvalRecordStore };
  }

  test('lists user approval records with total count and thread title search', async () => {
    const { app, approvalRecordStore } = await createApp();
    const now = Date.now();
    approvalRecordStore.record({
      requestId: 'req-1',
      invocationId: 'inv-1',
      agentId: 'codex',
      threadId: 'thread-1',
      threadTitle: '部署发布会话',
      action: 'shell_command',
      operationSummary: '执行命令：deploy',
      decision: 'allow',
      approvalSource: 'user',
      requestedAt: now - 1000,
      decidedAt: now,
      scope: 'once',
      decidedBy: 'user-1',
    });
    approvalRecordStore.record({
      requestId: '',
      invocationId: 'inv-rule',
      agentId: 'codex',
      threadId: 'thread-2',
      threadTitle: '规则命中会话',
      action: 'shell_command',
      operationSummary: '执行命令：status',
      decision: 'allow',
      approvalSource: 'rule',
      requestedAt: now,
      decidedAt: now,
      matchedRuleId: 'rule-1',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/records?threadQuery=部署',
      headers: { 'x-office-claw-user': 'user-1' },
    });

    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body);
    assert.equal(body.totalCount, 1);
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].threadTitle, '部署发布会话');
    assert.equal(body.records[0].operationSummary, '执行命令：deploy');
    assert.equal(body.retention.autoCleanupEnabled, true);
    assert.equal(body.retention.retentionDays, 30);

    await app.close();
    approvalRecordStore.close();
  });

  test('lists approval records with offset pagination', async () => {
    const { app, approvalRecordStore } = await createApp();
    const now = Date.now();
    for (let index = 0; index < 3; index += 1) {
      approvalRecordStore.record({
        requestId: `req-${index}`,
        invocationId: `inv-${index}`,
        agentId: 'codex',
        threadId: 'thread-1',
        threadTitle: '分页会话',
        action: `operation_${index}`,
        operationSummary: `操作 ${index}`,
        decision: 'allow',
        approvalSource: 'user',
        requestedAt: now + index,
        decidedAt: now + index,
        scope: 'once',
        decidedBy: 'user-1',
      });
    }

    const firstPage = await app.inject({
      method: 'GET',
      url: '/api/authorization/records?limit=2&offset=0',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(firstPage.statusCode, 200, firstPage.body);
    const firstBody = JSON.parse(firstPage.body);
    assert.equal(firstBody.records.length, 2);
    assert.equal(firstBody.totalCount, 3);
    assert.equal(firstBody.pageInfo.hasMore, true);
    assert.equal(firstBody.pageInfo.nextOffset, 2);

    const secondPage = await app.inject({
      method: 'GET',
      url: '/api/authorization/records?limit=2&offset=2',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(secondPage.statusCode, 200, secondPage.body);
    const secondBody = JSON.parse(secondPage.body);
    assert.equal(secondBody.records.length, 1);
    assert.equal(secondBody.pageInfo.hasMore, false);
    assert.equal(Object.hasOwn(secondBody.pageInfo, 'nextOffset'), false);

    await app.close();
    approvalRecordStore.close();
  });

  test('updates auto cleanup settings', async () => {
    const { app, approvalRecordStore } = await createApp();

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/authorization/records/settings',
      headers: { 'x-office-claw-user': 'user-1' },
      payload: { autoCleanupEnabled: false },
    });
    assert.equal(updateRes.statusCode, 200);
    assert.equal(JSON.parse(updateRes.body).autoCleanupEnabled, false);

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/authorization/records/settings',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(getRes.statusCode, 200);
    assert.equal(JSON.parse(getRes.body).autoCleanupEnabled, false);

    await app.close();
    approvalRecordStore.close();
  });

  test('returns 400 for invalid negative offset', async () => {
    const { app, approvalRecordStore } = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/records?offset=-1',
      headers: { 'x-office-claw-user': 'user-1' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, 'Invalid query');

    await app.close();
    approvalRecordStore.close();
  });
});
