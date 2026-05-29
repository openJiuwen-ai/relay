/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeTmpDir(prefix) {
  return mkdtemp(join(homedir(), `.office-claw-acp-model-profile-${prefix}-`));
}

describe('acp model profile store', () => {
  it('readAcpModelProfiles does not rewrite already-normalized files', async () => {
    const { createAcpModelProfile, readAcpModelProfiles } = await import('../dist/config/acp-model-profiles.js');
    const projectRoot = await makeTmpDir('clean-read');
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      await createAcpModelProfile(projectRoot, {
        displayName: 'Gateway Default',
        provider: 'openai_compatible',
        model: 'gpt-4.1',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      });

      const metaPath = join(projectRoot, '.office-claw', 'acp-model-profiles.json');
      const secretsPath = join(projectRoot, '.office-claw', 'acp-model-profiles.secrets.local.json');
      const before = await Promise.all([stat(metaPath), stat(secretsPath)]);

      await sleep(25);
      await readAcpModelProfiles(projectRoot);

      const after = await Promise.all([stat(metaPath), stat(secretsPath)]);
      assert.equal(after[0].mtimeMs, before[0].mtimeMs);
      assert.equal(after[1].mtimeMs, before[1].mtimeMs);
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('readAcpModelProfiles rewrites files once when normalization changes stored data', async () => {
    const { readAcpModelProfiles } = await import('../dist/config/acp-model-profiles.js');
    const projectRoot = await makeTmpDir('dirty-read');
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      const catCafeDir = join(projectRoot, '.office-claw');
      await mkdir(catCafeDir, { recursive: true });
      const metaPath = join(catCafeDir, 'acp-model-profiles.json');
      const secretsPath = join(catCafeDir, 'acp-model-profiles.secrets.local.json');

      await writeFile(
        metaPath,
        JSON.stringify({
          version: 1,
          profiles: [
            {
              id: ' gateway-default ',
              displayName: ' Gateway Default ',
              provider: 'openai_compatible',
              model: ' gpt-4.1 ',
              baseUrl: ' https://api.openai.com/v1 ',
              topP: 3,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
          ],
        }),
      );
      await writeFile(
        secretsPath,
        JSON.stringify({
          version: 1,
          profiles: {
            ' gateway-default ': { apiKey: 'sk-test' },
          },
        }),
      );

      const before = await stat(metaPath);
      await sleep(25);
      const view = await readAcpModelProfiles(projectRoot);
      const after = await stat(metaPath);

      assert.equal(view.profiles[0].displayName, 'Gateway Default');
      assert.ok(after.mtimeMs > before.mtimeMs);

      const normalized = JSON.parse(await readFile(metaPath, 'utf-8'));
      assert.equal(normalized.profiles[0].id, 'gateway-default');
      assert.equal(normalized.profiles[0].displayName, 'Gateway Default');
      assert.equal(normalized.profiles[0].model, 'gpt-4.1');
      assert.equal(normalized.profiles[0].topP, undefined);
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
