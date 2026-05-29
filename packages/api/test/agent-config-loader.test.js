/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { officeClawRegistry, createAgentId } from '@openjiuwen/relay-shared';

const {
  loadCatConfig,
  getDefaultVariant,
  toFlatConfigs,
  toAllCatConfigs,
  findBreedByMention,
  isSessionChainEnabled,
  getMissionHubSelfClaimScope,
  getDefaultAgentId,
  buildAgentIdToBreedIndex,
  _resetCachedConfig,
} = await import('../dist/config/office-claw-config-loader.js');

/** Create a temp JSON file with given content, return path */
function writeTempConfig(data) {
  const dir = mkdtempSync(join(tmpdir(), 'cat-template-'));
  const path = join(dir, 'office-claw-template.json');
  writeFileSync(path, JSON.stringify(data));
  return path;
}

/** Minimal valid config for testing */
function validConfig() {
  return {
    version: 1,
    breeds: [
      {
        id: 'ragdoll',
        agentId: 'opus',
        name: 'Claude',
        displayName: 'Claude',
        avatar: '/avatars/opus.png',
        color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
        mentionPatterns: ['@opus', '@claude'],
        roleDescription: '主架构师',
        defaultVariantId: 'opus-default',
        variants: [
          {
            id: 'opus-default',
            provider: 'anthropic',
            defaultModel: 'claude-sonnet-4-5-20250929',
            mcpSupport: true,
            cli: { command: 'claude', outputFormat: 'stream-json' },
            personality: '温柔',
          },
        ],
      },
    ],
  };
}

