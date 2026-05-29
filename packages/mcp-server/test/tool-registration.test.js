/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * MCP Tool Registration Tests
 * 回归测试: 确认所有预期工具都注册到 MCP server
 *
 * 背景: request_permission / check_permission_status 的 handler 和 schema
 * 早就存在，但 createServer() 漏了 server.tool() 注册。
 * 本测试守住"注册层"，修复前会 Red，修复后 Green。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const EXPECTED_TOOLS = [
  // Callback tools (chat + task + ack)
  'office_claw_post_message',
  'office_claw_get_pending_mentions',
  'office_claw_ack_mentions',
  'office_claw_get_thread_context',
  'office_claw_list_threads',
  'office_claw_feat_index',
  'office_claw_cross_post_message',
  'office_claw_list_tasks',
  'office_claw_list_skills',
  'office_claw_load_skill',
  'office_claw_update_task',
  'office_claw_create_rich_block',
  'office_claw_get_rich_block_rules',
  'office_claw_register_pr_tracking',
  // Workflow SOP tools (F073 P1)
  'office_claw_update_workflow',
  // Multi-mention orchestration (F086 M1)
  'office_claw_multi_mention',
  // F079 Gap 4: Cat-initiated voting
  'office_claw_start_vote',
  // Permission tools (this is the regression guard)
  'office_claw_request_permission',
  'office_claw_check_permission_status',
  // Bootcamp tools (F087)
  'office_claw_update_bootcamp_state',
  'office_claw_bootcamp_env_check',
  // Callback-scoped memory tools
  'office_claw_retain_memory_callback',
  // Direct evidence/reflect tools
  'office_claw_search_evidence',
  'office_claw_reflect',
  // Signal Hunter tools (F21 S5) + F091 Study tools
  'signal_list_inbox',
  'signal_get_article',
  'signal_search',
  'signal_mark_read',
  'signal_summarize',
  'signal_start_study',
  'signal_save_notes',
  'signal_list_studies',
  'signal_generate_podcast',
  'signal_update_article',
  'signal_delete_article',
  'signal_link_thread',
  // Session chain tools
  'office_claw_list_session_chain',
  'office_claw_read_session_events',
  'office_claw_read_session_digest',
  'office_claw_read_invocation_detail',
  // Limb tools
  'limb_list_available',
  'limb_invoke',
  'limb_pair_list',
  'limb_pair_approve',
  // Schedule tools
  'office_claw_list_scheduled_tasks',
  'office_claw_list_schedule_templates',
  'office_claw_preview_scheduled_task',
  'office_claw_register_scheduled_task',
  'office_claw_update_scheduled_task',
  'office_claw_set_scheduled_task_enabled',
  'office_claw_remove_scheduled_task',
  // F101 Phase I: Game action tool
  'office_claw_submit_game_action',
];

const EXPECTED_COLLAB_TOOLS = [
  'office_claw_post_message',
  'office_claw_get_pending_mentions',
  'office_claw_ack_mentions',
  'office_claw_get_thread_context',
  'office_claw_list_threads',
  'office_claw_feat_index',
  'office_claw_cross_post_message',
  'office_claw_list_tasks',
  'office_claw_update_task',
  'office_claw_create_rich_block',
  'office_claw_get_rich_block_rules',
  'office_claw_request_permission',
  'office_claw_check_permission_status',
  'office_claw_register_pr_tracking',
  'office_claw_update_workflow',
  'office_claw_multi_mention',
  'office_claw_start_vote',
  'office_claw_update_bootcamp_state',
  'office_claw_bootcamp_env_check',
  'office_claw_list_skills',
  'office_claw_load_skill',
  'office_claw_list_scheduled_tasks',
  'office_claw_list_schedule_templates',
  'office_claw_preview_scheduled_task',
  'office_claw_register_scheduled_task',
  'office_claw_update_scheduled_task',
  'office_claw_set_scheduled_task_enabled',
  'office_claw_remove_scheduled_task',
  'office_claw_submit_game_action',
];

const EXPECTED_MEMORY_TOOLS = [
  'office_claw_retain_memory_callback',
  'office_claw_search_evidence',
  'office_claw_reflect',
  'office_claw_list_session_chain',
  'office_claw_read_session_events',
  'office_claw_read_session_digest',
  'office_claw_read_invocation_detail',
];

