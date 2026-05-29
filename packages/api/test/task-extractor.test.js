/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * TaskExtractor tests
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractTasks, toCreateTaskInputs } from '../dist/domains/agents/services/orchestration/TaskExtractor.js';

// Mock AgentService that returns valid JSON
const mockServiceWithJSON = {
  async *invoke() {
    yield { type: 'text', content: '[{"title": "Test task", "why": "Testing", "sourceIndex": 0}]' };
    yield { type: 'done', agentId: 'opus' };
  },
};

// Mock AgentService that returns invalid response
const mockServiceWithGarbage = {
  async *invoke() {
    yield { type: 'text', content: 'Here are some tasks but no JSON' };
    yield { type: 'done', agentId: 'opus' };
  },
};

// Mock AgentService that errors
const mockServiceWithError = {
  async *invoke() {
    yield { type: 'error', error: 'LLM API failed' };
  },
};

const mockMessages = [
  { id: 'msg-1', content: 'We need to TODO: implement auth', agentId: null },
  { id: 'msg-2', content: 'I agree - [ ] add login page', agentId: 'opus' },
];

describe('extractTasks', () => {
  it('happy path: parses valid JSON from LLM', async () => {
    const result = await extractTasks(mockMessages, mockServiceWithJSON, {
      threadId: 'thread-1',
      userId: 'user-1',
    });

    assert.equal(result.degraded, false);
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].title, 'Test task');
    assert.equal(result.tasks[0].why, 'Testing');
  });

  it('returns empty for empty messages', async () => {
    const result = await extractTasks([], mockServiceWithJSON, {
      threadId: 'thread-1',
      userId: 'user-1',
    });

    assert.equal(result.tasks.length, 0);
    assert.equal(result.degraded, false);
  });

  it('falls back to pattern matching on invalid JSON', async () => {
    const result = await extractTasks(mockMessages, mockServiceWithGarbage, {
      threadId: 'thread-1',
      userId: 'user-1',
    });

    assert.equal(result.degraded, true);
    assert.ok(result.reason?.includes('JSON'));
    // Should find TODO and checkbox from messages
    assert.ok(result.tasks.length >= 1);
  });

  it('falls back to pattern matching on LLM error', async () => {
    const result = await extractTasks(mockMessages, mockServiceWithError, {
      threadId: 'thread-1',
      userId: 'user-1',
    });

    assert.equal(result.degraded, true);
    assert.ok(result.tasks.length >= 1);
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await extractTasks(mockMessages, mockServiceWithJSON, {
      threadId: 'thread-1',
      userId: 'user-1',
      signal: controller.signal,
    });

    assert.equal(result.degraded, true);
    assert.ok(result.reason?.includes('Aborted'));
  });

  it('respects maxMessages option', async () => {
    const manyMessages = Array(100)
      .fill(null)
      .map((_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`,
        agentId: null,
      }));

    const result = await extractTasks(manyMessages, mockServiceWithJSON, {
      threadId: 'thread-1',
      userId: 'user-1',
      maxMessages: 10,
    });

    // Should not throw or fail
    assert.equal(result.degraded, false);
  });
});

describe('toCreateTaskInputs', () => {
  it('converts extracted tasks to CreateTaskInput', () => {
    const extracted = [
      { title: 'Task 1', why: 'Reason 1' },
      { title: 'Task 2', why: 'Reason 2', ownerAgentId: 'opus', sourceMessageId: 'msg-1' },
    ];

    const inputs = toCreateTaskInputs(extracted, 'thread-1', 'user');

    assert.equal(inputs.length, 2);
    assert.equal(inputs[0].threadId, 'thread-1');
    assert.equal(inputs[0].title, 'Task 1');
    assert.equal(inputs[0].createdBy, 'user');
    assert.equal(inputs[0].ownerAgentId, null);
    assert.equal(inputs[1].ownerAgentId, 'opus');
    assert.equal(inputs[1].sourceMessageId, 'msg-1');
  });
});

describe('sourceIndex normalization (#33)', () => {
  const messagesWithIds = [
    { id: 'msg-aaa', content: 'First message', agentId: null },
    { id: 'msg-bbb', content: 'Second message', agentId: null },
    { id: 'msg-ccc', content: 'Third message', agentId: 'opus' },
  ];

  it('parses sourceIndex as number', async () => {
    const mockService = {
      async *invoke() {
        yield { type: 'text', content: '[{"title": "Task", "why": "Test", "sourceIndex": 1}]' };
        yield { type: 'done', agentId: 'opus' };
      },
    };
    const result = await extractTasks(messagesWithIds, mockService, {
      threadId: 't1',
      userId: 'u1',
    });
    assert.equal(result.tasks[0].sourceMessageId, 'msg-bbb');
  });

  it('parses sourceIndex as string number "1"', async () => {
    const mockService = {
      async *invoke() {
        yield { type: 'text', content: '[{"title": "Task", "why": "Test", "sourceIndex": "1"}]' };
        yield { type: 'done', agentId: 'opus' };
      },
    };
    const result = await extractTasks(messagesWithIds, mockService, {
      threadId: 't1',
      userId: 'u1',
    });
    assert.equal(result.tasks[0].sourceMessageId, 'msg-bbb');
  });

  it('parses sourceIndex as "msg-N" format', async () => {
    const mockService = {
      async *invoke() {
        yield { type: 'text', content: '[{"title": "Task", "why": "Test", "sourceIndex": "msg-2"}]' };
        yield { type: 'done', agentId: 'opus' };
      },
    };
    const result = await extractTasks(messagesWithIds, mockService, {
      threadId: 't1',
      userId: 'u1',
    });
    assert.equal(result.tasks[0].sourceMessageId, 'msg-ccc');
  });

  it('ignores invalid sourceIndex', async () => {
    const mockService = {
      async *invoke() {
        yield { type: 'text', content: '[{"title": "Task", "why": "Test", "sourceIndex": "invalid"}]' };
        yield { type: 'done', agentId: 'opus' };
      },
    };
    const result = await extractTasks(messagesWithIds, mockService, {
      threadId: 't1',
      userId: 'u1',
    });
    assert.equal(result.tasks[0].sourceMessageId, undefined);
  });

  it('validates ownerAgentId to known cats only', async () => {
    const mockService = {
      async *invoke() {
        yield {
          type: 'text',
          content:
            '[{"title": "Task1", "why": "T", "ownerAgentId": "opus"}, {"title": "Task2", "why": "T", "ownerAgentId": "unknown"}, {"title": "Task3", "why": "T", "ownerAgentId": 123}]',
        };
        yield { type: 'done', agentId: 'opus' };
      },
    };
    const result = await extractTasks(messagesWithIds, mockService, {
      threadId: 't1',
      userId: 'u1',
    });
    assert.equal(result.tasks[0].ownerAgentId, 'opus');
    assert.equal(result.tasks[1].ownerAgentId, undefined);
    assert.equal(result.tasks[2].ownerAgentId, undefined);
  });
});

describe('Pattern extraction fallback', () => {
  it('extracts TODO patterns', async () => {
    const msgs = [{ id: 'm1', content: 'TODO: fix the bug', agentId: null }];
    const result = await extractTasks(msgs, mockServiceWithGarbage, {
      threadId: 'thread-1',
      userId: 'user-1',
    });

    assert.ok(result.tasks.some((t) => t.title.includes('fix the bug')));
  });

  it('extracts checkbox patterns', async () => {
    const msgs = [{ id: 'm1', content: '- [ ] implement feature', agentId: null }];
    const result = await extractTasks(msgs, mockServiceWithGarbage, {
      threadId: 'thread-1',
      userId: 'user-1',
    });

    assert.ok(result.tasks.some((t) => t.title.includes('implement feature')));
  });

  it('extracts #task patterns', async () => {
    const msgs = [{ id: 'm1', content: '#task review the code', agentId: null }];
    const result = await extractTasks(msgs, mockServiceWithGarbage, {
      threadId: 'thread-1',
      userId: 'user-1',
    });

    assert.ok(result.tasks.some((t) => t.title.includes('review the code')));
  });
});
