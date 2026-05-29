/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage as ChatMessageType } from '@/stores/chatStore';

const markdownRenderSpy = vi.fn(({ content }: { content: string }) => React.createElement('p', null, content));

vi.mock('@/hooks/useTts', () => ({
  useTts: () => ({ state: 'idle', synthesize: vi.fn(), activeMessageId: null }),
}));
vi.mock('@/hooks/useCoCreatorConfig', () => ({
  useCoCreatorConfig: () => ({
    name: 'ME',
    avatar: '',
    color: { primary: '#000000', secondary: '#ffffff' },
  }),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      uiThinkingExpandedByDefault: false,
      threads: [],
      currentThreadId: 'thread-1',
    }),
}));

vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: (props: { content: string }) => markdownRenderSpy(props),
}));
vi.mock('@/components/AgentAvatar', () => ({ AgentAvatar: () => null }));
vi.mock('../components/ConnectorBubble', () => ({ ConnectorBubble: () => null }));
vi.mock('../components/ContentBlocks', () => ({ ContentBlocks: () => null }));
vi.mock('../components/DirectionPill', () => ({ DirectionPill: () => null }));
vi.mock('../components/EvidencePanel', () => ({ EvidencePanel: () => null }));
vi.mock('../components/IntentRecognitionPlaceholder', () => ({ IntentRecognitionPlaceholder: () => null }));
vi.mock('../components/MetadataBadge', () => ({ MetadataBadge: () => null }));
vi.mock('../components/ReplyPill', () => ({ ReplyPill: () => null }));
vi.mock('../components/ThinkingContent', () => ({ ThinkingContent: () => null }));
vi.mock('../components/TimeoutDiagnosticsPanel', () => ({ TimeoutDiagnosticsPanel: () => null }));
vi.mock('../components/TtsPlayButton', () => ({ TtsPlayButton: () => null }));
vi.mock('@/components/cli-output/cli-output-block', () => ({ CliOutputBlock: () => null }));
vi.mock('@/components/rich/RichBlocks', () => ({ RichBlocks: () => null }));

describe('ChatMessage memoization', () => {
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
    markdownRenderSpy.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('does not rerender an unchanged message when the parent rerenders', async () => {
    const { ChatMessage } = await import('@/components/chat-message');

    const message: ChatMessageType = {
      id: 'msg-1',
      type: 'assistant',
      agentId: 'assistant',
      content: 'Stable markdown body',
      timestamp: Date.now(),
      isStreaming: false,
    };
    const getAgentById = () => undefined;

    function Parent() {
      const [, setTick] = useState(0);
      return (
        <div>
          <button type="button" data-testid="rerender" onClick={() => setTick((value) => value + 1)}>
            rerender
          </button>
          <ChatMessage message={message} getAgentById={getAgentById} />
        </div>
      );
    }

    act(() => {
      root.render(<Parent />);
    });

    expect(markdownRenderSpy).toHaveBeenCalledTimes(1);

    act(() => {
      (container.querySelector('[data-testid="rerender"]') as HTMLButtonElement).click();
    });

    expect(markdownRenderSpy).toHaveBeenCalledTimes(1);
  });
});
