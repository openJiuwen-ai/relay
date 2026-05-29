/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';

const tempDirs = [];

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
        id: 'maine-coon',
        agentId: 'codex',
        name: 'Codex',
        displayName: 'Codex',
        avatar: '/avatars/codex.png',
        color: { primary: '#E8913A', secondary: '#FFF0DD' },
        mentionPatterns: ['@codex', '@assistant'],
        roleDescription: '测试用种子成员',
        defaultVariantId: 'codex-default',
        variants: [
          {
            id: 'codex-default',
            provider: 'openai',
            defaultModel: 'gpt-5.4',
            mcpSupport: true,
            cli: { command: 'codex', outputFormat: 'json' },
          },
        ],
      },
    ],
    roster: {
      codex: {
        family: 'maine-coon',
        roles: ['assistant'],
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
  const projectRoot = mkdtempSync(join(tmpdir(), 'catalog-provider-extend-e2e-'));
  tempDirs.push(projectRoot);
  process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;
  const templatePath = join(projectRoot, 'office-claw-template.json');
  writeFileSync(templatePath, JSON.stringify(makeTemplate(), null, 2));
  writeFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  return { projectRoot, templatePath };
}

function createCloudCatalogProvider() {
  let catalog = null;
  const events = [];
  return {
    events,
    provider: {
      id: 'cloud-e2e',
      displayName: 'Cloud E2E',
      async readCatalog(identity) {
        events.push({ type: 'readCatalog', identity });
        if (!catalog) {
          throw new Error('catalog not initialized');
        }
        return { catalog };
      },
      async writeCatalog(identity, nextCatalog) {
        events.push({ type: 'writeCatalog', identity, catalog: nextCatalog });
        catalog = structuredClone(nextCatalog);
      },
      async getMember(identity, agentId) {
        events.push({ type: 'getMember', identity, agentId });
        if (!catalog) return null;
        const { toAllAgentConfigs } = await import('../dist/config/office-claw-config-loader.js');
        const config = toAllAgentConfigs(catalog)[agentId];
        if (!config) return null;
        return {
          agentId,
          config,
          extend: config.extend ? structuredClone(config.extend) : undefined,
        };
      },
      async listRoutableMembers(identity) {
        events.push({ type: 'listRoutableMembers', identity });
        if (!catalog) return [];
        const { toAllAgentConfigs } = await import('../dist/config/office-claw-config-loader.js');
        return Object.entries(toAllAgentConfigs(catalog)).map(([agentId, config]) => ({
          agentId,
          config,
          extend: config.extend ? structuredClone(config.extend) : undefined,
        }));
      },
    },
  };
}

async function collect(iterable) {
  const msgs = [];
  for await (const msg of iterable) msgs.push(msg);
  return msgs;
}

describe('CatalogProvider extend E2E', { concurrency: false }, () => {
  let savedTemplatePath;
  let savedGlobalRoot;

  beforeEach(() => {
    savedTemplatePath = process.env.CAT_TEMPLATE_PATH;
    savedGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    resetRegistryToBuiltins();
  });

  afterEach(() => {
    if (savedGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = savedGlobalRoot;
    if (savedTemplatePath === undefined) delete process.env.CAT_TEMPLATE_PATH;
    else process.env.CAT_TEMPLATE_PATH = savedTemplatePath;
    resetRegistryToBuiltins();
  });

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates an agent with extend JSON and passes it through provider getMember into invoke options', async () => {
    const { templatePath } = createProjectRoot();
    process.env.CAT_TEMPLATE_PATH = templatePath;

    const { loadAgentConfig } = await import('../dist/config/office-claw-config-loader.js');
    const { catsRoutes } = await import('../dist/routes/agents.js');
    const { invokeSingleCat } = await import('../dist/domains/agents/services/agents/invocation/invoke-single-cat.js');

    const { provider, events } = createCloudCatalogProvider();
    const initialCatalog = loadAgentConfig(templatePath);
    await provider.writeCatalog({ userId: 'seed-user' }, initialCatalog);

    const app = Fastify();
    app.decorateRequest('authenticatedUserId', null);
    app.addHook('preHandler', async (request) => {
      const headerUserId = request.headers['x-office-claw-user'];
      if (typeof headerUserId === 'string' && headerUserId.trim().length > 0) {
        request.authenticatedUserId = headerUserId.trim();
      }
    });
    await app.register(catsRoutes, {
      catalogProvider: provider,
    });

    const extend = {
      tenantId: 'tenant-001',
      bot: { appId: 'bot-app-9', scene: 'qa' },
      flags: ['cloud', 'e2e'],
    };

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'alice',
      },
      body: JSON.stringify({
        agentId: 'runtime-cloud-bot',
        name: 'Cloud Bot',
        displayName: 'Cloud Bot',
        nickname: 'Cloudy',
        avatar: '/avatars/cloud-bot.png',
        color: { primary: '#2563eb', secondary: '#bfdbfe' },
        mentionPatterns: ['@runtime-cloud-bot', '@cloud-bot'],
        roleDescription: '验证 extend 透传',
        personality: '严谨',
        teamStrengths: '透传验证',
        strengths: ['routing'],
        sessionChain: true,
        client: 'openai',
        accountRef: 'codex',
        defaultModel: 'gpt-5.4',
        mcpSupport: false,
        cli: { command: 'codex', outputFormat: 'json' },
        extend,
      }),
    });

    assert.equal(createRes.statusCode, 201);
    const createdBody = JSON.parse(createRes.body);
    assert.deepEqual(createdBody.cat.extend, extend);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: {
        'x-office-claw-user': 'alice',
      },
    });
    assert.equal(listRes.statusCode, 200);
    const listed = JSON.parse(listRes.body).cats.find((cat) => cat.id === 'runtime-cloud-bot');
    assert.ok(listed, 'created agent should be visible in GET /api/agents');
    assert.deepEqual(listed.extend, extend);

    const optionsSeen = [];
    const service = {
      async *invoke(_prompt, options) {
        optionsSeen.push(options ?? {});
        yield { type: 'done', agentId: 'runtime-cloud-bot', timestamp: Date.now() };
      },
    };

    const deps = {
      registry: {
        create: () => ({ invocationId: 'inv-e2e-1', callbackToken: 'tok-e2e-1' }),
        verify: () => null,
      },
      sessionManager: {
        get: async () => undefined,
        getOrCreate: async () => ({}),
        store: async () => {},
        delete: async () => {},
        resolveWorkingDirectory: () => undefined,
      },
      catalogProvider: provider,
      threadStore: null,
      apiUrl: 'http://127.0.0.1:3004',
    };

    const messages = await collect(
      invokeSingleCat(deps, {
        agentId: 'runtime-cloud-bot',
        service,
        prompt: 'ping',
        userId: 'alice',
        threadId: 'thread-cloud-e2e',
        isLastCat: true,
        gatewayIdentity: { userId: 'alice' },
      }),
    );

    assert.ok(messages.some((msg) => msg.type === 'done'));
    assert.equal(optionsSeen.length, 1);
    assert.deepEqual(optionsSeen[0].gatewayIdentity, { userId: 'alice' });
    assert.deepEqual(optionsSeen[0].memberExtend, extend);

    const getMemberEvent = events.findLast((event) => event.type === 'getMember');
    assert.ok(getMemberEvent, 'provider getMember should be called during invoke');
    assert.deepEqual(getMemberEvent.identity, { userId: 'alice' });

    await app.close();
  });
});
