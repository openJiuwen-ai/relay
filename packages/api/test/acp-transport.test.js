/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('acp transport framing', () => {
  it('uses NDJSON framing for opencode ACP subprocesses', async () => {
    const { frameACPMessage, resolveACPStdioFrameMode } = await import(
      '../dist/domains/agents/services/agents/providers/acp-transport.js'
    );

    const mode = resolveACPStdioFrameMode('opencode');
    assert.equal(mode, 'ndjson');
    assert.equal(frameACPMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, mode).toString('utf8').endsWith('\n'), true);
  });

  it('treats Windows opencode.exe paths as NDJSON ACP subprocesses', async () => {
    const { resolveACPStdioFrameMode } = await import('../dist/domains/agents/services/agents/providers/acp-transport.js');

    assert.equal(resolveACPStdioFrameMode('C:\\tools\\opencode.exe'), 'ndjson');
  });

  it('keeps Content-Length framing for non-opencode ACP subprocesses', async () => {
    const { frameACPMessage, resolveACPStdioFrameMode } = await import(
      '../dist/domains/agents/services/agents/providers/acp-transport.js'
    );

    const mode = resolveACPStdioFrameMode('uv');
    assert.equal(mode, 'content-length');
    assert.match(
      frameACPMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, mode).toString('utf8'),
      /^Content-Length:\s+\d+\r\n\r\n/,
    );
  });
});