describe('agent-config-loader', () => {
  describe('loadCatConfig', () => {
    it('loads valid JSON successfully', () => {
      const path = writeTempConfig(validConfig());
      const config = loadCatConfig(path);
      assert.equal(config.version, 1);
      assert.equal(config.breeds.length, 1);
      assert.equal(config.breeds[0].id, 'ragdoll');
    });

    it('loads default project office-claw-template.json when no path/env provided', () => {
      const saved = process.env.CAT_TEMPLATE_PATH;
      delete process.env.CAT_TEMPLATE_PATH;
      try {
        const config = loadCatConfig();
        // F032: version can be 1 or 2 now
        assert.ok(config.version === 1 || config.version === 2);
        assert.ok(config.breeds.length >= 1);
      } finally {
        if (saved === undefined) {
          delete process.env.CAT_TEMPLATE_PATH;
        } else {
          process.env.CAT_TEMPLATE_PATH = saved;
        }
      }
    });

    it('prefers .office-claw/office-claw-catalog.json over office-claw-template.json for default loads', () => {
      const projectDir = mkdtempSync(join(tmpdir(), 'cat-template-project-'));
      const templatePath = join(projectDir, 'office-claw-template.json');
      writeFileSync(templatePath, JSON.stringify(validConfig()));
      const runtimeDir = join(projectDir, '.office-claw');
      mkdirSync(runtimeDir, { recursive: true });
      const runtimeConfig = validConfig();
      runtimeConfig.breeds[0].displayName = '运行时Claude';
      writeFileSync(join(runtimeDir, 'office-claw-catalog.json'), JSON.stringify(runtimeConfig));

      const saved = process.env.CAT_TEMPLATE_PATH;
      process.env.CAT_TEMPLATE_PATH = templatePath;
      try {
        const config = loadCatConfig();
        assert.equal(config.breeds[0].displayName, '运行时Claude');
      } finally {
        if (saved === undefined) {
          delete process.env.CAT_TEMPLATE_PATH;
        } else {
          process.env.CAT_TEMPLATE_PATH = saved;
        }
      }
    });

    it('deep-merges catalog overlay onto config base (preserves base-only fields)', () => {
      const projectDir = mkdtempSync(join(tmpdir(), 'cat-merge-project-'));
      const templatePath = join(projectDir, 'office-claw-template.json');

      // Base config: breed has teamStrengths and caution (fields catalog might not have)
      const base = validConfig();
      base.breeds[0].teamStrengths = 'base-only-strength';
      base.breeds[0].caution = 'base-only-caution';
      writeFileSync(templatePath, JSON.stringify(base));
      writeFileSync(join(projectDir, 'office-claw-config.json'), JSON.stringify(base));

      // Catalog: same breed with different displayName, but missing teamStrengths/caution
      const runtimeDir = join(projectDir, '.office-claw');
      mkdirSync(runtimeDir, { recursive: true });
      const catalog = validConfig();
      catalog.breeds[0].displayName = '运行时Claude';
      delete catalog.breeds[0].teamStrengths;
      delete catalog.breeds[0].caution;
      writeFileSync(join(runtimeDir, 'office-claw-catalog.json'), JSON.stringify(catalog));

      const saved = process.env.CAT_TEMPLATE_PATH;
      process.env.CAT_TEMPLATE_PATH = templatePath;
      try {
        const config = loadCatConfig();
        // Catalog override: displayName comes from catalog
        assert.equal(config.breeds[0].displayName, '运行时Claude', 'catalog displayName overrides base');
        // Base preservation: fields absent from catalog are preserved from base
        assert.equal(
          config.breeds[0].teamStrengths,
          'base-only-strength',
          'base breed field preserved when catalog lacks it',
        );
        assert.equal(config.breeds[0].caution, 'base-only-caution', 'base caution preserved when catalog lacks it');
      } finally {
        if (saved === undefined) {
          delete process.env.CAT_TEMPLATE_PATH;
        } else {
          process.env.CAT_TEMPLATE_PATH = saved;
        }
      }
    });

    it('replaces cli object when catalog switches provider so stale effort/defaultArgs do not leak from base', () => {
      const projectDir = mkdtempSync(join(tmpdir(), 'cat-cli-merge-project-'));
      const templatePath = join(projectDir, 'cat-template.json');

      const base = validConfig();
      base.breeds[0].variants[0].cli = {
        command: 'claude',
        outputFormat: 'stream-json',
        defaultArgs: ['--output-format', 'stream-json'],
        effort: 'max',
      };
      writeFileSync(templatePath, JSON.stringify(base));
      writeFileSync(join(projectDir, 'cat-config.json'), JSON.stringify(base));

      const runtimeDir = join(projectDir, '.office-claw');
      mkdirSync(runtimeDir, { recursive: true });
      const catalog = validConfig();
      catalog.breeds[0].variants[0].provider = 'openai';
      catalog.breeds[0].variants[0].defaultModel = 'gpt-5.4';
      catalog.breeds[0].variants[0].cli = {
        command: 'codex',
        outputFormat: 'json',
      };
      writeFileSync(join(runtimeDir, 'cat-catalog.json'), JSON.stringify(catalog));

      const saved = process.env.CAT_TEMPLATE_PATH;
      process.env.CAT_TEMPLATE_PATH = templatePath;
      try {
        const config = loadCatConfig();
        const variant = config.breeds[0].variants[0];
        assert.equal(variant.provider, 'openai');
        assert.deepEqual(variant.cli, {
          command: 'codex',
          outputFormat: 'json',
        });
        assert.equal('effort' in variant.cli, false, 'base cli.effort must not leak across provider switch');
        assert.equal('defaultArgs' in variant.cli, false, 'base cli.defaultArgs must not leak across provider switch');
      } finally {
        if (saved === undefined) {
          delete process.env.CAT_TEMPLATE_PATH;
        } else {
          process.env.CAT_TEMPLATE_PATH = saved;
        }
      }
    });

    it('replaces cli object when catalog switches provider from openai back to anthropic', () => {
      const projectDir = mkdtempSync(join(tmpdir(), 'cat-cli-reverse-merge-project-'));
      const templatePath = join(projectDir, 'cat-template.json');

      const base = validConfig();
      base.breeds[0].variants[0].provider = 'openai';
      base.breeds[0].variants[0].defaultModel = 'gpt-5.4';
      base.breeds[0].variants[0].cli = {
        command: 'codex',
        outputFormat: 'json',
        defaultArgs: ['exec', '--json'],
        effort: 'xhigh',
      };
      writeFileSync(templatePath, JSON.stringify(base));
      writeFileSync(join(projectDir, 'cat-config.json'), JSON.stringify(base));

      const runtimeDir = join(projectDir, '.office-claw');
      mkdirSync(runtimeDir, { recursive: true });
      const catalog = validConfig();
      catalog.breeds[0].variants[0].provider = 'anthropic';
      catalog.breeds[0].variants[0].defaultModel = 'claude-opus-4-1';
      catalog.breeds[0].variants[0].cli = {
        command: 'claude',
        outputFormat: 'stream-json',
      };
      writeFileSync(join(runtimeDir, 'cat-catalog.json'), JSON.stringify(catalog));

      const saved = process.env.CAT_TEMPLATE_PATH;
      process.env.CAT_TEMPLATE_PATH = templatePath;
      try {
        const config = loadCatConfig();
        const variant = config.breeds[0].variants[0];
        assert.equal(variant.provider, 'anthropic');
        assert.deepEqual(variant.cli, {
          command: 'claude',
          outputFormat: 'stream-json',
        });
        assert.equal('effort' in variant.cli, false, 'base cli.effort must not leak back to anthropic');
        assert.equal('defaultArgs' in variant.cli, false, 'base cli.defaultArgs must not leak back to anthropic');
      } finally {
        if (saved === undefined) {
          delete process.env.CAT_TEMPLATE_PATH;
        } else {
          process.env.CAT_TEMPLATE_PATH = saved;
        }
      }
    });

    it('rejects invalid JSON (missing required field)', () => {
      const bad = validConfig();
      delete bad.breeds[0].roleDescription;
      const path = writeTempConfig(bad);
      assert.throws(() => loadCatConfig(path), /Invalid cat config/);
    });

    it('rejects wrong version', () => {
      const bad = { ...validConfig(), version: 2 };
      const path = writeTempConfig(bad);
      assert.throws(() => loadCatConfig(path), /Invalid cat config/);
    });

    it('throws clear error when file not found', () => {
      assert.throws(() => loadCatConfig('/nonexistent/office-claw-template.json'), /Failed to read cat config/);
    });

    it('rejects empty variants array', () => {
      const bad = validConfig();
      bad.breeds[0].variants = [];
      const path = writeTempConfig(bad);
      assert.throws(() => loadCatConfig(path), /Invalid cat config/);
    });

    it('rejects invalid defaultVariantId reference', () => {
      const bad = validConfig();
      bad.breeds[0].defaultVariantId = 'nonexistent-variant';
      const path = writeTempConfig(bad);
      assert.throws(() => loadCatConfig(path), /defaultVariantId.*not found/);
    });

    it('rejects invalid provider', () => {
      const bad = validConfig();
      bad.breeds[0].variants[0].provider = 'invalid-provider';
      const path = writeTempConfig(bad);
      assert.throws(() => loadCatConfig(path), /Invalid cat config/);
    });

    it('accepts dare provider (F050)', () => {
      const config = validConfig();
      config.breeds.push({
        id: 'dare-test',
        agentId: 'dare',
        name: 'DARE',
        displayName: 'DARE',
        avatar: '/avatars/dare.png',
        color: { primary: '#D4A76A', secondary: '#F5EBD7' },
        mentionPatterns: ['@dare'],
        roleDescription: '确定性执行与审计引擎',
        defaultVariantId: 'dare-default',
        variants: [
          {
            id: 'dare-default',
            provider: 'dare',
            defaultModel: 'zhipu/glm-4.7',
            mcpSupport: false,
            cli: { command: 'python', outputFormat: 'headless-json' },
          },
        ],
      });
      const path = writeTempConfig(config);
      const loaded = loadCatConfig(path);
      const cats = toAllCatConfigs(loaded);
      assert.ok(cats.dare);
      assert.strictEqual(cats.dare.provider, 'dare');
    });

    it('accepts arbitrary agentId (F32-a: any non-empty string is valid)', () => {
      // F32-a: agentId is no longer restricted to opus/codex/gemini
      const custom = validConfig();
      custom.breeds[0].agentId = 'foobar';
      custom.breeds[0].mentionPatterns = ['@foobar', '@claude'];
      const path = writeTempConfig(custom);
      const config = loadCatConfig(path);
      assert.equal(config.breeds[0].agentId, 'foobar');
    });
  });

  describe('getDefaultVariant', () => {
    it('returns the default variant', () => {
      const path = writeTempConfig(validConfig());
      const config = loadCatConfig(path);
      const variant = getDefaultVariant(config.breeds[0]);
      assert.equal(variant.id, 'opus-default');
      assert.equal(variant.provider, 'anthropic');
    });
  });

  describe('toFlatConfigs', () => {
    it('produces Record matching OfficeClawConfigEntry shape', () => {
      const path = writeTempConfig(validConfig());
      const config = loadCatConfig(path);
      const flat = toFlatConfigs(config);

      assert.ok(flat.opus);
      assert.equal(flat.opus.displayName, 'Claude');
      assert.equal(flat.opus.provider, 'anthropic');
      assert.equal(flat.opus.mcpSupport, true);
      assert.deepEqual(flat.opus.mentionPatterns, ['@opus', '@claude']);
      assert.equal(flat.opus.personality, '温柔');
    });

    it('handles multiple breeds', () => {
      const cfg = validConfig();
      cfg.breeds.push({
        id: 'maine-coon',
        agentId: 'codex',
        name: 'Codex',
        displayName: 'Codex',
        avatar: '/avatars/codex.png',
        color: { primary: '#5B8C5A', secondary: '#D4E6D3' },
        mentionPatterns: ['@codex', '@assistant'],
        roleDescription: '代码审查专家',
        defaultVariantId: 'codex-default',
        variants: [
          {
            id: 'codex-default',
            provider: 'openai',
            defaultModel: 'codex',
            mcpSupport: false,
            cli: { command: 'codex', outputFormat: 'json' },
            personality: '严谨认真',
          },
        ],
      });
      const path = writeTempConfig(cfg);
      const config = loadCatConfig(path);
      const flat = toFlatConfigs(config);

      assert.ok(flat.opus);
      assert.ok(flat.codex);
      assert.equal(flat.codex.provider, 'openai');
    });
  });

  describe('findBreedByMention', () => {
    it('finds breed by mention pattern', () => {
      const path = writeTempConfig(validConfig());
      const config = loadCatConfig(path);
      const result = findBreedByMention(config, '你好 @claude 帮我看看');
      assert.ok(result);
      assert.equal(result.breed.id, 'ragdoll');
    });

    it('is case-insensitive', () => {
      const path = writeTempConfig(validConfig());
      const config = loadCatConfig(path);
      const result = findBreedByMention(config, 'Hello @OPUS');
      assert.ok(result);
      assert.equal(result.breed.id, 'ragdoll');
    });

    it('returns undefined when no match', () => {
      const path = writeTempConfig(validConfig());
      const config = loadCatConfig(path);
      const result = findBreedByMention(config, '你好世界');
      assert.equal(result, undefined);
    });

    it('longest-match-first: variant pattern wins over breed prefix (R28 regression)', () => {
      // @claude45 must match opus-45 variant, not breed-level @claude
      const cfg = multiVariantConfig();
      cfg.breeds[0].variants[1].mentionPatterns = ['@opus-45', '@claude45'];
      cfg.breeds[0].mentionPatterns = ['@opus', '@claude', '@claude'];
      const config2 = loadCatConfig(writeTempConfig(cfg));
      const result = findBreedByMention(config2, '@claude45 帮忙');
      assert.ok(result);
      assert.equal(String(result.agentId), 'opus-45');
    });

    it('longest-match-first: project config @claudesonnet resolves to sonnet', () => {
      const config = loadCatConfig();
      const result = findBreedByMention(config, '@claudesonnet 帮忙');
      assert.ok(result);
      assert.equal(String(result.agentId), 'sonnet');
    });

    it('breed-level short pattern still works when no prefix collision', () => {
      const config = loadCatConfig();
      const result = findBreedByMention(config, '@claude 帮忙');
      assert.ok(result);
      assert.equal(String(result.agentId), 'opus');
    });
  });

  describe('isSessionChainEnabled', () => {
    it('returns true by default (no features field)', () => {
      const config = loadCatConfig(writeTempConfig(validConfig()));
      assert.equal(isSessionChainEnabled('opus', config), true);
    });

    it('returns true when features.sessionChain is true', () => {
      const cfg = validConfig();
      cfg.breeds[0].features = { sessionChain: true };
      const config = loadCatConfig(writeTempConfig(cfg));
      assert.equal(isSessionChainEnabled('opus', config), true);
    });

    it('returns false when features.sessionChain is explicitly false', () => {
      const cfg = validConfig();
      cfg.breeds[0].features = { sessionChain: false };
      const config = loadCatConfig(writeTempConfig(cfg));
      assert.equal(isSessionChainEnabled('opus', config), false);
    });

    it('returns true for unknown agentId (not in config)', () => {
      const config = loadCatConfig(writeTempConfig(validConfig()));
      assert.equal(isSessionChainEnabled('unknown-cat', config), true);
    });

    it('prefers variant.sessionChain override over breed-level setting', () => {
      const cfg = validConfig();
      cfg.breeds[0].features = { sessionChain: true };
      cfg.breeds[0].variants.push({
        id: 'opus-sonnet',
        agentId: 'opus-sonnet',
        provider: 'anthropic',
        defaultModel: 'claude-sonnet-4-5-20250929',
        mcpSupport: true,
        cli: { command: 'claude', outputFormat: 'stream-json' },
        sessionChain: false,
      });
      const config = loadCatConfig(writeTempConfig(cfg));
      assert.equal(isSessionChainEnabled('opus', config), true);
      assert.equal(isSessionChainEnabled('opus-sonnet', config), false);
    });

    it('F053: loads project config for gemini (sessionChain: true after parity fix)', () => {
      // Uses the actual project office-claw-config.json
      const config = loadCatConfig();
      assert.equal(isSessionChainEnabled('gemini', config), true);
      assert.equal(isSessionChainEnabled('opus', config), true);
      assert.equal(isSessionChainEnabled('codex', config), true);
    });

    it('accepts features with empty object (all defaults)', () => {
      const cfg = validConfig();
      cfg.breeds[0].features = {};
      const config = loadCatConfig(writeTempConfig(cfg));
      assert.equal(isSessionChainEnabled('opus', config), true);
    });

    it('Cloud P1: gracefully returns true when config file is missing (no throw)', () => {
      const saved = process.env.CAT_TEMPLATE_PATH;
      process.env.CAT_TEMPLATE_PATH = '/tmp/nonexistent-cat-template-12345.json';
      _resetCachedConfig();
      try {
        // Should NOT throw — should fallback to default (true)
        const result = isSessionChainEnabled('codex');
        assert.equal(result, true, 'should return true (default) when config is unreadable');
      } finally {
        if (saved === undefined) {
          delete process.env.CAT_TEMPLATE_PATH;
        } else {
          process.env.CAT_TEMPLATE_PATH = saved;
        }
        _resetCachedConfig();
      }
    });
  });

  describe('getMissionHubSelfClaimScope', () => {
    it('returns disabled by default when missionHub feature is not configured', () => {
      const config = loadCatConfig(writeTempConfig(validConfig()));
      assert.equal(getMissionHubSelfClaimScope('opus', config), 'disabled');
    });

    it('reads configured missionHub self-claim scope from breed features', () => {
      const cfg = validConfig();
      cfg.breeds[0].features = {
        missionHub: {
          selfClaimScope: 'global',
        },
      };
      const config = loadCatConfig(writeTempConfig(cfg));
      assert.equal(getMissionHubSelfClaimScope('opus', config), 'global');
    });
  });
});

