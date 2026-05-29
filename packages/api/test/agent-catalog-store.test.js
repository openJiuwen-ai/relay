/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

const { bootstrapCatCatalog, resolveCatCatalogPath } = await import('../dist/config/office-claw-catalog-store.js');
const { createRuntimeCat, deleteRuntimeCat, readRuntimeCatCatalog, updateRuntimeCat } = await import(
  '../dist/config/runtime-office-claw-catalog.js'
);

function validConfig() {
  return {
    version: 2,
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
          },
        ],
      },
    ],
    roster: {
      opus: {
        family: 'ragdoll',
        roles: ['architect'],
        lead: true,
        available: true,
        evaluation: 'primary',
      },
    },
    reviewPolicy: {
      requireDifferentFamily: true,
      preferActiveInThread: true,
      preferLead: true,
      excludeUnavailable: true,
    },
    coCreator: {
      name: 'Co-worker',
      aliases: ['共创伙伴'],
      mentionPatterns: ['@co-worker', '@owner'],
    },
  };
}

function makeF127BootstrapTemplate() {
  return {
    version: 2,
    breeds: [
      {
        id: 'ragdoll',
        agentId: 'opus',
        name: 'Claude',
        displayName: 'Claude',
        avatar: '/avatars/opus.png',
        color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
        mentionPatterns: ['@opus', '@claude'],
        roleDescription: 'Claude 系主力',
        defaultVariantId: 'opus-default',
        variants: [
          {
            id: 'opus-default',
            provider: 'anthropic',
            defaultModel: 'claude-opus-4-6',
            mcpSupport: true,
            cli: { command: 'claude', outputFormat: 'stream-json' },
          },
          {
            id: 'opus-sonnet',
            agentId: 'sonnet',
            displayName: 'Claude',
            mentionPatterns: ['@sonnet'],
            provider: 'anthropic',
            defaultModel: 'claude-sonnet-4',
            mcpSupport: true,
            cli: { command: 'claude', outputFormat: 'stream-json' },
          },
        ],
      },
      {
        id: 'maine-coon',
        agentId: 'codex',
        name: 'Codex',
        displayName: 'Codex',
        avatar: '/avatars/codex.png',
        color: { primary: '#5B8C5A', secondary: '#D4E6D3' },
        mentionPatterns: ['@codex', '@assistant'],
        roleDescription: 'Codex 系主力',
        defaultVariantId: 'codex-default',
        variants: [
          {
            id: 'codex-default',
            provider: 'openai',
            defaultModel: 'gpt-5.4',
            mcpSupport: true,
            cli: { command: 'codex', outputFormat: 'json' },
          },
          {
            id: 'codex-spark',
            agentId: 'spark',
            displayName: 'Codex',
            mentionPatterns: ['@spark'],
            provider: 'openai',
            defaultModel: 'gpt-5.3-codex-spark',
            mcpSupport: true,
            cli: { command: 'codex', outputFormat: 'json' },
          },
        ],
      },
      {
        id: 'siamese',
        agentId: 'gemini',
        name: 'Gemini',
        displayName: 'Gemini',
        avatar: '/avatars/gemini.png',
        color: { primary: '#5B9BD5', secondary: '#D6E9F8' },
        mentionPatterns: ['@gemini', '@design'],
        roleDescription: 'Gemini 系主力',
        defaultVariantId: 'gemini-default',
        variants: [
          {
            id: 'gemini-default',
            provider: 'google',
            defaultModel: 'gemini-3.1-pro',
            mcpSupport: true,
            cli: { command: 'gemini', outputFormat: 'stream-json' },
          },
        ],
      },
      {
        id: 'dragon-li',
        agentId: 'dare',
        name: 'DARE',
        displayName: 'DARE',
        avatar: '/avatars/dare.png',
        color: { primary: '#6B7280', secondary: '#E5E7EB' },
        mentionPatterns: ['@dare', '@dare'],
        roleDescription: 'Dare 框架猫',
        defaultVariantId: 'dare-default',
        variants: [
          {
            id: 'dare-default',
            provider: 'dare',
            defaultModel: 'glm-4.7',
            mcpSupport: true,
            cli: { command: 'dare', outputFormat: 'json' },
          },
        ],
      },
      {
        id: 'golden-chinchilla',
        agentId: 'opencode',
        name: 'OpenCode',
        displayName: 'OpenCode',
        avatar: '/avatars/opencode.png',
        color: { primary: '#C08457', secondary: '#FDE7D3' },
        mentionPatterns: ['@opencode', '@opencode'],
        roleDescription: 'OpenCode',
        defaultVariantId: 'opencode-default',
        variants: [
          {
            id: 'opencode-default',
            provider: 'opencode',
            defaultModel: 'claude-opus-4-6',
            mcpSupport: true,
            cli: { command: 'opencode', outputFormat: 'json' },
          },
        ],
      },
    ],
    roster: {
      opus: { family: 'ragdoll', roles: ['architect'], lead: true, available: true, evaluation: 'claude' },
      sonnet: { family: 'ragdoll', roles: ['assistant'], lead: false, available: true, evaluation: 'claude-2' },
      codex: { family: 'maine-coon', roles: ['reviewer'], lead: true, available: true, evaluation: 'codex' },
      spark: { family: 'maine-coon', roles: ['coder'], lead: false, available: true, evaluation: 'spark' },
      gemini: { family: 'siamese', roles: ['designer'], lead: true, available: true, evaluation: 'gemini' },
      dare: { family: 'dragon-li', roles: ['coding'], lead: true, available: true, evaluation: 'dare' },
      opencode: { family: 'golden-chinchilla', roles: ['coding'], lead: true, available: true, evaluation: 'opencode' },
    },
    reviewPolicy: {
      requireDifferentFamily: true,
      preferActiveInThread: true,
      preferLead: true,
      excludeUnavailable: true,
    },
    coCreator: {
      name: 'Co-worker',
      aliases: ['共创伙伴'],
      mentionPatterns: ['@co-worker', '@owner'],
    },
  };
}

