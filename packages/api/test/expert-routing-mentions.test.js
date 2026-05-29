/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { officeClawRegistry } from '@openjiuwen/relay-shared';

function createMockRegistry() {
  return {
    create: () => ({ invocationId: 'inv-1', callbackToken: 'tok-1' }),
    verify: () => null,
  };
}

function createMockMessageStore() {
  return {
    append: async () => null,
    getByThread: async () => [],
  };
}

function createMockCatalogProvider() {
  return {
    readCatalog: async () => ({ catalog: { agents: {} } }),
    listRoutableMembers: async () => null,
  };
}

function createMockAgentService(agentId) {
  return {
    async *invoke(prompt) {
      yield {
        type: 'text',
        agentId,
        content: prompt,
        timestamp: Date.now(),
      };
    },
  };
}

test('invited @古诗词创作专家 resolves to expert-poetry in the current thread', async () => {
  const { AgentRegistry } = await import('../dist/domains/agents/services/agents/registry/AgentRegistry.js');
  const { AgentRouter } = await import('../dist/domains/agents/services/agents/routing/AgentRouter.js');
  const { initExpertCatalog, registerExpertAgents } = await import('../dist/domains/agents/services/experts/ExpertCatalog.js');

  initExpertCatalog();
  registerExpertAgents(officeClawRegistry);

  const collisionAgentId = `poetry-helper-${Date.now()}`;
  officeClawRegistry.register(collisionAgentId, {
    id: collisionAgentId,
    displayName: '古诗词助手',
    name: '古诗词助手',
    mentionPatterns: ['@古诗词创作专家'],
    avatar: '',
    color: { primary: '#8E44AD', secondary: '#F2E9FF' },
    provider: 'openai',
    defaultModel: 'gpt-4.1',
    roleDescription: '测试用诗词助手',
    personality: 'test',
    source: 'seed',
    roster: null,
  });

  const agentRegistry = new AgentRegistry();
  agentRegistry.register(collisionAgentId, createMockAgentService(collisionAgentId));
  agentRegistry.register('expert-poetry', createMockAgentService('expert-poetry'));

  const router = new AgentRouter({
    agentRegistry,
    catalogProvider: createMockCatalogProvider(),
    registry: createMockRegistry(),
    messageStore: createMockMessageStore(),
    threadStore: {
      getInvitedExperts: async () => ['expert-poetry'],
      getParticipants: async () => [],
      getParticipantsWithActivity: async () => [],
    },
  });

  const withoutHint = await router.resolveTargetsAndIntent('@古诗词创作专家 帮我写一首七言绝句', 'thread-poetry');
  // 无 hint 时：受邀 expert 优先返回（因为 getThreadScopedVisibility 已将受邀 expert 合并到 visibleAgentIds）
  // collisionAgentId 虽然有相同的 mention pattern，但它未被邀请，所以在路由时不会被优先选择
  assert.deepEqual(withoutHint.targetAgents, ['expert-poetry']);

  const withHint = await router.resolveTargetsAndIntent(
    '@古诗词创作专家 帮我写一首七言绝句',
    'thread-poetry',
    {
      mentionRefs: [{ catId: 'expert-poetry', mention: '@古诗词创作专家' }],
    },
  );
  assert.deepEqual(withHint.targetAgents, ['expert-poetry']);
});

test('latest surviving mentionRef wins when stale same-name refs remain in the payload', async () => {
  const { AgentRegistry } = await import('../dist/domains/agents/services/agents/registry/AgentRegistry.js');
  const { AgentRouter } = await import('../dist/domains/agents/services/agents/routing/AgentRouter.js');
  const { initExpertCatalog, registerExpertAgents } = await import('../dist/domains/agents/services/experts/ExpertCatalog.js');

  initExpertCatalog();
  registerExpertAgents(officeClawRegistry);

  const collisionAgentId = `poetry-helper-${Date.now()}`;
  officeClawRegistry.register(collisionAgentId, {
    id: collisionAgentId,
    displayName: '古诗词助手',
    name: '古诗词助手',
    mentionPatterns: ['@古诗词创作专家'],
    avatar: '',
    color: { primary: '#8E44AD', secondary: '#F2E9FF' },
    provider: 'openai',
    defaultModel: 'gpt-4.1',
    roleDescription: '测试用诗词助手',
    personality: 'test',
    source: 'seed',
    roster: null,
  });

  const agentRegistry = new AgentRegistry();
  agentRegistry.register(collisionAgentId, createMockAgentService(collisionAgentId));
  agentRegistry.register('expert-poetry', createMockAgentService('expert-poetry'));

  const router = new AgentRouter({
    agentRegistry,
    catalogProvider: createMockCatalogProvider(),
    registry: createMockRegistry(),
    messageStore: createMockMessageStore(),
    threadStore: {
      getInvitedExperts: async () => ['expert-poetry'],
      getParticipants: async () => [],
      getParticipantsWithActivity: async () => [],
    },
  });

  const result = await router.resolveTargetsAndIntent('@古诗词创作专家 帮我写一首七言绝句', 'thread-poetry', {
    mentionRefs: [
      { catId: collisionAgentId, mention: '@古诗词创作专家' },
      { catId: 'expert-poetry', mention: '@古诗词创作专家' },
    ],
  });
  assert.deepEqual(result.targetAgents, ['expert-poetry']);
});

test('invited expert remains routable under gatewayIdentity-scoped catalog visibility', async () => {
  const { AgentRegistry } = await import('../dist/domains/agents/services/agents/registry/AgentRegistry.js');
  const { AgentRouter } = await import('../dist/domains/agents/services/agents/routing/AgentRouter.js');
  const { initExpertCatalog, registerExpertAgents } = await import('../dist/domains/agents/services/experts/ExpertCatalog.js');

  initExpertCatalog();
  registerExpertAgents(officeClawRegistry);

  const catalogProvider = {
    readCatalog: async () => ({ catalog: { agents: {} } }),
    listRoutableMembers: async (identity) => {
      if (identity?.userId !== 'scoped-user') return [];
      return [
        {
          agentId: 'codex',
          config: {
            id: 'codex',
            name: 'Codex',
            displayName: 'Codex',
            mentionPatterns: ['@codex'],
            avatar: '',
            color: { primary: '#111827', secondary: '#d1d5db' },
            provider: 'openai',
            defaultModel: 'gpt-5.4',
            mcpSupport: false,
          },
        },
      ];
    },
  };

  const agentRegistry = new AgentRegistry();
  agentRegistry.register('codex', createMockAgentService('codex'));
  agentRegistry.register('expert-poetry', createMockAgentService('expert-poetry'));

  const router = new AgentRouter({
    agentRegistry,
    catalogProvider,
    registry: createMockRegistry(),
    messageStore: createMockMessageStore(),
    threadStore: {
      getInvitedExperts: async () => ['expert-poetry'],
      getParticipants: async () => [],
      getParticipantsWithActivity: async () => [],
    },
  });

  const result = await router.resolveTargetsAndIntent('@古诗词创作专家 帮我写一首七言绝句', 'thread-poetry', {
    identity: { userId: 'scoped-user' },
    mentionRefs: [{ catId: 'expert-poetry', mention: '@古诗词创作专家' }],
  });
  assert.deepEqual(result.targetAgents, ['expert-poetry']);
});
