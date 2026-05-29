/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b: getCatModel dynamic env key tests
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { getCatModel, getAllCatModels } = await import('../dist/config/office-claw-models.js');

describe('F32-b: getCatModel dynamic env key', () => {
  it('resolves default model from OFFICE_CLAW_CONFIGS fallback', () => {
    // Without officeClawRegistry population from office-claw-config.json, falls through to OFFICE_CLAW_CONFIGS
    // officeClawRegistry IS populated by setup-agent-registry.js, so it reads from there
    const model = getCatModel('opus');
    assert.ok(typeof model === 'string');
    assert.ok(model.length > 0);
  });

  it('env var takes highest priority (CAT_OPUS_MODEL)', () => {
    const saved = process.env.CAT_OPUS_MODEL;
    process.env.CAT_OPUS_MODEL = 'test-model-override';
    try {
      assert.equal(getCatModel('opus'), 'test-model-override');
    } finally {
      if (saved === undefined) delete process.env.CAT_OPUS_MODEL;
      else process.env.CAT_OPUS_MODEL = saved;
    }
  });

  it('hyphenated agentId generates correct env key (CAT_OPUS_45_MODEL)', () => {
    const saved = process.env.CAT_OPUS_45_MODEL;
    process.env.CAT_OPUS_45_MODEL = 'sonnet-override';
    try {
      assert.equal(getCatModel('opus-45'), 'sonnet-override');
    } finally {
      if (saved === undefined) delete process.env.CAT_OPUS_45_MODEL;
      else process.env.CAT_OPUS_45_MODEL = saved;
    }
  });

  it('throws for unknown cat (no env, no registry, no OFFICE_CLAW_CONFIGS)', () => {
    assert.throws(() => getCatModel('nonexistent-cat-xyz'), /No model configured/);
  });

  it('getAllCatModels returns models for all registered cats', () => {
    const all = getAllCatModels();
    assert.ok(all.opus);
    assert.ok(all.codex);
    assert.ok(all.gemini);
  });
});