function makeSiblingTemplate(seedAgentId) {
  const config = validConfig();
  config.breeds[0].agentId = seedAgentId;
  config.breeds[0].displayName = '影子猫';
  config.breeds[0].mentionPatterns = [`@${seedAgentId}`];
  config.roster = {
    [seedAgentId]: {
      family: 'ragdoll',
      roles: ['architect'],
      lead: true,
      available: true,
      evaluation: 'shadow',
    },
  };
  return config;
}

describe('agent-catalog-store', () => {
  // Isolate provider profiles to a clean tmpdir so tests don't read from ~/.office-claw/
  let savedGlobalRoot;
  const isolationRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-isolation-'));
  before(() => {
    savedGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = isolationRoot;
  });
  beforeEach(() => {
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = isolationRoot;
  });
  after(() => {
    if (savedGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = savedGlobalRoot;
  });

  it('bootstraps managed clients with bindings while preserving skipped seed members', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-f127-default-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(makeF127BootstrapTemplate(), null, 2));

    const catalogPath = bootstrapCatCatalog(projectRoot, templatePath);
    const runtimeCatalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));

    assert.deepEqual(
      runtimeCatalog.breeds.map((breed) => [breed.id, breed.variants.map((variant) => variant.accountRef ?? null)]),
      [
        ['ragdoll', ['claude', 'claude']],
        ['maine-coon', ['codex', 'codex']],
        ['siamese', ['gemini']],
        ['dragon-li', ['dare']],
        ['golden-chinchilla', [null]],
      ],
    );
  });

  it('bootstraps installer api_key bindings while preserving skipped seed members', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-f127-installer-'));
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(makeF127BootstrapTemplate(), null, 2));
    mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.office-claw', 'provider-profiles.json'),
      JSON.stringify(
        {
          version: 3,
          activeProfileId: null,
          bootstrapBindings: {
            anthropic: { enabled: true, mode: 'api_key', accountRef: 'api-key-1' },
            openai: { enabled: true, mode: 'oauth', accountRef: 'codex' },
            google: { enabled: false, mode: 'skip' },
          },
          providers: [
            { id: 'claude', kind: 'builtin', client: 'anthropic', authType: 'oauth', builtin: true },
            { id: 'codex', kind: 'builtin', client: 'openai', authType: 'oauth', builtin: true },
            { id: 'gemini', kind: 'builtin', client: 'google', authType: 'oauth', builtin: true },
            { id: 'dare', kind: 'builtin', client: 'dare', authType: 'oauth', builtin: true },
            { id: 'opencode', kind: 'builtin', client: 'opencode', authType: 'oauth', builtin: true },
            { id: 'api-key-1', kind: 'api_key', displayName: 'API Key 1', authType: 'api_key', builtin: false },
          ],
        },
        null,
        2,
      ),
    );

    const catalogPath = bootstrapCatCatalog(projectRoot, templatePath);
    const runtimeCatalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));

    assert.deepEqual(
      runtimeCatalog.breeds.map((breed) => [breed.id, breed.variants.map((variant) => variant.accountRef ?? null)]),
      [
        ['ragdoll', ['api-key-1']],
        ['maine-coon', ['codex', 'codex']],
        ['siamese', [null]],
        ['dragon-li', ['dare']],
        ['golden-chinchilla', [null]],
      ],
    );
  });

  it('preserves explicit seed account markers while bootstrapping runtime catalog', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-f127-explicit-seed-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = makeF127BootstrapTemplate();
    const codexBreed = template.breeds.find((breed) => breed.agentId === 'codex');
    if (!codexBreed) throw new Error('codex breed missing from template');
    codexBreed.variants[0].providerProfileId = 'codex-pinned';
    writeFileSync(templatePath, JSON.stringify(template, null, 2));

    const catalogPath = bootstrapCatCatalog(projectRoot, templatePath);
    const runtimeCatalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    const runtimeCodexBreed = runtimeCatalog.breeds.find((breed) => breed.agentId === 'codex');
    const runtimeCodexVariant = runtimeCodexBreed?.variants[0];

    assert.equal(runtimeCodexVariant?.accountRef, 'codex-pinned');
    assert.equal(runtimeCodexVariant?.providerProfileId, 'codex-pinned');
  });

  it('treats relayclaw seed variants as openai bootstrap clients', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-relayclaw-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = makeF127BootstrapTemplate();
    template.breeds.push({
      id: 'jiuwenclaw',
      agentId: 'jiuwenclaw',
      name: 'jiuwenClaw',
      displayName: 'jiuwenClaw',
      avatar: '/avatars/jiuwenclaw.png',
      color: { primary: '#D97A3A', secondary: '#F6E7DA' },
      mentionPatterns: ['@jiuwenclaw'],
      roleDescription: 'office',
      defaultVariantId: 'jiuwenclaw-default',
      variants: [
        {
          id: 'jiuwenclaw-default',
          provider: 'relayclaw',
          defaultModel: 'gpt-5.4',
          mcpSupport: true,
          cli: { command: 'jiuwenclaw-app', outputFormat: 'json' },
        },
      ],
    });
    writeFileSync(templatePath, JSON.stringify(template, null, 2));

    const catalogPath = bootstrapCatCatalog(projectRoot, templatePath);
    const runtimeCatalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    const breed = runtimeCatalog.breeds.find((entry) => entry.id === 'jiuwenclaw');

    assert.equal(breed?.variants?.[0]?.accountRef, 'codex');
  });

  it('bootstraps .office-claw/office-claw-catalog.json from office-claw-template.json', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = validConfig();
    writeFileSync(templatePath, JSON.stringify(template, null, 2));

    const catalogPath = bootstrapCatCatalog(projectRoot, templatePath);
    assert.equal(catalogPath, resolveCatCatalogPath(projectRoot));
    assert.ok(existsSync(catalogPath), 'runtime catalog should be created');
    const runtimeCatalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    assert.deepEqual(runtimeCatalog.breeds[0]?.variants[0]?.accountRef, 'claude');
    assert.deepEqual(
      {
        ...runtimeCatalog,
        breeds: runtimeCatalog.breeds.map((breed) => ({
          ...breed,
          variants: breed.variants.map(({ accountRef, ...variant }) => variant),
        })),
      },
      template,
    );
  });

  it('keeps existing .office-claw/office-claw-catalog.json runtime edits while backfilling missing accountRef bindings', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));

    const runtimeConfig = validConfig();
    runtimeConfig.breeds[0].displayName = '运行时Claude';
    mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
    writeFileSync(join(projectRoot, '.office-claw', 'office-claw-catalog.json'), JSON.stringify(runtimeConfig, null, 2));

    const catalogPath = bootstrapCatCatalog(projectRoot, templatePath);
    const hydrated = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    assert.equal(hydrated.breeds[0]?.displayName, '运行时Claude');
    assert.equal(hydrated.breeds[0]?.variants[0]?.accountRef, 'claude');
  });

  it('creates a new runtime member without corrupting v2 top-level fields', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await createRuntimeCat(projectRoot, {
      agentId: 'spark-lite',
      breedId: 'spark-lite',
      name: '火花猫',
      displayName: '火花猫',
      avatar: '/avatars/spark.png',
      color: { primary: '#f97316', secondary: '#fed7aa' },
      mentionPatterns: ['@spark-lite', '@火花猫'],
      roleDescription: '快速执行',
      personality: '利落',
      provider: 'openai',
      defaultModel: 'gpt-5.4-mini',
      mcpSupport: false,
      cli: { command: 'codex', outputFormat: 'json' },
    });

    const catalog = readRuntimeCatCatalog(projectRoot);
    assert.equal(catalog.version, 2);
    assert.equal(catalog.coCreator?.name, 'Co-worker');
    assert.equal(catalog.reviewPolicy?.preferLead, true);
    assert.ok(catalog.roster?.opus, 'existing roster must be preserved');
    assert.deepEqual(catalog.roster?.['spark-lite'], {
      family: 'spark-lite',
      roles: ['assistant'],
      lead: false,
      available: true,
      evaluation: '火花猫 runtime member',
    });
    const created = catalog.breeds.find((breed) => breed.agentId === 'spark-lite');
    assert.ok(created, 'spark-lite breed should be created');
    assert.equal(created.displayName, '火花猫');
    assert.deepEqual(created.mentionPatterns, ['@spark-lite', '@火花猫']);
    assert.equal(created.variants[0]?.provider, 'openai');
  });

  it('updates an existing runtime member in place', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await updateRuntimeCat(projectRoot, 'opus', {
      displayName: '运行时Claude',
      mentionPatterns: ['@opus', '@claude', '@运行时布偶'],
      defaultModel: 'claude-opus-4-1',
      personality: '更严格',
    });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const updated = catalog.breeds.find((breed) => breed.agentId === 'opus');
    assert.ok(updated, 'opus breed should still exist');
    assert.equal(updated.displayName, '运行时Claude');
    assert.deepEqual(updated.mentionPatterns, ['@opus', '@claude', '@运行时布偶']);
    assert.equal(updated.variants[0]?.defaultModel, 'claude-opus-4-1');
    assert.equal(updated.variants[0]?.personality, '更严格');
    assert.equal(catalog.coCreator?.mentionPatterns[0], '@co-worker');
  });

  it('keeps sessionChain updates scoped to non-default variants', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = validConfig();
    template.breeds[0].features = { sessionChain: true };
    template.breeds[0].variants.push({
      id: 'opus-sonnet',
      agentId: 'opus-sonnet',
      provider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5-20250929',
      mcpSupport: true,
      cli: { command: 'claude', outputFormat: 'stream-json' },
    });
    writeFileSync(templatePath, JSON.stringify(template, null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await updateRuntimeCat(projectRoot, 'opus-sonnet', { sessionChain: false });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const breed = catalog.breeds.find((item) => item.id === 'ragdoll');
    assert.ok(breed, 'ragdoll breed should still exist');
    assert.equal(breed.features?.sessionChain, true);
    const sonnetVariant = breed.variants.find((variant) => variant.id === 'opus-sonnet');
    assert.ok(sonnetVariant, 'opus-sonnet variant should still exist');
    assert.equal(sonnetVariant.sessionChain, false);
    const defaultVariant = breed.variants.find((variant) => variant.id === 'opus-default');
    assert.ok(defaultVariant, 'opus-default variant should still exist');
    assert.equal(defaultVariant.sessionChain, undefined);
  });

  it('keeps roleDescription updates scoped to non-default variants', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = validConfig();
    template.breeds[0].variants.push({
      id: 'opus-sonnet',
      agentId: 'opus-sonnet',
      provider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5-20250929',
      mcpSupport: true,
      cli: { command: 'claude', outputFormat: 'stream-json' },
    });
    writeFileSync(templatePath, JSON.stringify(template, null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await updateRuntimeCat(projectRoot, 'opus-sonnet', { roleDescription: '副手架构师' });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const breed = catalog.breeds.find((item) => item.id === 'ragdoll');
    assert.ok(breed, 'ragdoll breed should still exist');
    assert.equal(breed.roleDescription, '主架构师');
    const sonnetVariant = breed.variants.find((variant) => variant.id === 'opus-sonnet');
    assert.ok(sonnetVariant, 'opus-sonnet variant should still exist');
    assert.equal(sonnetVariant.roleDescription, '副手架构师');
    const defaultVariant = breed.variants.find((variant) => variant.id === 'opus-default');
    assert.ok(defaultVariant, 'opus-default variant should still exist');
    assert.equal(defaultVariant.roleDescription, undefined);
  });

  it('keeps roleDescription updates scoped to the default variant', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = validConfig();
    template.breeds[0].variants.push({
      id: 'opus-sonnet',
      agentId: 'opus-sonnet',
      provider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5-20250929',
      mcpSupport: true,
      cli: { command: 'claude', outputFormat: 'stream-json' },
    });
    writeFileSync(templatePath, JSON.stringify(template, null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await updateRuntimeCat(projectRoot, 'opus', { roleDescription: '默认成员专属职责' });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const breed = catalog.breeds.find((item) => item.id === 'ragdoll');
    assert.ok(breed, 'ragdoll breed should still exist');
    assert.equal(breed.roleDescription, '主架构师');
    const defaultVariant = breed.variants.find((variant) => variant.id === 'opus-default');
    assert.ok(defaultVariant, 'opus-default variant should still exist');
    assert.equal(defaultVariant.roleDescription, '默认成员专属职责');
    const sonnetVariant = breed.variants.find((variant) => variant.id === 'opus-sonnet');
    assert.ok(sonnetVariant, 'opus-sonnet variant should still exist');
    assert.equal(sonnetVariant.roleDescription, undefined);
  });

  it('keeps sessionChain updates scoped to the default variant', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = validConfig();
    template.breeds[0].features = { sessionChain: true };
    template.breeds[0].variants.push({
      id: 'opus-sonnet',
      agentId: 'opus-sonnet',
      provider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5-20250929',
      mcpSupport: true,
      cli: { command: 'claude', outputFormat: 'stream-json' },
    });
    writeFileSync(templatePath, JSON.stringify(template, null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await updateRuntimeCat(projectRoot, 'opus', { sessionChain: false });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const breed = catalog.breeds.find((item) => item.id === 'ragdoll');
    assert.ok(breed, 'ragdoll breed should still exist');
    assert.equal(breed.features?.sessionChain, true);
    const defaultVariant = breed.variants.find((variant) => variant.id === 'opus-default');
    assert.ok(defaultVariant, 'opus-default variant should still exist');
    assert.equal(defaultVariant.sessionChain, false);
    const sonnetVariant = breed.variants.find((variant) => variant.id === 'opus-sonnet');
    assert.ok(sonnetVariant, 'opus-sonnet variant should still exist');
    assert.equal(sonnetVariant.sessionChain, undefined);
  });

  it('does not overwrite runtime catalog when validation fails', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    const catalogPath = resolveCatCatalogPath(projectRoot);
    const beforeRaw = readFileSync(catalogPath, 'utf-8');

    assert.throws(() => {
      updateRuntimeCat(projectRoot, 'opus', { defaultModel: '' });
    }, /Invalid cat config/i);

    const afterRaw = readFileSync(catalogPath, 'utf-8');
    assert.equal(afterRaw, beforeRaw, 'failed update must not corrupt persisted runtime catalog');
  });

  it('rejects runtime members that reuse an alias from another cat', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    const catalogPath = resolveCatCatalogPath(projectRoot);
    const beforeRaw = readFileSync(catalogPath, 'utf-8');

    assert.throws(() => {
      createRuntimeCat(projectRoot, {
        agentId: 'spark-lite',
        breedId: 'spark-lite',
        name: '火花猫',
        displayName: '火花猫',
        avatar: '/avatars/spark.png',
        color: { primary: '#f97316', secondary: '#fed7aa' },
        mentionPatterns: ['@opus', '@spark-lite'],
        roleDescription: '快速执行',
        provider: 'openai',
        defaultModel: 'gpt-5.4',
        mcpSupport: false,
        cli: { command: 'codex', outputFormat: 'json' },
      });
    }, /mention alias "@opus" is already used by cat "opus"/i);

    const afterRaw = readFileSync(catalogPath, 'utf-8');
    assert.equal(afterRaw, beforeRaw, 'failed create must not mutate runtime catalog');
  });

  it('deletes a runtime-created member without touching the rest of the catalog', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await createRuntimeCat(projectRoot, {
      agentId: 'temp-cat',
      breedId: 'temp-cat',
      name: '临时猫',
      displayName: '临时猫',
      avatar: '/avatars/temp.png',
      color: { primary: '#64748b', secondary: '#cbd5e1' },
      mentionPatterns: ['@temp-cat'],
      roleDescription: '临时成员',
      personality: '临时',
      provider: 'dare',
      defaultModel: 'dare-1',
      mcpSupport: false,
      cli: { command: 'dare', outputFormat: 'json' },
    });

    await deleteRuntimeCat(projectRoot, 'temp-cat');

    const catalog = readRuntimeCatCatalog(projectRoot);
    assert.equal(
      catalog.breeds.some((breed) => breed.agentId === 'temp-cat'),
      false,
    );
    assert.equal(
      catalog.breeds.some((breed) => breed.agentId === 'opus'),
      true,
    );
    assert.ok(catalog.roster?.opus, 'existing v2 metadata must stay intact');
  });

  it('blocks seed deletion even when CAT_TEMPLATE_PATH points to an unreadable in-project file', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-stale-template-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    const previousTemplatePath = process.env.CAT_TEMPLATE_PATH;
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'missing-template.json');
    try {
      assert.throws(() => deleteRuntimeCat(projectRoot, 'opus'), /cannot delete seed cat/i);
    } finally {
      if (previousTemplatePath === undefined) delete process.env.CAT_TEMPLATE_PATH;
      else process.env.CAT_TEMPLATE_PATH = previousTemplatePath;
    }

    const catalog = readRuntimeCatCatalog(projectRoot);
    assert.equal(
      catalog.breeds.some((breed) => breed.agentId === 'opus'),
      true,
    );
  });

  it('ignores sibling CAT_TEMPLATE_PATH prefixes when bootstrapping a runtime catalog', async () => {
    const parentRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-boundary-'));
    const projectRoot = join(parentRoot, 'office-claw');
    const siblingRoot = join(parentRoot, 'office-claw-old');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(siblingRoot, { recursive: true });

    const templatePath = join(projectRoot, 'office-claw-template.json');
    const siblingTemplatePath = join(siblingRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    writeFileSync(siblingTemplatePath, JSON.stringify(makeSiblingTemplate('shadow-seed'), null, 2));

    const previousTemplatePath = process.env.CAT_TEMPLATE_PATH;
    process.env.CAT_TEMPLATE_PATH = siblingTemplatePath;
    try {
      await createRuntimeCat(projectRoot, {
        agentId: 'temp-cat',
        breedId: 'temp-cat',
        name: '临时猫',
        displayName: '临时猫',
        avatar: '/avatars/temp.png',
        color: { primary: '#64748b', secondary: '#cbd5e1' },
        mentionPatterns: ['@temp-cat'],
        roleDescription: '临时成员',
        personality: '临时',
        provider: 'dare',
        defaultModel: 'dare-1',
        mcpSupport: false,
        cli: { command: 'dare', outputFormat: 'json' },
      });
    } finally {
      if (previousTemplatePath === undefined) delete process.env.CAT_TEMPLATE_PATH;
      else process.env.CAT_TEMPLATE_PATH = previousTemplatePath;
    }

    const catalog = readRuntimeCatCatalog(projectRoot);
    assert.equal(
      catalog.breeds.some((breed) => breed.agentId === 'opus'),
      true,
      'runtime bootstrap should use the in-project template',
    );
    assert.equal(
      catalog.breeds.some((breed) => breed.agentId === 'shadow-seed'),
      false,
      'sibling template must not seed this project',
    );
  });

  it('does not treat sibling-template seeds as local seeds during delete checks', async () => {
    const parentRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-delete-boundary-'));
    const projectRoot = join(parentRoot, 'office-claw');
    const siblingRoot = join(parentRoot, 'office-claw-old');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(siblingRoot, { recursive: true });

    const templatePath = join(projectRoot, 'office-claw-template.json');
    const siblingTemplatePath = join(siblingRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    writeFileSync(siblingTemplatePath, JSON.stringify(makeSiblingTemplate('shadow-seed'), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await createRuntimeCat(projectRoot, {
      agentId: 'shadow-seed',
      breedId: 'shadow-seed',
      name: '影子临时猫',
      displayName: '影子临时猫',
      avatar: '/avatars/shadow.png',
      color: { primary: '#334155', secondary: '#cbd5f5' },
      mentionPatterns: ['@shadow-seed'],
      roleDescription: '用于路径边界验证',
      provider: 'dare',
      defaultModel: 'dare-1',
      mcpSupport: false,
      cli: { command: 'dare', outputFormat: 'json' },
    });

    const previousTemplatePath = process.env.CAT_TEMPLATE_PATH;
    process.env.CAT_TEMPLATE_PATH = siblingTemplatePath;
    try {
      await deleteRuntimeCat(projectRoot, 'shadow-seed');
    } finally {
      if (previousTemplatePath === undefined) delete process.env.CAT_TEMPLATE_PATH;
      else process.env.CAT_TEMPLATE_PATH = previousTemplatePath;
    }

    const catalog = readRuntimeCatCatalog(projectRoot);
    assert.equal(
      catalog.breeds.some((breed) => breed.agentId === 'shadow-seed'),
      false,
      'runtime cat matching a sibling seed id should still be deletable',
    );
  });

  it('api_key bootstrap uses profile model when template defaultModel is not in profile', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-model-'));
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const catCafeDir = join(projectRoot, '.office-claw');
    mkdirSync(catCafeDir, { recursive: true });

    writeFileSync(
      templatePath,
      JSON.stringify({
        version: 2,
        breeds: [
          {
            id: 'ragdoll',
            agentId: 'opus',
            name: 'Claude',
            displayName: 'Claude',
            avatar: '/avatars/opus.png',
            color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
            mentionPatterns: ['@opus'],
            roleDescription: '主架构师',
            defaultVariantId: 'opus-default',
            variants: [
              {
                id: 'opus-default',
                provider: 'anthropic',
                defaultModel: 'claude-opus-4-6',
                cli: { command: 'claude' },
              },
            ],
          },
        ],
      }),
    );

    // API key profile with different models
    writeFileSync(
      join(catCafeDir, 'provider-profiles.json'),
      JSON.stringify({
        version: 3,
        activeProfileId: null,
        providers: [
          {
            id: 'installer-anthropic',
            displayName: 'Installer anthropic API Key',
            kind: 'api_key',
            authType: 'api_key',
            protocol: 'anthropic',
            baseUrl: 'https://openrouter.ai/api',
            models: ['z-ai/glm-4.7', 'z-ai/glm-4.6'],
          },
        ],
        bootstrapBindings: {
          anthropic: { mode: 'api_key', accountRef: 'installer-anthropic' },
        },
      }),
    );

    bootstrapCatCatalog(projectRoot, templatePath);

    const catalog = readRuntimeCatCatalog(projectRoot);
    const opus = catalog.breeds.find((b) => b.agentId === 'opus');
    assert.ok(opus, 'opus seed cat should exist');
    const variant = opus.variants[0];
    assert.equal(
      variant.defaultModel,
      'z-ai/glm-4.7',
      'defaultModel should fall back to first model from the API key profile',
    );
  });

  it('displayName change on default variant syncs into breed mentionPatterns', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    writeFileSync(templatePath, JSON.stringify(validConfig(), null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await updateRuntimeCat(projectRoot, 'opus', { displayName: '新Claude' });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const breed = catalog.breeds.find((b) => b.agentId === 'opus');
    assert.ok(breed);
    assert.equal(breed.displayName, '新Claude');
    assert.ok(
      breed.mentionPatterns.some((p) => p === '@新Claude'),
      'new displayName should be added to mentionPatterns',
    );
    assert.ok(
      !breed.mentionPatterns.some((p) => p === '@claude'),
      'old displayName pattern should be replaced',
    );
    assert.ok(
      breed.mentionPatterns.some((p) => p === '@opus'),
      'existing non-displayName patterns must be preserved',
    );
  });

  it('displayName change on non-default variant materializes variant mentionPatterns without polluting breed', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = validConfig();
    template.breeds[0].variants.push({
      id: 'opus-sonnet',
      agentId: 'opus-sonnet',
      provider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5-20250929',
      mcpSupport: true,
      cli: { command: 'claude', outputFormat: 'stream-json' },
    });
    writeFileSync(templatePath, JSON.stringify(template, null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    await updateRuntimeCat(projectRoot, 'opus-sonnet', { displayName: '副手Claude' });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const breed = catalog.breeds.find((b) => b.id === 'ragdoll');
    assert.ok(breed);
    // Breed mentionPatterns must NOT be mutated
    assert.deepEqual(breed.mentionPatterns, ['@opus', '@claude'],
      'breed mentionPatterns must not be polluted by non-default variant rename');
    // Non-default variant should have its own materialized patterns
    const sonnet = breed.variants.find((v) => v.id === 'opus-sonnet');
    assert.ok(sonnet);
    assert.ok(Array.isArray(sonnet.mentionPatterns), 'variant should have materialized mentionPatterns');
    assert.ok(
      sonnet.mentionPatterns.some((p) => p === '@opus-sonnet'),
      'materialized patterns should include @agentId',
    );
    assert.ok(
      sonnet.mentionPatterns.some((p) => p === '@副手Claude'),
      'materialized patterns should include new displayName',
    );
  });

  it('name-only update on non-default variant does not corrupt breed mentionPatterns', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cat-catalog-store-'));
    const templatePath = join(projectRoot, 'office-claw-template.json');
    const template = validConfig();
    template.breeds[0].variants.push({
      id: 'opus-sonnet',
      agentId: 'opus-sonnet',
      provider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5-20250929',
      mcpSupport: true,
      cli: { command: 'claude', outputFormat: 'stream-json' },
    });
    writeFileSync(templatePath, JSON.stringify(template, null, 2));
    bootstrapCatCatalog(projectRoot, templatePath);

    const origCatalog = readRuntimeCatCatalog(projectRoot);
    const origBreed = origCatalog.breeds.find((b) => b.id === 'ragdoll');
    const origPatterns = [...origBreed.mentionPatterns];

    // name-only update — but frontend always sends displayName too,
    // so simulate that by including displayName in the patch
    await updateRuntimeCat(projectRoot, 'opus-sonnet', {
      name: '新副手',
      displayName: 'Claude',
    });

    const catalog = readRuntimeCatCatalog(projectRoot);
    const breed = catalog.breeds.find((b) => b.id === 'ragdoll');
    assert.deepEqual(breed.mentionPatterns, origPatterns,
      'breed mentionPatterns must be unchanged after non-default variant name update');
  });
});
