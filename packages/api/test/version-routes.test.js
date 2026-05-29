/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { versionRoutes } from '../dist/routes/version.js';

function createTempProjectRoot() {
  return mkdtempSync(join(tmpdir(), 'office-claw-version-'));
}

async function buildApp(projectRoot) {
  const app = Fastify();
  await versionRoutes(app, { projectRoot });
  await app.ready();
  return app;
}

describe('versionRoutes current version fallback order', () => {
  const tempDirs = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  it('falls back to .office-claw-release.json when package.json is missing', async () => {
    const projectRoot = createTempProjectRoot();
    tempDirs.push(projectRoot);
    writeFileSync(join(projectRoot, '.office-claw-release.json'), JSON.stringify({ version: '3.4.5' }), 'utf8');

    const app = await buildApp(projectRoot);
    const response = await app.inject({ method: 'GET', url: '/api/lastversion' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().curversion, '3.4.5');

    await app.close();
  });
});
