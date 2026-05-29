/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * A2A Mention Detection + Prompt Injection Tests
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { officeClawRegistry } from '@openjiuwen/relay-shared';

describe('parseA2AMentions', () => {
  it('detects line-start @mention (Chinese name)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@assistant 请 review 这段代码', 'opus');
    assert.deepEqual(result, ['codex']);
  });

  it('accepts line-start @mention without a separating space (Chinese handle)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@assistant请 review 这段代码', 'opus');
    assert.deepEqual(result, ['codex']);
  });

  it('detects line-start @mention with leading whitespace when action words exist', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('  @claude 请确认这个修复', 'codex');
    assert.deepEqual(result, ['opus']);
  });

  it('routes when action words are in next line of same paragraph', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '@claude\n请 review 这个 PR';
    const result = parseA2AMentions(text, 'codex');
    assert.deepEqual(result, ['opus']);
  });

  // === Standalone mention: line-start @mention always routes ===

  it('routes standalone @mention on its own line followed by content (no keywords needed)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '@codex\n砚砚方案如上。你按这个落地就行';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, ['codex']);
  });

  it('routes @mention + handoff language without action keywords', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '@codex\n下一个你！';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, ['codex']);
  });

  it('routes @mention across paragraph boundary (blank line between mention and content)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '@claude\n\n这是交接文档 blah blah';
    const result = parseA2AMentions(text, 'codex');
    assert.deepEqual(result, ['opus']);
  });

  it('routes bare @mention (no other content in message)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@claude', 'codex');
    assert.deepEqual(result, ['opus']);
  });

  it('routes @mention with arbitrary text on same line (no keyword match)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@claude prefix typo', 'codex');
    assert.deepEqual(result, ['opus']);
  });

  it('routes multiple @mentions across paragraphs', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '@claude\n@assistant\n\n这是交接给你们的';
    const result = parseA2AMentions(text, 'gpt52');
    assert.deepEqual(result, ['opus', 'codex']);
  });

  // === Content-before-mention: 上文写内容，最后一行 @ (Codex习惯) ===

  it('routes when content comes before @mention (content-before-mention pattern)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '这是交接文档，DARE 源码目录执行 + 业务项目 workspace\n是否接受完全禁用 --api-key argv\n@opus';
    const result = parseA2AMentions(text, 'codex');
    assert.deepEqual(result, ['opus']);
  });

  it('analyzeA2AMentions returns empty suppressed (no suppression system)', async () => {
    const { analyzeA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = analyzeA2AMentions('@claude', 'codex');
    assert.deepEqual(result.mentions, ['opus']);
    assert.deepEqual(result.suppressed, []);
  });

  // === Backward compat: mode option is accepted but ignored ===

  it('mode option is accepted but does not affect routing (backward compat)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '@claude\n\n这是交接文档';
    const strict = parseA2AMentions(text, 'codex', { mode: 'strict' });
    const relaxed = parseA2AMentions(text, 'codex', { mode: 'relaxed' });
    assert.deepEqual(strict, ['opus']);
    assert.deepEqual(relaxed, ['opus']);
  });

  it('does NOT trigger for non-line-start @mention', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('之前Claude说的 @claude 方案不错', 'codex');
    assert.deepEqual(result, []);
  });

  it('ignores @mention inside fenced code blocks', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const text = '看看这段代码：\n```\n@assistant 请review\n```\n没问题';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, []);
  });

  it('filters self-mention', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@claude 我自己说的', 'opus');
    assert.deepEqual(result, []);
  });

  it('F27: returns all matches (multi-mention, up to 2)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    // Both on separate lines — F27 returns both
    const text = '@assistant 先review\n@design 再看看设计';
    const result = parseA2AMentions(text, 'opus');
    assert.equal(result.length, 2);
    assert.ok(result.includes('codex'));
    assert.ok(result.includes('gemini'));
  });

  it('returns empty array for empty text', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    assert.deepEqual(parseA2AMentions('', 'opus'), []);
  });

  it('matches English mention patterns', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@codex please review', 'opus');
    assert.deepEqual(result, ['codex']);
  });

  it('accepts line-start @mention without a separating space (English handle + CJK)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@codex请看', 'opus');
    assert.deepEqual(result, ['codex']);
  });

  it('matches gpt52 variant alias @gpt5.2 from runtime cat-config', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const { loadCatConfig, toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');

    const originalConfigs = officeClawRegistry.getAllConfigs();
    officeClawRegistry.reset();
    try {
      const runtimeConfigs = toAllCatConfigs(loadCatConfig());
      for (const [id, config] of Object.entries(runtimeConfigs)) {
        officeClawRegistry.register(id, config);
      }

      const result = parseA2AMentions('@gpt5.2 帮忙看下', 'codex');
      assert.deepEqual(result, ['gpt52']);
    } finally {
      officeClawRegistry.reset();
      for (const [id, config] of Object.entries(originalConfigs)) {
        officeClawRegistry.register(id, config);
      }
    }
  });

  it('matches stable @gpt alias for gpt52 from runtime cat-config', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const { loadCatConfig, toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');

    const originalConfigs = officeClawRegistry.getAllConfigs();
    officeClawRegistry.reset();
    try {
      const runtimeConfigs = toAllCatConfigs(loadCatConfig());
      for (const [id, config] of Object.entries(runtimeConfigs)) {
        officeClawRegistry.register(id, config);
      }

      const result = parseA2AMentions('@gpt 帮忙看下', 'codex');
      assert.deepEqual(result, ['gpt52']);
    } finally {
      officeClawRegistry.reset();
      for (const [id, config] of Object.entries(originalConfigs)) {
        officeClawRegistry.register(id, config);
      }
    }
  });

  it('does not prefix-match variant handles (@opus-45 should not match @opus)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const { loadCatConfig, toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');

    const originalConfigs = officeClawRegistry.getAllConfigs();
    officeClawRegistry.reset();
    try {
      const runtimeConfigs = toAllCatConfigs(loadCatConfig());
      for (const [id, config] of Object.entries(runtimeConfigs)) {
        officeClawRegistry.register(id, config);
      }

      const result = parseA2AMentions('@opus-45 请看', 'gpt52');
      assert.deepEqual(result, ['opus-45']);
    } finally {
      officeClawRegistry.reset();
      for (const [id, config] of Object.entries(originalConfigs)) {
        officeClawRegistry.register(id, config);
      }
    }
  });

  it('keeps true first two targets without prefix collision side effects', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const { loadCatConfig, toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');

    const originalConfigs = officeClawRegistry.getAllConfigs();
    officeClawRegistry.reset();
    try {
      const runtimeConfigs = toAllCatConfigs(loadCatConfig());
      for (const [id, config] of Object.entries(runtimeConfigs)) {
        officeClawRegistry.register(id, config);
      }

      const text = '@opus-45 请看一下\n@gemini25 please review';
      const result = parseA2AMentions(text, 'gpt52');
      assert.deepEqual(result, ['opus-45', 'gemini25']);
    } finally {
      officeClawRegistry.reset();
      for (const [id, config] of Object.entries(originalConfigs)) {
        officeClawRegistry.register(id, config);
      }
    }
  });
});

