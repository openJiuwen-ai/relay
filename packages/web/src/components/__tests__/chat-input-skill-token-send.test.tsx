/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, threadDrafts } from '@/components/chat-input/ChatInput';
import { restoreSkillTokensFromSendText } from '@/components/chat-input/utils/helpers';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import type { AgentData } from '@/hooks/useAgentData';
import { refreshMentionData, resetMentionDataForTest } from '@/lib/mention-highlight';
import { useChatStore } from '@/stores/chatStore';
import { useInputHistoryStore } from '@/stores/inputHistoryStore';
import { usePlaceholderStore } from '@/stores/placeholderStore';

const mockAgentData = vi.hoisted(() => ({
  agents: [] as AgentData[],
}));

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
    agents: mockAgentData.agents,
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
  fetchSkillOptionsWithCache: () => Promise.resolve([{ name: 'pdf' }, { name: 'docx' }, { name: 'xlsx' }]),
  seedSkillOptionsCache: vi.fn(),
  SKILL_OPTIONS_UPDATED_EVENT: 'office-claw:skill-options-updated',
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
  resetMentionDataForTest();
  mockAgentData.agents = [];
  threadDrafts.clear();
  useChatStore.setState({
    activeInvocations: {},
    hasActiveInvocation: false,
    pendingChatInsert: null,
    targetAgents: [],
  });
  useInputHistoryStore.setState({ entries: [] });
  usePlaceholderStore.getState().clearAll();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  threadDrafts.clear();
  useChatStore.setState({ pendingChatInsert: null });
  usePlaceholderStore.getState().clearAll();
  resetMentionDataForTest();
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

function findButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing button with text ${text}`);
  return button;
}

function findButtonContainingText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button containing text ${text}`);
  return button;
}

function getTemplatePlaceholder(): HTMLElement {
  const placeholder = container.querySelector(
    '[data-placeholder-control="true"][data-placeholder-type="text"]',
  ) as HTMLElement | null;
  if (!placeholder) throw new Error('Missing template text placeholder');
  return placeholder;
}

function getPromptFixedBlock(blockIndex: number): HTMLElement {
  const block = container.querySelector(`[data-block-index="${blockIndex}"]`) as HTMLElement | null;
  if (!block) throw new Error(`Missing prompt fixed block ${blockIndex}`);
  return block;
}

function setCaretAtEnd(element: HTMLElement) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function setTextboxValue(value: string) {
  const textbox = getTextbox();
  act(() => {
    textbox.textContent = value;
    textbox.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  });
}

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const textbox = getTextbox();
  act(() => {
    textbox.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
  });
}

function seedTemplateInsert(template: string) {
  useChatStore.setState({
    pendingChatInsert: {
      threadId: 'thread-1',
      text: template,
      inspirationData: {
        prompt: template,
        skills: [],
        agents: [],
        templateId: 'template-1',
      },
    },
  });
}

