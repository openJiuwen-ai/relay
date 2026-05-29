/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

describe('socket manager identity ingress hardening', () => {
  it('keeps handshake userId routing until server-verified socket auth exists', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'infrastructure', 'websocket', 'SocketManager.ts'),
      'utf8',
    );

    assert.match(source, /function readSocketHandshakeUserId/);
    assert.match(source, /handshake\.auth/);
    assert.match(source, /handshake\.query\??\.userId/);
    assert.match(source, /const requestedUserId = readSocketHandshakeUserId\(socket\) \?\? FRONTEND_DEFAULT_USER_ID;/);
    assert.match(source, /const userId = resolveEffectiveUserId\(requestedUserId\) \?\? FRONTEND_DEFAULT_USER_ID;/);
  });
});
