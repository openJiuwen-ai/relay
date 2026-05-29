/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';

const { createAuthModule } = await import('../dist/auth/module.js');

describe('auth module', () => {
  test('defaults to no-auth and still registers built-in providers', async () => {
    const authModule = await createAuthModule({ env: {} });

    assert.equal(authModule.activeProviderId, 'no-auth');
    assert.equal(authModule.getActiveProvider().id, 'no-auth');
    assert.deepEqual(authModule.providerRegistry.listIds().sort(), ['no-auth']);
  });

  test('accepts arbitrary provider ids without hardcoded kind unions', async () => {
    const authModule = await createAuthModule({
      env: { OFFICE_CLAW_AUTH_PROVIDER: 'corp-oidc' },
      providers: [
        {
          id: 'corp-oidc',
          displayName: 'Corp OIDC',
          presentation: { mode: 'form', fields: [], submitLabel: 'Continue' },
          async authenticate() {
            return {
              success: true,
              principal: { userId: 'corp-user', expiresAt: null },
            };
          },
        },
      ],
    });

    assert.equal(authModule.activeProviderId, 'corp-oidc');
    assert.equal(authModule.getActiveProvider().displayName, 'Corp OIDC');
  });

  test('loads third-party auth providers from external modules and resolves them by env id', async () => {
    const fixtureModuleUrl = pathToFileURL(resolve(new URL('.', import.meta.url).pathname, 'fixtures/custom-auth-provider.mjs')).href;
    const authModule = await createAuthModule({
      env: {
        OFFICE_CLAW_AUTH_PROVIDER: 'external-sso',
        OFFICE_CLAW_AUTH_PROVIDER_MODULES: fixtureModuleUrl,
      },
    });

    assert.equal(authModule.activeProviderId, 'external-sso');
    assert.equal(authModule.getActiveProvider().displayName, 'External SSO');
    assert.ok(authModule.providerRegistry.has('external-sso'));
  });

  test('throws a helpful error when env selects an unregistered provider', async () => {
    await assert.rejects(
      () => createAuthModule({ env: { OFFICE_CLAW_AUTH_PROVIDER: 'missing-provider' } }),
      /missing-provider/,
    );
  });

  test('calls bootstrap on the active provider if defined', async () => {
    let bootstrapped = false;
    const authModule = await createAuthModule({
      env: { OFFICE_CLAW_AUTH_PROVIDER: 'boot-test' },
      providers: [
        {
          id: 'boot-test',
          displayName: 'Bootstrap Test',
          presentation: { mode: 'auto', fields: [] },
          async bootstrap() { bootstrapped = true; },
          async authenticate() {
            return { success: true, principal: { userId: 'test', expiresAt: null } };
          },
        },
      ],
    });

    assert.equal(bootstrapped, true);
    assert.equal(authModule.activeProviderId, 'boot-test');
  });
});
