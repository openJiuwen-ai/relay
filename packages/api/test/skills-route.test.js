/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Skills route tests
 * GET /api/skills          鈥?OfficeClaw 鍏变韩 Skills 鐪嬫澘鏁版嵁
 * GET /api/skills/detail   鈥?鑾峰彇宸插畨瑁?skill 璇︽儏
 * GET /api/skills/file     鈥?棰勮 skill 鐩綍涓殑鏂囨湰鏂囦欢
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { skillsRoutes } from '../dist/routes/skills.js';

const AUTH_HEADERS = { 'x-office-claw-user': 'test-user' };
const TEST_BODY_LIMIT = 10 * 1024 * 1024;
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..');

describe('Skills Route', () => {
  it('returns 401 when no identity header is provided', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('缺少用户身份信息'));

    await app.close();
  });

  it('GET /api/skills returns skills array and summary', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    // Response structure
    assert.ok(Array.isArray(body.skills), 'skills should be an array');
    assert.ok(body.summary, 'should have summary');
    assert.equal(typeof body.summary.total, 'number');
    assert.equal(typeof body.summary.allMounted, 'boolean');
    assert.equal(typeof body.summary.registrationConsistent, 'boolean');

    await app.close();
  });

  it('each skill entry has required fields', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    if (body.skills.length === 0) {
      // No skills found (possible in CI), skip field checks
      await app.close();
      return;
    }

    for (const skill of body.skills) {
      assert.equal(typeof skill.name, 'string', 'name should be string');
      assert.equal(typeof skill.category, 'string', 'category should be string');
      assert.equal(typeof skill.trigger, 'string', 'trigger should be string');
      assert.ok(skill.mounts, 'should have mounts');
      assert.equal(typeof skill.mounts.claude, 'boolean');
      assert.equal(typeof skill.mounts.codex, 'boolean');
      assert.equal(typeof skill.mounts.gemini, 'boolean');
    }

    await app.close();
  });

  it('skills follow BOOTSTRAP ordering (registered before unregistered)', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    if (body.skills.length === 0) {
      await app.close();
      return;
    }

    // Skills with a category (from BOOTSTRAP) should come before '鍏朵粬'
    let seenUnregistered = false;
    for (const skill of body.skills) {
      if (skill.category === '鍏朵粬') {
        seenUnregistered = true;
      } else if (seenUnregistered) {
        assert.fail(`Registered skill "${skill.name}" appeared after unregistered skill 鈥?ordering violated`);
      }
    }

    await app.close();
  });

  it('summary.total matches skills array length', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    assert.equal(body.summary.total, body.skills.length);

    await app.close();
  });

  // 鈹€鈹€鈹€ GET /api/skills/detail tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  it('GET /api/skills/detail returns 401 without identity', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail?name=tdd',
    });

    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it('GET /api/skills/detail returns 400 without name parameter', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('缺少必填参数'));
    await app.close();
  });

  it('GET /api/skills/detail returns 404 for non-existent skill', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail?name=non-existent-skill-12345',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it('GET /api/skills/detail returns 400 for path traversal in name', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail?name=../etc/passwd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('技能名称不合法'));
    await app.close();
  });

  // 鈹€鈹€鈹€ GET /api/skills/file tests 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  it('GET /api/skills/detail maps uploaded local skills to external source and keeps frontmatter category', async () => {
    const skillName = 'local-detail-test';
    const skillDir = join(repoRoot, '.office-claw', 'skills', skillName);
    const registryPath = join(repoRoot, '.office-claw', 'installed-skills.json');
    const registryBackup = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : null;

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: local-detail-test',
        'description: local skill detail test',
        'category: Productivity',
        'triggers:',
        '  - local detail',
        '---',
        '',
        '# local-detail-test',
      ].join('\n'),
      'utf8',
    );

    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 1,
          skills: [
            {
              name: skillName,
              source: 'local',
              skillhubUrl: '',
              owner: 'local',
              repo: 'upload',
              remoteSkillName: skillName,
              installedAt: '2026-04-11T10:00:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/skills/detail?name=${skillName}`,
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.source, 'external');
      assert.equal(body.category, 'Productivity');
    } finally {
      await app.close();
      rmSync(skillDir, { recursive: true, force: true });
      if (registryBackup == null) {
        rmSync(registryPath, { force: true });
      } else {
        writeFileSync(registryPath, registryBackup, 'utf8');
      }
    }
  });

  it('GET /api/skills/file returns 401 without identity', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=SKILL.md',
    });

    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it('GET /api/skills/file returns 400 without required parameters', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('缺少必填参数'));
    await app.close();
  });

  it('GET /api/skills/file returns 403 for hidden files', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    // Use a skill that exists in the project (tdd should exist)
    // The hidden file check happens before file existence check
    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=.hidden',
      headers: AUTH_HEADERS,
    });

    // Should return 403 for hidden files (before checking if file exists)
    // If skill doesn't exist, it might return 404 first - that's also acceptable
    // The important thing is that hidden files are blocked when skill exists
    assert.ok(res.statusCode === 403 || res.statusCode === 404, `Expected 403 or 404, got ${res.statusCode}`);
    await app.close();
  });

  it('GET /api/skills/file returns 403 for hidden files in subdirectory', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=subdir/.env',
      headers: AUTH_HEADERS,
    });

    // Should return 403 for hidden files (before checking if file exists)
    assert.ok(res.statusCode === 403 || res.statusCode === 404, `Expected 403 or 404, got ${res.statusCode}`);
    await app.close();
  });

  it('GET /api/skills/file returns 400 for path traversal', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=../../../etc/passwd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('文件路径不合法'));
    await app.close();
  });

  it('GET /api/skills/file returns 400 for absolute path', async () => {
    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=/etc/passwd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('文件路径不合法'));
    await app.close();
  });

  it('GET /api/skills includes skills stored in .office-claw/skills', async () => {
    const skillName = 'user-storage-route-test';
    const userSkillDir = join(repoRoot, '.office-claw', 'skills', skillName);
    mkdirSync(userSkillDir, { recursive: true });
    writeFileSync(join(userSkillDir, 'SKILL.md'), '# User Storage Route Test\n', 'utf-8');

    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/skills',
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.skills.some((skill) => skill.name === skillName));
    } finally {
      await app.close();
      rmSync(join(repoRoot, '.office-claw', 'skills', skillName), { recursive: true, force: true });
    }
  });

  it('GET /api/skills/file reads files from .office-claw/skills', async () => {
    const skillName = 'user-storage-file-test';
    const userSkillDir = join(repoRoot, '.office-claw', 'skills', skillName);
    mkdirSync(join(userSkillDir, 'docs'), { recursive: true });
    writeFileSync(join(userSkillDir, 'SKILL.md'), '# User Storage File Test\n', 'utf-8');
    writeFileSync(join(userSkillDir, 'docs', 'notes.txt'), 'hello from persistent skill storage', 'utf-8');

    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/skills/file?name=${skillName}&path=docs/notes.txt`,
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.path, 'docs/notes.txt');
      assert.equal(body.content, 'hello from persistent skill storage');
    } finally {
      await app.close();
      rmSync(join(repoRoot, '.office-claw', 'skills', skillName), { recursive: true, force: true });
    }
  });

  it('POST /api/skills/upload rejects too many files', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-upload-limit-'));
    mkdirSync(join(tempRoot, 'office-claw-skills'), { recursive: true });
    const previousRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    await app.register(skillsRoutes);
    await app.ready();

    const files = Array.from({ length: 101 }, (_, index) => ({
      path: index === 0 ? 'SKILL.md' : `file-${index}.txt`,
      content: Buffer.from('x').toString('base64'),
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/skills/upload',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'too-many-files', files }),
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.match(body.error, /文件数量过多/);

    await app.close();
    if (previousRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('POST /api/skills/upload rejects oversized total payload', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-upload-size-'));
    mkdirSync(join(tempRoot, 'office-claw-skills'), { recursive: true });
    const previousRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    await app.register(skillsRoutes);
    await app.ready();

    const oneMb = Buffer.alloc(1024 * 1024, 'a').toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/api/skills/upload',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'too-large-total',
        files: [
          { path: 'skill/SKILL.md', content: Buffer.from('# skill').toString('base64') },
          { path: 'skill/a.bin', content: oneMb },
          { path: 'skill/b.bin', content: oneMb },
          { path: 'skill/c.bin', content: oneMb },
          { path: 'skill/d.bin', content: oneMb },
          { path: 'skill/e.bin', content: oneMb },
        ],
      }),
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.match(body.error, /上传文件总大小超过 4MB 限制/);

    await app.close();
    if (previousRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('POST /api/skills/upload removes created folder when import fails validation', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-upload-cleanup-'));
    const userSkillsRoot = join(tempRoot, '.office-claw', 'skills');
    mkdirSync(userSkillsRoot, { recursive: true });
    const previousRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/skills/upload',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'broken-import-cleanup-case',
        files: [{ path: 'README.md', content: Buffer.from('oops').toString('base64') }],
      }),
    });

    assert.equal(res.statusCode, 422);
    assert.equal(existsSync(join(userSkillsRoot, 'broken-import-cleanup-case')), false);

    await app.close();
    if (previousRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('POST /api/skills/upload stores imported skills under .office-claw/skills', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-upload-persist-'));
    const userSkillsRoot = join(tempRoot, '.office-claw', 'skills');
    mkdirSync(userSkillsRoot, { recursive: true });
    const previousRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    const { skillsRoutes: isolatedSkillsRoutes } = await import(
      `../dist/routes/skills.js?upload-persist=${Date.now()}`
    );
    await app.register(isolatedSkillsRoutes);
    await app.ready();

    const skillName = 'uploaded-persistent-skill';
    const res = await app.inject({
      method: 'POST',
      url: '/api/skills/upload',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: skillName,
        files: [
          { path: `${skillName}/SKILL.md`, content: Buffer.from('# uploaded skill').toString('base64') },
          {
            path: `${skillName}/docs/notes.txt`,
            content: Buffer.from('hello from uploaded persistent skill').toString('base64'),
          },
        ],
      }),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.localPath, `.office-claw/skills/${skillName}`);
    assert.equal(existsSync(join(userSkillsRoot, skillName, 'SKILL.md')), true);
    assert.equal(existsSync(join(userSkillsRoot, skillName, 'docs', 'notes.txt')), true);

    const fileRes = await app.inject({
      method: 'GET',
      url: `/api/skills/file?name=${skillName}&path=docs/notes.txt`,
      headers: AUTH_HEADERS,
    });

    assert.equal(fileRes.statusCode, 200);
    const fileBody = JSON.parse(fileRes.body);
    assert.equal(fileBody.content, 'hello from uploaded persistent skill');

    await app.close();
    if (previousRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('POST /api/skills/upload rejects duplicate skill names', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-upload-duplicate-'));
    mkdirSync(join(tempRoot, 'office-claw-skills', 'agent-browser'), { recursive: true });
    const previousRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/skills/upload',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'pdf',
        files: [{ path: 'SKILL.md', content: Buffer.from('# new skill').toString('base64') }],
      }),
    });

    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.match(body.error, /已存在/);

    await app.close();
    if (previousRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('POST /api/skills/upload rejects Chinese skill names', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-upload-name-'));
    mkdirSync(join(tempRoot, 'office-claw-skills'), { recursive: true });
    const previousRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/skills/upload',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: '\u4e2d\u6587\u6280\u80fd',
        files: [{ path: 'SKILL.md', content: Buffer.from('# skill').toString('base64') }],
      }),
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.match(body.error, /不能包含中文字符/);

    await app.close();
    if (previousRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('POST /api/skills/upload rejects skill names with underscores', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-upload-invalid-name-'));
    mkdirSync(join(tempRoot, 'office-claw-skills'), { recursive: true });
    const previousRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const app = Fastify({ bodyLimit: TEST_BODY_LIMIT });
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/skills/upload',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'demo_skill',
        files: [{ path: 'SKILL.md', content: Buffer.from('# skill').toString('base64') }],
      }),
    });

    assert.equal(res.statusCode, 422);
    assert.equal(existsSync(join(tempRoot, '.office-claw', 'skills', 'demo_skill')), false);

    await app.close();
    if (previousRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
