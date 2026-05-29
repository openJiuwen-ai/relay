/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry, createAgentId } from '@openjiuwen/relay-shared';

const { parseA2AMentions } = await import('../dist/domains/agents/services/agents/routing/a2a-mentions.js');
const { _clearRuntimeOverrides, getRuntimeOverride, setRuntimeOverride } = await import(
  '../dist/config/session-strategy-overrides.js'
);

const tempDirs = [];
let savedTemplatePath;

function resetRegistryToBuiltins() {
  officeClawRegistry.reset();
  for (const [id, config] of Object.entries(OFFICE_CLAW_CONFIGS)) {
    officeClawRegistry.register(id, config);
  }
}

function makeTemplate() {
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

function createProjectRoot() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'cats-route-crud-'));
  tempDirs.push(projectRoot);
  process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;
  writeFileSync(join(projectRoot, 'office-claw-template.json'), JSON.stringify(makeTemplate(), null, 2));
  return projectRoot;
}

function createMonorepoProjectRoot() {
  const projectRoot = createProjectRoot();
  writeFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  return projectRoot;
}

function createProjectRootFromRepoTemplate() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'cats-route-crud-seed-'));
  tempDirs.push(projectRoot);
  process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;
  const repoTemplate = JSON.parse(readFileSync(join(process.cwd(), '..', '..', 'office-claw-template.json'), 'utf-8'));
  writeFileSync(join(projectRoot, 'office-claw-template.json'), JSON.stringify(repoTemplate, null, 2));
  return projectRoot;
}

