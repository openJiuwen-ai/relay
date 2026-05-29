/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat-input/ChatInput';
import { useInputHistoryStore } from '@/stores/inputHistoryStore';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ entries: [] }),
    }),
  ),
}));

vi.mock('@/utils/skill-options-cache', () => ({
  fetchSkillOptionsWithCache: vi.fn(() => Promise.resolve([])),
  seedSkillOptionsCache: vi.fn(),
}));

vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [],
    isLoading: false,
    getAgentById: () => undefined,
    getAgentsByBreed: () => new Map(),
  }),
}));

vi.mock('@/components/chat-input/components/ImagePreview', () => ({ ImagePreview: () => null }));
vi.mock('@/utils/compressImage', () => ({ compressImage: (file: File) => Promise.resolve(file) }));

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useInputHistoryStore.setState({ entries: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function getTextbox(): HTMLDivElement {
  return container.querySelector('[role="textbox"]') as HTMLDivElement;
}

function setCaretToEnd(element: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function typeIntoTextbox(textbox: HTMLDivElement, value: string) {
  textbox.textContent = value;
  setCaretToEnd(textbox);
  textbox.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ChatInput ghost suggestion during composition', () => {
  it('hides history ghost suggestion while IME composition is active', async () => {
    useInputHistoryStore.setState({ entries: ['hello world'] });

    await act(async () => {
      root.render(<ChatInput threadId="thread-1" onSend={vi.fn()} />);
      await Promise.resolve();
    });

    const textbox = getTextbox();

    act(() => {
      typeIntoTextbox(textbox, 'hel');
    });

    expect(container.querySelector('[data-testid="ghost-suggestion"]')).not.toBeNull();

    act(() => {
      textbox.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="ghost-suggestion"]')).toBeNull();

    act(() => {
      textbox.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'l' }));
    });

    expect(container.querySelector('[data-testid="ghost-suggestion"]')).not.toBeNull();
  });
});
