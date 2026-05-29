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
import { checkGovernancePreflight } from '../../dist/config/governance/governance-preflight.js';
import { GovernanceRegistry } from '../../dist/config/governance/governance-registry.js';
import { GOVERNANCE_PACK_VERSION } from '../../dist/config/governance/governance-pack.js';

describe('governance-preflight', () => {
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

  it('passes for office-claw project (not external)', async () => {
    const result = await checkGovernancePreflight(catCafeRoot, catCafeRoot);
    assert.equal(result.ready, true);
    assert.equal(result.reason, undefined);
  });

  it('auto-bootstraps unregistered external project and returns ready', async () => {
    const result = await checkGovernancePreflight(externalProject, catCafeRoot);
    assert.equal(result.ready, true);

    const registry = new GovernanceRegistry(catCafeRoot);
    const entry = await registry.get(externalProject);
    assert.ok(entry, 'project should be registered after auto-bootstrap');
    assert.equal(entry.packVersion, GOVERNANCE_PACK_VERSION);
  });

  it('auto-bootstrap writes methodology templates', async () => {
    await checkGovernancePreflight(externalProject, catCafeRoot);

    const backlog = await readFile(join(externalProject, 'BACKLOG.md'), 'utf-8');
    assert.ok(backlog.includes('doc_kind:'));
  });

  it('passes for already-registered project', async () => {
    const registry = new GovernanceRegistry(catCafeRoot);
    await registry.register(externalProject, {
      packVersion: GOVERNANCE_PACK_VERSION,
      checksum: 'abc',
      syncedAt: Date.now(),
      confirmedByUser: true,
    });

    const result = await checkGovernancePreflight(externalProject, catCafeRoot);
    assert.equal(result.ready, true);
  });

  it('simplified PreflightResult has no needsBootstrap or needsConfirmation', async () => {
    const result = await checkGovernancePreflight(externalProject, catCafeRoot);
    assert.equal(result.needsBootstrap, undefined);
    assert.equal(result.needsConfirmation, undefined);
    assert.equal(result.bootstrapCommand, undefined);
  });

  it('returns not-ready when auto-bootstrap fails (unwritable path)', async () => {
    const nonexistentRoot = join(tmpdir(), 'nonexistent-cat-cafe-root-' + Date.now());
    const badProject = '/nonexistent/path/that/cannot/be/written';
    const result = await checkGovernancePreflight(badProject, nonexistentRoot);
    assert.equal(result.ready, false);
    assert.ok(result.reason?.includes('Auto-bootstrap failed'));
  });
});