describe('F052: cross-thread self-reference exemption', () => {
  it('parseA2AMentions with undefined currentAgentId does not filter any cat', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@codex 请处理这个任务', undefined);
    assert.ok(result.includes('codex'), 'should include codex when currentAgentId is undefined');
  });

  it('parseA2AMentions with currentAgentId still filters self', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@codex 请处理这个任务', 'codex');
    assert.ok(!result.includes('codex'), 'should NOT include codex when it is currentAgentId');
  });

  it('cross-thread: @gemini still works normally when currentAgentId is undefined (no regression)', async () => {
    const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
    const result = parseA2AMentions('@gemini 请确认这个安排', undefined);
    assert.ok(result.includes('gemini'), '@gemini should work with undefined currentAgentId');
  });
});

describe('SystemPromptBuilder A2A injection', () => {
  it('includes A2A section when a2aEnabled and serial mode', async () => {
    const { buildSystemPrompt } = await import('../dist/domains/agents/services/context/SystemPromptBuilder.js');
    const prompt = buildSystemPrompt({
      agentId: 'opus',
      mode: 'serial',
      teammates: ['codex', 'gemini'],
      mcpAvailable: false,
      a2aEnabled: true,
    });
    assert.ok(prompt.includes('协作'), 'should include 协作 section');
    assert.ok(prompt.includes('@队友'), 'should include @队友 instruction');
  });

  it('parallel mode uses independent thinking context (collaboration guide still present)', async () => {
    const { buildSystemPrompt } = await import('../dist/domains/agents/services/context/SystemPromptBuilder.js');
    const prompt = buildSystemPrompt({
      agentId: 'opus',
      mode: 'parallel',
      teammates: ['codex', 'gemini'],
      mcpAvailable: false,
      a2aEnabled: true,
    });
    // Static collaboration guide is always present (cats should always know how to @)
    assert.ok(prompt.includes('## 协作'), 'should include static collaboration guide');
    // Parallel mode should indicate independent thinking
    assert.ok(prompt.includes('独立思考'), 'should indicate independent thinking in parallel mode');
  });

  it('includes A2A section even with empty teammates (single-cat scenario)', async () => {
    const { buildSystemPrompt } = await import('../dist/domains/agents/services/context/SystemPromptBuilder.js');
    // Single-cat: only opus in worklist, teammates = []
    const prompt = buildSystemPrompt({
      agentId: 'opus',
      mode: 'independent',
      teammates: [],
      mcpAvailable: false,
      a2aEnabled: true,
    });
    assert.ok(prompt.includes('协作'), 'should include 协作 even with empty teammates');
    assert.ok(prompt.includes('@assistant'), 'should list codex as callable');
    assert.ok(prompt.includes('@design'), 'should list gemini as callable');
    assert.ok(!prompt.includes('@claude'), 'should NOT list self as callable');
  });
});
