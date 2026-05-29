/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { resolveProbeTimeoutMs } = await import('../dist/routes/mcp-probe.js');

function makeCapability(command, args = []) {
  return {
    id: 'tool',
    type: 'mcp',
    enabled: true,
    source: 'external',
    mcpServer: { command, args },
  };
}

describe('resolveProbeTimeoutMs', () => {
  it('uses explicit override when provided', () => {
    const cap = makeCapability('node', ['dist/index.js']);
    assert.equal(resolveProbeTimeoutMs(cap, 4321), 4321);
  });

  it('uses default timeout for normal node-based server', () => {
    const cap = makeCapability('node', ['dist/index.js']);
    assert.equal(resolveProbeTimeoutMs(cap), 2500);
  });

  it('uses slow-start timeout for npx servers', () => {
    const cap = makeCapability('npx', ['-y', '@playwright/mcp@latest']);
    assert.equal(resolveProbeTimeoutMs(cap), 7000);
  });

  it('uses slow-start timeout for pnpm dlx servers', () => {
    const cap = makeCapability('pnpm', ['dlx', '@modelcontextprotocol/server-filesystem']);
    assert.equal(resolveProbeTimeoutMs(cap), 7000);
  });

  it('uses slow-start timeout for docker mcp gateway run', () => {
    const cap = makeCapability('docker', ['mcp', 'gateway', 'run']);
    assert.equal(resolveProbeTimeoutMs(cap), 7000);
  });
});
