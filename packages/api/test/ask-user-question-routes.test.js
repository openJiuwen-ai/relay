/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';

const { AskUserQuestionBridge } = await import('../dist/domains/agents/services/ask/AskUserQuestionBridge.js');
const { askUserQuestionRoutes } = await import('../dist/routes/ask-user-question.js');

describe('ask user question routes', () => {
  let bridge;
  let submitted;

  beforeEach(() => {
    submitted = [];
    bridge = new AskUserQuestionBridge();
  });

  async function createApp() {
    const app = Fastify();
    await app.register(askUserQuestionRoutes, { askUserQuestionBridge: bridge });
    return app;
  }

  test('returns pending ask_user_question records for a thread', async () => {
    const app = await createApp();

    await bridge.ingestAskUserQuestion({
      catId: 'codex',
      threadId: 'thread-ask',
      invocationId: 'inv-ask',
      sessionId: 'session-ask',
      payload: {
        request_id: 'jiuwen-ask-1',
        source: 'ask_tool',
        questions: [
          {
            header: '数据库',
            question: '你想使用哪种数据库？',
            options: [{ label: 'PostgreSQL' }, { label: 'MongoDB' }],
            multi_select: false,
          },
        ],
      },
      submitAnswer: async (answer) => {
        submitted.push(answer);
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/ask-user-question/pending?threadId=thread-ask',
      headers: { 'x-office-claw-user': 'user-1' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.pending.length, 1);
    assert.equal(body.pending[0].source, 'ask_tool');
    assert.equal(body.pending[0].questions[0].question, '你想使用哪种数据库？');
  });

  test('bridges ask_user_question answers back to jiuwen', async () => {
    const app = await createApp();

    const record = await bridge.ingestAskUserQuestion({
      catId: 'codex',
      threadId: 'thread-ask',
      invocationId: 'inv-ask',
      sessionId: 'session-ask',
      payload: {
        request_id: 'jiuwen-ask-2',
        source: 'ask_tool',
        questions: [
          {
            header: '数据库',
            question: '你想使用哪种数据库？',
            options: [{ label: 'PostgreSQL' }, { label: 'MongoDB' }],
            multi_select: false,
          },
        ],
      },
      submitAnswer: async (answer) => {
        submitted.push(answer);
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/ask-user-question/respond',
      headers: { 'x-office-claw-user': 'user-1' },
      payload: {
        requestId: record.localRequestId,
        source: 'ask_tool',
        answers: [
          {
            question: '你想使用哪种数据库？',
            selected_options: ['PostgreSQL'],
            custom_input: null,
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0], {
      sessionId: 'session-ask',
      jiuwenRequestId: 'jiuwen-ask-2',
      source: 'ask_tool',
      answers: [
        {
          question: '你想使用哪种数据库？',
          selected_options: ['PostgreSQL'],
        },
      ],
    });
  });
});
