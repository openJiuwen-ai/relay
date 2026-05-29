/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { OpenCodeAgentService } from '../dist/domains/agents/services/agents/providers/OpenCodeAgentService.js';
import { transformOpenCodeEvent } from '../dist/domains/agents/services/agents/providers/opencode-event-transform.js';
import { ensureFakeCliOnPath } from './helpers/fake-cli-path.js';
import {
  OFFICE_CLAW_AGENT_IDS,
  OFFICE_CLAW_HANDLES,
  collect,
  createMockProcess,
  emitOpenCodeEvents,
  OMOC_BASH_TOOL,
  OMOC_DELEGATE_FRONTEND,
  OMOC_DELEGATE_LIBRARIAN,
  OMOC_DELEGATE_ORACLE,
  OMOC_INTERNAL_AGENTS,
  OMOC_SISYPHUS_TEXT,
  OMOC_STEP_FINISH,
  OMOC_STEP_START,
  OPENCODE_INTERNAL_TOOLS,
} from './helpers/opencode-test-helpers.js';

ensureFakeCliOnPath('opencode');

describe('OMOC Sisyphus Isolation (AC-9)', () => {
  test('delegate-task targets are OMOC internal agents, not OfficeClaw cats', () => {
    const delegateEvents = [OMOC_DELEGATE_ORACLE, OMOC_DELEGATE_LIBRARIAN, OMOC_DELEGATE_FRONTEND];

    for (const event of delegateEvents) {
      const result = transformOpenCodeEvent(event, 'opencode');
      assert.ok(result, `expected result for ${event.part.state.input.agent}`);
      assert.strictEqual(result.type, 'tool_use');
      assert.strictEqual(result.toolName, 'delegate-task');

      const agentTarget = result.toolInput?.agent;
      assert.ok(agentTarget, 'delegate-task must have agent field in input');
      assert.ok(OMOC_INTERNAL_AGENTS.includes(agentTarget), `agent "${agentTarget}" must be OMOC-internal`);
      assert.ok(!OFFICE_CLAW_AGENT_IDS.includes(agentTarget), `agent "${agentTarget}" must NOT be a OfficeClaw cat`);
    }
  });

  test('all OMOC tool_use events map to opencode-internal tool names', () => {
    const allToolEvents = [OMOC_DELEGATE_ORACLE, OMOC_DELEGATE_LIBRARIAN, OMOC_DELEGATE_FRONTEND, OMOC_BASH_TOOL];

    for (const event of allToolEvents) {
      const result = transformOpenCodeEvent(event, 'opencode');
      assert.ok(result);
      assert.strictEqual(result.type, 'tool_use');
      assert.ok(OPENCODE_INTERNAL_TOOLS.includes(result.toolName), `tool "${result.toolName}" not in internal toolset`);
    }
  });

  test('OMOC text events do not contain OfficeClaw cat handles', () => {
    const result = transformOpenCodeEvent(OMOC_SISYPHUS_TEXT, 'opencode');
    assert.ok(result);
    assert.strictEqual(result.type, 'text');
    for (const handle of OFFICE_CLAW_HANDLES) {
      assert.ok(!result.content.includes(handle), `text should not reference "${handle}"`);
    }
  });

  test('full OMOC session: all events stay within opencode boundary', async () => {
    const proc = createMockProcess();
    const spawnFn = mock.fn(() => proc);
    const service = new OpenCodeAgentService({ agentId: 'opencode', spawnFn, model: 'claude-sonnet-4-6' });

    const promise = collect(service.invoke('Analyze and fix the auth module'));
    emitOpenCodeEvents(proc, [
      OMOC_STEP_START,
      OMOC_SISYPHUS_TEXT,
      OMOC_DELEGATE_ORACLE,
      OMOC_DELEGATE_LIBRARIAN,
      OMOC_BASH_TOOL,
      OMOC_DELEGATE_FRONTEND,
      OMOC_STEP_FINISH,
    ]);
    const messages = await promise;

    const toolUses = messages.filter((m) => m.type === 'tool_use');
    assert.ok(toolUses.length >= 4, `expected >=4 tool_use, got ${toolUses.length}`);
    for (const tu of toolUses) {
      assert.ok(OPENCODE_INTERNAL_TOOLS.includes(tu.toolName), `"${tu.toolName}" leaked outside boundary`);
    }

    const officeClawMcpTools = [
      'office_claw_post_message',
      'office_claw_get_thread_context',
      'office_claw_search_evidence',
      'office_claw_multi_mention',
    ];
    for (const tu of toolUses) {
      for (const mcpTool of officeClawMcpTools) {
        assert.notStrictEqual(tu.toolName, mcpTool, `OfficeClaw MCP tool "${mcpTool}" must not appear`);
      }
    }

    const textMsgs = messages.filter((m) => m.type === 'text');
    for (const tm of textMsgs) {
      for (const handle of OFFICE_CLAW_HANDLES) {
        assert.ok(!tm.content.includes(handle), `text references "${handle}"`);
      }
    }

    for (const m of messages.filter((m) => m.metadata)) {
      assert.strictEqual(m.metadata.provider, 'opencode');
    }
  });

  test('delegate-task with OfficeClaw cat ID as agent would be detected', () => {
    const maliciousEvent = {
      type: 'tool_use',
      timestamp: 1773304960000,
      sessionID: 'ses_omoc_test',
      part: {
        type: 'tool',
        callID: 'toolu_bad',
        tool: 'delegate-task',
        state: { status: 'completed', input: { agent: 'opus', task: 'Should never happen' }, output: 'N/A' },
      },
    };

    const result = transformOpenCodeEvent(maliciousEvent, 'opencode');
    assert.ok(result);
    // Architecturally can't happen (process boundary), but proves detectability
    assert.ok(OFFICE_CLAW_AGENT_IDS.includes(result.toolInput?.agent), 'should detect OfficeClaw cat ID in agent field');
  });
});
