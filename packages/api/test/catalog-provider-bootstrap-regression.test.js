/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import Fastify from 'fastify';
import { createOfficeClawServer } from '../dist/server.js';

const tempDirs = [];

function createProjectRoot() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'catalog-bootstrap-reg-'));
  tempDirs.push(projectRoot);
  writeFileSync(
    join(projectRoot, 'office-claw-template.json'),
    JSON.stringify(
      {
        version: 1,
        breeds: [
          {
            id: 'codex-breed',
            agentId: 'codex',
            name: 'Codex',
            displayName: 'Codex',
            avatar: '/avatars/codex.png',
            color: { primary: '#111827', secondary: '#d1d5db' },
            mentionPatterns: ['@codex'],
            roleDescription: 'reviewer',
            defaultVariantId: 'codex-default',
            variants: [
              {
                id: 'codex-default',
                provider: 'openai',
                defaultModel: 'gpt-5.4',
                mcpSupport: false,
                cli: { command: 'codex', outputFormat: 'json' },
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
  return projectRoot;
}

test.after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createOfficeClawServer starts with a non-no-auth provider without bootstrap identity crash', async () => {
  const projectRoot = createProjectRoot();
  const fixtureModuleUrl = pathToFileURL(resolve(process.cwd(), 'test', 'fixtures', 'custom-auth-provider.mjs')).href;
  const prevAuthProvider = process.env.OFFICE_CLAW_AUTH_PROVIDER;
  const prevAuthModules = process.env.OFFICE_CLAW_AUTH_PROVIDER_MODULES;
  const prevPort = process.env.API_SERVER_PORT;
  const prevHost = process.env.API_SERVER_HOST;

  process.env.OFFICE_CLAW_AUTH_PROVIDER = 'external-sso';
  process.env.OFFICE_CLAW_AUTH_PROVIDER_MODULES = fixtureModuleUrl;

  const server = await createOfficeClawServer({
    port: 3324,
    host: '127.0.0.1',
    memoryStore: true,
    projectRoot,
  });

  try {
    const url = await server.start();
    assert.match(url, /^http:\/\/127\.0\.0\.1:3324$/);
  } finally {
    await server.close();
    if (prevAuthProvider === undefined) delete process.env.OFFICE_CLAW_AUTH_PROVIDER;
    else process.env.OFFICE_CLAW_AUTH_PROVIDER = prevAuthProvider;
    if (prevAuthModules === undefined) delete process.env.OFFICE_CLAW_AUTH_PROVIDER_MODULES;
    else process.env.OFFICE_CLAW_AUTH_PROVIDER_MODULES = prevAuthModules;
    if (prevPort === undefined) delete process.env.API_SERVER_PORT;
    else process.env.API_SERVER_PORT = prevPort;
    if (prevHost === undefined) delete process.env.API_SERVER_HOST;
    else process.env.API_SERVER_HOST = prevHost;
  }
});

test('GET /api/agents/:id/status returns 401 when catalog identity is missing', async () => {
  const projectRoot = createProjectRoot();
  const prevTemplatePath = process.env.CAT_TEMPLATE_PATH;
  const prevConfigRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;

  process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');
  process.env.OFFICE_CLAW_CONFIG_ROOT = projectRoot;

  const { catsRoutes } = await import('../dist/routes/agents.js');
  const app = Fastify();

  try {
    await app.register(catsRoutes);
    const res = await app.inject({ method: 'GET', url: '/api/agents/codex/status' });
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error, 'Authentication required');
  } finally {
    await app.close();
    if (prevTemplatePath === undefined) delete process.env.CAT_TEMPLATE_PATH;
    else process.env.CAT_TEMPLATE_PATH = prevTemplatePath;
    if (prevConfigRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = prevConfigRoot;
  }
});