describe('cats routes runtime CRUD', { concurrency: false }, () => {
  /** @type {string | undefined} */ let savedGlobalRoot;

  beforeEach(() => {
    savedTemplatePath = process.env.CAT_TEMPLATE_PATH;
    savedGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    resetRegistryToBuiltins();
    _clearRuntimeOverrides();
  });

  afterEach(() => {
    if (savedGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = savedGlobalRoot;
    if (savedTemplatePath === undefined) {
      delete process.env.CAT_TEMPLATE_PATH;
    } else {
      process.env.CAT_TEMPLATE_PATH = savedTemplatePath;
    }
    resetRegistryToBuiltins();
    _clearRuntimeOverrides();
  });

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('POST /api/agents creates a normal runtime member and PATCH updates aliases immediately', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-spark',
        name: '火花猫',
        displayName: '火花猫',
        nickname: '小火花',
        avatar: '/avatars/spark.png',
        color: { primary: '#f97316', secondary: '#fed7aa' },
        mentionPatterns: ['@runtime-spark', '@火花猫'],
        roleDescription: '快速执行',
        personality: '利落',
        teamStrengths: '精确点改',
        caution: '不会自动跑测试',
        strengths: ['precision', 'speed'],
        sessionChain: true,
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
        contextBudget: {
          maxPromptTokens: 24000,
          maxContextTokens: 16000,
          maxMessages: 24,
          maxContentLengthPerMsg: 6000,
        },
        mcpSupport: false,
        cli: { command: 'codex', outputFormat: 'json' },
      }),
    });
    assert.equal(createRes.statusCode, 201);
    const createdBody = JSON.parse(createRes.body);
    assert.equal(createdBody.cat.id, 'runtime-spark');
    assert.equal(createdBody.cat.provider, 'openai');

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-spark',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        displayName: '运行时火花猫',
        nickname: '火花',
        mentionPatterns: ['@runtime-spark', '@运行时火花'],
        teamStrengths: '精确点改 + 快速修复',
        caution: '',
        strengths: ['precision', 'speed', 'surgical-edits'],
        sessionChain: false,
        contextBudget: {
          maxPromptTokens: 36000,
          maxContextTokens: 22000,
          maxMessages: 36,
          maxContentLengthPerMsg: 9000,
        },
      }),
    });
    assert.equal(patchRes.statusCode, 200);

    const listRes = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    const runtimeCat = listBody.cats.find((cat) => cat.id === 'runtime-spark');
    assert.ok(runtimeCat, 'runtime-spark should appear in /api/agents');
    assert.equal(runtimeCat.displayName, '运行时火花猫');
    assert.equal(runtimeCat.nickname, '火花');
    assert.deepEqual(runtimeCat.mentionPatterns, ['@runtime-spark', '@运行时火花']);
    assert.equal(runtimeCat.teamStrengths, '精确点改 + 快速修复');
    assert.equal(runtimeCat.caution, null);
    assert.deepEqual(runtimeCat.strengths, ['precision', 'speed', 'surgical-edits']);
    assert.equal(runtimeCat.sessionChain, false);
    assert.deepEqual(runtimeCat.contextBudget, {
      maxPromptTokens: 36000,
      maxContextTokens: 22000,
      maxMessages: 36,
      maxContentLengthPerMsg: 9000,
    });

    const bindProviderRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-spark',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        providerProfileId: 'codex',
      }),
    });
    assert.equal(bindProviderRes.statusCode, 200);

    const clearProviderRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-spark',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        providerProfileId: null,
      }),
    });
    assert.equal(clearProviderRes.statusCode, 400);
    assert.match(JSON.parse(clearProviderRes.body).error, /requires a provider binding/i);

    const clearBudgetRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-spark',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        contextBudget: null,
      }),
    });
    assert.equal(clearBudgetRes.statusCode, 200);

    const listAfterClearRes = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(listAfterClearRes.statusCode, 200);
    const listAfterClearBody = JSON.parse(listAfterClearRes.body);
    const runtimeCatAfterClear = listAfterClearBody.cats.find((cat) => cat.id === 'runtime-spark');
    assert.ok(runtimeCatAfterClear, 'runtime-spark should still exist');
    assert.equal(runtimeCatAfterClear.contextBudget, undefined);
    assert.equal(runtimeCatAfterClear.accountRef, 'codex');

    const mentions = parseA2AMentions('@运行时火花 请跟进这个分支', createAgentId('opus'));
    assert.ok(mentions.includes('runtime-spark'), 'new alias should route immediately');
  });

  it('POST /api/agents rejects duplicate names that collide with seed members', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const listRes = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    const seedCat = listBody.cats.find((cat) => cat.id === 'opus');
    assert.ok(seedCat, 'opus seed cat should appear in /api/agents');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-duplicate-name',
        name: seedCat.name,
        displayName: seedCat.displayName,
        nickname: 'duplicate-name',
        avatar: '/avatars/spark.png',
        color: { primary: '#f97316', secondary: '#fed7aa' },
        mentionPatterns: ['@runtime-duplicate-name'],
        roleDescription: 'duplicate name check',
        personality: 'direct',
        teamStrengths: 'validation',
        caution: '',
        strengths: ['validation'],
        sessionChain: true,
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
        contextBudget: {
          maxPromptTokens: 24000,
          maxContextTokens: 16000,
          maxMessages: 24,
          maxContentLengthPerMsg: 6000,
        },
        mcpSupport: false,
        cli: { command: 'codex', outputFormat: 'json' },
      }),
    });

    assert.equal(createRes.statusCode, 400);
    assert.match(JSON.parse(createRes.body).error, /名称 .* 已被使用/);
  });

  it('PATCH /api/agents/:id rejects duplicate names that collide with seed members', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-rename-target',
        name: 'runtime rename target',
        displayName: 'runtime rename target',
        nickname: 'rename-target',
        avatar: '/avatars/spark.png',
        color: { primary: '#f97316', secondary: '#fed7aa' },
        mentionPatterns: ['@runtime-rename-target'],
        roleDescription: 'duplicate name check',
        personality: 'direct',
        teamStrengths: 'validation',
        caution: '',
        strengths: ['validation'],
        sessionChain: true,
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
        contextBudget: {
          maxPromptTokens: 24000,
          maxContextTokens: 16000,
          maxMessages: 24,
          maxContentLengthPerMsg: 6000,
        },
        mcpSupport: false,
        cli: { command: 'codex', outputFormat: 'json' },
      }),
    });
    assert.equal(createRes.statusCode, 201);

    const listRes = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    const seedCat = listBody.cats.find((cat) => cat.id === 'opus');
    assert.ok(seedCat, 'opus seed cat should appear in /api/agents');

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-rename-target',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        name: seedCat.name,
        displayName: seedCat.displayName,
      }),
    });

    assert.equal(patchRes.statusCode, 400);
    assert.match(JSON.parse(patchRes.body).error, /名称 .* 已被使用/);
  });

  it('POST /api/agents falls back to the readable active project root when CAT_TEMPLATE_PATH is stale', async () => {
    const projectRoot = createMonorepoProjectRoot();
    const staleRoot = mkdtempSync(join(tmpdir(), 'cats-route-crud-stale-'));
    tempDirs.push(staleRoot);
    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    process.env.CAT_TEMPLATE_PATH = join(staleRoot, 'missing-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    try {
      await app.register(catsRoutes);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/agents',
        headers: {
          'content-type': 'application/json',
          'x-office-claw-user': 'codex',
        },
        body: JSON.stringify({
          agentId: 'runtime-fallback',
          name: '回退猫',
          displayName: '回退猫',
          avatar: '/avatars/fallback.png',
          color: { primary: '#2563eb', secondary: '#bfdbfe' },
          mentionPatterns: ['@runtime-fallback'],
          roleDescription: '验证 project root fallback',
          client: 'openai',
          accountRef: 'codex',
          defaultModel: 'gpt-5.4',
        }),
      });

      assert.equal(createRes.statusCode, 201);
      assert.equal(existsSync(join(projectRoot, '.office-claw', 'office-claw-catalog.json')), true);
      assert.equal(existsSync(join(staleRoot, '.office-claw', 'office-claw-catalog.json')), false);
    } finally {
      process.chdir(previousCwd);
      await app.close();
    }
  });

  it('POST /api/agents creates Antigravity members without requiring provider selection', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-antigravity',
        name: '运行时桥接猫',
        displayName: '运行时桥接猫',
        avatar: '/avatars/antigravity.png',
        color: { primary: '#0f766e', secondary: '#99f6e4' },
        mentionPatterns: ['@runtime-antigravity'],
        roleDescription: '桥接通道',
        personality: '稳定',
        client: 'antigravity',
        defaultModel: 'gemini-bridge',
        commandArgs: ['chat', '--mode', 'agent'],
      }),
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.cat.id, 'runtime-antigravity');
    assert.equal(body.cat.provider, 'antigravity');
    assert.equal(body.cat.defaultModel, 'gemini-bridge');

    const statusRes = await app.inject({ method: 'GET', url: '/api/agents/runtime-antigravity/status' });
    assert.equal(statusRes.statusCode, 200);
    const statusBody = JSON.parse(statusRes.body);
    assert.equal(statusBody.id, 'runtime-antigravity');
  });

  it('PATCH /api/agents/:id allows clearing antigravity commandArgs with an empty array', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-antigravity-clear',
        name: '运行时桥接猫',
        displayName: '运行时桥接猫',
        avatar: '/avatars/antigravity.png',
        color: { primary: '#0f766e', secondary: '#99f6e4' },
        mentionPatterns: ['@runtime-antigravity-clear'],
        roleDescription: '桥接通道',
        personality: '稳定',
        client: 'antigravity',
        defaultModel: 'gemini-bridge',
        commandArgs: ['chat', '--mode', 'agent'],
      }),
    });
    assert.equal(createRes.statusCode, 201);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-antigravity-clear',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        commandArgs: [],
      }),
    });
    assert.equal(patchRes.statusCode, 200);
    const patchBody = JSON.parse(patchRes.body);
    assert.equal(patchBody.cat.commandArgs, undefined);
  });

  it('POST /api/agents defaults mcpSupport=true for Codex/Gemini clients when omitted', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    for (const spec of [
      { agentId: 'runtime-openai', client: 'openai', accountRef: 'codex', model: 'gpt-5.4' },
      { agentId: 'runtime-gemini', client: 'google', accountRef: 'gemini', model: 'gemini-2.5-pro' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents',
        headers: {
          'content-type': 'application/json',
          'x-office-claw-user': 'codex',
        },
        body: JSON.stringify({
          agentId: spec.agentId,
          name: `${spec.agentId}-name`,
          displayName: `${spec.agentId}-display`,
          avatar: '/avatars/runtime.png',
          color: { primary: '#334155', secondary: '#cbd5e1' },
          mentionPatterns: [`@${spec.agentId}`],
          roleDescription: 'runtime',
          client: spec.client,
          accountRef: spec.accountRef,
          defaultModel: spec.model,
        }),
      });

      assert.equal(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.equal(body.cat.id, spec.agentId);
      assert.equal(body.cat.mcpSupport, true);
    }
  });

  it('PATCH /api/agents/:id rejects provider bindings that do not resolve to an existing account', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-codex',
        name: '运行时Codex',
        displayName: '运行时Codex',
        avatar: '/avatars/codex.png',
        color: { primary: '#16a34a', secondary: '#bbf7d0' },
        mentionPatterns: ['@runtime-codex'],
        roleDescription: '审查',
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
      }),
    });
    assert.equal(createRes.statusCode, 201);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-codex',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        providerProfileId: 'claude-oauth',
      }),
    });
    assert.equal(patchRes.statusCode, 400);
    const patchBody = JSON.parse(patchRes.body);
    assert.match(patchBody.error, /provider "claude-oauth" not found/i);
  });

  it('POST /api/agents allows api_key bindings with different protocol than client default', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const crossProtocolProfile = await createProviderProfile(projectRoot, {
      displayName: 'OpenAI Key Profile',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://api.bound.example',
      apiKey: 'sk-bound-openai',
      models: ['openai/claude-sonnet-4-6'],
    });

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-opencode-crossproto',
        name: '运行时OpenCode',
        displayName: '运行时OpenCode',
        avatar: '/avatars/opencode.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@runtime-opencode-crossproto'],
        roleDescription: '审查',
        client: 'opencode',
        providerProfileId: crossProtocolProfile.id,
        defaultModel: 'openai/claude-sonnet-4-6',
        ocProviderName: 'openai',
      }),
    });

    assert.equal(createRes.statusCode, 201, 'cross-protocol api_key binding should be allowed');
  });

  it('POST /api/agents opencode+api_key always requires ocProviderName', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const openaiProfile = await createProviderProfile(projectRoot, {
      displayName: 'OpenAI Key Profile',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://api.bound.example',
      apiKey: 'sk-bound-openai',
      models: ['gpt-5.4'],
    });

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    // Case 1: bare model WITHOUT ocProviderName → 400
    const bareReject = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { 'content-type': 'application/json', 'x-office-claw-user': 'codex' },
      body: JSON.stringify({
        agentId: 'oc-bare-no-provider',
        name: 'OpenCodeA',
        displayName: 'OpenCodeA',
        avatar: '/avatars/opencode.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@oc-bare-no-provider'],
        roleDescription: '审查',
        client: 'opencode',
        providerProfileId: openaiProfile.id,
        defaultModel: 'gpt-5.4',
      }),
    });
    assert.equal(bareReject.statusCode, 400, 'bare model without ocProviderName → 400');
    assert.match(JSON.parse(bareReject.body).error, /provider/i);

    // Case 2: provider/model format WITHOUT ocProviderName → 400 (Path B eliminated)
    const slashReject = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { 'content-type': 'application/json', 'x-office-claw-user': 'codex' },
      body: JSON.stringify({
        agentId: 'oc-slash-no-provider',
        name: 'OpenCodeB',
        displayName: 'OpenCodeB',
        avatar: '/avatars/opencode.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@oc-slash-no-provider'],
        roleDescription: '审查',
        client: 'opencode',
        providerProfileId: openaiProfile.id,
        defaultModel: 'openai/gpt-5.4',
      }),
    });
    assert.equal(slashReject.statusCode, 400, 'provider/model without ocProviderName → 400');
    assert.match(JSON.parse(slashReject.body).error, /provider/i);

    // Case 3: bare model WITH ocProviderName → 201
    const bareAccept = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { 'content-type': 'application/json', 'x-office-claw-user': 'codex' },
      body: JSON.stringify({
        agentId: 'oc-bare-with-provider',
        name: 'OpenCodeC',
        displayName: 'OpenCodeC',
        avatar: '/avatars/opencode.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@oc-bare-with-provider'],
        roleDescription: '审查',
        client: 'opencode',
        providerProfileId: openaiProfile.id,
        defaultModel: 'gpt-5.4',
        ocProviderName: 'openai',
      }),
    });
    assert.equal(bareAccept.statusCode, 201, 'bare model + ocProviderName → 201');
  });

  it('PATCH /api/agents/:id saves embedded Agent Teams executable override for the seed member', async () => {
    const projectRoot = createProjectRootFromRepoTemplate();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    mkdirSync(join(projectRoot, 'vendor', 'relay-teams'), { recursive: true });
    writeFileSync(join(projectRoot, 'vendor', 'relay-teams', 'relay-teams.exe'), '', 'utf8');

    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const openAiProfile = await createProviderProfile(projectRoot, {
      provider: 'openai',
      name: 'codex-sponsor',
      mode: 'api_key',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://api.bound.example/v1',
      apiKey: 'sk-bound-openai',
      models: ['gpt-5.4'],
      setActive: false,
    });

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agentteams',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        accountRef: openAiProfile.id,
        defaultModel: 'gpt-5.4',
        embeddedAcpExecutablePath: 'vendor/relay-teams/relay-teams.exe',
        embeddedAcpConfig: {
          executablePath: 'vendor/relay-teams/relay-teams.exe',
          args: ['--trace', 'gateway', 'acp', 'stdio'],
          cwd: 'vendor/relay-teams',
          env: {
            ACP_TRACE_STDIO: '1',
            RELAY_TEAMS_LOG_LEVEL: 'debug',
          },
        },
      }),
    });

    assert.equal(patchRes.statusCode, 200);
    const patchBody = JSON.parse(patchRes.body);
    assert.equal(patchBody.cat.id, 'agentteams');
    assert.equal(patchBody.cat.accountRef, openAiProfile.id);
    assert.equal(patchBody.cat.embeddedAcpExecutablePath, 'vendor/relay-teams/relay-teams.exe');
    assert.deepEqual(patchBody.cat.embeddedAcpConfig, {
      executablePath: 'vendor/relay-teams/relay-teams.exe',
      args: ['--trace', 'gateway', 'acp', 'stdio'],
      cwd: 'vendor/relay-teams',
      env: {
        ACP_TRACE_STDIO: '1',
        RELAY_TEAMS_LOG_LEVEL: 'debug',
      },
    });

    const listRes = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    const agentTeams = listBody.cats.find((cat) => cat.id === 'agentteams');
    assert.ok(agentTeams, 'agentteams should appear in /api/agents');
    assert.equal(agentTeams.embeddedAcpExecutablePath, 'vendor/relay-teams/relay-teams.exe');
    assert.deepEqual(agentTeams.embeddedAcpConfig, {
      executablePath: 'vendor/relay-teams/relay-teams.exe',
      args: ['--trace', 'gateway', 'acp', 'stdio'],
      cwd: 'vendor/relay-teams',
      env: {
        ACP_TRACE_STDIO: '1',
        RELAY_TEAMS_LOG_LEVEL: 'debug',
      },
    });
  });

  it('PATCH /api/agents/:id accepts model.json bindings for the embedded Agent Teams seed member', async () => {
    const projectRoot = createProjectRootFromRepoTemplate();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    mkdirSync(join(projectRoot, 'tools', 'python'), { recursive: true });
    writeFileSync(join(projectRoot, 'tools', 'python', 'python.exe'), '', 'utf8');
    mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.office-claw', 'model.json'),
      `${JSON.stringify({ 'huawei-maas': [{ id: 'glm-5' }, { id: 'qwen3-32b' }] }, null, 2)}\n`,
      'utf8',
    );

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agentteams',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        client: 'relayclaw',
        accountRef: 'huawei-maas',
        defaultModel: 'glm-5',
      }),
    });

    assert.equal(patchRes.statusCode, 200);
    const patchBody = JSON.parse(patchRes.body);
    assert.equal(patchBody.cat.id, 'agentteams');
    assert.equal(patchBody.cat.accountRef, 'huawei-maas');
    assert.equal(patchBody.cat.defaultModel, 'glm-5');

    const listRes = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    const agentTeams = listBody.cats.find((cat) => cat.id === 'agentteams');
    assert.ok(agentTeams, 'agentteams should appear in /api/agents');
    assert.equal(agentTeams.accountRef, 'huawei-maas');
    assert.equal(agentTeams.defaultModel, 'glm-5');
  });

  it('POST /api/agents rejects agentId values that are not lowercase-safe identifiers', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: '__proto__',
        name: '危险 ID',
        displayName: '危险 ID',
        avatar: '/avatars/runtime.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@danger'],
        roleDescription: '审查',
        client: 'openai',
        providerProfileId: 'codex',
        defaultModel: 'gpt-5.4',
      }),
    });

    assert.equal(createRes.statusCode, 400);
    const createBody = JSON.parse(createRes.body);
    assert.equal(createBody.error, 'Invalid request');
    assert.ok(
      createBody.details.some(
        (issue) =>
          Array.isArray(issue.path) &&
          issue.path.includes('agentId') &&
          /agentId must use lowercase letters/i.test(String(issue.message)),
      ),
      'expected agentId validation issue in details',
    );
  });

  it('POST /api/agents rejects builtin bindings from the wrong client family even when protocol matches', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const cases = [
      {
        agentId: 'runtime-dare-wrong-builtin',
        client: 'dare',
        providerProfileId: 'codex',
        defaultModel: 'gpt-5.4',
      },
      {
        agentId: 'runtime-opencode-wrong-builtin',
        client: 'opencode',
        providerProfileId: 'claude',
        defaultModel: 'claude-sonnet-4-6',
      },
    ];

    for (const spec of cases) {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/agents',
        headers: {
          'content-type': 'application/json',
          'x-office-claw-user': 'codex',
        },
        body: JSON.stringify({
          agentId: spec.agentId,
          name: spec.agentId,
          displayName: spec.agentId,
          avatar: '/avatars/runtime.png',
          color: { primary: '#0f172a', secondary: '#e2e8f0' },
          mentionPatterns: [`@${spec.agentId}`],
          roleDescription: '审查',
          client: spec.client,
          providerProfileId: spec.providerProfileId,
          defaultModel: spec.defaultModel,
        }),
      });

      assert.equal(createRes.statusCode, 400);
      const createBody = JSON.parse(createRes.body);
      assert.match(createBody.error, new RegExp(`incompatible with client "${spec.client}"`, 'i'));
    }
  });

  it('POST /api/agents rejects non-builtin provider bindings for google client', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const apiKeyProfile = await createProviderProfile(projectRoot, {
      displayName: 'Gemini Proxy',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://proxy.example/openrouter',
      apiKey: 'sk-openrouter-proxy',
      models: ['openrouter/google/gemini-3-flash-preview'],
    });

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-gemini-non-builtin',
        name: 'runtime-gemini-non-builtin',
        displayName: 'runtime-gemini-non-builtin',
        avatar: '/avatars/runtime.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@runtime-gemini-non-builtin'],
        roleDescription: '审查',
        client: 'google',
        providerProfileId: apiKeyProfile.id,
        defaultModel: 'openrouter/google/gemini-3-flash-preview',
      }),
    });

    assert.equal(createRes.statusCode, 400);
    const createBody = JSON.parse(createRes.body);
    assert.match(createBody.error, /only supports builtin Gemini auth/i);
  });

  it('POST /api/agents allows jiuwen with openai-compatible api_key profiles and rejects oauth bindings', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const openaiProfile = await createProviderProfile(projectRoot, {
      displayName: 'Codex Sponsor',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://api.codex-sponsor.example',
      apiKey: 'sk-codex-sponsor',
      models: ['gpt-5.4'],
    });

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const okRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-jiuwenclaw',
        name: '九问爪猫',
        displayName: '九问爪猫',
        avatar: '/avatars/runtime.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@runtime-jiuwenclaw'],
        roleDescription: '审查',
        client: 'relayclaw',
        providerProfileId: openaiProfile.id,
        defaultModel: 'gpt-5.4',
      }),
    });

    assert.equal(okRes.statusCode, 201);
    assert.equal(JSON.parse(okRes.body).cat.provider, 'relayclaw');

    const rejectRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-jiuwenclaw-oauth',
        name: '九问爪猫 OAuth',
        displayName: '九问爪猫 OAuth',
        avatar: '/avatars/runtime.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@runtime-jiuwenclaw-oauth'],
        roleDescription: '审查',
        client: 'relayclaw',
        providerProfileId: 'codex',
        defaultModel: 'gpt-5.4',
      }),
    });

    assert.equal(rejectRes.statusCode, 400);
    assert.match(JSON.parse(rejectRes.body).error, /client "jiuwen" requires an API key provider profile/i);
  });

  it('POST /api/agents allows dare and relayclaw to bind custom sources from ~/.office-claw/model.json', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');
    mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.office-claw', 'model.json'),
      `${JSON.stringify(
        {
          'my-openai-proxy': {
            protocol: 'openai',
            displayName: 'My OpenAI Proxy',
            baseUrl: 'https://proxy.example.com/v1',
            apiKey: 'sk-proxy',
            headers: { 'X-App-Id': 'office-claw' },
            models: [{ id: 'glm-5' }, { id: 'gpt-4o-mini' }],
          },
        },
        null,
        2,
      )}\n`,
    );

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const dareRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-dare-proxy',
        name: '办公室猫',
        displayName: '办公室猫',
        avatar: '/avatars/runtime.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@runtime-dare-proxy'],
        roleDescription: '执行',
        client: 'dare',
        providerProfileId: 'my-openai-proxy',
        defaultModel: 'glm-5',
      }),
    });

    assert.equal(dareRes.statusCode, 201);
    assert.equal(JSON.parse(dareRes.body).cat.accountRef, 'my-openai-proxy');

    const relayclawRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-relayclaw-proxy',
        name: '助理猫',
        displayName: '助理猫',
        avatar: '/avatars/runtime.png',
        color: { primary: '#0f172a', secondary: '#e2e8f0' },
        mentionPatterns: ['@runtime-relayclaw-proxy'],
        roleDescription: '执行',
        client: 'relayclaw',
        providerProfileId: 'my-openai-proxy',
        defaultModel: 'gpt-4o-mini',
      }),
    });

    assert.equal(relayclawRes.statusCode, 201);
    assert.equal(JSON.parse(relayclawRes.body).cat.accountRef, 'my-openai-proxy');
  });

  it('PATCH /api/agents/:id rejects models that are not available on the bound provider profile', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const boundProfile = await createProviderProfile(projectRoot, {
      displayName: 'Scoped OpenAI Profile',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://api.scoped.example',
      apiKey: 'sk-scoped-openai',
      models: ['gpt-5.4-mini'],
    });

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-codex-scoped-profile',
        name: '运行时Codex',
        displayName: '运行时Codex',
        avatar: '/avatars/codex.png',
        color: { primary: '#16a34a', secondary: '#bbf7d0' },
        mentionPatterns: ['@runtime-codex-scoped-profile'],
        roleDescription: '审查',
        client: 'openai',
        providerProfileId: boundProfile.id,
        defaultModel: 'gpt-5.4-mini',
      }),
    });
    assert.equal(createRes.statusCode, 201);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-codex-scoped-profile',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        defaultModel: 'gpt-5.4',
      }),
    });

    assert.equal(patchRes.statusCode, 400);
    const patchBody = JSON.parse(patchRes.body);
    assert.match(patchBody.error, /model "gpt-5\.4" is not available on provider "scoped-openai-profile"/i);
  });

  it('PATCH /api/agents/:id validates seed model edits against the active bootstrap account', async () => {
    const projectRoot = createProjectRootFromRepoTemplate();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

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

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/codex',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        defaultModel: 'gpt-5.4-mini',
      }),
    });

    assert.equal(patchRes.statusCode, 200);
    const patchBody = JSON.parse(patchRes.body);
    assert.equal(patchBody.cat.defaultModel, 'gpt-5.4-mini');
    assert.equal(patchBody.cat.accountRef, sponsorProfile.id);
  });

  it('PATCH /api/agents/:id allows non-provider edits for unbound opencode seed member', async () => {
    if (savedTemplatePath === undefined) {
      delete process.env.CAT_TEMPLATE_PATH;
    } else {
      process.env.CAT_TEMPLATE_PATH = savedTemplatePath;
    }

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');
    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/agents/opencode',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        nickname: 'OpenCode审计版',
      }),
    });
    assert.equal(res.statusCode, 200);
  });

  it('PATCH /api/agents/:id returns 400 when runtime catalog validation rejects the update', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-review-bot',
        name: '运行时审查猫',
        displayName: '运行时审查猫',
        avatar: '/avatars/review.png',
        color: { primary: '#334155', secondary: '#cbd5e1' },
        mentionPatterns: ['@runtime-review-bot'],
        roleDescription: '审查',
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
      }),
    });
    assert.equal(createRes.statusCode, 201);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/runtime-review-bot',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        mentionPatterns: ['@runtime-review-bot', '@opus'],
      }),
    });
    assert.equal(patchRes.statusCode, 400);
    const patchBody = JSON.parse(patchRes.body);
    assert.match(patchBody.error, /@opus.*opus/i);
  });

  it('POST /api/agents still requires a concrete provider binding for dare and opencode clients', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-dare',
        name: '运行时审计猫',
        displayName: '运行时审计猫',
        avatar: '/avatars/dare.png',
        color: { primary: '#0f172a', secondary: '#cbd5e1' },
        mentionPatterns: ['@runtime-dare'],
        roleDescription: '审计',
        client: 'dare',
        defaultModel: 'dare-1',
      }),
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.error, /requires a provider binding/i);
  });

  it('PATCH /api/agents/:id persists roster availability toggles for existing members', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const disableRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/opus',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        available: false,
      }),
    });

    assert.equal(disableRes.statusCode, 200);
    const disableBody = JSON.parse(disableRes.body);
    assert.equal(disableBody.cat.roster.available, false);

    const enableRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/opus',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        available: true,
      }),
    });

    assert.equal(enableRes.statusCode, 200);
    const enableBody = JSON.parse(enableRes.body);
    assert.equal(enableBody.cat.roster.available, true);
  });

  it('DELETE /api/agents/:id removes runtime session-strategy override for deleted cat', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-strategy-cat',
        name: '策略猫',
        displayName: '策略猫',
        avatar: '/avatars/strategy.png',
        color: { primary: '#155e75', secondary: '#a5f3fc' },
        mentionPatterns: ['@runtime-strategy-cat'],
        roleDescription: '策略验证',
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
      }),
    });
    assert.equal(createRes.statusCode, 201);

    await setRuntimeOverride('runtime-strategy-cat', {
      strategy: 'compress',
      thresholds: { warn: 0.55, action: 0.8 },
    });
    assert.ok(getRuntimeOverride('runtime-strategy-cat'));

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/agents/runtime-strategy-cat',
      headers: { 'x-office-claw-user': 'codex' },
    });
    assert.equal(deleteRes.statusCode, 200);
    assert.equal(getRuntimeOverride('runtime-strategy-cat'), undefined);
  });

  it('DELETE /api/agents/:id removes runtime members from subsequent reads', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'codex',
      },
      body: JSON.stringify({
        agentId: 'runtime-temp',
        name: '临时猫',
        displayName: '临时猫',
        avatar: '/avatars/temp.png',
        color: { primary: '#64748b', secondary: '#cbd5e1' },
        mentionPatterns: ['@runtime-temp'],
        roleDescription: '临时成员',
        personality: '临时',
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
        mcpSupport: false,
        cli: { command: 'codex', outputFormat: 'json' },
      }),
    });
    assert.equal(createRes.statusCode, 201);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/agents/runtime-temp',
      headers: {
        'x-office-claw-user': 'codex',
      },
    });
    assert.equal(deleteRes.statusCode, 200);

    const listRes = await app.inject({ method: 'GET', url: '/api/agents' });
    const listBody = JSON.parse(listRes.body);
    assert.equal(
      listBody.cats.some((cat) => cat.id === 'runtime-temp'),
      false,
    );
  });

  it('DELETE /api/agents/:id blocks deletion for seed members', async () => {
    const projectRoot = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');

    const Fastify = (await import('fastify')).default;
    const { catsRoutes } = await import('../dist/routes/agents.js');

    const app = Fastify();
    await app.register(catsRoutes);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/agents/opus',
      headers: {
        'x-office-claw-user': 'codex',
      },
    });
    assert.equal(deleteRes.statusCode, 409);
    const deleteBody = JSON.parse(deleteRes.body);
    assert.match(deleteBody.error, /cannot delete seed cat/i);

    const listRes = await app.inject({ method: 'GET', url: '/api/agents' });
    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    assert.equal(
      listBody.cats.some((cat) => cat.id === 'opus'),
      true,
    );
  });
});
