/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: { removeMessage: (id: string) => void }) => unknown) =>
    selector({ removeMessage: () => {} }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({ threadId: 't2' }) })),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => 'alice',
}));

vi.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

describe('MessageActions position', () => {
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
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('places user copy button row below the bubble and right-aligned', async () => {
    const { MessageActions } = await import('@/components/MessageActions');

    await act(async () => {
      root.render(
        // eslint-disable-next-line react/no-children-prop -- createElement in test
        React.createElement(MessageActions, {
          message: {
            id: 'msg-user-1',
            type: 'user',
            content: 'hi',
            timestamp: Date.now(),
          },
          threadId: 'thread-1',
          isLastCopyVisible: true,
          // biome-ignore lint/correctness/noChildrenProp: createElement in test
          children: React.createElement('div', null, 'user message'),
        }),
      );
    });

    const wrapper = container.querySelector('[data-testid="message-copy-button-wrapper"]') as HTMLDivElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('mt-[8px]');
    expect(wrapper?.className).toContain('mb-[8px]');
    expect(wrapper?.className).toContain('justify-end');
    const legacyToolbar = container.querySelector('div.absolute.right-1');
    expect(legacyToolbar).toBeNull();
  });

  it('places assistant copy button row below the bubble and left-aligned', async () => {
    const { MessageActions } = await import('@/components/MessageActions');

    await act(async () => {
      root.render(
        // eslint-disable-next-line react/no-children-prop -- createElement in test
        React.createElement(MessageActions, {
          message: {
            id: 'msg-assistant-1',
            type: 'assistant',
            agentId: 'codex',
            content: 'hello',
            timestamp: Date.now(),
          },
          threadId: 'thread-1',
          isLastCopyVisible: true,
          // biome-ignore lint/correctness/noChildrenProp: createElement in test
          children: React.createElement('div', null, 'assistant message'),
        }),
      );
    });

    const wrapper = container.querySelector('[data-testid="message-copy-button-wrapper"]') as HTMLDivElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('justify-start');
    const legacyToolbar = container.querySelector('div.absolute.right-1');
    expect(legacyToolbar).toBeNull();
  });
});
