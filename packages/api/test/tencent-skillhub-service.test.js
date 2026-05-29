/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import test from 'node:test';

test('Tencent SkillHub normalization strips malformed fields before returning search results', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiBase = process.env.TENCENT_SKILLHUB_API_BASE_URL;

  process.env.TENCENT_SKILLHUB_API_BASE_URL = 'https://skillhub.example.test';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: {
          skills: [
            {
              slug: ' skill-safe ',
              name: ' ',
              description: null,
              description_zh: '  normalized description  ',
              ownerName: null,
              stars: 'oops',
              downloads: 12,
              tags: [null, '  ai-intelligence  ', '', 7],
            },
          ],
          total: 1,
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );

  try {
    const { searchSkills } = await import('../src/domains/agents/services/skillhub/TencentSkillHubService.ts');
    const result = await searchSkills('safe');

    assert.equal(result.total, 1);
    assert.equal(result.data.length, 1);
    assert.deepEqual(result.data[0], {
      id: 'skill-safe',
      slug: 'skill-safe',
      name: 'skill-safe',
      description: 'normalized description',
      category: '通用',
      tags: ['ai-intelligence'],
      createdAt: '',
      repo: {
        id: 'skill-safe',
        starCount: 0,
        downloadCount: 12,
        githubOwner: '',
        githubRepoName: 'skill-safe',
      },
      owner: {
        id: '',
        username: '',
        displayName: '',
        avatarUrl: '',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.TENCENT_SKILLHUB_API_BASE_URL;
    } else {
      process.env.TENCENT_SKILLHUB_API_BASE_URL = originalApiBase;
    }
  }
});

test('Tencent SkillHub normalization keeps upstream category and falls back to 通用', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiBase = process.env.TENCENT_SKILLHUB_API_BASE_URL;

  process.env.TENCENT_SKILLHUB_API_BASE_URL = 'https://skillhub.example.test';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: {
          skills: [
            {
              slug: 'skill-with-category',
              name: 'Skill With Category',
              description: 'category preserved',
              category: 'developer-tools',
              tags: ['ignored-tag'],
            },
            {
              slug: 'skill-without-category',
              name: 'Skill Without Category',
              description: 'category fallback',
              tags: ['ignored-tag'],
            },
          ],
          total: 2,
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );

  try {
    const { searchSkills } = await import('../src/domains/agents/services/skillhub/TencentSkillHubService.ts?category-test');
    const result = await searchSkills('category');

    assert.equal(result.data[0]?.category, 'developer-tools');
    assert.equal(result.data[1]?.category, '通用');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.TENCENT_SKILLHUB_API_BASE_URL;
    } else {
      process.env.TENCENT_SKILLHUB_API_BASE_URL = originalApiBase;
    }
  }
});

test('Tencent SkillHub search falls back to the default API base when env is missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiBase = process.env.TENCENT_SKILLHUB_API_BASE_URL;

  delete process.env.TENCENT_SKILLHUB_API_BASE_URL;

  try {
    const calls = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            skills: [],
            total: 0,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };

    const modulePath = '../src/domains/agents/services/skillhub/TencentSkillHubService.ts?fallback-test';
    const { searchSkills } = await import(modulePath);
    await searchSkills('safe');

    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/lightmake\.site\/api\/skills\?/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.TENCENT_SKILLHUB_API_BASE_URL;
    } else {
      process.env.TENCENT_SKILLHUB_API_BASE_URL = originalApiBase;
    }
  }
});
