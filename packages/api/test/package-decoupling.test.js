/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(__dirname, '..', 'package.json');

test('api-server does not hard-depend on sqlite storage provider package', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const dependencyGroups = [
    packageJson.dependencies ?? {},
    packageJson.peerDependencies ?? {},
    packageJson.optionalDependencies ?? {},
  ];

  for (const dependencies of dependencyGroups) {
    assert.equal(dependencies['@openjiuwen/relay-storage-sqlite'], undefined);
  }

  assert.ok(!packageJson.scripts?.build?.includes('@openjiuwen/relay-storage-sqlite'));
});
