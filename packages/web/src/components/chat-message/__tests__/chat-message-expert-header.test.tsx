/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentData } from '@/hooks/useAgentData';
import type { ExpertCatalogItem } from '@/hooks/useExpertCatalog';
import type { ChatMessage as ChatMessageType } from '@/stores/chatStore';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeInvocations: {},
      agentInvocations: {},
      currentThreadId: 'thread-1',
      hasActiveInvocation: false,
      targetAgents: [],
      threads: [],
      uiThinkingExpandedByDefault: false,
    }),
}));

vi.mock('@/hooks/useCoCreatorConfig', () => ({
  useCoCreatorConfig: () => ({
    name: '始皇帝',
    aliases: ['秦始皇'],
    mentionPatterns: ['@owner', '@me'],
    avatar: '/uploads/qin-owner.png',
    color: { primary: '#B76E4C', secondary: '#F8D7C6' },
  }),
}));

vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => React.createElement('span', null, content),
}));
vi.mock('@/components/AgentAvatar', () => ({
  AgentAvatar: ({ agentId }: { agentId: string }) =>
    agentId === 'expert-poetry'
      ? React.createElement('img', {
          alt: '古诗词创作专家',
          src: '/avatars/expert-poetry.png',
        })
      : null,
}));
vi.mock('../components/ConnectorBubble', () => ({ ConnectorBubble: () => null }));
vi.mock('../components/ContentBlocks', () => ({ ContentBlocks: () => null }));
vi.mock('../components/DirectionPill', () => ({ DirectionPill: () => null }));
vi.mock('../components/EvidencePanel', () => ({ EvidencePanel: () => null }));
vi.mock('../components/IntentRecognitionPlaceholder', () => ({ IntentRecognitionPlaceholder: () => null }));
vi.mock('../components/ReplyPill', () => ({ ReplyPill: () => null }));
vi.mock('../components/TaskGroupedStreamBody', () => ({ TaskGroupedStreamBody: () => null }));
vi.mock('../components/ThinkingContent', () => ({ ThinkingContent: () => null }));
vi.mock('../components/TimeoutDiagnosticsPanel', () => ({ TimeoutDiagnosticsPanel: () => null }));
vi.mock('@/components/rich/RichBlocks', () => ({ RichBlocks: () => null }));

vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [
      {
        id: 'jiuwenclaw',
        displayName: '办公助理',
        roster: { available: true },
      },
    ],
    isLoading: false,
    getCatById: (id: string) =>
      id === 'jiuwenclaw'
        ? {
            id: 'jiuwenclaw',
            displayName: '办公助理',
            avatar: '/avatars/jiuwenclaw.png',
            color: { primary: '#D97A3A', secondary: '#F6E7DA' },
          }
        : undefined,
    getCatsByBreed: () => new Map(),
  }),
}));

vi.mock('@/hooks/useExpertCatalog', () => ({
  useExpertCatalog: () => ({
    experts: [
      {
        expertId: 'expert-poetry',
        displayName: '古诗词创作专家',
        avatar: '/avatars/expert-poetry.png',
        color: { primary: '#8B5CF6', secondary: '#EDE9FE' },
        category: 'content',
        mentionPatterns: ['@expert-poetry', '@古诗词创作专家'],
        roleDescription: 'poetry expert',
      },
    ],
    isLoading: false,
    refresh: vi.fn(),
    getExpertById: (id: string) =>
      id === 'expert-poetry'
        ? ({
            expertId: 'expert-poetry',
            displayName: '古诗词创作专家',
            avatar: '/avatars/expert-poetry.png',
            color: { primary: '#8B5CF6', secondary: '#EDE9FE' },
            category: 'content',
            mentionPatterns: ['@expert-poetry', '@古诗词创作专家'],
            roleDescription: 'poetry expert',
          } satisfies ExpertCatalogItem)
        : undefined,
  }),
}));

describe('ChatMessage expert header rendering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders avatar, display name, and timestamp for expert replies', async () => {
    const { ChatMessage } = await import('@/components/chat-message');
    const getAgentById = vi.fn((id: string): AgentData | undefined =>
      id === 'expert-poetry'
        ? {
            id: 'expert-poetry',
            name: '古诗词创作专家',
            displayName: '古诗词创作专家',
            nickname: '小诗',
            avatar: '/avatars/expert-poetry.png',
            color: { primary: '#8B5CF6', secondary: '#EDE9FE' },
            mentionPatterns: [],
            breedId: 'content',
            provider: 'relayclaw',
            defaultModel: 'glm-5',
            roleDescription: 'poetry expert',
            personality: '沉静典雅',
            source: 'runtime',
            expert: true,
            roster: { family: 'content', roles: [], lead: false, available: true, evaluation: 'preset expert' },
          }
        : undefined,
    );

    const timestamp = new Date('2026-05-11T12:34:00').getTime();
    const message: ChatMessageType = {
      id: 'msg-expert-1',
      type: 'assistant',
      agentId: 'expert-poetry',
      content: '一春又到杜鹃时',
      timestamp,
      contentBlocks: [],
    } as ChatMessageType;

    act(() => {
      root.render(React.createElement(ChatMessage, { message, getAgentById }));
    });

    expect(container.textContent).toContain('古诗词创作专家');
    expect(container.textContent).toContain('一春又到杜鹃时');
    expect(container.textContent).toContain('05/11 12:34');
    expect(container.textContent).not.toContain('expert-poetry');

    const avatar = container.querySelector('img[alt="古诗词创作专家"]') as HTMLImageElement | null;
    expect(avatar).not.toBeNull();
    expect(avatar?.getAttribute('src')).toBe('/avatars/expert-poetry.png');
  });
});