// ── F32-b Multi-Variant Tests ──────────────────────────────────────────

/** Config with multiple variants per breed */
function multiVariantConfig() {
  return {
    version: 1,
    breeds: [
      {
        id: 'ragdoll',
        agentId: 'opus',
        name: 'Claude',
        displayName: 'Claude',
        avatar: '/avatars/opus.png',
        color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
        mentionPatterns: ['@opus', '@claude', '@claude'],
        roleDescription: '主架构师',
        defaultVariantId: 'opus-default',
        variants: [
          {
            id: 'opus-default',
            provider: 'anthropic',
            defaultModel: 'claude-opus-4-6',
            mcpSupport: true,
            cli: { command: 'claude', outputFormat: 'stream-json' },
            personality: '温柔',
          },
          {
            id: 'opus-45',
            agentId: 'opus-45',
            displayName: 'Claude 4.5',
            mentionPatterns: ['@opus-45', '@claude4.5'],
            provider: 'anthropic',
            defaultModel: 'claude-sonnet-4-5-20250929',
            mcpSupport: true,
            cli: { command: 'claude', outputFormat: 'stream-json' },
            personality: '快速高效',
          },
        ],
      },
      {
        id: 'siamese',
        agentId: 'gemini',
        name: 'Gemini',
        displayName: 'Gemini',
        avatar: '/avatars/gemini.png',
        color: { primary: '#D4A574', secondary: '#F5E6D3' },
        mentionPatterns: ['@gemini', '@design'],
        roleDescription: '视觉设计',
        defaultVariantId: 'gemini-default',
        features: { sessionChain: false },
        variants: [
          {
            id: 'gemini-default',
            provider: 'google',
            defaultModel: 'gemini-2.5-pro',
            mcpSupport: false,
            cli: { command: 'gemini', outputFormat: 'stream-json' },
            personality: '创意',
          },
        ],
      },
    ],
  };
}

