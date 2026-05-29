/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';

const tempDirs = [];
let savedTemplatePath;
let savedGlobalRoot;

function makeCatalog(agentId, displayName, provider = 'openai', defaultModel = 'gpt-5.4') {
  return {
    version: 1,
    breeds: [
      {
        id: `${agentId}-breed`,
        agentId,
        name: displayName,
        displayName,
        avatar: `/avatars/${agentId}.png`,
        color: { primary: '#334155', secondary: '#cbd5e1' },
        mentionPatterns: [`@${agentId}`],
        roleDescription: 'runtime cat',
        defaultVariantId: `${agentId}-default`,
        variants: [
          {
            id: `${agentId}-default`,
            provider,
            defaultModel,
            mcpSupport: provider !== 'antigravity',
            cli: { command: provider === 'antigravity' ? 'antigravity' : 'codex', outputFormat: 'json' },
          },
        ],
      },
    ],
  };
}

function makeVersion2Config(agentId, displayName, options = {}) {
  const provider = options.provider ?? 'openai';
  const defaultModel = options.defaultModel ?? 'gpt-5.4';
  const evaluation = options.evaluation ?? `${displayName} evaluation`;
  return {
    version: 2,
    breeds: makeCatalog(agentId, displayName, provider, defaultModel).breeds,
    roster: {
      [agentId]: {
        family: options.family ?? 'maine-coon',
        roles: options.roles ?? ['peer-reviewer'],
        lead: options.lead ?? false,
        available: options.available ?? true,
        evaluation,
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

function createRuntimeCatalogProject(catalog, template = makeCatalog('template-cat', '模板猫')) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'cats-route-runtime-'));
  tempDirs.push(projectRoot);
  writeFileSync(join(projectRoot, 'office-claw-template.json'), JSON.stringify(template, null, 2));
  mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
  writeFileSync(join(projectRoot, '.office-claw', 'office-claw-catalog.json'), JSON.stringify(catalog, null, 2));
  return projectRoot;
}

function createTemplateOnlyProject(template) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'cats-route-template-'));
  tempDirs.push(projectRoot);
  writeFileSync(join(projectRoot, 'office-claw-template.json'), JSON.stringify(template, null, 2));
  return projectRoot;
}

function createMonorepoTemplateOnlyProject(template) {
  const projectRoot = createTemplateOnlyProject(template);
  writeFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  return projectRoot;
}

function loadRepoTemplate() {
  return JSON.parse(readFileSync(join(process.cwd(), '..', '..', 'office-claw-template.json'), 'utf-8'));
}

