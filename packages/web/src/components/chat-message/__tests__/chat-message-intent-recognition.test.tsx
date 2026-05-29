/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTts', () => ({
  useTts: () => ({ state: 'idle', synthesize: vi.fn(), activeMessageId: null }),
}));
vi.mock('@/hooks/useCoCreatorConfig', () => ({
  useCoCreatorConfig: () => ({
    name: '共创者',
    aliases: [],
    mentionPatterns: [],
    avatar: '',
    color: { primary: '#815b5b', secondary: '#FFDDD2' },
  }),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (
    selector: (s: { uiThinkingExpandedByDefault: boolean; threads: never[]; currentThreadId: string }) => unknown,
  ) => selector({ uiThinkingExpandedByDefault: false, threads: [], currentThreadId: 'default' }),
}));

vi.mock('@/components/AgentAvatar', () => ({
  AgentAvatar: ({ agentId }: { agentId: string }) =>
    React.createElement('span', { 'data-testid': 'cat-avatar', 'data-cat-id': agentId }, 'avatar'),
}));
vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => React.createElement('span', null, content),
}));
vi.mock('../components/EvidencePanel', () => ({ EvidencePanel: () => null }));
vi.mock('../components/MetadataBadge', () => ({ MetadataBadge: () => null }));
vi.mock('@/components/rich/RichBlocks', () => ({ RichBlocks: () => null }));

describe('ChatMessage intent recognition placeholder', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the recognition placeholder through ChatMessage using passed cat data', async () => {
    const { ChatMessage } = await import('@/components/chat-message');
    const getAgentById = vi.fn(() => ({
      id: 'jiuwenclaw',
      displayName: '主智能体',
      variantLabel: 'Office',
      color: { primary: '#D97A3A', secondary: '#F6E7DA' },
      breedId: 'ragdoll',
      provider: 'openai',
      defaultModel: 'gpt-5.4',
      avatar: '/avatars/jiuwenclaw.png',
      mentionPatterns: [],
      roleDescription: '',
      personality: '',
    }));

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: {
            id: 'intent-1',
            type: 'assistant',
            agentId: 'jiuwenclaw',
            content: '',
            timestamp: new Date(2026, 1, 26, 19, 35, 0).getTime(),
            variant: 'intent_recognition',
          } as never,
          getAgentById: getAgentById as never,
        }),
      );
    });

    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cat-avatar"]')?.getAttribute('data-cat-id')).toBe('jiuwenclaw');
    expect(container.textContent).toContain('主智能体（Office）');
    expect(container.textContent).toContain('正在识别你的需求');
    expect(getAgentById).toHaveBeenCalledWith('jiuwenclaw');
  });
});