describe('ChatInput skill token send behavior', () => {
  it('keeps plain skill-like text as normal text when sending', async () => {
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    await flush();

    setTextboxValue('need pdf docx xlsx files');

    act(() => {
      getSendButton().click();
    });

    expect(onSend).toHaveBeenCalledWith('need pdf docx xlsx files', undefined, undefined, undefined, undefined);
    expect(container.querySelector('[data-token-type="skill"]')).toBeNull();
  });

  it('converts explicit skill tokens into skill trigger text on send', async () => {
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    await flush();

    setTextboxValue('[[skill:pdf]]');
    await flush();

    const skillToken = container.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');

    act(() => {
      getSendButton().click();
    });

    expect(onSend).toHaveBeenCalledWith('使用 pdf 技能', undefined, undefined, undefined, undefined);
    expect(useInputHistoryStore.getState().entries).toContain('[[skill:pdf]]');
  });

  it('restores skill tokens from queued send text', () => {
    const restored = restoreSkillTokensFromSendText('请先使用 pdf 技能，然后使用 xlsx 技能处理附件', ['pdf', 'xlsx']);
    expect(restored).toContain('[[skill:pdf]]');
    expect(restored).toContain('[[skill:xlsx]]');
  });

  it('converts history Tab completion "使用 xxx 技能" to highlighted skill token', async () => {
    useInputHistoryStore.setState({ entries: ['使用 minimax-pdf 技能'] });
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    await flush();

    setTextboxValue('使');
    pressKey('Tab');
    await flush();

    const skillToken = container.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:minimax-pdf]]');
  });

  it('renders raw skill tokens and terminal @ agent mentions in the main input', async () => {
    mockAgentData.agents = [
      {
        id: 'gemini',
        displayName: '协作智能体',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@gemini', '@协作智能体'],
        avatar: '',
        roleDescription: '协作智能体',
        personality: '',
        provider: 'google',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ];
    refreshMentionData(mockAgentData.agents);
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    await flush();

    setTextboxValue('[[skill:meeting-autopilot-pro]] @协作智能体');
    await flush();

    const textbox = getTextbox();
    const skillToken = textbox.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    const mentionToken = textbox.querySelector('[data-token-type="mention"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:meeting-autopilot-pro]]');
    expect(skillToken?.textContent).toContain('meeting-autopilot-pro');
    expect(mentionToken?.textContent).toBe('@协作智能体');
    expect(mentionToken?.className).toContain('text-[var(--text-accent)]');
  });

  it('keeps fixed skill and @ agent tokens visible when an inspiration template with placeholders is inserted', async () => {
    mockAgentData.agents = [
      {
        id: 'gemini',
        displayName: '协作智能体',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@gemini', '@协作智能体'],
        avatar: '',
        roleDescription: '协作智能体',
        personality: '',
        provider: 'google',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ];
    refreshMentionData(mockAgentData.agents);
    seedTemplateInsert('请 [[skill:meeting-autopilot-pro]] {{slot}} @协作智能体 完成');
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const placeholder = getTemplatePlaceholder();
    const textbox = getTextbox();
    const skillToken = textbox.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    const mentionToken = textbox.querySelector('[data-token-type="mention"]') as HTMLElement | null;

    expect(placeholder).toBeTruthy();
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:meeting-autopilot-pro]]');
    expect(skillToken?.textContent).toContain('meeting-autopilot-pro');
    expect(mentionToken?.textContent).toBe('@协作智能体');
    expect(mentionToken?.className).toContain('text-[var(--text-accent)]');
  });

  it('keeps an existing skill token when a placeholder template is inserted afterwards', async () => {
    mockAgentData.agents = [
      {
        id: 'gemini',
        displayName: '协作智能体',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@gemini', '@协作智能体'],
        avatar: '',
        roleDescription: '协作智能体',
        personality: '',
        provider: 'google',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ];
    refreshMentionData(mockAgentData.agents);
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    setTextboxValue('[[skill:meeting-autopilot-pro]]');
    await flush();

    act(() => {
      seedTemplateInsert('请 {{slot}} @协作智能体 完成');
    });
    await flush();
    await flush();

    const placeholder = getTemplatePlaceholder();
    const textbox = getTextbox();
    const skillToken = textbox.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    const mentionToken = textbox.querySelector('[data-token-type="mention"]') as HTMLElement | null;

    expect(placeholder).toBeTruthy();
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:meeting-autopilot-pro]]');
    expect(skillToken?.textContent).toContain('meeting-autopilot-pro');
    expect(mentionToken?.textContent).toBe('@协作智能体');
    expect(mentionToken?.className).toContain('text-[var(--text-accent)]');
  });

  it('keeps @ agent insertion working inside template placeholders', async () => {
    mockAgentData.agents = [
      {
        id: 'assistant',
        displayName: '逻辑大师',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@assistant', '@逻辑大师'],
        avatar: '',
        roleDescription: '逻辑大师',
        personality: '',
        provider: 'openai',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ];
    refreshMentionData(mockAgentData.agents);
    seedTemplateInsert('请 {{slot}} 完成');
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const placeholder = getTemplatePlaceholder();
    act(() => {
      placeholder.textContent = '@';
      setCaretAtEnd(placeholder);
      placeholder.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '@' }));
    });
    await flush();

    expect(container.textContent).toContain('@逻辑大师');
    const option = findButtonContainingText('@逻辑大师');
    act(() => {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(usePlaceholderStore.getState().textValues.ph_0).toBe('@逻辑大师');
    const mentionToken = placeholder.querySelector('[data-token-type="mention"]') as HTMLElement | null;
    expect(mentionToken?.className).toContain('text-[var(--text-accent)]');
    expect(mentionToken?.textContent).toBe('@逻辑大师');

    act(() => {
      getSendButton().click();
    });

    expect(onSend.mock.calls[0]?.[0]).toBe('请 @assistant 完成');
  });

  it('keeps skill insertion working inside template placeholders', async () => {
    seedTemplateInsert('请 {{slot}} 完成');
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const placeholder = getTemplatePlaceholder();
    act(() => {
      setCaretAtEnd(placeholder);
      const skillButton = findButtonByText('技能');
      skillButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      skillButton.click();
    });
    await flush();

    const pdfOption = findButtonContainingText('pdf');
    act(() => {
      pdfOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(usePlaceholderStore.getState().textValues.ph_0).toBe('[[skill:pdf]]');
    const skillToken = placeholder.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');
    expect(skillToken?.getAttribute('contenteditable')).toBe('false');
    expect(skillToken?.className).toContain('text-[var(--text-accent)]');

    act(() => {
      getSendButton().click();
    });

    expect(onSend.mock.calls[0]?.[0]).toBe('请 使用 pdf 技能 完成');
  });

  it('renders a skill immediately when inserted into fixed text after a placeholder template', async () => {
    seedTemplateInsert('请 {{slot}} 完成');
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const after = getPromptFixedBlock(2);
    act(() => {
      setCaretAtEnd(after);
      const skillButton = findButtonByText('技能');
      skillButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      skillButton.click();
    });
    await flush();

    const pdfOption = findButtonContainingText('pdf');
    act(() => {
      pdfOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await flush();

    const skillToken = after.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');
    expect(skillToken?.textContent).toContain('pdf');
  });

  it('sends the live mixed template content and clears the prompt after send', async () => {
    mockAgentData.agents = [
      {
        id: 'assistant',
        displayName: '逻辑大师',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@assistant', '@逻辑大师'],
        avatar: '',
        roleDescription: '逻辑大师',
        personality: '',
        provider: 'openai',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ];
    refreshMentionData(mockAgentData.agents);
    seedTemplateInsert('请 {{slot}} 完成');
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const placeholder = getTemplatePlaceholder();
    act(() => {
      placeholder.textContent = '@';
      setCaretAtEnd(placeholder);
      placeholder.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '@' }));
    });
    await flush();

    const mentionOption = findButtonContainingText('@逻辑大师');
    act(() => {
      mentionOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(usePlaceholderStore.getState().textValues.ph_0).toBe('@逻辑大师');
    const mentionToken = placeholder.querySelector('[data-token-type="mention"]') as HTMLElement | null;
    expect(mentionToken?.textContent).toBe('@逻辑大师');

    const after = getPromptFixedBlock(2);
    act(() => {
      setCaretAtEnd(after);
      const skillButton = findButtonByText('技能');
      skillButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      skillButton.click();
    });
    await flush();

    const pdfOption = findButtonContainingText('pdf');
    act(() => {
      pdfOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await flush();

    const updatedAfter = getPromptFixedBlock(2);
    const skillToken = updatedAfter.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');
    expect(skillToken?.textContent).toContain('pdf');

    act(() => {
      getSendButton().click();
    });
    await flush();

    expect(onSend).toHaveBeenCalledWith('请 @assistant 完成 使用 pdf 技能', undefined);
    expect(getTextbox().textContent).toBe('');
    expect(container.querySelector('[data-placeholder-control="true"]')).toBeNull();
    expect(container.querySelector('[data-block-index]')).toBeNull();
    expect(usePlaceholderStore.getState().textValues).toEqual({});
    expect(usePlaceholderStore.getState().fileValues).toEqual({});
  });

  it('keeps quick action insertion working inside template placeholders', async () => {
    const quickAction = QUICK_ACTIONS.find((action) => action.label === '定时任务');
    expect(quickAction).toBeTruthy();
    if (!quickAction) return;
    seedTemplateInsert('请 {{slot}} 完成');
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const placeholder = getTemplatePlaceholder();
    act(() => {
      setCaretAtEnd(placeholder);
      findButtonContainingText(quickAction.label).click();
    });
    await flush();

    expect(usePlaceholderStore.getState().textValues.ph_0).toBe(`[[quick_action:${quickAction.label}]] `);

    act(() => {
      getSendButton().click();
    });

    expect(onSend.mock.calls[0]?.[0]).toBe(`请 ${quickAction.label} 完成`);
  });
});