describe('F32-b: toAllCatConfigs (multi-variant)', () => {
  it('expands all variants as independent cats', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    assert.ok(all.opus, 'default variant registered as opus');
    assert.ok(all['opus-45'], 'non-default variant registered as opus-45');
    assert.ok(all.gemini, 'second breed registered');
    assert.equal(Object.keys(all).length, 3);
  });

  it('default variant inherits breed mentionPatterns', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    assert.deepEqual(all.opus.mentionPatterns, ['@opus', '@claude', '@claude']);
  });

  it('non-default variant uses its own mentionPatterns plus auto-added displayName', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    // displayName 'Claude 4.5' (with space) differs from alias '@claude4.5' (no space),
    // so toAllCatConfigs auto-appends it as a valid mention pattern.
    assert.deepEqual(all['opus-45'].mentionPatterns, ['@opus-45', '@claude4.5', '@Claude 4.5']);
  });

  it('non-default variant with no mentionPatterns gets @agentId fallback pattern', () => {
    const cfg = multiVariantConfig();
    // Add a variant without mentionPatterns and without agentId override
    cfg.breeds[0].variants.push({
      id: 'opus-haiku',
      agentId: 'opus-haiku',
      provider: 'anthropic',
      defaultModel: 'claude-haiku-4-5-20251001',
      mcpSupport: false,
      cli: { command: 'claude', outputFormat: 'stream-json' },
      personality: '简洁',
    });
    const config = loadCatConfig(writeTempConfig(cfg));
    const all = toAllCatConfigs(config);
    assert.deepEqual(all['opus-haiku'].mentionPatterns, ['@opus-haiku']);
  });

  it('non-default variant with explicit empty mentionPatterns still gets @agentId fallback', () => {
    const cfg = multiVariantConfig();
    cfg.breeds[0].variants.push({
      id: 'opus-haiku-empty',
      agentId: 'opus-haiku-empty',
      mentionPatterns: [],
      provider: 'anthropic',
      defaultModel: 'claude-haiku-4-5-20251001',
      mcpSupport: false,
      cli: { command: 'claude', outputFormat: 'stream-json' },
      personality: '简洁',
    });
    const config = loadCatConfig(writeTempConfig(cfg));
    const all = toAllCatConfigs(config);
    assert.deepEqual(all['opus-haiku-empty'].mentionPatterns, ['@opus-haiku-empty']);
  });

  it('variant overrides displayName', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    assert.equal(all.opus.displayName, 'Claude');
    assert.equal(all['opus-45'].displayName, 'Claude 4.5');
  });

  it('variants without avatar/color inherit breed-level values', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    // opus-45 has no avatar/color override → inherits breed
    assert.equal(all.opus.avatar, all['opus-45'].avatar);
    assert.deepEqual(all.opus.color, all['opus-45'].color);
  });

  it('sets breedId on all variants', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    assert.equal(all.opus.breedId, 'ragdoll');
    assert.equal(all['opus-45'].breedId, 'ragdoll');
    assert.equal(all.gemini.breedId, 'siamese');
  });

  it('throws on duplicate agentId', () => {
    const cfg = multiVariantConfig();
    // Make second variant use same agentId as default (no agentId override → inherits breed)
    delete cfg.breeds[0].variants[1].agentId;
    cfg.breeds[0].variants[1].mentionPatterns = ['@opus', '@claude4.5'];
    assert.throws(() => toAllCatConfigs(loadCatConfig(writeTempConfig(cfg))), /Duplicate agentId "opus"/);
  });

  it('toFlatConfigs is an alias for toAllCatConfigs', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    const flat = toFlatConfigs(config);
    assert.deepEqual(all, flat);
  });
});

