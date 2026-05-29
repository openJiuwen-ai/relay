/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b: Multi-variant mention parsing tests
 * Tests longest-match-first + token boundary + consumed interval algorithm
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { officeClawRegistry, createAgentId } from '@openjiuwen/relay-shared';

const { AgentRouter } = await import('../dist/domains/agents/services/agents/routing/AgentRouter.js');
const { AgentRegistry } = await import('../dist/domains/agents/services/agents/registry/AgentRegistry.js');

/** Minimal mock service that yields text + done */
function createMockService(agentId) {
  return {
    agentId: createAgentId(agentId),
    invoke: async function* (prompt) {
      yield { type: 'text', agentId: createAgentId(agentId), content: `[${agentId}] ${prompt}`, timestamp: Date.now() };
      yield { type: 'done', agentId: createAgentId(agentId), timestamp: Date.now() };
    },
  };
}

function createMockRegistry() {
  let counter = 0;
  return {
    create: () => ({ invocationId: `inv-${++counter}`, callbackToken: `tok-${counter}` }),
    verify: () => null,
  };
}

function createMockMessageStore() {
  const rows = [];
  let seq = 0;
  const sorted = () => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
  return {
    append: (msg) => {
      const stored = { ...msg, id: `msg-${String(++seq).padStart(6, '0')}`, threadId: msg.threadId ?? 'default' };
      rows.push(stored);
      return stored;
    },
    getRecent: (limit = 50) => sorted().slice(-limit),
    getMentionsFor: () => [],
    getByThread: () => [],
    getByThreadAfter: () => [],
    getByThreadBefore: () => [],
    deleteByThread: () => 0,
  };
}

function createMockThreadStore() {
  const participants = new Map();
  const activity = new Map();
  return {
    get: () => null,
    getParticipants: (threadId) => participants.get(threadId) ?? [],
    addParticipants: (threadId, cats) => {
      const existing = participants.get(threadId) ?? [];
      const merged = [...new Set([...existing, ...cats])];
      participants.set(threadId, merged);
      // Track activity
      const now = Date.now();
      for (const agentId of cats) {
        const key = `${threadId}:${agentId}`;
        const existing = activity.get(key) ?? { lastMessageAt: 0, messageCount: 0 };
        activity.set(key, { lastMessageAt: now, messageCount: existing.messageCount + 1 });
      }
    },
    // F032 P1-2: Return participants with activity
    getParticipantsWithActivity: (threadId) => {
      const cats = participants.get(threadId) ?? [];
      return cats
        .map((agentId) => {
          const key = `${threadId}:${agentId}`;
          const data = activity.get(key) ?? { lastMessageAt: 0, messageCount: 0 };
          return { agentId, lastMessageAt: data.lastMessageAt, messageCount: data.messageCount };
        })
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    },
    updateParticipantActivity: (threadId, agentId) => {
      const cats = participants.get(threadId) ?? [];
      if (!cats.includes(agentId)) {
        participants.set(threadId, [...cats, agentId]);
      }
      const key = `${threadId}:${agentId}`;
      const existing = activity.get(key) ?? { lastMessageAt: 0, messageCount: 0 };
      activity.set(key, { lastMessageAt: Date.now(), messageCount: existing.messageCount + 1 });
    },
    updateLastActive: () => {},
  };
}

// Register variant cats for testing
const variantCatConfigs = {
  'opus-45': {
    id: createAgentId('opus-45'),
    name: 'opus-45',
    displayName: 'Claude 4.5',
    avatar: '/avatars/opus.png',
    color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
    mentionPatterns: ['@opus-45', '@claude4.5'],
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    mcpSupport: true,
    roleDescription: '主架构师',
    personality: '快速',
    breedId: 'ragdoll',
  },
};

// Track whether we registered (for cleanup)
let _registeredVariants = false;

before(() => {
  for (const [id, config] of Object.entries(variantCatConfigs)) {
    if (!officeClawRegistry.has(id)) {
      officeClawRegistry.register(id, config);
      _registeredVariants = true;
    }
  }
});

after(() => {
  // officeClawRegistry has no unregister API, but since tests run in isolation this is fine
});

