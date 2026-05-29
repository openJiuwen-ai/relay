/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Context Window Sizes Fallback Table Tests
 * F24: Hardcoded model → context window mapping.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('getContextWindowFallback', () => {
  let getContextWindowFallback;
  let CONTEXT_WINDOW_SIZES;

  test('setup', async () => {
    const mod = await import('../dist/config/context-window-sizes.js');
    getContextWindowFallback = mod.getContextWindowFallback;
    CONTEXT_WINDOW_SIZES = mod.CONTEXT_WINDOW_SIZES;
  });

  test('returns exact match for known models', async () => {
    assert.equal(getContextWindowFallback('claude-opus-4-6'), 200_000);
    assert.equal(getContextWindowFallback('claude-sonnet-4-5'), 200_000);
    assert.equal(getContextWindowFallback('gpt-5.3'), 128_000);
    assert.equal(getContextWindowFallback('gemini-2.5-pro'), 1_000_000);
    assert.equal(getContextWindowFallback('gemini-3-pro'), 1_000_000);
    assert.equal(getContextWindowFallback('gemini-3.1-pro-preview'), 1_000_000);
  });

  test('returns prefix match for versioned models', async () => {
    assert.equal(getContextWindowFallback('claude-opus-4-6-20260101'), 200_000);
    assert.equal(getContextWindowFallback('gpt-5.3-turbo'), 128_000);
    assert.equal(getContextWindowFallback('gemini-2.5-pro-exp'), 1_000_000);
  });

  test('returns undefined for unknown models', async () => {
    assert.equal(getContextWindowFallback('unknown-model'), undefined);
    assert.equal(getContextWindowFallback(''), undefined);
  });

  test('covers all expected model families', async () => {
    const keys = Object.keys(CONTEXT_WINDOW_SIZES);
    // Claude
    assert.ok(keys.some((k) => k.startsWith('claude-opus')));
    assert.ok(keys.some((k) => k.startsWith('claude-sonnet')));
    assert.ok(keys.some((k) => k.startsWith('claude-haiku')));
    // GPT
    assert.ok(keys.some((k) => k.startsWith('gpt-')));
    // Gemini
    assert.ok(keys.some((k) => k.startsWith('gemini-')));
    // GLM (Huawei ModelArts)
    assert.ok(keys.some((k) => k.startsWith('glm-')));
  });

  test('gpt-5.1-codex has 400k window', async () => {
    assert.equal(getContextWindowFallback('gpt-5.1-codex'), 400_000);
  });

  test('o3 model returns correct window', async () => {
    assert.equal(getContextWindowFallback('o3'), 200_000);
  });

  // GLM models — exact, prefix, and provider-qualified
  test('glm-5 exact match returns 196608', async () => {
    assert.equal(getContextWindowFallback('glm-5'), 196_608);
  });

  test('glm-4 exact match returns 128000', async () => {
    assert.equal(getContextWindowFallback('glm-4'), 128_000);
  });

  test('glm-4.7 prefix-matches glm-4 → 128000', async () => {
    assert.equal(getContextWindowFallback('glm-4.7'), 128_000);
  });

  test('provider-qualified huawei-modelarts/glm-5 strips prefix → 196608', async () => {
    assert.equal(getContextWindowFallback('huawei-modelarts/glm-5'), 196_608);
  });

  test('provider-qualified z-ai/glm-4.7 strips prefix and prefix-matches → 128000', async () => {
    assert.equal(getContextWindowFallback('z-ai/glm-4.7'), 128_000);
  });

  test('provider-qualified zhipu/glm-4 strips prefix → 128000', async () => {
    assert.equal(getContextWindowFallback('zhipu/glm-4'), 128_000);
  });
});