describe('F32-b: buildAgentIdToBreedIndex', () => {
  it('maps variant agentIds to parent breed', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const index = buildAgentIdToBreedIndex(config);
    assert.equal(index.get('opus').id, 'ragdoll');
    assert.equal(index.get('opus-45').id, 'ragdoll');
    assert.equal(index.get('gemini').id, 'siamese');
  });
});

describe('F32-b: isSessionChainEnabled (variant resolution)', () => {
  it('variant agentId resolves to parent breed features', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    // opus-45 belongs to ragdoll → no features.sessionChain → true
    assert.equal(isSessionChainEnabled('opus-45', config), true);
    // gemini belongs to siamese → sessionChain: false
    assert.equal(isSessionChainEnabled('gemini', config), false);
  });
});

describe('F32-b: getDefaultAgentId', () => {
  it('returns first breed default variant agentId', () => {
    const saved = process.env.CAT_TEMPLATE_PATH;
    const path = writeTempConfig(multiVariantConfig());
    process.env.CAT_TEMPLATE_PATH = path;
    _resetCachedConfig();
    try {
      const id = getDefaultAgentId();
      assert.equal(id, 'opus');
    } finally {
      if (saved === undefined) {
        delete process.env.CAT_TEMPLATE_PATH;
      } else {
        process.env.CAT_TEMPLATE_PATH = saved;
      }
      _resetCachedConfig();
    }
  });

  it('returns variant agentId when default variant has agentId override', () => {
    const cfg = multiVariantConfig();
    // Make opus-45 the default and give it a custom agentId
    cfg.breeds[0].defaultVariantId = 'opus-45';
    const saved = process.env.CAT_TEMPLATE_PATH;
    const path = writeTempConfig(cfg);
    process.env.CAT_TEMPLATE_PATH = path;
    _resetCachedConfig();
    try {
      const id = getDefaultAgentId();
      assert.equal(id, 'opus-45');
    } finally {
      if (saved === undefined) {
        delete process.env.CAT_TEMPLATE_PATH;
      } else {
        process.env.CAT_TEMPLATE_PATH = saved;
      }
      _resetCachedConfig();
    }
  });

  it('falls back to the first registered runtime cat when config load fails', () => {
    const savedTemplatePath = process.env.CAT_TEMPLATE_PATH;
    const savedRegistry = officeClawRegistry.getAllConfigs();
    const missingPath = join(tmpdir(), `missing-cat-template-${Date.now()}.json`);

    officeClawRegistry.reset();
    officeClawRegistry.register('office', {
      id: createAgentId('office'),
      name: '办公智能体',
      displayName: '办公智能体',
      nickname: '小九',
      avatar: '/avatars/office.svg',
      color: { primary: '#2B5797', secondary: '#C0D0E8' },
      mentionPatterns: ['@office'],
      provider: 'relayclaw',
      defaultModel: 'glm-5',
      mcpSupport: true,
      breedId: 'office',
      roleDescription: '办公助手',
      personality: '专业',
    });

    process.env.CAT_TEMPLATE_PATH = missingPath;
    _resetCachedConfig();
    try {
      const id = getDefaultAgentId();
      assert.equal(id, 'office');
    } finally {
      officeClawRegistry.reset();
      for (const [id, config] of Object.entries(savedRegistry)) {
        officeClawRegistry.register(id, config);
      }
      if (savedTemplatePath === undefined) {
        delete process.env.CAT_TEMPLATE_PATH;
      } else {
        process.env.CAT_TEMPLATE_PATH = savedTemplatePath;
      }
      _resetCachedConfig();
    }
  });
});

