/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  transformRelayClawChunk,
} = await import('../dist/domains/agents/services/agents/providers/relayclaw-event-transform.js');

const CAT = 'jiuwenclaw';

test('task.start with task_id + task_content → system_info task_boundary', () => {
  const msg = transformRelayClawChunk(
    {
      request_id: 'req-1',
      payload: {
        event_type: 'task.start',
        task_id: 'skill_step:1',
        task_content: '正在创建任务清单',
        task_index: 0,
        total_tasks: 3,
      },
    },
    CAT,
  );
  assert.equal(msg?.type, 'system_info');
  assert.equal(msg?.taskPhase, 'start');
  assert.equal(msg?.taskContext?.id, 'skill_step:1');
  assert.equal(msg?.taskContext?.title, '正在创建任务清单');
  assert.equal(msg?.taskContext?.index, 0);
  assert.equal(msg?.taskContext?.total, 3);
  const body = JSON.parse(msg?.content ?? '{}');
  assert.equal(body.type, 'task_boundary');
  assert.equal(body.phase, 'start');
});

test('task.start without task_id → null', () => {
  const msg = transformRelayClawChunk(
    {
      request_id: 'req-2',
      payload: {
        event_type: 'task.start',
        task_content: 'only title',
      },
    },
    CAT,
  );
  assert.equal(msg, null);
});

test('task.complete with task_id → system_info', () => {
  const msg = transformRelayClawChunk(
    {
      request_id: 'req-2b',
      payload: {
        event_type: 'task.complete',
        task_id: 'skill_step:1',
        task_content: 'Done',
      },
    },
    CAT,
  );
  assert.equal(msg?.type, 'system_info');
  assert.equal(msg?.taskPhase, 'complete');
  assert.equal(msg?.taskContext?.id, 'skill_step:1');
});

test('chat.delta behavior unchanged → text message', () => {
  const msg = transformRelayClawChunk(
    {
      request_id: 'req-3',
      payload: {
        event_type: 'chat.delta',
        content: 'hello',
      },
    },
    CAT,
  );
  assert.equal(msg?.type, 'text');
  assert.equal(msg?.content, 'hello');
});

test('task.update → system_info with task_progress content', () => {
  const msg = transformRelayClawChunk(
    {
      request_id: 'req-4',
      payload: {
        event_type: 'task.update',
        tasks: [
          {
            task_id: 'task-1',
            task_content: 'Construct meeting points',
            task_index: 0,
            source: 'todo',
            status: 'in_progress',
          },
          {
            task_id: 'task-2',
            task_content: 'Write meeting minutes',
            task_index: 0,
            source: 'todo',
            status: 'pending',
          }
        ],
      },
    },
    CAT,
  );
  assert.equal(msg?.type, 'system_info');
  const body = JSON.parse(msg?.content ?? '{}');
  assert.equal(body.type, 'task_progress');
  assert.equal(body.agentId, CAT);
  assert.equal(body.tasks.length, 2);
  assert.equal(body.tasks[0].id, 'task-1');
  assert.equal(body.tasks[0].subject, 'Construct meeting points');
  assert.equal(body.tasks[0].status, 'in_progress');
  assert.equal(body.tasks[1].id, 'task-2');
  assert.equal(body.tasks[1].status, 'pending');
});

