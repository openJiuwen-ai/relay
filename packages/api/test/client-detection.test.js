/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function removeDirWithRetries(target, attempts = 5) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (index === attempts - 1) {
        if (error && (error.code === 'ENOTEMPTY' || error.code === 'EPERM')) return;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (index + 1)));
    }
  }
}

test('detectAvailableClients marks dare available when vendored runtime exists', async () => {
  const dareRoot = mkdtempSync(join(tmpdir(), 'dare-client-detect-'));
  const oldDarePath = process.env.DARE_PATH;
  const oldAllowedClients = process.env.OFFICE_CLAW_ALLOWED_CLIENTS;

  try {
    mkdirSync(join(dareRoot, 'client'), { recursive: true });
    mkdirSync(join(dareRoot, '.venv', 'bin'), { recursive: true });
    writeFileSync(join(dareRoot, 'client', '__main__.py'), '', 'utf8');
    writeFileSync(join(dareRoot, '.venv', 'bin', 'python'), '#!/usr/bin/env python\n', 'utf8');

    process.env.DARE_PATH = dareRoot;
    process.env.OFFICE_CLAW_ALLOWED_CLIENTS = 'dare';

    const { refreshAvailableClients } = await import('../dist/utils/client-detection.js');
    const clients = await refreshAvailableClients();

    assert.deepEqual(clients, [{ id: 'dare', label: 'Office Agent', command: 'dare', available: true }]);
  } finally {
    if (oldDarePath === undefined) delete process.env.DARE_PATH;
    else process.env.DARE_PATH = oldDarePath;
    if (oldAllowedClients === undefined) delete process.env.OFFICE_CLAW_ALLOWED_CLIENTS;
    else process.env.OFFICE_CLAW_ALLOWED_CLIENTS = oldAllowedClients;

    const { refreshAvailableClients } = await import('../dist/utils/client-detection.js');
    await refreshAvailableClients();
    await removeDirWithRetries(dareRoot);
  }
});

test('detectAvailableClients marks ACP available only when bundled relay-teams runtime exists', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'acp-client-detect-'));
  const previousCwd = process.cwd();
  const oldAllowedClients = process.env.OFFICE_CLAW_ALLOWED_CLIENTS;

  try {
    mkdirSync(join(projectRoot, 'tools', 'python'), { recursive: true });
    writeFileSync(join(projectRoot, 'tools', 'python', 'python.exe'), '', 'utf8');
    writeFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n', 'utf8');

    process.chdir(projectRoot);
    process.env.OFFICE_CLAW_ALLOWED_CLIENTS = 'acp';

    const { refreshAvailableClients } = await import('../dist/utils/client-detection.js');
    const clients = await refreshAvailableClients();

    assert.equal(clients.length, 1);
    assert.equal(clients[0].id, 'acp');
    assert.equal(clients[0].available, true);
    assert.match(clients[0].command, /python\.exe -m relay_teams gateway acp stdio$/);
  } finally {
    process.chdir(previousCwd);
    if (oldAllowedClients === undefined) delete process.env.OFFICE_CLAW_ALLOWED_CLIENTS;
    else process.env.OFFICE_CLAW_ALLOWED_CLIENTS = oldAllowedClients;

    const { refreshAvailableClients } = await import('../dist/utils/client-detection.js');
    await refreshAvailableClients();
    await removeDirWithRetries(projectRoot);
  }
});