describe('F32-b: mentionPattern validation', () => {
  it('rejects breed mentionPatterns without @ prefix', () => {
    const cfg = multiVariantConfig();
    cfg.breeds[0].mentionPatterns = ['opus', '@claude'];
    const path = writeTempConfig(cfg);
    assert.throws(() => loadCatConfig(path), /Invalid cat config/);
  });

  it('rejects variant mentionPatterns without @ prefix', () => {
    const cfg = multiVariantConfig();
    cfg.breeds[0].variants[1].mentionPatterns = ['opus-45'];
    const path = writeTempConfig(cfg);
    assert.throws(() => loadCatConfig(path), /Invalid cat config/);
  });

  it('accepts breed mentionPatterns without canonical @agentId (custom aliases allowed)', () => {
    const cfg = multiVariantConfig();
    cfg.breeds[0].mentionPatterns = ['@claude', '@claude'];
    const path = writeTempConfig(cfg);
    const config = loadCatConfig(path);
    const allConfigs = toAllCatConfigs(config);
    assert.deepEqual(allConfigs.opus.mentionPatterns, ['@claude', '@claude']);
  });

  it('accepts variant mentionPatterns without canonical @agentId (custom aliases allowed)', () => {
    const cfg = multiVariantConfig();
    cfg.breeds[0].variants[1].mentionPatterns = ['@claude4.5'];
    const path = writeTempConfig(cfg);
    const config = loadCatConfig(path);
    const allConfigs = toAllCatConfigs(config);
    // displayName 'Claude 4.5' auto-appended (differs from alias '@claude4.5' by space)
    assert.deepEqual(allConfigs['opus-45'].mentionPatterns, ['@claude4.5', '@Claude 4.5']);
  });
});

