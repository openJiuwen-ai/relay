/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { GovernanceBootstrapService } from '../../dist/config/governance/governance-bootstrap.js';
import { GOVERNANCE_PACK_VERSION } from '../../dist/config/governance/governance-pack.js';

describe('GovernanceBootstrapService', () => {
  let catCafeRoot;
  let targetProject;

  beforeEach(async () => {
    catCafeRoot = await mkdtemp(join(tmpdir(), 'office-claw-root-'));
    targetProject = await mkdtemp(join(tmpdir(), 'target-project-'));
  });

  afterEach(async () => {
    await rm(catCafeRoot, { recursive: true, force: true });
    await rm(targetProject, { recursive: true, force: true });
  });

  it('bootstraps empty project with methodology templates', async () => {
    const svc = new GovernanceBootstrapService(catCafeRoot);
    const report = await svc.bootstrap(targetProject, { dryRun: false });

    assert.equal(report.dryRun, false);
    assert.equal(report.packVersion, GOVERNANCE_PACK_VERSION);
    assert.ok(report.actions.length > 0);

    const backlog = await readFile(join(targetProject, 'BACKLOG.md'), 'utf-8');
    assert.ok(backlog.includes('doc_kind:'));

    const sop = await readFile(join(targetProject, 'docs/SOP.md'), 'utf-8');
    assert.ok(sop.includes('worktree'));
  });

  it('does not generate provider files (CLAUDE.md, AGENTS.md, GEMINI.md)', async () => {
    const svc = new GovernanceBootstrapService(catCafeRoot);
    await svc.bootstrap(targetProject, { dryRun: false });

    for (const f of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']) {
      await assert.rejects(lstat(join(targetProject, f)), { code: 'ENOENT' });
    }
  });

  it('does not generate skills or hooks symlinks', async () => {
    const svc = new GovernanceBootstrapService(catCafeRoot);
    await svc.bootstrap(targetProject, { dryRun: false });

    for (const dir of ['.claude/skills', '.codex/skills', '.gemini/skills', '.claude/hooks']) {
      await assert.rejects(lstat(join(targetProject, dir)), { code: 'ENOENT' });
    }
  });

  it('does not overwrite existing methodology files', async () => {
    const customBacklog = '# My Custom Backlog\n';
    await writeFile(join(targetProject, 'BACKLOG.md'), customBacklog, 'utf-8');

    const svc = new GovernanceBootstrapService(catCafeRoot);
    const report = await svc.bootstrap(targetProject, { dryRun: false });

    const content = await readFile(join(targetProject, 'BACKLOG.md'), 'utf-8');
    assert.equal(content, customBacklog, 'existing BACKLOG.md should not be overwritten');

    const backlogAction = report.actions.find((a) => a.file === 'BACKLOG.md');
    assert.ok(backlogAction);
    assert.equal(backlogAction.action, 'skipped');
  });

  it('is idempotent — second run produces no created actions', async () => {
    const svc = new GovernanceBootstrapService(catCafeRoot);
    await svc.bootstrap(targetProject, { dryRun: false });

    const report2 = await svc.bootstrap(targetProject, { dryRun: false });
    const created = report2.actions.filter((a) => a.action === 'created');
    assert.equal(created.length, 0, 'no files should be created on second run');
  });

  it('dry-run writes nothing to disk', async () => {
    const svc = new GovernanceBootstrapService(catCafeRoot);
    const report = await svc.bootstrap(targetProject, { dryRun: true });

    assert.equal(report.dryRun, true);
    assert.ok(report.actions.length > 0);

    for (const f of ['BACKLOG.md']) {
      await assert.rejects(lstat(join(targetProject, f)), { code: 'ENOENT' });
    }
  });

  it('saves bootstrap report to .office-claw/', async () => {
    const svc = new GovernanceBootstrapService(catCafeRoot);
    await svc.bootstrap(targetProject, { dryRun: false });

    const reportPath = join(targetProject, '.office-claw/governance-bootstrap-report.json');
    const raw = await readFile(reportPath, 'utf-8');
    const report = JSON.parse(raw);
    assert.equal(report.projectPath, targetProject);
    assert.equal(report.packVersion, GOVERNANCE_PACK_VERSION);
    assert.ok(Array.isArray(report.actions));
  });

  it('registers project in governance registry', async () => {
    const svc = new GovernanceBootstrapService(catCafeRoot);
    await svc.bootstrap(targetProject, { dryRun: false });

    const registry = svc.getRegistry();
    const entry = await registry.get(targetProject);
    assert.ok(entry);
    assert.equal(entry.packVersion, GOVERNANCE_PACK_VERSION);
    assert.equal(entry.confirmedByUser, true);
  });
});
