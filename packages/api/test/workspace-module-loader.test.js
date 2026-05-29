/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('WorkspaceModuleLoader', () => {
  it('resolves workspace provider package subpath without an api-server package dependency', async () => {
    const { createWorkspaceModuleLoader } = await import('../dist/utils/workspace-module-loader.js');
    const loader = createWorkspaceModuleLoader(process.cwd());

    const namespace = await loader('@openjiuwen/relay-storage-sqlite/evidence');

    assert.equal(typeof namespace, 'object');
    assert.ok(namespace.evidenceProvider);
    assert.equal(namespace.evidenceProvider.id, 'sqlite');
  });
});

