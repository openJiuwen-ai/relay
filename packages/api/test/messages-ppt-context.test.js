/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

function makeMockSocketManager() {
  return {
    broadcastToRoom() {},
    broadcastAgentMessage() {},
    emitToUser() {},
  };
}

function makeMockInvocationTracker() {
  return {
    has: () => false,
    isDeleting: () => false,
    start: () => new AbortController(),
    tryStartThread: () => new AbortController(),
    complete: () => {},
  };
}

function makeMockInvocationRecordStore() {
  return {
    create: async () => ({ outcome: 'created', invocationId: 'inv-ppt-context' }),
    update: async () => {},
  };
}

describe('POST /api/messages pptContext', () => {
  it('passes PPT targeting as hidden mode prompt while keeping stored user content clean', async () => {
    const { messagesRoutes } = await import('../dist/routes/messages.js');
    const appendedMessages = [];
    const routeExecutionCalls = [];
    const app = Fastify();
    const pptTemplateStore = {
      get: async (templateId) =>
        templateId === 'builtin:light-tech'
          ? { templateId, name: '浅色科技风' }
          : null,
    };

    const router = {
      resolveTargetsAndIntent: async () => ({
        targetCats: ['codex'],
        intent: { intent: 'execute', explicit: false, promptTags: [] },
      }),
      routeExecution: async function* (userId, message, threadId, userMessageId, targetCats, intent, options) {
        routeExecutionCalls.push({ userId, message, threadId, userMessageId, targetCats, intent, options });
        yield { type: 'done', catId: 'codex', isFinal: true, timestamp: Date.now() };
      },
      route: async function* () {},
      ackCollectedCursors: async () => {},
    };

    await app.register(messagesRoutes, {
      registry: { active: () => new Set() },
      messageStore: {
        append: async (message) => {
          appendedMessages.push(message);
          return { id: `msg-${appendedMessages.length}`, ...message };
        },
        updateStatus: async () => {},
      },
      socketManager: makeMockSocketManager(),
      router,
      invocationTracker: makeMockInvocationTracker(),
      invocationRecordStore: makeMockInvocationRecordStore(),
      pptTemplateStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'x-office-claw-user': 'test-user',
      },
      payload: {
        content: '把这里改得更有高管汇报感',
        threadId: 'thread-ppt',
        pptContext: {
          projectRoot: '/tmp/ppt-root',
          pagesDir: 'output/demo/pages',
          deckTitle: 'Demo Deck',
        },
        pptTemplateId: 'builtin:light-tech',
      },
    });

    assert.equal(res.statusCode, 200);
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(appendedMessages[0].content, '把这里改得更有高管汇报感');
    assert.equal(appendedMessages[0].content.includes('page-1.pptx.html'), false);
    assert.equal(routeExecutionCalls[0].message, '把这里改得更有高管汇报感\n\nPPT风格要求：浅色科技风');
    assert.match(routeExecutionCalls[0].options.modeSystemPrompt, /output\/demo\/pages/);
    assert.match(routeExecutionCalls[0].options.modeSystemPrompt, /Demo Deck/);
    assert.match(routeExecutionCalls[0].options.modeSystemPrompt, /Preferred PPT template ID: builtin:light-tech/);
    assert.doesNotMatch(routeExecutionCalls[0].options.modeSystemPrompt, /do not export/i);

    await app.close();
  });

  it('does not fabricate pptContext for template-only new deck generation', async () => {
    const { messagesRoutes } = await import('../dist/routes/messages.js');
    const routeExecutionCalls = [];
    const app = Fastify();
    const pptTemplateStore = {
      get: async (templateId) =>
        templateId === 'builtin:light-tech'
          ? { templateId, name: '浅色科技风' }
          : null,
    };

    const router = {
      resolveTargetsAndIntent: async () => ({
        targetCats: ['codex'],
        intent: { intent: 'execute', explicit: false, promptTags: [] },
      }),
      routeExecution: async function* (userId, message, threadId, userMessageId, targetCats, intent, options) {
        routeExecutionCalls.push({ userId, message, threadId, userMessageId, targetCats, intent, options });
        yield { type: 'done', catId: 'codex', isFinal: true, timestamp: Date.now() };
      },
      route: async function* () {},
      ackCollectedCursors: async () => {},
    };

    await app.register(messagesRoutes, {
      registry: { active: () => new Set() },
      messageStore: {
        append: async (message) => ({ id: 'msg-1', ...message }),
        updateStatus: async () => {},
      },
      socketManager: makeMockSocketManager(),
      router,
      invocationTracker: makeMockInvocationTracker(),
      invocationRecordStore: makeMockInvocationRecordStore(),
      pptTemplateStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'x-office-claw-user': 'test-user',
      },
      payload: {
        content: '帮我生成一份关于 AI 趋势的 PPT',
        threadId: 'thread-new-ppt',
        pptTemplateId: 'builtin:light-tech',
      },
    });

    assert.equal(res.statusCode, 200);
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(routeExecutionCalls[0].message, '帮我生成一份关于 AI 趋势的 PPT\n\nPPT风格要求：浅色科技风');
    assert.equal(routeExecutionCalls[0].options.modeSystemPrompt, undefined);

    await app.close();
  });

  it('injects template directory path for custom user templates', async () => {
    const { messagesRoutes } = await import('../dist/routes/messages.js');
    const routeExecutionCalls = [];
    const app = Fastify();
    const pptTemplateStore = {
      get: async (templateId) =>
        templateId === 'user:enterprise-blue'
          ? {
              templateId,
              source: 'user',
              name: '企业蓝',
            }
          : null,
      resolveTemplatePromptPaths: async (templateId) =>
        templateId === 'user:enterprise-blue'
          ? {
              templateDir: 'D:\\repo\\.office-claw\\ppt-template\\enterprise-blue',
              templateMainFile: 'D:\\repo\\.office-claw\\ppt-template\\enterprise-blue\\企业蓝.md',
            }
          : null,
    };

    const router = {
      resolveTargetsAndIntent: async () => ({
        targetCats: ['codex'],
        intent: { intent: 'execute', explicit: false, promptTags: [] },
      }),
      routeExecution: async function* (userId, message, threadId, userMessageId, targetCats, intent, options) {
        routeExecutionCalls.push({ userId, message, threadId, userMessageId, targetCats, intent, options });
        yield { type: 'done', catId: 'codex', isFinal: true, timestamp: Date.now() };
      },
      route: async function* () {},
      ackCollectedCursors: async () => {},
    };

    await app.register(messagesRoutes, {
      registry: { active: () => new Set() },
      messageStore: {
        append: async (message) => ({ id: 'msg-1', ...message }),
        updateStatus: async () => {},
      },
      socketManager: makeMockSocketManager(),
      router,
      invocationTracker: makeMockInvocationTracker(),
      invocationRecordStore: makeMockInvocationRecordStore(),
      pptTemplateStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'x-office-claw-user': 'test-user',
      },
      payload: {
        content: '帮我生成一份企业发布会 PPT',
        threadId: 'thread-custom-ppt',
        pptTemplateId: 'user:enterprise-blue',
      },
    });

    assert.equal(res.statusCode, 200);
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(
      routeExecutionCalls[0].message,
      '帮我生成一份企业发布会 PPT\n\nPPT风格要求：使用自定义模板。\n模板名称：企业蓝\n模板目录路径：D:/repo/.office-claw/ppt-template/enterprise-blue\n模板主文件路径：D:/repo/.office-claw/ppt-template/enterprise-blue/企业蓝.md\n请严格基于该模板生成 PPT。',
    );
    assert.equal(routeExecutionCalls[0].options.modeSystemPrompt, undefined);

    await app.close();
  });

  it('rejects custom templates when safe prompt paths cannot be resolved', async () => {
    const { messagesRoutes } = await import('../dist/routes/messages.js');
    const routeExecutionCalls = [];
    const app = Fastify();
    const pptTemplateStore = {
      get: async (templateId) =>
        templateId === 'user:enterprise-blue'
          ? {
              templateId,
              source: 'user',
              name: '企业蓝',
            }
          : null,
      resolveTemplatePromptPaths: async () => null,
    };

    const router = {
      resolveTargetsAndIntent: async () => ({
        targetCats: ['codex'],
        intent: { intent: 'execute', explicit: false, promptTags: [] },
      }),
      routeExecution: async function* (...args) {
        routeExecutionCalls.push(args);
        yield { type: 'done', catId: 'codex', isFinal: true, timestamp: Date.now() };
      },
      route: async function* () {},
      ackCollectedCursors: async () => {},
    };

    await app.register(messagesRoutes, {
      registry: { active: () => new Set() },
      messageStore: {
        append: async (message) => ({ id: 'msg-1', ...message }),
        updateStatus: async () => {},
      },
      socketManager: makeMockSocketManager(),
      router,
      invocationTracker: makeMockInvocationTracker(),
      invocationRecordStore: makeMockInvocationRecordStore(),
      pptTemplateStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'x-office-claw-user': 'test-user',
      },
      payload: {
        content: '帮我生成一份企业发布会 PPT',
        threadId: 'thread-custom-ppt',
        pptTemplateId: 'user:enterprise-blue',
      },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, 'ppt_template_not_ready');
    assert.equal(routeExecutionCalls.length, 0);

    await app.close();
  });
});
