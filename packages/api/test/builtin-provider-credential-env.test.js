/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

const {
  resolveAnthropicCredentialEnv,
  resolveOpenAiCredentialEnv,
  resolveGoogleCredentialEnv,
  resolveDareCredentialEnv,
  resolveRelayClawCredentialEnv,
} = await import('../dist/config/plugins/builtin-credential-resolvers.js');

function baseCtx(overrides = {}) {
  return {
    agentId: 'test-agent',
    provider: 'test',
    configProjectRoot: '/tmp/test',
    userId: 'u1',
    agentConfig: {},
    resolvedAccount: null,
    effectiveProtocol: null,
    modelConfigBinding: null,
    ...overrides,
  };
}

describe('resolveAnthropicCredentialEnv', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_PROXY_ENABLED = '0';
  });

  it('delegates to anthropic protocol helper', async () => {
    const ctx = baseCtx({
      resolvedAccount: { id: 'p1', authType: 'api_key', kind: 'api_key', apiKey: 'sk-1' },
      defaultModel: 'model-1',
    });
    const env = await resolveAnthropicCredentialEnv(ctx);
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_PROFILE_MODE, 'api_key');
    assert.equal(env.OFFICE_CLAW_ANTHROPIC_API_KEY, 'sk-1');
  });
});

describe('resolveOpenAiCredentialEnv', () => {
  it('delegates to openai protocol helper', () => {
    const ctx = baseCtx({
      resolvedAccount: { id: 'codex', authType: 'api_key', kind: 'api_key', apiKey: 'sk-oai' },
    });
    const env = resolveOpenAiCredentialEnv(ctx);
    assert.equal(env.CODEX_AUTH_MODE, 'api_key');
    assert.equal(env.OPENAI_API_KEY, 'sk-oai');
  });
});

describe('resolveGoogleCredentialEnv', () => {
  it('delegates to google protocol helper', () => {
    const ctx = baseCtx({
      resolvedAccount: { id: 'gemini', authType: 'api_key', kind: 'api_key', apiKey: 'gk' },
    });
    const env = resolveGoogleCredentialEnv(ctx);
    assert.equal(env.GEMINI_API_KEY, 'gk');
    assert.equal(env.GOOGLE_API_KEY, 'gk');
  });
});

describe('resolveDareCredentialEnv', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_PROXY_ENABLED = '0';
  });

  it('huawei_maas protocol sets DARE overlay on openai base', async () => {
    const ctx = baseCtx({
      effectiveProtocol: 'openai',
      modelConfigBinding: { id: 'mc', protocol: 'openai', apiKey: 'dare-k', baseUrl: 'https://dare.api', models: [] },
    });
    const env = await resolveDareCredentialEnv(ctx);
    assert.equal(env.OFFICE_CLAW_DARE_ADAPTER, 'openai');
    assert.equal(env.DARE_API_KEY, 'dare-k');
    assert.equal(env.DARE_ENDPOINT, 'https://dare.api');
    assert.equal(env.OPENAI_API_KEY, 'dare-k');
  });

  it('api_key account without binding uses account directly', async () => {
    const ctx = baseCtx({
      effectiveProtocol: 'openai',
      resolvedAccount: {
        id: 'dare',
        authType: 'api_key',
        kind: 'api_key',
        apiKey: 'ak',
        baseUrl: 'https://custom.dare',
        protocol: 'openai',
      },
    });
    const env = await resolveDareCredentialEnv(ctx);
    assert.equal(env.OFFICE_CLAW_DARE_ADAPTER, 'openai');
    assert.equal(env.DARE_API_KEY, 'ak');
    assert.equal(env.DARE_ENDPOINT, 'https://custom.dare');
  });
});

describe('resolveRelayClawCredentialEnv', () => {
  it('openai protocol + MODEL_CONTEXT_WINDOW', () => {
    const ctx = baseCtx({
      effectiveProtocol: 'openai',
      resolvedAccount: { id: 'relay', authType: 'api_key', kind: 'api_key', apiKey: 'rk' },
      defaultModel: 'gpt-5.4',
    });
    const env = resolveRelayClawCredentialEnv(ctx);
    assert.equal(env.OPENAI_API_KEY, 'rk');
    assert.equal(env.CODEX_AUTH_MODE, 'api_key');
  });
});