describe('cats routes read runtime catalog', { concurrency: false }, () => {
  beforeEach(() => {
    savedTemplatePath = process.env.CAT_TEMPLATE_PATH;
    savedGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
  });

  afterEach(() => {
    if (savedTemplatePath === undefined) {
      delete process.env.CAT_TEMPLATE_PATH;
    } else {
      process.env.CAT_TEMPLATE_PATH = savedTemplatePath;
    }
    if (savedGlobalRoot === undefined) {
      delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    } else {
      process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = savedGlobalRoot;
    }
  });

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('GET /api/agents returns cats from runtime catalog even when not in officeClawRegistry', async () => {
    const projectRoot = createRuntimeCatalogProject(makeCatalog('runtime-cat', '运行时猫'));
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const runtimeCat = body.agents.find((cat) => cat.id === 'runtime-cat');
    assert.ok(runtimeCat, 'runtime-cat should come from runtime catalog');
    assert.equal(runtimeCat.displayName, '运行时猫');
    assert.deepEqual(runtimeCat.mentionPatterns, ['@runtime-cat']);
  });

  it('GET /api/agents preserves variant skills from the runtime catalog', async () => {
    const catalog = makeCatalog('runtime-skill-cat', '技能猫');
    catalog.breeds[0].variants[0].skills = ['daily-briefing', 'email-manager'];
    const projectRoot = createRuntimeCatalogProject(catalog);
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const runtimeCat = body.agents.find((cat) => cat.id === 'runtime-skill-cat');
    assert.ok(runtimeCat, 'runtime-skill-cat should come from runtime catalog');
    assert.deepEqual(runtimeCat.skills, ['daily-briefing', 'email-manager']);
  });

  it('GET /api/agents annotates seed/runtime source and roster metadata', async () => {
    const templateConfig = makeVersion2Config('template-cat', '模板猫', {
      family: 'ragdoll',
      roles: ['architect', 'peer-reviewer'],
      lead: true,
      evaluation: 'seed lead',
      provider: 'anthropic',
      defaultModel: 'claude-opus-4-6',
    });
    const runtimeCatalog = {
      ...templateConfig,
      breeds: [...templateConfig.breeds, ...makeCatalog('runtime-cat', '运行时猫').breeds],
    };
    const projectRoot = createRuntimeCatalogProject(runtimeCatalog, templateConfig);
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    const seedCat = body.agents.find((cat) => cat.id === 'template-cat');
    assert.ok(seedCat, 'template-cat should be listed');
    assert.equal(seedCat.source, 'seed');
    assert.deepEqual(seedCat.roster, {
      family: 'ragdoll',
      roles: ['architect', 'peer-reviewer'],
      lead: true,
      available: true,
      evaluation: 'seed lead',
    });

    const runtimeCat = body.agents.find((cat) => cat.id === 'runtime-cat');
    assert.ok(runtimeCat, 'runtime-cat should be listed');
    assert.equal(runtimeCat.source, 'runtime');
    assert.equal(runtimeCat.roster, null);
  });

  it('GET /api/agents bootstraps the runtime catalog before the first read', async () => {
    const codexTemplate = makeCatalog('codex', 'Codex');
    const dareTemplate = makeCatalog('dare', 'Dare', 'dare', 'glm-4.7');
    const antigravityTemplate = makeCatalog('antigravity', 'Antigravity', 'antigravity', 'gemini-bridge');
    const opencodeTemplate = makeCatalog('opencode', 'OpenCode', 'opencode', 'claude-opus-4-6');
    const template = {
      version: 1,
      breeds: [
        ...codexTemplate.breeds,
        ...dareTemplate.breeds,
        ...antigravityTemplate.breeds,
        ...opencodeTemplate.breeds,
      ],
    };
    const projectRoot = createTemplateOnlyProject(template);
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(
      body.agents.map((cat) => cat.id),
      ['codex', 'dare', 'antigravity', 'opencode'],
      'first read should match the bootstrapped runtime catalog, not the raw template',
    );

    const runtimeCatalog = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'office-claw-catalog.json'), 'utf-8'));
    assert.deepEqual(
      runtimeCatalog.breeds.map((breed) => breed.agentId),
      ['codex', 'dare', 'antigravity', 'opencode'],
      'bootstrapped runtime catalog should preserve non-bootstrap and skipped seed clients before GET /api/agents responds',
    );

    await app.close();
  });

  it('GET /api/agents falls back to the readable active project root when CAT_TEMPLATE_PATH is stale', async () => {
    const projectRoot = createMonorepoTemplateOnlyProject(makeCatalog('local-template', '本地模板猫'));
    const staleRoot = mkdtempSync(join(tmpdir(), 'cats-route-catalog-stale-'));
    tempDirs.push(staleRoot);
    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    process.env.CAT_TEMPLATE_PATH = join(staleRoot, 'missing-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    try {
      await app.register(catsRoutes);

      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      const localTemplateCat = body.agents.find((cat) => cat.id === 'local-template');
      assert.ok(
        localTemplateCat,
        'GET /api/agents should read the local project template when CAT_TEMPLATE_PATH is stale',
      );
      assert.equal(localTemplateCat.source, 'seed');
      assert.equal(
        readFileSync(join(projectRoot, '.office-claw', 'office-claw-catalog.json'), 'utf-8').includes('local-template'),
        true,
      );
    } finally {
      process.chdir(previousCwd);
      await app.close();
    }
  });

  it('GET /api/agents recomputes seed accountRef from the active bootstrap binding', async () => {
    const projectRoot = createTemplateOnlyProject(loadRepoTemplate());
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    const { bootstrapCatCatalog } = await import('../dist/config/office-claw-catalog-store.js');
    const { activateProviderProfile, createProviderProfile } = await import('../dist/config/provider-profiles.js');
    bootstrapCatCatalog(projectRoot, process.env.CAT_TEMPLATE_PATH);
    const sponsorProfile = await createProviderProfile(projectRoot, {
      displayName: 'Codex Sponsor',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://api.codex-sponsor.example',
      apiKey: 'sk-codex-sponsor',
      models: ['gpt-5.4-mini'],
    });
    await activateProviderProfile(projectRoot, 'openai', sponsorProfile.id);

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const codex = body.agents.find((cat) => cat.id === 'codex');
    assert.ok(codex, 'codex should be listed');
    assert.equal(codex.source, 'seed');
    assert.equal(codex.accountRef, sponsorProfile.id);

    await app.close();
  });

  it('GET /api/agents/:id/status resolves runtime-only Antigravity cats', async () => {
    const projectRoot = createRuntimeCatalogProject(
      makeCatalog('runtime-antigravity', '运行时桥接猫', 'antigravity', 'gemini-bridge'),
    );
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({ method: 'GET', url: '/api/agents/runtime-antigravity/status' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.id, 'runtime-antigravity');
    assert.equal(body.displayName, '运行时桥接猫');
  });
});
