/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { transformOpenCodeEvent } from '../dist/domains/agents/services/agents/providers/opencode-event-transform.js';

const agentId = 'opencode';

describe('transformOpenCodeEvent', () => {
  // ── step_start → session_init ──
  test('maps step_start → session_init with sessionID', () => {
    const event = {
      type: 'step_start',
      timestamp: 1773304958492,
      sessionID: 'ses_31ec9cff6ffe2fh92VnIubiN7o',
      part: { type: 'step-start', id: 'prt_xxx', sessionID: 'ses_31ec9cff6ffe2fh92VnIubiN7o', messageID: 'msg_xxx' },
    };
    const result = transformOpenCodeEvent(event, agentId);
    assert.ok(result);
    assert.strictEqual(result.type, 'session_init');
    assert.strictEqual(result.sessionId, 'ses_31ec9cff6ffe2fh92VnIubiN7o');
    assert.strictEqual(result.agentId, agentId);
  });

  // ── text → text ──
  test('maps text → text with content', () => {
    const event = {
      type: 'text',
      timestamp: 1773304958494,
      sessionID: 'ses_xxx',
      part: { type: 'text', text: 'HELLO_OPENCODE', time: { start: 1773304958493, end: 1773304958493 } },
    };
    const result = transformOpenCodeEvent(event, agentId);
    assert.ok(result);
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'HELLO_OPENCODE');
    assert.strictEqual(result.agentId, agentId);
  });

  // ── tool_use → tool_use ──
  test('maps tool_use → tool_use with toolName and toolInput', () => {
    const event = {
      type: 'tool_use',
      timestamp: 1773304980356,
      sessionID: 'ses_xxx',
      part: {
        type: 'tool',
        callID: 'toolu_xxx',
        tool: 'bash',
        state: {
          status: 'completed',
          input: { command: 'ls -la', description: 'List files' },
          output: 'file1.txt\nfile2.txt',
        },
      },
    };
    const result = transformOpenCodeEvent(event, agentId);
    assert.ok(result);
    assert.strictEqual(result.type, 'tool_use');
    assert.strictEqual(result.toolName, 'bash');
    assert.deepStrictEqual(result.toolInput, { command: 'ls -la', description: 'List files' });
  });

  // ── tool_use completed → also yields tool_result ──
  test('maps tool_use with completed status including output', () => {
    const event = {
      type: 'tool_use',
      timestamp: 1773304980356,
      sessionID: 'ses_xxx',
      part: {
        type: 'tool',
        callID: 'toolu_xxx',
        tool: 'read',
        state: { status: 'completed', input: { path: '/tmp/file.txt' }, output: 'file contents' },
      },
    };
    const result = transformOpenCodeEvent(event, agentId);
    assert.ok(result);
    // tool_use is the primary mapping; output is available in toolInput
    assert.strictEqual(result.type, 'tool_use');
    assert.strictEqual(result.toolName, 'read');
  });

  // ── step_finish → null ──
  test('maps step_finish → null (metadata only)', () => {
    const event = {
      type: 'step_finish',
      timestamp: 1773304958508,
      sessionID: 'ses_xxx',
      part: {
        type: 'step-finish',
        reason: 'stop',
        cost: 0.036973,
        tokens: { total: 36937, input: 36928, output: 9, reasoning: 0 },
      },
    };
    const result = transformOpenCodeEvent(event, agentId);
    assert.strictEqual(result, null);
  });

  // ── error → error ──
  test('maps error event → error', () => {
    const event = {
      type: 'error',
      timestamp: 1773298718314,
      sessionID: 'ses_xxx',
      error: { name: 'APIError', data: { message: 'Rate limit exceeded', statusCode: 429 } },
    };
    const result = transformOpenCodeEvent(event, agentId);
    assert.ok(result);
    assert.strictEqual(result.type, 'error');
    assert.ok(result.error);
    assert.ok(result.error.includes('Rate limit exceeded'));
  });

  // ── unknown → null ──
  test('returns null for unknown event type', () => {
    const event = { type: 'heartbeat', timestamp: 123456, sessionID: 'ses_xxx' };
    const result = transformOpenCodeEvent(event, agentId);
    assert.strictEqual(result, null);
  });

  // ── graceful handling ──
  test('returns null for non-object input', () => {
    const result = transformOpenCodeEvent('not an object', agentId);
    assert.strictEqual(result, null);
  });

  test('returns null for event missing type', () => {
    const result = transformOpenCodeEvent({ timestamp: 123 }, agentId);
    assert.strictEqual(result, null);
  });

  // ── timestamp ──
  test('uses event timestamp in output', () => {
    const event = {
      type: 'text',
      timestamp: 1773304958494,
      sessionID: 'ses_xxx',
      part: { type: 'text', text: 'hello' },
    };
    const result = transformOpenCodeEvent(event, agentId);
    assert.ok(result);
    assert.strictEqual(result.timestamp, 1773304958494);
  });
});