// ── F32-b P4c: Per-Variant Avatar/Color Override + Personality Fallback ──

describe('F32-b P4c: variant-level avatar/color override', () => {
  /** Config with variant that overrides avatar and color */
  function variantOverrideConfig() {
    const cfg = multiVariantConfig();
    cfg.breeds[0].variants[1].avatar = '/avatars/opus-45.png';
    cfg.breeds[0].variants[1].color = { primary: '#B39DDB', secondary: '#EDE7F6' };
    return cfg;
  }

  it('variant with avatar/color override uses its own values', () => {
    const config = loadCatConfig(writeTempConfig(variantOverrideConfig()));
    const all = toAllCatConfigs(config);
    assert.equal(all['opus-45'].avatar, '/avatars/opus-45.png');
    assert.deepEqual(all['opus-45'].color, { primary: '#B39DDB', secondary: '#EDE7F6' });
  });

  it('default variant still uses breed-level avatar/color', () => {
    const config = loadCatConfig(writeTempConfig(variantOverrideConfig()));
    const all = toAllCatConfigs(config);
    assert.equal(all.opus.avatar, '/avatars/opus.png');
    assert.deepEqual(all.opus.color, { primary: '#9B7EBD', secondary: '#E8DFF5' });
  });

  it('variant without override inherits breed values (unchanged behavior)', () => {
    const cfg = multiVariantConfig();
    // opus-45 has no avatar/color in base multiVariantConfig
    const config = loadCatConfig(writeTempConfig(cfg));
    const all = toAllCatConfigs(config);
    assert.equal(all['opus-45'].avatar, '/avatars/opus.png');
    assert.deepEqual(all['opus-45'].color, { primary: '#9B7EBD', secondary: '#E8DFF5' });
  });
});

describe('F32-b P4c: personality fallback to default variant', () => {
  it('non-default variant without personality inherits default variant personality', () => {
    const cfg = multiVariantConfig();
    // Remove personality from opus-45 to test fallback
    delete cfg.breeds[0].variants[1].personality;
    const config = loadCatConfig(writeTempConfig(cfg));
    const all = toAllCatConfigs(config);
    // Should fall back to default variant personality '温柔'
    assert.equal(all['opus-45'].personality, '温柔');
  });

  it('non-default variant with explicit personality keeps its own', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    assert.equal(all['opus-45'].personality, '快速高效');
  });

  it('default variant personality is used as-is', () => {
    const config = loadCatConfig(writeTempConfig(multiVariantConfig()));
    const all = toAllCatConfigs(config);
    assert.equal(all.opus.personality, '温柔');
  });
});

