/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('A2ACollapsible layout-change event', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('emits chat-layout-changed after expand commits (cloud P2)', async () => {
    const { A2ACollapsible } = await import('@/components/A2ACollapsible');

    const group = {
      groupId: 'g1',
      messages: [
        { id: 'm1', agentId: 'codex', content: 'hi' },
        { id: 'm2', agentId: 'opus', content: 'yo' },
      ],
    } as unknown;

    let expandedPresentAtEvent: boolean | null = null;
    const handler = () => {
      expandedPresentAtEvent = Boolean(container.querySelector('div.border-l-2'));
    };
    window.addEventListener('office-claw:chat-layout-changed', handler);

    act(() => {
      root.render(
        React.createElement(A2ACollapsible, {
          group: group as never,
          renderMessage: (msg: { id: string }) => React.createElement('div', {}, `msg:${msg.id}`),
        }),
      );
    });

    const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('查看内部讨论'),
    );
    expect(toggle).toBeTruthy();

    act(() => {
      (toggle as HTMLButtonElement).click();
    });

    expect(container.querySelector('div.border-l-2')).toBeTruthy();
    expect(expandedPresentAtEvent).toBe(true);

    window.removeEventListener('office-claw:chat-layout-changed', handler);
  });
});