describe('MCP Server Tool Registration', () => {
  test('all expected tools are registered via createServer()', async () => {
    const { createServer } = await import('../dist/index.js');
    const server = createServer();

    // _registeredTools is a plain object keyed by tool name
    const registeredNames = Object.keys(server._registeredTools);

    for (const name of EXPECTED_TOOLS) {
      assert.ok(registeredNames.includes(name), `Tool "${name}" is NOT registered on the MCP server`);
    }
  });

  test('no unexpected tools are registered', async () => {
    const { createServer } = await import('../dist/index.js');
    const server = createServer();

    const registeredNames = Object.keys(server._registeredTools);

    for (const name of registeredNames) {
      assert.ok(
        EXPECTED_TOOLS.includes(name),
        `Unexpected tool "${name}" found — add it to EXPECTED_TOOLS if intentional`,
      );
    }
  });

  test('permission tools have correct input schemas', async () => {
    const { createServer } = await import('../dist/index.js');
    const server = createServer();

    const reqTool = server._registeredTools.office_claw_request_permission;
    assert.ok(reqTool, 'request_permission tool should exist');

    const checkTool = server._registeredTools.office_claw_check_permission_status;
    assert.ok(checkTool, 'check_permission_status tool should exist');
  });

  test('deprecated file tools are not registered', async () => {
    const { createServer } = await import('../dist/index.js');
    const server = createServer();
    const registeredNames = Object.keys(server._registeredTools);

    assert.ok(!registeredNames.includes('read_file'));
    assert.ok(!registeredNames.includes('write_file'));
    assert.ok(!registeredNames.includes('list_files'));
  });

  test('relayclaw MCP denylist removes blocked tools from registration', async () => {
    const previous = process.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS;
    process.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS = [
      'limb_list_available',
      'limb_invoke',
      'limb_pair_list',
      'limb_pair_approve',
      'office_claw_list_tasks',
      'office_claw_update_task',
      'office_claw_load_skill',
      'office_claw_create_rich_block',
      'office_claw_get_rich_block_rules',
      'office_claw_request_permission',
      'office_claw_check_permission_status',
      'office_claw_update_workflow',
      'office_claw_feat_index',
    ].join(',');

    try {
      const { createServer } = await import('../dist/index.js');
      const server = createServer();
      const registeredNames = Object.keys(server._registeredTools);

      assert.ok(!registeredNames.includes('limb_list_available'));
      assert.ok(!registeredNames.includes('limb_invoke'));
      assert.ok(!registeredNames.includes('limb_pair_list'));
      assert.ok(!registeredNames.includes('limb_pair_approve'));
      assert.ok(!registeredNames.includes('office_claw_list_tasks'));
      assert.ok(!registeredNames.includes('office_claw_update_task'));
      assert.ok(!registeredNames.includes('office_claw_load_skill'));
      assert.ok(!registeredNames.includes('office_claw_create_rich_block'));
      assert.ok(!registeredNames.includes('office_claw_get_rich_block_rules'));
      assert.ok(!registeredNames.includes('office_claw_request_permission'));
      assert.ok(!registeredNames.includes('office_claw_check_permission_status'));
      assert.ok(!registeredNames.includes('office_claw_update_workflow'));
      assert.ok(!registeredNames.includes('office_claw_feat_index'));
      assert.ok(registeredNames.includes('office_claw_post_message'));
    } finally {
      if (previous === undefined) {
        delete process.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS;
      } else {
        process.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS = previous;
      }
    }
  });

  test('src/index.ts stays under 350 lines (hard limit)', () => {
    const sourcePath = new URL('../src/index.ts', import.meta.url);
    const source = readFileSync(sourcePath, 'utf-8');
    const lineCount = source.split('\n').length;
    assert.ok(lineCount <= 350, `mcp-server/src/index.ts exceeds 350 lines: ${lineCount}`);
  });

  test('createCollabServer registers only collab tool surface', async () => {
    const { createCollabServer } = await import('../dist/collab.js');
    const server = createCollabServer();
    const registered = Object.keys(server._registeredTools);

    assert.deepEqual([...registered].sort(), [...EXPECTED_COLLAB_TOOLS].sort());
  });

  test('createMemoryServer registers only memory tool surface', async () => {
    const { createMemoryServer } = await import('../dist/memory.js');
    const server = createMemoryServer();
    const registered = Object.keys(server._registeredTools);

    assert.deepEqual([...registered].sort(), [...EXPECTED_MEMORY_TOOLS].sort());
  });

});
