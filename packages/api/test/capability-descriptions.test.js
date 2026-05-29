/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { describeMcpCapability } = await import('../dist/routes/capabilities.js');

function makeCapability(id, command, args = []) {
  return {
    id,
    type: 'mcp',
    enabled: true,
    source: 'external',
    mcpServer: { command, args },
  };
}

describe('describeMcpCapability', () => {
  it('returns known static descriptions for office-claw split servers', () => {
    const desc = describeMcpCapability(makeCapability('office-claw-collab', 'node', ['dist/collab.js']));
    assert.ok(desc?.includes('协作核心'));
  });

  it('labels docker gateway as aggregator even without tool list', () => {
    const desc = describeMcpCapability(makeCapability('MCP_DOCKER', 'docker', ['mcp', 'gateway', 'run']));
    assert.ok(desc?.includes('Docker MCP Gateway（聚合器）'));
  });

  it('includes detected sub-server families for docker gateway tools', () => {
    const desc = describeMcpCapability(makeCapability('MCP_DOCKER', 'docker', ['mcp', 'gateway', 'run']), [
      { name: 'browser_click' },
      { name: 'search' },
      { name: 'docker' },
    ]);
    assert.ok(desc?.includes('playwright(browser_*)'));
    assert.ok(desc?.includes('dockerhub'));
    assert.ok(desc?.includes('docker-gateway'));
  });
});
