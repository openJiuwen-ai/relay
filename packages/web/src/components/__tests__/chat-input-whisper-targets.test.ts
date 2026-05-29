/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b Phase 3: Regression test for whisper target selection.
 *
 * Verifies that cats with empty mentionPatterns still appear in the
 * whisper target list and can be toggled. This prevents re-coupling
 * whisper targets to the mention-filtered agentOptions in future refactors.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat-input/ChatInput';

// ── Mocks ──
vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/components/chat-input/components/ImagePreview', () => ({ ImagePreview: () => null }));
vi.mock('@/utils/compressImage', () => ({ compressImage: (f: File) => Promise.resolve(f) }));

// Two agents: one with mentionPatterns, one without (non-default variant)
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [
      {
        id: 'opus',
        displayName: '布偶猫',
        color: { primary: '#9B7EBD', secondary: '#E8D5F5' },
        mentionPatterns: ['布偶', '布偶猫', 'opus'],
        provider: 'anthropic',
        defaultModel: 'opus',
        avatar: '/a.png',
        roleDescription: 'dev',
        personality: 'kind',
      },
      {
        id: 'opus-fast',
        displayName: '布偶猫(快)',
        color: { primary: '#9B7EBD', secondary: '#E8D5F5' },
        mentionPatterns: [],
        provider: 'anthropic',
        defaultModel: 'opus-fast',
        avatar: '/a.png',
        roleDescription: '快速变体',
        personality: 'kind',
      },
    ],
    isLoading: false,
    getAgentById: () => undefined,
    getAgentsByBreed: () => new Map(),
  }),
}));

// ── Setup ──
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

describe('ChatInput whisper targets with empty mentionPatterns', () => {
  it('shows all cats including those with empty mentionPatterns as whisper targets', () => {
    act(() => {
      root.render(React.createElement(ChatInput, { onSend: vi.fn() }));
    });

    // Click the whisper mode toggle (aria-label="Whisper mode")
    const whisperBtn = container.querySelector<HTMLButtonElement>('[aria-label="Whisper mode"]');
    expect(whisperBtn).not.toBeNull();
    act(() => whisperBtn?.click());

    // Whisper section should show "悄悄话发给:" with target buttons
    expect(container.textContent).toContain('悄悄话发给');

    // Collect whisper target button texts (rounded-full pill buttons)
    const targetButtons = [...container.querySelectorAll('button')].filter((b) => b.className.includes('rounded-full'));
    const targetNames = targetButtons.map((b) => b.textContent);

    // Both cats should be available as whisper targets
    expect(targetNames).toContain('布偶猫');
    expect(targetNames).toContain('布偶猫(快)');
  });

  it('can toggle a whisper target with empty mentionPatterns', () => {
    act(() => {
      root.render(React.createElement(ChatInput, { onSend: vi.fn() }));
    });

    // Enter whisper mode
    const whisperBtn = container.querySelector<HTMLButtonElement>('[aria-label="Whisper mode"]');
    act(() => whisperBtn?.click());

    // Find the opus-fast target button and click to deselect
    const targetButtons = [...container.querySelectorAll('button')].filter((b) => b.className.includes('rounded-full'));
    const fastBtn = targetButtons.find((b) => b.textContent === '布偶猫(快)');
    expect(fastBtn).toBeDefined();

    // Initially auto-selected (border-current bg-amber-50)
    expect(fastBtn?.className).toContain('bg-amber-50');

    // Click to deselect
    act(() => fastBtn?.click());
    expect(fastBtn?.className).not.toContain('bg-amber-50');

    // Click again to re-select
    act(() => fastBtn?.click());
    expect(fastBtn?.className).toContain('bg-amber-50');
  });
});