describe('F32-b P4c: Sonnet variant in project config', () => {
  it('project office-claw-template.json loads with Sonnet variant', () => {
    const config = loadCatConfig();
    const ragdoll = config.breeds.find((b) => b.id === 'ragdoll');
    assert.ok(ragdoll, 'ragdoll breed exists');
    const sonnetVariant = ragdoll.variants.find((v) => v.id === 'opus-sonnet');
    assert.ok(sonnetVariant, 'opus-sonnet variant exists');
    assert.equal(sonnetVariant.agentId, 'sonnet');
    assert.equal(sonnetVariant.variantLabel, 'Sonnet');
    assert.equal(sonnetVariant.provider, 'anthropic');
    assert.equal(sonnetVariant.defaultModel, 'claude-sonnet-4-6');
  });

  it('Sonnet expands to independent cat with correct overrides', () => {
    const config = loadCatConfig();
    const all = toAllCatConfigs(config);
    const sonnet = all.sonnet;
    assert.ok(sonnet, 'sonnet cat config exists');
    assert.equal(sonnet.breedId, 'ragdoll');
    assert.equal(sonnet.displayName, 'Claude');
    assert.equal(sonnet.variantLabel, 'Sonnet');
    assert.equal(sonnet.isDefaultVariant, false);
    assert.deepEqual(sonnet.color, { primary: '#B39DDB', secondary: '#EDE7F6' });
    assert.deepEqual(sonnet.mentionPatterns, ['@sonnet', '@claudesonnet']);
  });

  it('Sonnet does not share avatar/color with default opus', () => {
    const config = loadCatConfig();
    const all = toAllCatConfigs(config);
    // Sonnet has its own color
    assert.notDeepEqual(all.sonnet.color, all.opus.color);
  });

  it('total cat count is 12 (opus + sonnet + opus-45 + codex + gpt52 + spark + gemini + gemini25 + dare + antigravity + antig-opus + opencode)', () => {
    const config = loadCatConfig();
    const all = toAllCatConfigs(config);
    assert.equal(Object.keys(all).length, 12);
    assert.ok(all.opus);
    assert.ok(all.sonnet);
    assert.ok(all['opus-45']);
    assert.ok(all.codex);
    assert.ok(all.gpt52);
    assert.ok(all.spark); // F032 Phase E: new cat added
    assert.ok(all.gemini);
    assert.ok(all.gemini25);
    assert.ok(all.dare); // F050: DARE external agent (dragon-li)
    assert.ok(all.antigravity); // F061: Antigravity CDP bridge
    assert.ok(all['antig-opus']); // F061: Antigravity Claude variant
    assert.ok(all.opencode); // F105: OpenCode external agent
  });

  it('projects antigravity commandArgs from cli.defaultArgs when variant.commandArgs is absent', () => {
    const config = loadCatConfig();
    const all = toAllCatConfigs(config);
    assert.deepEqual(all.antigravity.commandArgs, ['.', '--remote-debugging-port=9000']);
    assert.deepEqual(all['antig-opus'].commandArgs, ['.', '--remote-debugging-port=9000']);
  });
});

// --- F-Ground-3 R1 fix: caution null semantics ---

describe('F-Ground-3: caution null semantics', () => {
  it('accepts caution: null at breed level (spec says string | null)', () => {
    const cfg = validConfig();
    cfg.breeds[0].caution = null;
    const path = writeTempConfig(cfg);
    // Should NOT throw — null means "explicitly no caution"
    const loaded = loadCatConfig(path);
    assert.equal(loaded.breeds[0].caution, null);
  });

  it('accepts caution: null at variant level', () => {
    const cfg = validConfig();
    cfg.breeds[0].caution = 'breed warning';
    cfg.breeds[0].variants[0].caution = null;
    const path = writeTempConfig(cfg);
    const loaded = loadCatConfig(path);
    assert.equal(loaded.breeds[0].variants[0].caution, null);
  });

  it('variant caution: null overrides breed caution (does not inherit)', () => {
    const cfg = validConfig();
    cfg.breeds[0].caution = 'breed warning';
    cfg.breeds[0].variants[0].caution = null;
    const path = writeTempConfig(cfg);
    const loaded = loadCatConfig(path);
    const all = toAllCatConfigs(loaded);
    // null means "explicitly no caution" — should NOT fallback to breed's caution
    assert.equal(all.opus.caution, null, 'variant null should override breed caution');
  });

  it('variant caution: undefined inherits breed caution', () => {
    const cfg = validConfig();
    cfg.breeds[0].caution = 'breed warning';
    // variant.caution not set → undefined → should inherit
    const path = writeTempConfig(cfg);
    const loaded = loadCatConfig(path);
    const all = toAllCatConfigs(loaded);
    assert.equal(all.opus.caution, 'breed warning');
  });
});

describe('GPT-5.2 variant mention aliases in project config', () => {
  it('includes @gpt5.2 and @gpt-5.2 for gpt52 variant', () => {
    const config = loadCatConfig();
    const all = toAllCatConfigs(config);
    const gpt52 = all.gpt52;
    assert.ok(gpt52, 'gpt52 cat config exists');
    assert.ok(gpt52.mentionPatterns.includes('@gpt5.2'));
    assert.ok(gpt52.mentionPatterns.includes('@gpt-5.2'));
  });

  it('includes stable @gpt alias for gpt52 variant', () => {
    const config = loadCatConfig();
    const all = toAllCatConfigs(config);
    const gpt52 = all.gpt52;
    assert.ok(gpt52, 'gpt52 cat config exists');
    assert.ok(gpt52.mentionPatterns.includes('@gpt'));
  });
});
