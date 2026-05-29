/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';

const { buildAnthropicProtocolEnv, buildOpenAiProtocolEnv, buildHuaweiMaaSProtocolEnv, buildGoogleProtocolEnv } =
  await import('../dist/config/plugins/protocol-credential-helpers.js');

function baseCtx(overrides = {}) {
  return {
    agentId: 'test-agent',
    provider: 'anthropic',
    configProjectRoot: '/tmp/test',
    userId: 'u1',
    agentConfig: {},
    resolvedAccount: null,
    effectiveProtocol: null,
    modelConfigBinding: null,
    ...overrides,
  };
}

describe('buildAnthropicProtocolEnv', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_PROXY_PORT;
    delete process.env.ANTHROPIC_PROXY_ENABLED;
  });

  it('api_key account sets PROFILE_MODE and API_KEY', async () => {
    process.env.ANTHROPIC_PROXY_ENABLED = '0';
    const ctx = baseCtx({
      resolvedAccount: { id: 'profile-abc', authType: 'api_key', kind: 'api_key', apiKey: 'sk-123' },
      defaultModel: 'glm-5',
    });
    const env = await buildAnthropicProtocolEnv(ctx);
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_PROFILE_MODE, 'api_key');
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_API_KEY, 'sk-123');
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_MODEL_OVERRIDE, 'glm-5');
  });

  it('api_key account with baseUrl and proxy disabled falls back to direct URL', async () => {
    process.env.ANTHROPIC_PROXY_ENABLED = '0';
    const ctx = baseCtx({
      resolvedAccount: {
        id: 'profile-abc',
        authType: 'api_key',
        kind: 'api_key',
        apiKey: 'sk-123',
        baseUrl: 'https://custom.api.com',
      },
    });
    const env = await buildAnthropicProtocolEnv(ctx);
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_BASE_URL, 'https://custom.api.com');
  });

  it('no api_key account sets subscription mode', async () => {
    const ctx = baseCtx({ resolvedAccount: { id: 'claude', authType: 'oauth', kind: 'builtin' } });
    const env = await buildAnthropicProtocolEnv(ctx);
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_PROFILE_MODE, 'subscription');
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_API_KEY, undefined);
  });

  it('null account sets subscription mode', async () => {
    const ctx = baseCtx({ resolvedAccount: null });
    const env = await buildAnthropicProtocolEnv(ctx);
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_PROFILE_MODE, 'subscription');
  });
});

describe('buildOpenAiProtocolEnv', () => {
  it('modelConfigBinding takes precedence over account', () => {
    const ctx = baseCtx({
      modelConfigBinding: {
        id: 'custom',
        protocol: 'openai',
        apiKey: 'mc-key',
        baseUrl: 'https://mc.api.com',
        headers: { 'X-Custom': 'val' },
        models: [],
      },
      resolvedAccount: { id: 'codex', authType: 'api_key', kind: 'api_key', apiKey: 'other-key' },
    });
    const env = buildOpenAiProtocolEnv(ctx);
    assert.equal(env.CODEX_AUTH_MODE, 'api_key');
    assert.equal(env.OPENAI_API_KEY, 'mc-key');
    assert.equal(env.OPENAI_BASE_URL, 'https://mc.api.com');
    assert.ok(env.OPENAI_DEFAULT_HEADERS);
    assert.ok(JSON.parse(env.OPENAI_DEFAULT_HEADERS)['X-Custom']);
  });

  it('api_key account sets OPENAI keys', () => {
    const ctx = baseCtx({
      resolvedAccount: {
        id: 'codex',
        authType: 'api_key',
        kind: 'api_key',
        apiKey: 'sk-oai',
        baseUrl: 'https://oai.api.com',
      },
    });
    const env = buildOpenAiProtocolEnv(ctx);
    assert.equal(env.CODEX_AUTH_MODE, 'api_key');
    assert.equal(env.OPENAI_API_KEY, 'sk-oai');
    assert.equal(env.OPENROUTER_API_KEY, 'sk-oai');
    assert.equal(env.OPENAI_BASE_URL, 'https://oai.api.com');
    assert.equal(env.OPENAI_API_BASE, 'https://oai.api.com');
  });

  it('oauth fallback when boundAccountRef is set', () => {
    const ctx = baseCtx({
      resolvedAccount: { id: 'codex', authType: 'oauth', kind: 'builtin' },
      boundAccountRef: 'codex',
    });
    const env = buildOpenAiProtocolEnv(ctx);
    assert.equal(env.CODEX_AUTH_MODE, 'oauth');
  });

  it('no oauth when boundAccountRef is absent (inherited default)', () => {
    const ctx = baseCtx({
      resolvedAccount: { id: 'codex', authType: 'oauth', kind: 'builtin' },
    });
    const env = buildOpenAiProtocolEnv(ctx);
    assert.equal(env.CODEX_AUTH_MODE, undefined);
  });

  it('returns empty when no binding and no account', () => {
    const ctx = baseCtx({});
    const env = buildOpenAiProtocolEnv(ctx);
    assert.deepEqual(env, {});
  });
});

describe('buildHuaweiMaaSProtocolEnv', () => {
  it('resolves config and sets all env vars', () => {
    const mockResolve = () => ({
      baseUrl: 'https://maas.api.com',
      apiKey: 'maas-key',
      defaultHeaders: { 'X-Auth': 'token' },
    });
    const ctx = baseCtx({ userId: 'user1' });
    const env = buildHuaweiMaaSProtocolEnv(mockResolve, ctx);
    assert.equal(env.OFFICE_CLAW_HUAWEI_MAAS_ENABLED, '1');
    assert.equal(env.OFFICE_CLAW_HUAWEI_MAAS_BASE_URL, 'https://maas.api.com');
    assert.equal(env.OPENAI_API_KEY, 'maas-key');
    assert.equal(env.CODEX_AUTH_MODE, 'api_key');
    assert.ok(env.OPENAI_DEFAULT_HEADERS);
  });
});

describe('buildGoogleProtocolEnv', () => {
  it('api_key account sets GEMINI and GOOGLE keys', () => {
    const ctx = baseCtx({
      resolvedAccount: {
        id: 'gemini',
        authType: 'api_key',
        kind: 'api_key',
        apiKey: 'goog-key',
        baseUrl: 'https://gemini.api.com',
      },
    });
    const env = buildGoogleProtocolEnv(ctx);
    assert.equal(env.GEMINI_API_KEY, 'goog-key');
    assert.equal(env.GOOGLE_API_KEY, 'goog-key');
    assert.equal(env.OPENROUTER_API_KEY, 'goog-key');
    assert.equal(env.GEMINI_BASE_URL, 'https://gemini.api.com');
  });

  it('oauth account returns empty', () => {
    const ctx = baseCtx({
      resolvedAccount: { id: 'gemini', authType: 'oauth', kind: 'builtin' },
    });
    const env = buildGoogleProtocolEnv(ctx);
    assert.deepEqual(env, {});
  });

  it('null account returns empty', () => {
    const ctx = baseCtx({});
    const env = buildGoogleProtocolEnv(ctx);
    assert.deepEqual(env, {});
  });
});
