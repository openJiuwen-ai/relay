/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat-input/ChatInput';

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
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [],
    isLoading: false,
    getAgentById: () => undefined,
    getAgentsByBreed: () => new Map(),
  }),
}));
vi.mock('@/hooks/useVoiceInput', () => ({
  useVoiceInput: () => ({
    state: 'idle',
    transcript: '',
    partialTranscript: '',
    error: null,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePathCompletion', () => ({
  usePathCompletion: () => ({
    entries: [],
    isOpen: false,
    selectedIdx: 0,
    setSelectedIdx: vi.fn(),
    selectEntry: vi.fn(),
    close: vi.fn(),
    detectPath: vi.fn(),
  }),
}));
vi.mock('@/utils/skill-options-cache', () => ({
  fetchSkillOptionsWithCache: () => Promise.resolve([]),
  seedSkillOptionsCache: vi.fn(),
  SKILL_OPTIONS_UPDATED_EVENT: 'office-claw:skill-options-updated',
}));
vi.mock('@/components/chat-input/components/TemplatePicker', () => ({
  TemplatePicker: ({ onSelectChange }: { onSelectChange: (template: { id: string; name: string } | null) => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'mock-template-picker-select',
        onClick: () => onSelectChange({ id: 'builtin:light-tech', name: '浅色科技风' }),
      },
      'select template',
    ),
}));

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

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
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getTextbox(): HTMLDivElement {
  return container.querySelector('[role="textbox"]') as HTMLDivElement;
}

function getSendButton(): HTMLButtonElement {
  return container.querySelector('button[aria-label="发送消息"]') as HTMLButtonElement;
}

function setTextboxValue(value: string) {
  const textbox = getTextbox();
  act(() => {
    textbox.textContent = value;
    textbox.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  });
}

describe('ChatInput ppt template reset behavior', () => {
  it('does not keep sending pptTemplateId after slide-mode send completes', async () => {
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    await flush();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('幻灯片')) as HTMLButtonElement).click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="chat-input-style-template-trigger"]') as HTMLButtonElement).click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="mock-template-picker-select"]') as HTMLButtonElement).click();
    });
    await flush();

    setTextboxValue('[[quick_action:幻灯片]] 帮我做一页发布会 PPT');
    await flush();

    act(() => {
      getSendButton().click();
    });

    expect(onSend).toHaveBeenNthCalledWith(
      1,
      '幻灯片 帮我做一页发布会 PPT',
      undefined,
      undefined,
      undefined,
      { pptTemplateId: 'builtin:light-tech' },
    );

    setTextboxValue('普通聊天消息');
    await flush();

    expect(container.querySelector('[data-testid="chat-input-selected-template-pill"]')).toBeNull();

    act(() => {
      getSendButton().click();
    });

    expect(onSend).toHaveBeenNthCalledWith(2, '普通聊天消息', undefined, undefined, undefined, undefined);
  });
});
