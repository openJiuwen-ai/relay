/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { resolveSocketIoPingOptions } = await import('../../dist/infrastructure/websocket/SocketManager.js');

describe('socket.io ping options', () => {
  it('uses Socket.IO defaults when env is not configured', () => {
    assert.deepEqual(resolveSocketIoPingOptions({}), {
      pingInterval: undefined,
      pingTimeout: undefined,
    });
  });

  it('reads positive integer millisecond values from env', () => {
    assert.deepEqual(
      resolveSocketIoPingOptions({
        SOCKET_IO_PING_INTERVAL_MS: '60000',
        SOCKET_IO_PING_TIMEOUT_MS: '120000',
      }),
      {
        pingInterval: 60000,
        pingTimeout: 120000,
      },
    );
  });

  it('ignores invalid values so the server keeps Socket.IO defaults', () => {
    assert.deepEqual(
      resolveSocketIoPingOptions({
        SOCKET_IO_PING_INTERVAL_MS: '0',
        SOCKET_IO_PING_TIMEOUT_MS: 'abc',
      }),
      {
        pingInterval: undefined,
        pingTimeout: undefined,
      },
    );
  });
});
