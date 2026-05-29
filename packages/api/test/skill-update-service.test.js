/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import JSZip from 'jszip';

describe('SkillUpdateService', () => {
  let tempRoot;
  let originalFetch;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'office-claw-skill-update-'));
    originalFetch = globalThis.fetch;
    mkdirSync(join(tempRoot, '.office-claw', 'skills', 'remote-skill'), { recursive: true });
    writeFileSync(join(tempRoot, '.office-claw', 'skills', 'remote-skill', 'SKILL.md'), '# Remote skill\n', 'utf-8');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function writeRegistry(skillRecord) {
    mkdirSync(join(tempRoot, '.office-claw'), { recursive: true });
    writeFileSync(
      join(tempRoot, '.office-claw', 'installed-skills.json'),
      `${JSON.stringify({ version: 1, skills: [skillRecord] }, null, 2)}\n`,
      'utf-8',
    );
  }

  function mockSkillHubVersion(version) {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            skills: [
              {
                slug: 'remote-skill',
                name: 'Remote Skill',
                description: 'Remote skill',
                ownerName: 'owner',
                version,
              },
            ],
            total: 1,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
  }

  async function createSkillZip(skillMd) {
    const zip = new JSZip();
    zip.file('SKILL.md', skillMd);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('returns available update when remote version differs from installed version', async () => {
    writeRegistry({
      name: 'remote-skill',
      source: 'skillhub',
      skillhubUrl: 'https://example.com/skills/remote-skill',
      owner: 'owner',
      repo: 'repo',
      remoteSkillName: 'remote-skill',
      installedAt: '2026-05-01T00:00:00.000Z',
      installedVersion: '1.0.0',
    });
    mockSkillHubVersion('1.1.0');

    const { checkSkillUpdates } = await import(
      `../dist/domains/agents/services/skillhub/SkillUpdateService.js?available=${Date.now()}`
    );
    const result = await checkSkillUpdates(tempRoot, { force: true, now: new Date('2026-05-08T00:00:00.000Z') });

    assert.equal(result.updates.length, 1);
    assert.equal(result.updates[0].name, 'remote-skill');
    assert.equal(result.updates[0].currentVersion, '1.0.0');
    assert.equal(result.updates[0].latestVersion, '1.1.0');

    const registry = JSON.parse(readFileSync(join(tempRoot, '.office-claw', 'installed-skills.json'), 'utf-8'));
    assert.equal(registry.skills[0].updateStatus, 'available');
    assert.equal(registry.skills[0].latestVersion, '1.1.0');
  });

  it('baselines legacy installed skills without prompting an update', async () => {
    writeRegistry({
      name: 'remote-skill',
      source: 'skillhub',
      skillhubUrl: 'https://example.com/skills/remote-skill',
      owner: 'owner',
      repo: 'repo',
      remoteSkillName: 'remote-skill',
      installedAt: '2026-05-01T00:00:00.000Z',
    });
    mockSkillHubVersion('1.1.0');

    const { checkSkillUpdates } = await import(
      `../dist/domains/agents/services/skillhub/SkillUpdateService.js?baseline=${Date.now()}`
    );
    const result = await checkSkillUpdates(tempRoot, { force: true, now: new Date('2026-05-08T00:00:00.000Z') });

    assert.equal(result.updates.length, 0);
    const registry = JSON.parse(readFileSync(join(tempRoot, '.office-claw', 'installed-skills.json'), 'utf-8'));
    assert.equal(registry.skills[0].installedVersion, '1.1.0');
    assert.equal(registry.skills[0].latestVersion, '1.1.0');
    assert.equal(registry.skills[0].updateStatus, 'current');
  });

  it('prompts update when recently checked registry has divergent known versions', async () => {
    writeRegistry({
      name: 'remote-skill',
      source: 'skillhub',
      skillhubUrl: 'https://example.com/skills/remote-skill',
      owner: 'owner',
      repo: 'repo',
      remoteSkillName: 'remote-skill',
      installedAt: '2026-05-01T00:00:00.000Z',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      lastCheckedAt: '2026-05-08T00:30:00.000Z',
      updateStatus: 'current',
    });
    globalThis.fetch = async () => {
      throw new Error('recently checked records should not hit the network');
    };

    const { checkSkillUpdates } = await import(
      `../dist/domains/agents/services/skillhub/SkillUpdateService.js?divergent=${Date.now()}`
    );
    const result = await checkSkillUpdates(tempRoot, { now: new Date('2026-05-08T01:00:00.000Z') });

    assert.equal(result.updates.length, 1);
    assert.equal(result.updates[0].name, 'remote-skill');
    assert.equal(result.updates[0].currentVersion, '1.0.0');
    assert.equal(result.updates[0].latestVersion, '1.1.0');

    const registry = JSON.parse(readFileSync(join(tempRoot, '.office-claw', 'installed-skills.json'), 'utf-8'));
    assert.equal(registry.skills[0].updateStatus, 'available');
  });

  it('bypasses cached skill zip when applying an update', async () => {
    rmSync(join(tempRoot, '.office-claw', 'skills', 'remote-skill'), { recursive: true, force: true });
    mkdirSync(join(tempRoot, '.office-claw', 'skills', 'cache-skill'), { recursive: true });
    writeFileSync(join(tempRoot, '.office-claw', 'skills', 'cache-skill', 'SKILL.md'), '# Cache skill\n', 'utf-8');
    writeRegistry({
      name: 'cache-skill',
      source: 'skillhub',
      skillhubUrl: 'https://example.com/skills/cache-skill',
      owner: 'owner',
      repo: 'repo',
      remoteSkillName: 'cache-skill',
      installedAt: '2026-05-01T00:00:00.000Z',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateStatus: 'available',
    });

    const oldZip = await createSkillZip('# Old cache skill\n');
    const newZip = await createSkillZip('# New cache skill\n');
    let downloadCount = 0;
    globalThis.fetch = async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/api/v1/download')) {
        downloadCount += 1;
        return new Response(downloadCount === 1 ? oldZip : newZip, { status: 200 });
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            skills: [
              {
                slug: 'cache-skill',
                name: 'Cache Skill',
                description: 'Cache skill',
                ownerName: 'owner',
                version: '1.1.0',
              },
            ],
            total: 1,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const skillHubModule = await import(
      `../dist/domains/agents/services/skillhub/SkillHubService.js?cache=${Date.now()}`
    );
    await skillHubModule.fetchSkillAllFiles('owner', 'repo', 'cache-skill');

    const { updateSkill } = await import(
      `../dist/domains/agents/services/skillhub/SkillUpdateService.js?update=${Date.now()}`
    );
    const result = await updateSkill(tempRoot, 'cache-skill');

    assert.equal(result.currentVersion, '1.1.0');
    assert.equal(downloadCount, 2);
    assert.equal(
      readFileSync(join(tempRoot, '.office-claw', 'skills', 'cache-skill', 'SKILL.md'), 'utf-8'),
      '# New cache skill\n',
    );
  });
});
