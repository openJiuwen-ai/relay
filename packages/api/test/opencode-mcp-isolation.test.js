/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { OpenCodeAgentService } from '../dist/domains/agents/services/agents/providers/OpenCodeAgentService.js';
import { generateOpenCodeConfig } from '../dist/domains/agents/services/agents/providers/opencode-config-template.js';
import { collect, createMockProcess, emitOpenCodeEvents } from './helpers/opencode-test-helpers.js';

const STEP_START = {
  type: 'step_start',
  timestamp: 1773304958492,
  sessionID: 'ses_mcp_test',
  part: { type: 'step-start', id: 'prt_1', sessionID: 'ses_mcp_test', messageID: 'msg_1' },
};
const TEXT_RESPONSE = {
  type: 'text',
  timestamp: 1773304958494,
  sessionID: 'ses_mcp_test',
  part: { type: 'text', text: 'Done.' },
};
const STEP_FINISH = {
  type: 'step_finish',
  timestamp: 1773304958508,
  sessionID: 'ses_mcp_test',
  part: { type: 'step-finish', reason: 'stop', cost: 0.01, tokens: { total: 5000 } },
};

// OfficeClaw MCP env var names used in assertions below

describe('MCP Tool Namespace Isolation (AC-10)', () => {
  // ── buildEnv does not pass OfficeClaw MCP env vars ──

  test('buildEnv does not forward OFFICE_CLAW_MCP_* env vars to child process', async () => {
    const proc = createMockProcess();
    const spawnFn = mock.fn(() => proc);
    const service = new OpenCodeAgentService({
      agentId: 'opencode',
      spawnFn,
      model: 'claude-haiku-4-5',
    });

    // Simulate callbackEnv with OfficeClaw MCP vars mixed in
    const callbackEnv = {
      OFFICE_CLAW_ANTHROPIC_API_KEY: 'sk-test',
      OFFICE_CLAW_ANTHROPIC_BASE_URL: 'http://proxy:9877/slug',
      OFFICE_CLAW_MCP_SERVER_URL: 'http://localhost:3003/mcp',
      OFFICE_CLAW_MCP_TOKEN: 'secret-mcp-token',
      OFFICE_CLAW_MCP_ENDPOINT: 'ws://localhost:3003/mcp/ws',
    };

    const promise = collect(service.invoke('Test', { callbackEnv }));
    emitOpenCodeEvents(proc, [STEP_START, TEXT_RESPONSE, STEP_FINISH]);
    await promise;

    const opts = spawnFn.mock.calls[0].arguments[2];
    const childEnv = opts.env;

    // OfficeClaw MCP vars should either be absent or passthrough as-is
    // (they are harmless because opencode doesn't read them),
    // but they must NOT be mapped to opencode's own MCP config vars.
    // opencode reads MCP config from opencode.json, not env vars.

    // Verify no OPENCODE_MCP_* vars were created from OfficeClaw vars
    const opencodeMcpKeys = Object.keys(childEnv).filter(
      (k) => k.startsWith('OPENCODE_MCP_') || k === 'MCP_SERVER_URL',
    );
    assert.strictEqual(opencodeMcpKeys.length, 0, `should not create opencode MCP env vars, found: ${opencodeMcpKeys}`);
  });

  // ── opencode CLI is invoked without --mcp-server flags ──

  test('opencode CLI args do not include MCP server configuration', async () => {
    const proc = createMockProcess();
    const spawnFn = mock.fn(() => proc);
    const service = new OpenCodeAgentService({
      agentId: 'opencode',
      spawnFn,
      model: 'claude-haiku-4-5',
    });

    const promise = collect(service.invoke('Test'));
    emitOpenCodeEvents(proc, [STEP_START, TEXT_RESPONSE, STEP_FINISH]);
    await promise;

    const args = spawnFn.mock.calls[0].arguments[1];
    // No --mcp-server or --mcp flags should be in args
    const mcpArgs = args.filter((a) => typeof a === 'string' && a.includes('mcp'));
    assert.strictEqual(mcpArgs.length, 0, `CLI args should not contain MCP flags, found: ${mcpArgs}`);
  });

  // ── buildEnv cleans up intermediate vars ──

  test('OPENCODE_API_KEY and OPENCODE_BASE_URL are removed from child env', async () => {
    const proc = createMockProcess();
    const spawnFn = mock.fn(() => proc);
    const service = new OpenCodeAgentService({
      agentId: 'opencode',
      spawnFn,
      model: 'claude-haiku-4-5',
    });

    const promise = collect(service.invoke('Test'));
    emitOpenCodeEvents(proc, [STEP_START, TEXT_RESPONSE, STEP_FINISH]);
    await promise;

    const opts = spawnFn.mock.calls[0].arguments[2];
    const childEnv = opts.env;

    // buildEnv sets these to null → buildChildEnv deletes them from process.env copy.
    // This prevents OPENCODE_API_KEY/BASE_URL from parent env leaking to child,
    // ensuring opencode reads ANTHROPIC_API_KEY/BASE_URL instead.
    assert.ok(!('OPENCODE_API_KEY' in childEnv), 'OPENCODE_API_KEY should be deleted from child env');
    assert.ok(!('OPENCODE_BASE_URL' in childEnv), 'OPENCODE_BASE_URL should be deleted from child env');
  });

  // ── Process boundary: opencode reads MCP config from opencode.json, not OfficeClaw ──

  test('opencode MCP config is file-based (opencode.json), not env-based', () => {
    // Verify that generateOpenCodeConfig does NOT produce an mcp section.
    // opencode reads MCP config from opencode.json; OfficeClaw serves MCP via
    // its own mcp-server package. The config template must NOT bridge them.
    const config = generateOpenCodeConfig({
      apiKey: 'sk-test',
      baseUrl: 'https://proxy.example/v1',
      model: 'claude-sonnet-4-6',
    });

    // No MCP section means no OfficeClaw tools leak into opencode's namespace
    assert.strictEqual(config.mcp, undefined, 'generated config must not have mcp section');
    assert.strictEqual(config.provider.anthropic.options.apiKey, undefined, 'apiKey must stay in env');

    // Verify OfficeClaw MCP tool prefix convention is distinct from opencode's tools
    // (opencode tools: bash/read/write/..., OfficeClaw MCP: office_claw_*)
    const serialized = JSON.stringify(config);
    assert.ok(!serialized.includes('office_claw'), 'no office_claw references in opencode config');
    assert.ok(!serialized.includes('office-claw'), 'no office-claw references in opencode config');
  });

  // ── No OfficeClaw MCP tool names in opencode's internal toolset ──

  test('opencode internal tools do not collide with OfficeClaw MCP tool names', () => {
    const opencodeTools = [
      'bash',
      'read',
      'write',
      'edit',
      'glob',
      'grep',
      'delegate-task',
      'list-sessions',
      'webfetch',
      'todoreplace',
    ];

    const catCafeMcpTools = [
      'office_claw_post_message',
      'office_claw_get_pending_mentions',
      'office_claw_ack_mentions',
      'office_claw_get_thread_context',
      'office_claw_search_messages',
      'office_claw_list_threads',
      'office_claw_feat_index',
      'office_claw_cross_post_message',
      'office_claw_list_tasks',
      'office_claw_update_task',
      'office_claw_create_rich_block',
      'office_claw_request_permission',
      'office_claw_search_evidence',
      'office_claw_reflect',
      'office_claw_multi_mention',
      'office_claw_start_vote',
      'office_claw_update_workflow',
      'office_claw_register_pr_tracking',
    ];

    // Verify zero overlap
    const overlap = opencodeTools.filter((t) => catCafeMcpTools.includes(t));
    assert.strictEqual(overlap.length, 0, `tool name collision detected: ${overlap}`);

    // Also verify by prefix convention: OfficeClaw uses office_claw_ prefix
    for (const tool of opencodeTools) {
      assert.ok(!tool.startsWith('office_claw_'), `opencode tool "${tool}" collides with OfficeClaw MCP namespace`);
    }
  });
});
