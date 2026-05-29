/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';

describe('callback-skill-routes', () => {
  let app;
  let registerFn;
  let originalEnv;
  let tempRoot;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempRoot = mkdtempSync(join(tmpdir(), 'office-claw-skill-callbacks-'));
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const skillsRoot = join(tempRoot, 'office-claw-skills');
    const userSkillsRoot = join(tempRoot, '.office-claw', 'skills');
    mkdirSync(skillsRoot, { recursive: true });
    mkdirSync(userSkillsRoot, { recursive: true });

    writeFileSync(
      join(skillsRoot, 'BOOTSTRAP.md'),
      `# Bootstrap

### 开发流程链
| Skill | 触发场景 | SOP Step |
|-------|----------|----------|
| \`local-skill\` | 本地开发 | — |
`,
      'utf-8',
    );

    writeFileSync(
      join(skillsRoot, 'manifest.yaml'),
      `skills:
  local-skill:
    description: "本地 skill 描述"
    triggers:
      - "本地开发"
      - "调试"
`,
      'utf-8',
    );

    mkdirSync(join(skillsRoot, 'local-skill'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'local-skill', 'SKILL.md'),
      `---
name: local-skill
description: 本地 skill 描述
triggers:
  - 本地开发
---

# Local Skill
`,
      'utf-8',
    );

    mkdirSync(join(userSkillsRoot, 'remote-skill', 'scripts'), { recursive: true });
    writeFileSync(
      join(userSkillsRoot, 'remote-skill', 'SKILL.md'),
      `---
name: remote-skill
description: 远程安装 skill 描述
triggers:
  - 远程搜索
  - SkillHub
---

# Remote Skill

Use this skill carefully.
`,
      'utf-8',
    );
    writeFileSync(join(userSkillsRoot, 'remote-skill', 'scripts', 'helper.sh'), '#!/usr/bin/env bash\n', 'utf-8');

    writeFileSync(
      join(tempRoot, '.office-claw', 'installed-skills.json'),
      JSON.stringify(
        {
          version: 1,
          skills: [
            {
              name: 'remote-skill',
              source: 'skillhub',
              skillhubUrl: 'https://example.com/remote-skill',
              owner: 'example',
              repo: 'skills',
              remoteSkillName: 'remote-skill',
              installedAt: '2026-03-28T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const mod = await import('../dist/routes/callback-skill-routes.js');
    registerFn = mod.registerCallbackSkillRoutes;
  });

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  function createMockRegistry() {
    return {
      verify: (invocationId, callbackToken) => {
        if (invocationId !== 'inv-1' || callbackToken !== 'tok-1') return null;
        return {
          invocationId,
          agentId: 'agentteams',
          userId: 'user-1',
          threadId: 'thread-1',
          callbackToken,
        };
      },
    };
  }

  it('lists installed OfficeClaw skills for authenticated callbacks', async () => {
    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/list?invocationId=inv-1&callbackToken=tok-1',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.total, 2);
    assert.equal(body.skills.length, 2);

    const [localSkill, remoteSkill] = body.skills;
    assert.equal(localSkill.name, 'local-skill');
    assert.equal(localSkill.source, 'local');
    assert.equal(localSkill.category, '开发流程链');
    assert.deepEqual(localSkill.triggers, ['本地开发', '调试']);
    assert.ok(typeof localSkill.contentHash === 'string' && localSkill.contentHash.length > 10);

    assert.equal(remoteSkill.name, 'remote-skill');
    assert.equal(remoteSkill.source, 'skillhub');
    assert.equal(remoteSkill.category, '技能扩展');
    assert.deepEqual(remoteSkill.triggers, ['远程搜索', 'SkillHub']);
  });

  it('matches mixed-intent ACP skill queries via token aliases', async () => {
    const skillsRoot = join(tempRoot, 'office-claw-skills');
    const fixtures = {
      'writing-plans': ['写实施计划', 'implementation plan', 'planning', '拆分步骤'],
      'collaborative-thinking': ['brainstorm', '方案对比', '收敛决策', '多角度讨论'],
      tdd: ['写测试', 'test first', '测试驱动', '红绿重构'],
      worktree: ['git worktree', '并行分支开发', '多改动隔离', '分支隔离'],
    };

    for (const [skillName, triggers] of Object.entries(fixtures)) {
      mkdirSync(join(skillsRoot, skillName), { recursive: true });
      writeFileSync(
        join(skillsRoot, skillName, 'SKILL.md'),
        `---\nname: ${skillName}\ndescription: ${skillName} skill\ntriggers:\n${triggers.map((trigger) => `  - ${trigger}`).join('\n')}\n---\n\n# ${skillName}\n`,
        'utf-8',
      );
    }

    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/list?invocationId=inv-1&callbackToken=tok-1&query=planning%20implementation%20plan%20TDD%20collaboration%20worktree&limit=10',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const names = body.skills.map((skill) => skill.name);
    assert.ok(names.includes('writing-plans'));
    assert.ok(names.includes('collaborative-thinking'));
    assert.ok(names.includes('tdd'));
    assert.ok(names.includes('worktree'));
  });

  it('ranks collaborative-thinking first for compare-and-converge phrasing', async () => {
    const skillsRoot = join(tempRoot, 'office-claw-skills');
    mkdirSync(join(skillsRoot, 'collaborative-thinking'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'collaborative-thinking', 'SKILL.md'),
      `---\nname: collaborative-thinking\ndescription: decision convergence skill\ntriggers:\n  - 方案对比\n  - 收敛决策\n  - 多角度讨论\n---\n\n# collaborative-thinking\n`,
      'utf-8',
    );
    mkdirSync(join(skillsRoot, 'deep-research'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'deep-research', 'SKILL.md'),
      `---\nname: deep-research\ndescription: research skill\ntriggers:\n  - 调研\n  - research\n---\n\n# deep-research\n`,
      'utf-8',
    );

    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/list?invocationId=inv-1&callbackToken=tok-1&query=%E6%96%B9%E6%A1%88%E5%AF%B9%E6%AF%94%20%E6%94%B6%E6%95%9B%E5%86%B3%E7%AD%96%20%E5%A4%9A%E8%A7%92%E5%BA%A6%E8%AE%A8%E8%AE%BA&limit=5',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.skills[0]?.name, 'collaborative-thinking');
  });

  it('ranks worktree first for branch-isolation phrasing', async () => {
    const skillsRoot = join(tempRoot, 'office-claw-skills');
    mkdirSync(join(skillsRoot, 'worktree'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'worktree', 'SKILL.md'),
      `---\nname: worktree\ndescription: git worktree skill\ntriggers:\n  - git worktree\n  - 并行分支开发\n  - 多改动隔离\n---\n\n# worktree\n`,
      'utf-8',
    );
    mkdirSync(join(skillsRoot, 'workspace-navigator'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'workspace-navigator', 'SKILL.md'),
      `---\nname: workspace-navigator\ndescription: workspace helper\ntriggers:\n  - workspace\n---\n\n# workspace-navigator\n`,
      'utf-8',
    );

    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/list?invocationId=inv-1&callbackToken=tok-1&query=%E5%B9%B6%E8%A1%8C%E5%88%86%E6%94%AF%E5%BC%80%E5%8F%91%20%E5%A4%9A%E6%94%B9%E5%8A%A8%E9%9A%94%E7%A6%BB&limit=5',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.skills[0]?.name, 'worktree');
  });

  it('ranks tdd first for mixed red-green-refactor planning phrasing', async () => {
    const skillsRoot = join(tempRoot, 'office-claw-skills');
    mkdirSync(join(skillsRoot, 'writing-plans'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'writing-plans', 'SKILL.md'),
      `---\nname: writing-plans\ndescription: planning skill\ntriggers:\n  - implementation plan\n  - 拆分步骤\n---\n\n# writing-plans\n`,
      'utf-8',
    );
    mkdirSync(join(skillsRoot, 'tdd'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'tdd', 'SKILL.md'),
      `---\nname: tdd\ndescription: test driven development skill\ntriggers:\n  - test first\n  - red green refactor\n  - 失败测试\n  - 最小实现\n---\n\n# tdd\n`,
      'utf-8',
    );

    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/list?invocationId=inv-1&callbackToken=tok-1&query=red%20green%20refactor%20plan&limit=5',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.skills[0]?.name, 'tdd');
  });

  it('ranks explicit skill name above generic planning phrasing', async () => {
    const skillsRoot = join(tempRoot, 'office-claw-skills');
    mkdirSync(join(skillsRoot, 'writing-plans'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'writing-plans', 'SKILL.md'),
      `---\nname: writing-plans\ndescription: planning skill\ntriggers:\n  - implementation plan\n  - 拆分步骤\n---\n\n# writing-plans\n`,
      'utf-8',
    );
    mkdirSync(join(skillsRoot, 'tdd'), { recursive: true });
    writeFileSync(
      join(skillsRoot, 'tdd', 'SKILL.md'),
      `---\nname: tdd\ndescription: test driven development skill\ntriggers:\n  - test first\n  - red green refactor\n  - 失败测试\n  - 最小实现\n---\n\n# tdd\n`,
      'utf-8',
    );

    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/list?invocationId=inv-1&callbackToken=tok-1&query=tdd%20planning%20implementation%20plan&limit=5',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.skills[0]?.name, 'tdd');
  });

  it('loads one skill with markdown and related files', async () => {
    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/load?invocationId=inv-1&callbackToken=tok-1&name=remote-skill',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.name, 'remote-skill');
    assert.equal(body.source, 'skillhub');
    assert.ok(body.skillMarkdown.includes('# Remote Skill'));
    assert.ok(body.skillDir.replaceAll('\\', '/').endsWith('/.office-claw/skills/remote-skill'));
    assert.ok(
      body.files.some((filePath) =>
        filePath.replaceAll('\\', '/').endsWith('/.office-claw/skills/remote-skill/scripts/helper.sh'),
      ),
    );
    assert.equal(body.filesOmittedCount, 0);
  });

  it('returns 404 for an unknown skill', async () => {
    app = Fastify();
    await registerFn(app, { registry: createMockRegistry() });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/skills/load?invocationId=inv-1&callbackToken=tok-1&name=missing-skill',
    });

    assert.equal(res.statusCode, 404);
    assert.match(res.body, /Skill not found: missing-skill/);
  });
});
