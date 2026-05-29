/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { richBlocksFromSendFileToUserTool, stripLeadingDirectCatMention, toStoredToolEvent } = await import(
  '../dist/domains/agents/services/agents/routing/route-helpers.js'
);

describe('route-helpers', () => {
  it('strips the current cat direct mention from the start of a user task', () => {
    assert.equal(stripLeadingDirectCatMention('@office 帮我做一页 PPT', 'jiuwenclaw'), '帮我做一页 PPT');
    assert.equal(stripLeadingDirectCatMention('@office，帮我做一页 PPT', 'jiuwenclaw'), '帮我做一页 PPT');
  });

  it('does not strip mentions that are not direct leading addresses', () => {
    assert.equal(
      stripLeadingDirectCatMention('请 @office 帮我做一页 PPT', 'jiuwenclaw'),
      '请 @office 帮我做一页 PPT',
    );
  });
});

describe('toStoredToolEvent', () => {
  it('preserves toolCallId in tool_use event', () => {
    const msg = {
      type: 'tool_use',
      agentId: 'office',
      toolName: 'Read',
      toolInput: { file_path: '/test.txt' },
      toolCallId: 'call-abc123',
      timestamp: 1709500000000,
    };
    const result = toStoredToolEvent(msg);
    assert.ok(result);
    assert.strictEqual(result.type, 'tool_use');
    assert.strictEqual(result.toolCallId, 'call-abc123');
    assert.ok(result.label.includes('Read'));
  });

  it('preserves toolCallId in tool_result event', () => {
    const msg = {
      type: 'tool_result',
      agentId: 'office',
      content: 'file contents here',
      toolCallId: 'call-abc123',
      timestamp: 1709500001000,
    };
    const result = toStoredToolEvent(msg);
    assert.ok(result);
    assert.strictEqual(result.type, 'tool_result');
    assert.strictEqual(result.toolCallId, 'call-abc123');
  });

  it('gracefully handles missing toolCallId (backward compat)', () => {
    const msg = {
      type: 'tool_use',
      agentId: 'office',
      toolName: 'Bash',
      timestamp: 1709500002000,
    };
    const result = toStoredToolEvent(msg);
    assert.ok(result);
    assert.strictEqual(result.toolCallId, undefined);
    // Should not have toolCallId property set to undefined
    assert.strictEqual('toolCallId' in result, false);
  });

  it('pairs tool_use and tool_result by same toolCallId', () => {
    const toolCallId = 'call-pair-test';
    const useMsg = {
      type: 'tool_use',
      agentId: 'office',
      toolName: 'Write',
      toolCallId,
      timestamp: 1709500003000,
    };
    const resultMsg = {
      type: 'tool_result',
      agentId: 'office',
      content: 'written successfully',
      toolCallId,
      timestamp: 1709500004000,
    };
    const useEvent = toStoredToolEvent(useMsg);
    const resultEvent = toStoredToolEvent(resultMsg);
    assert.ok(useEvent);
    assert.ok(resultEvent);
    assert.strictEqual(useEvent.toolCallId, resultEvent.toolCallId);
  });

  it('does not truncate send_file_to_user detail at 200 chars (multi-file paths must stay valid JSON)', () => {
    const paths = [...Array(10)].map(
      (_, i) => `D:/zzc/relay-claw/workspace/20260428101110/file${String(i + 1).padStart(2, '0')}.md`,
    );
    const msg = {
      type: 'tool_use',
      catId: 'office',
      toolName: 'send_file_to_user',
      toolInput: { abs_file_path_list: paths },
      toolCallId: 'call-multi-send',
      timestamp: 1709500005000,
    };
    const ev = toStoredToolEvent(msg);
    assert.ok(ev?.detail);
    assert.ok(ev.detail.length > 200, 'detail should exceed legacy 200-char cap');
    JSON.parse(ev.detail);
    const parsed = JSON.parse(ev.detail);
    assert.strictEqual(parsed.abs_file_path_list.length, 10);
  });
});

describe('richBlocksFromSendFileToUserTool', () => {
  it('creates file blocks from absolute send_file_to_user paths', () => {
    const blocks = richBlocksFromSendFileToUserTool({
      type: 'tool_use',
      catId: 'office',
      toolName: 'send_file_to_user',
      toolInput: { abs_file_path_list: ['/tmp/report.pdf'] },
      timestamp: 1709500006000,
    });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].kind, 'file');
    assert.equal(blocks[0].url, '/tmp/report.pdf');
    assert.equal(blocks[0].fileName, 'report.pdf');
  });

  it('accepts JSON-string tool input from provider adapters', () => {
    const blocks = richBlocksFromSendFileToUserTool({
      type: 'tool_use',
      catId: 'office',
      toolName: 'mcp__cat_cafe__send_file_to_user',
      toolInput: '{"abs_file_path_list":["/tmp/report.pdf"]}',
      timestamp: 1709500007000,
    });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].url, '/tmp/report.pdf');
  });
});
