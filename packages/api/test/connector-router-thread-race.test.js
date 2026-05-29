/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConnectorRouter } from '../dist/infrastructure/connectors/ConnectorRouter.js';
import { MemoryConnectorThreadBindingStore } from '../dist/infrastructure/connectors/ConnectorThreadBindingStore.js';
import { InboundMessageDedup } from '../dist/infrastructure/connectors/InboundMessageDedup.js';

function noopLog() {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => noopLog(),
  };
}

function mockMessageStore() {
  const messages = [];
  return {
    messages,
    async append(input) {
      const msg = { id: `msg-${messages.length + 1}`, ...input };
      messages.push(msg);
      return msg;
    },
  };
}

function mockThreadStore() {
  let counter = 0;
  const threads = new Map();
  return {
    threads,
    create(userId, title) {
      const thread = {
        id: `thread-${++counter}`,
        createdBy: userId,
        title,
        participants: [],
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
        projectPath: 'default',
      };
      threads.set(thread.id, thread);
      return thread;
    },
  };
}

function mockTrigger() {
  const calls = [];
  return {
    calls,
    trigger(threadId, catId, userId, message, messageId) {
      calls.push({ threadId, catId, userId, message, messageId });
    },
  };
}

function mockSocketManager() {
  return {
    broadcastToRoom() {},
    emitToUser() {},
  };
}

describe('ConnectorRouter thread creation race protection', () => {
  it('creates only one thread when two concurrent messages arrive for the same chat with no binding', async () => {
    const bindingStore = new MemoryConnectorThreadBindingStore();
    let createCalls = 0;
    let releaseCreate;
    let firstCreateEnteredResolve;
    const firstCreateEntered = new Promise((resolve) => {
      firstCreateEnteredResolve = resolve;
    });
    const createBarrier = new Promise((resolve) => {
      releaseCreate = resolve;
    });

    const baseThreadStore = mockThreadStore();
    const racingThreadStore = {
      ...baseThreadStore,
      async create(userId, title) {
        createCalls += 1;
        firstCreateEnteredResolve();
        await createBarrier;
        return baseThreadStore.create(userId, title);
      },
    };

    const router = new ConnectorRouter({
      bindingStore,
      dedup: new InboundMessageDedup(),
      messageStore: mockMessageStore(),
      threadStore: racingThreadStore,
      invokeTrigger: mockTrigger(),
      socketManager: mockSocketManager(),
      defaultUserId: 'owner-1',
      defaultCatId: 'opus',
      log: noopLog(),
    });

    // Simulate Feishu sending text + file events concurrently for the same chat
    const textEvent = router.route('feishu', 'chat-race', 'Hello', 'ext-text-1');
    await firstCreateEntered;

    const fileEvent = router.route('feishu', 'chat-race', '[文件] doc.pdf', 'ext-file-1');
    await new Promise((resolve) => setImmediate(resolve));

    // The second event should be waiting — no second thread created yet
    assert.equal(createCalls, 1, 'second event should wait on the in-flight thread creation');

    releaseCreate();
    const [r1, r2] = await Promise.all([textEvent, fileEvent]);

    assert.equal(r1.kind, 'routed');
    assert.equal(r2.kind, 'routed');
    assert.equal(r1.threadId, r2.threadId, 'both messages should route to the same thread');
    assert.equal(createCalls, 1, 'only one thread should be created');
  });

  it('allows parallel processing for different chats', async () => {
    const bindingStore = new MemoryConnectorThreadBindingStore();
    let createCalls = 0;
    let releaseCreate;
    const createBarrier = new Promise((resolve) => {
      releaseCreate = resolve;
    });

    const baseThreadStore = mockThreadStore();
    const slowThreadStore = {
      ...baseThreadStore,
      async create(userId, title) {
        createCalls += 1;
        await createBarrier;
        return baseThreadStore.create(userId, title);
      },
    };

    const router = new ConnectorRouter({
      bindingStore,
      dedup: new InboundMessageDedup(),
      messageStore: mockMessageStore(),
      threadStore: slowThreadStore,
      invokeTrigger: mockTrigger(),
      socketManager: mockSocketManager(),
      defaultUserId: 'owner-1',
      defaultCatId: 'opus',
      log: noopLog(),
    });

    // Two different chats — should both enter create() concurrently
    const event1 = router.route('feishu', 'chat-A', 'Hello', 'ext-A-1');
    const event2 = router.route('feishu', 'chat-B', 'World', 'ext-B-1');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(createCalls, 2, 'different chats should create threads in parallel');

    releaseCreate();
    const [r1, r2] = await Promise.all([event1, event2]);

    assert.equal(r1.kind, 'routed');
    assert.equal(r2.kind, 'routed');
    assert.notEqual(r1.threadId, r2.threadId, 'different chats should get different threads');
  });

  it('second message reuses existing binding when first has already completed', async () => {
    const bindingStore = new MemoryConnectorThreadBindingStore();
    const threadStore = mockThreadStore();

    const router = new ConnectorRouter({
      bindingStore,
      dedup: new InboundMessageDedup(),
      messageStore: mockMessageStore(),
      threadStore,
      invokeTrigger: mockTrigger(),
      socketManager: mockSocketManager(),
      defaultUserId: 'owner-1',
      defaultCatId: 'opus',
      log: noopLog(),
    });

    // First message creates thread + binding
    const r1 = await router.route('feishu', 'chat-seq', 'Hello', 'ext-seq-1');
    assert.equal(r1.kind, 'routed');

    // Second message should reuse existing binding
    const r2 = await router.route('feishu', 'chat-seq', '[文件] doc.pdf', 'ext-seq-2');
    assert.equal(r2.kind, 'routed');
    assert.equal(r1.threadId, r2.threadId, 'sequential messages should share the same thread');
    assert.equal(threadStore.threads.size, 1, 'only one thread should exist');
  });
});
