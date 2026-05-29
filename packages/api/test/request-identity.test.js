/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

await import('tsx/esm');
const originalDefaultOwnerUserId = process.env.DEFAULT_OWNER_USER_ID;

afterEach(() => {
  if (originalDefaultOwnerUserId == null) {
    delete process.env.DEFAULT_OWNER_USER_ID;
  } else {
    process.env.DEFAULT_OWNER_USER_ID = originalDefaultOwnerUserId;
  }
});

describe('request identity resolution', () => {
  it('maps frontend default-user to DEFAULT_OWNER_USER_ID when configured', async () => {
    process.env.DEFAULT_OWNER_USER_ID = 'owner-123';
    const { resolveEffectiveUserId } = await import('../src/utils/request-identity.ts');
    assert.equal(resolveEffectiveUserId('default-user'), 'owner-123');
  });

  it('keeps explicit non-default user ids unchanged', async () => {
    process.env.DEFAULT_OWNER_USER_ID = 'owner-123';
    const { resolveEffectiveUserId } = await import('../src/utils/request-identity.ts');
    assert.equal(resolveEffectiveUserId('alice'), 'alice');
  });

  it('falls back to default-user when no owner override is configured', async () => {
    delete process.env.DEFAULT_OWNER_USER_ID;
    const { resolveEffectiveUserId } = await import('../src/utils/request-identity.ts');
    assert.equal(resolveEffectiveUserId('default-user'), 'default-user');
  });

  it('resolveTrustedUserId ignores query.userId and only trusts header/fallback/default', async () => {
    const { resolveTrustedUserId } = await import('../src/utils/request-identity.ts');
    const request = {
      headers: {},
      query: { userId: 'spoofed-query-user' },
    };

    assert.equal(resolveTrustedUserId(request, { defaultUserId: 'default-user' }), 'default-user');
  });

  it('resolveUserId still accepts query.userId for legacy websocket attach flows', async () => {
    const { resolveUserId } = await import('../src/utils/request-identity.ts');
    const request = {
      headers: {},
      query: { userId: 'terminal-query-user' },
    };

    assert.equal(resolveUserId(request), 'terminal-query-user');
  });
});
