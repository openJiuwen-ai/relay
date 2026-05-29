/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCancelInvocation = vi.fn();

// Mock useAgentData
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    getAgentById: (id: string) => (id === 'codex' ? { displayName: '缅因猫 (Codex)', agentId: 'codex' } : null),
  }),
}));

const storeState: Record<string, unknown> = {
  targetAgents: ['codex'],
  agentStatuses: {} as Record<string, string>,
  agentInvocations: {} as Record<string, unknown>,
  currentThreadId: 'thread-1',
};

vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => (selector ? selector(storeState) : storeState),
    { getState: () => storeState },
  ),
}));

describe('F118 ThinkingIndicator liveness states', () => {
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
    mockCancelInvocation.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders amber warning for alive_but_silent', async () => {
    storeState.agentStatuses = { codex: 'alive_but_silent' };
    storeState.agentInvocations = {
      codex: {
        livenessWarning: {
          level: 'alive_but_silent',
          state: 'busy-silent',
          silenceDurationMs: 150000,
          cpuTimeMs: 4200,
          processAlive: true,
          receivedAt: Date.now(),
        },
      },
    };

    const { ThinkingIndicator } = await import('../ThinkingIndicator');
    act(() => {
      root.render(React.createElement(ThinkingIndicator));
    });

    const el = container.querySelector('[data-testid="liveness-warning"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain('静默等待');
    expect(el?.textContent).toContain('2m 30s');
    // No cancel button for alive_but_silent
    expect(container.querySelector('[data-testid="cancel-btn"]')).toBeNull();
  });

  it('renders orange warning with cancel button for suspected_stall', async () => {
    storeState.agentStatuses = { codex: 'suspected_stall' };
    storeState.agentInvocations = {
      codex: {
        livenessWarning: {
          level: 'suspected_stall',
          state: 'idle-silent',
          silenceDurationMs: 312000,
          processAlive: true,
          receivedAt: Date.now(),
        },
      },
    };

    const { ThinkingIndicator } = await import('../ThinkingIndicator');
    act(() => {
      root.render(
        React.createElement(ThinkingIndicator as React.FC<{ onCancel?: (threadId: string) => void }>, {
          onCancel: mockCancelInvocation,
        }),
      );
    });

    const el = container.querySelector('[data-testid="liveness-warning"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain('可能卡住');
    expect(el?.textContent).toContain('5m 12s');

    const cancelBtn = container.querySelector('[data-testid="cancel-btn"]');
    expect(cancelBtn).toBeTruthy();
  });

  it('cancel button calls onCancel with threadId', async () => {
    storeState.agentStatuses = { codex: 'suspected_stall' };
    storeState.agentInvocations = {
      codex: {
        livenessWarning: {
          level: 'suspected_stall',
          state: 'idle-silent',
          silenceDurationMs: 312000,
          processAlive: true,
          receivedAt: Date.now(),
        },
      },
    };

    const { ThinkingIndicator } = await import('../ThinkingIndicator');
    act(() => {
      root.render(
        React.createElement(ThinkingIndicator as React.FC<{ onCancel?: (threadId: string) => void }>, {
          onCancel: mockCancelInvocation,
        }),
      );
    });

    const cancelBtn = container.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement;
    act(() => {
      cancelBtn.click();
    });

    expect(mockCancelInvocation).toHaveBeenCalledWith('thread-1');
  });

  it('normal thinking state renders paw emoji (KD-9: Apple emoji preferred over Lucide SVG)', async () => {
    storeState.agentStatuses = { codex: 'thinking' };
    storeState.agentInvocations = {};

    const { ThinkingIndicator } = await import('../ThinkingIndicator');
    act(() => {
      root.render(React.createElement(ThinkingIndicator));
    });

    expect(container.textContent).toContain('思考中');
    expect(container.textContent).toContain('⏳');
  });
});
