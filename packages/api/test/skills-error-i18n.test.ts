/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { skillsRoutes, translateSkillErrorMessage } from '../src/routes/skills.js';

const AUTH_HEADERS = { 'x-office-claw-user': 'test-user' };

async function createApp() {
  const app = Fastify();
  await app.register(skillsRoutes);
  await app.ready();
  return app;
}

describe('skills error localization', () => {
  it('translates install manager conflict errors to Chinese', () => {
    assert.equal(
      translateSkillErrorMessage('Local skill "demo-skill" already exists. Cannot overwrite a local skill.'),
      '本地技能“demo-skill”已存在，不能覆盖本地技能',
    );
  });

  it('translates nested download errors to Chinese', () => {
    assert.equal(
      translateSkillErrorMessage('Failed to download skill: Tencent skill download failed: 404'),
      '下载技能失败：技能下载失败（状态码 404）',
    );
  });

  it('GET /api/skills/search returns Chinese validation errors', async () => {
    const app = await createApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/skills/search',
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).error, '缺少必填查询参数：keyword');
    } finally {
      await app.close();
    }
  });

  it('GET /api/skills/detail returns Chinese validation errors', async () => {
    const app = await createApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/skills/detail',
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).error, '缺少必填参数：name');
    } finally {
      await app.close();
    }
  });

  it('GET /api/skills/file returns Chinese path errors', async () => {
    const app = await createApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/skills/file?name=docx&path=../secret.txt',
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).error, '文件路径不合法');
    } finally {
      await app.close();
    }
  });

  it('POST /api/skills/upload returns Chinese validation errors', async () => {
    const app = await createApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/skills/upload',
        headers: AUTH_HEADERS,
        payload: { name: 'demo-skill', files: [] },
      });

      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).error, '缺少技能名称或文件内容');
    } finally {
      await app.close();
    }
  });
});
