/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { tryGovernanceBootstrap } from '../../dist/config/capabilities/capability-orchestrator.js';
import { GOVERNANCE_PACK_VERSION } from '../../dist/config/governance/governance-pack.js';
import { GovernanceRegistry } from '../../dist/config/governance/governance-registry.js';

describe('governance integration with capability-orchestrator', () => {
  let catCafeRoot;
  let externalProject;

  beforeEach(async () => {
    catCafeRoot = await mkdtemp(join(tmpdir(), 'office-claw-root-'));
    externalProject = await mkdtemp(join(tmpdir(), 'external-project-'));
  });

  afterEach(async () => {
    await rm(catCafeRoot, { recursive: true, force: true });
    await rm(externalProject, { recursive: true, force: true });
  });

  it('auto-bootstraps any external project unconditionally', async () => {
    const result = await tryGovernanceBootstrap(externalProject, catCafeRoot);
    assert.equal(result.bootstrapped, true);

    const registry = new GovernanceRegistry(catCafeRoot);
    const entry = await registry.get(externalProject);
    assert.ok(entry);
    assert.equal(entry.packVersion, GOVERNANCE_PACK_VERSION);
  });

  it('writes methodology templates on bootstrap', async () => {
    await tryGovernanceBootstrap(externalProject, catCafeRoot);

    const backlog = await readFile(join(externalProject, 'BACKLOG.md'), 'utf-8');
    assert.ok(backlog.includes('doc_kind:'));
  });

  it('governance health returns never-synced for unknown project', async () => {
    const registry = new GovernanceRegistry(catCafeRoot);
    const health = await registry.checkHealth(externalProject);
    assert.equal(health.status, 'never-synced');
    assert.equal(health.packVersion, null);
  });

  it('governance health returns healthy after bootstrap', async () => {
    await tryGovernanceBootstrap(externalProject, catCafeRoot);

    const registry = new GovernanceRegistry(catCafeRoot);
    const health = await registry.checkHealth(externalProject);
    assert.equal(health.status, 'healthy');
    assert.equal(health.packVersion, GOVERNANCE_PACK_VERSION);
  });

  it('governance health returns stale for old version', async () => {
    const registry = new GovernanceRegistry(catCafeRoot);
    await registry.register(externalProject, {
      packVersion: '0.9.0',
      checksum: 'old',
      syncedAt: Date.now() - 86400000,
      confirmedByUser: true,
    });

    const health = await registry.checkHealth(externalProject);
    assert.equal(health.status, 'stale');
  });

  it('re-bootstraps stale registry entry and upgrades version', async () => {
    const registry = new GovernanceRegistry(catCafeRoot);
    await registry.register(externalProject, {
      packVersion: '1.4.0',
      checksum: 'old',
      syncedAt: Date.now() - 86400000,
      confirmedByUser: true,
    });

    await tryGovernanceBootstrap(externalProject, catCafeRoot);

    const entry = await registry.get(externalProject);
    assert.equal(entry.packVersion, GOVERNANCE_PACK_VERSION, 'should upgrade to current version');
  });
});
