/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F80: Draft persistence across thread switches.
 *
 * Verifies that:
 * 1. Typed text survives unmount/remount with the same threadId
 * 2. Different threads maintain independent drafts
 * 3. Sending a message clears the draft
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, threadDrafts } from '@/components/chat-input/ChatInput';

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
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [
      {
        id: 'opus',
        displayName: '布偶猫',
        color: { primary: '#9B7EBD', secondary: '#E8D5F5' },
        mentionPatterns: ['布偶猫'],
        provider: 'anthropic',
        defaultModel: 'opus',
        avatar: '/a.png',
        roleDescription: 'dev',
        personality: 'kind',
      },
    ],
    isLoading: false,
    getAgentById: () => undefined,
    getAgentsByBreed: () => new Map(),
  }),
}));

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
});
afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  threadDrafts.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function getTextarea(): HTMLTextAreaElement {
  return container.querySelector('textarea') as HTMLTextAreaElement;
}

function typeInto(textarea: HTMLTextAreaElement, value: string) {
  // React controlled components need nativeInputValueSetter + input event
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  nativeSetter.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ChatInput draft persistence', () => {
  it('restores draft when remounting with same threadId', () => {
    const onSend = vi.fn();

    // Mount with thread-A, type something
    act(() => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-A', onSend }));
    });
    act(() => {
      typeInto(getTextarea(), 'hello from A');
    });
    expect(getTextarea().value).toBe('hello from A');

    // Unmount
    act(() => root.unmount());

    // Remount with same threadId
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-A', onSend }));
    });

    // Draft should be restored
    expect(getTextarea().value).toBe('hello from A');
  });

  it('maintains independent drafts per thread', () => {
    const onSend = vi.fn();

    // Type in thread-A
    act(() => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-A', onSend }));
    });
    act(() => {
      typeInto(getTextarea(), 'draft A');
    });
    act(() => root.unmount());

    // Type in thread-B
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-B', onSend }));
    });
    act(() => {
      typeInto(getTextarea(), 'draft B');
    });
    act(() => root.unmount());

    // Switch back to thread-A — should see "draft A", not "draft B"
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-A', onSend }));
    });
    expect(getTextarea().value).toBe('draft A');
  });

  it('clears draft after sending', () => {
    const onSend = vi.fn();

    // Type and send
    act(() => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-C', onSend }));
    });
    act(() => {
      typeInto(getTextarea(), 'will be sent');
    });

    // Press Enter to send
    const textarea = getTextarea();
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onSend).toHaveBeenCalledWith('will be sent', undefined, undefined, undefined);

    // Unmount and remount — draft should be gone
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-C', onSend }));
    });
    expect(getTextarea().value).toBe('');
  });

  it('does not persist draft when threadId is undefined', () => {
    const onSend = vi.fn();

    act(() => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    act(() => {
      typeInto(getTextarea(), 'no thread');
    });

    // Map should remain empty — no threadId means no persistence
    expect(threadDrafts.size).toBe(0);
  });
});