describe('F32-b: parseMentions (longest-match-first)', () => {
  /** Create a router with variant services registered */
  async function createVariantRouter() {
    const agentRegistry = new AgentRegistry();
    agentRegistry.register('opus', createMockService('opus'));
    agentRegistry.register('codex', createMockService('codex'));
    agentRegistry.register('gemini', createMockService('gemini'));
    agentRegistry.register('opus-45', createMockService('opus-45'));

    return new AgentRouter({
      agentRegistry,
      registry: createMockRegistry(),
      messageStore: createMockMessageStore(),
      threadStore: createMockThreadStore(),
    });
  }

  it('@opus-45 routes to opus-45 only, not both opus and opus-45', async () => {
    const router = await createVariantRouter();
    const { targetAgents } = await router.resolveTargetsAndIntent('请 @opus-45 帮我写个函数', 'test-thread');
    assert.deepEqual(targetAgents.map(String), ['opus-45']);
  });

  it('@opus routes to opus only, not opus-45', async () => {
    const router = await createVariantRouter();
    const { targetAgents } = await router.resolveTargetsAndIntent('请 @opus 帮我看看', 'test-thread');
    assert.deepEqual(targetAgents.map(String), ['opus']);
  });

  it('@opus and @opus-45 both mentioned → two distinct targets', async () => {
    const router = await createVariantRouter();
    const { targetAgents } = await router.resolveTargetsAndIntent('@opus 和 @opus-45 一起来讨论', 'test-thread');
    assert.equal(targetAgents.length, 2);
    assert.ok(targetAgents.map(String).includes('opus'));
    assert.ok(targetAgents.map(String).includes('opus-45'));
  });

  it('@claude4.5 routes to opus-45 (Chinese variant mention)', async () => {
    const router = await createVariantRouter();
    const { targetAgents } = await router.resolveTargetsAndIntent('请 @claude4.5 来帮忙', 'test-thread');
    assert.deepEqual(targetAgents.map(String), ['opus-45']);
  });

  it('token boundary: @opus-45x does not match (no boundary after)', async () => {
    const router = await createVariantRouter();
    const { targetAgents } = await router.resolveTargetsAndIntent('邮件 @opus-45x 不是智能体', 'test-thread');
    // Should fall through to default (opus) since no valid mention found
    assert.deepEqual(targetAgents.map(String), ['opus']);
  });

  it('token boundary: @opus-45, (with comma) matches', async () => {
    const router = await createVariantRouter();
    const { targetAgents } = await router.resolveTargetsAndIntent('@opus-45，帮我看看代码', 'test-thread');
    assert.deepEqual(targetAgents.map(String), ['opus-45']);
  });

  it('preserves first-occurrence ordering', async () => {
    const router = await createVariantRouter();
    const { targetAgents } = await router.resolveTargetsAndIntent('@codex 和 @opus 来看看', 'test-thread');
    assert.deepEqual(targetAgents.map(String), ['codex', 'opus']);
  });

  it('earliest position wins when same cat has short+long alias (cloud P1 regression)', async () => {
    const router = await createVariantRouter();
    // @claude (short alias, early) → opus, @codex (mid), @claude (long alias, late) → opus
    // Longest-first processing sees @claude first (later position), but opus should
    // resolve to the earliest occurrence (@claude at position 0), not the longest match.
    const { targetAgents } = await router.resolveTargetsAndIntent(
      '@claude 和 @codex 讨论一下 @claude 的方案',
      'test-thread',
    );
    // opus should come first (earliest mention), codex second
    assert.deepEqual(targetAgents.map(String), ['opus', 'codex']);
  });

  it('bracket delimiters count as token boundary (cloud P2 regression)', async () => {
    const router = await createVariantRouter();
    // (@codex) — parenthesis after mention should be a valid boundary
    const r1 = await router.resolveTargetsAndIntent('(@codex)', 'test-thread');
    assert.deepEqual(r1.targetAgents.map(String), ['codex']);

    // [@claude] — square bracket
    const r2 = await router.resolveTargetsAndIntent('[@claude]', 'test-thread');
    assert.deepEqual(r2.targetAgents.map(String), ['opus']);

    // <@opus> — angle bracket
    const r3 = await router.resolveTargetsAndIntent('<@opus>', 'test-thread');
    assert.deepEqual(r3.targetAgents.map(String), ['opus']);
  });

  it('CJK fullwidth brackets count as token boundary (R3 P1 regression)', async () => {
    const router = await createVariantRouter();
    // （@codex） — fullwidth parenthesis
    const r1 = await router.resolveTargetsAndIntent('（@codex）', 'test-thread');
    assert.deepEqual(r1.targetAgents.map(String), ['codex']);

    // 【@assistant】 — fullwidth square bracket
    const r2 = await router.resolveTargetsAndIntent('【@assistant】', 'test-thread');
    assert.deepEqual(r2.targetAgents.map(String), ['codex']);

    // 《@opus》 — fullwidth angle bracket
    const r3 = await router.resolveTargetsAndIntent('《@opus》', 'test-thread');
    assert.deepEqual(r3.targetAgents.map(String), ['opus']);

    // 「@claude」 — corner bracket (common in Japanese/traditional Chinese)
    const r4 = await router.resolveTargetsAndIntent('「@claude」', 'test-thread');
    assert.deepEqual(r4.targetAgents.map(String), ['opus']);
  });
});
