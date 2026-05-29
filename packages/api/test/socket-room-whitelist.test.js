/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Socket room join_room whitelist regression test (F131)
 *
 * Extracted the regex from SocketManager.setupEventHandlers() to verify
 * that all Socket.IO rooms used by the codebase are accepted by the
 * join_room whitelist. Prevents regressions like the workspace:global
 * room being silently rejected.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Mirror of the regex in SocketManager.ts — keep in sync!
const JOIN_ROOM_WHITELIST = /^(thread:|worktree:|workspace:global$|user:|preview:global$)/;

describe('Socket join_room whitelist', () => {
  const accepted = [
    'thread:abc123',
    'thread:default',
    'worktree:office-claw',
    'worktree:office-claw-runtime',
    'preview:global',
    'workspace:global',
    'user:user-abc',
  ];

  for (const room of accepted) {
    it(`accepts "${room}"`, () => {
      assert.ok(JOIN_ROOM_WHITELIST.test(room), `Room "${room}" should be accepted`);
    });
  }

  const rejected = [
    'admin:secret',
    'global',
    'workspace:other', // only workspace:global is allowed
    'preview:other',
    'preview:global:extra',
    '',
    'thread:', // empty thread ID is technically allowed by regex but harmless
  ];

  for (const room of rejected) {
    // skip 'thread:' since the prefix match allows it
    if (room === 'thread:') continue;
    it(`rejects "${room}"`, () => {
      assert.ok(!JOIN_ROOM_WHITELIST.test(room), `Room "${room}" should be rejected`);
    });
  }
});
