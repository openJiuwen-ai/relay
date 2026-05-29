/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichTextarea, type RichTextareaHandle } from '@/components/chat-input/components/RichTextarea';
import type {
  RichQuickActionOption,
  RichSkillOption,
} from '@/components/chat-input/components/rich-textarea-token-rendering';
import type { AgentData } from '@/hooks/useAgentData';
import { refreshMentionData, resetMentionDataForTest } from '@/lib/mention-highlight';
import { usePlaceholderStore } from '@/stores/placeholderStore';
import { parsePromptTemplate } from '@/utils/promptParser';

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
  usePlaceholderStore.getState().clearAll();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  usePlaceholderStore.getState().clearAll();
  resetMentionDataForTest();
});

function makeAgent(overrides: Partial<AgentData> & { id: string; mentionPatterns: string[] }): AgentData {
  return {
    displayName: overrides.id,
    color: { primary: '#1476ff', secondary: '#eff6ff' },
    provider: 'openai',
    defaultModel: 'test',
    avatar: '',
    roleDescription: '',
    personality: '',
    source: 'seed',
    roster: null,
    ...overrides,
  };
}

function renderPrompt(
  template: string,
  textValues: Record<string, string> = {},
  onValueChange: (value: string, selectionStart: number, selectionEnd: number) => void = () => {},
  textareaRef?: React.RefObject<RichTextareaHandle | null>,
  options: {
    skillOptions?: RichSkillOption[];
    quickActionOptions?: RichQuickActionOption[];
  } = {},
) {
  const parsed = parsePromptTemplate(template);
  for (const [id, value] of Object.entries(textValues)) {
    usePlaceholderStore.getState().setTextValue(id, value);
  }

  const onFocus = vi.fn();
  const onBlur = vi.fn();
  act(() => {
    root.render(
      <RichTextarea
        ref={textareaRef ?? null}
        value=""
        onValueChange={onValueChange}
        skillOptions={options.skillOptions}
        quickActionOptions={options.quickActionOptions}
        promptBlocks={{
          parsed,
          activePlaceholderId: null,
          onFocus,
          onBlur,
          onDelete: () => {},
          onTabNext: () => {},
        }}
      />,
    );
  });

  return { parsed, onFocus, onBlur };
}

function fixedBlock(blockIndex: number): HTMLElement {
  const block = container.querySelector(`[data-block-index="${blockIndex}"]`) as HTMLElement | null;
  if (!block) throw new Error(`Missing fixed block ${blockIndex}`);
  return block;
}

function placeholderControl(placeholderId: string): HTMLElement {
  const control = container.querySelector(
    `[data-placeholder-control="true"][data-placeholder-id="${placeholderId}"]`,
  ) as HTMLElement | null;
  if (!control) throw new Error(`Missing placeholder control ${placeholderId}`);
  return control;
}

function setFixedCaret(block: HTMLElement, edge: 'start' | 'end') {
  block.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(block);
  range.collapse(edge === 'start');
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function setEditableCaret(element: HTMLElement, edge: 'start' | 'end') {
  element.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(edge === 'start');
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function setEditableTextOffset(element: HTMLElement, offset: number) {
  element.focus();
  const textNode = element.firstChild;
  if (!textNode) throw new Error('Editable placeholder has no text node');
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function keydown(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('RichTextarea prompt block keyboard navigation', () => {
  it('reports prompt block input through RichTextarea onValueChange', () => {
    const onValueChange = vi.fn();
    renderPrompt('before {{slot}} after', {}, onValueChange);

    const input = placeholderControl('ph_0');
    act(() => {
      input.textContent = '@';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '@' }));
    });

    expect(onValueChange).toHaveBeenCalled();
    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('before @ after');
    expect(usePlaceholderStore.getState().textValues.ph_0).toBe('@');
  });

  it('applies programmatic changes inside the active placeholder', () => {
    const textareaRef = React.createRef<RichTextareaHandle>();
    renderPrompt('before {{slot}} after', {}, () => {}, textareaRef);

    const input = placeholderControl('ph_0');
    act(() => {
      input.textContent = '@';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '@' }));
    });

    act(() => {
      textareaRef.current?.applyProgrammaticChange(
        'before @逻辑大师 after',
        'before @逻辑大师 '.length,
        'before @逻辑大师 '.length,
      );
    });

    expect(usePlaceholderStore.getState().textValues.ph_0).toBe('@逻辑大师');
    expect(input.textContent).toContain('@逻辑大师');
  });

  it('falls back to the active placeholder for partial programmatic insertions', () => {
    const textareaRef = React.createRef<RichTextareaHandle>();
    renderPrompt('before {{slot}} after', {}, () => {}, textareaRef);

    const input = placeholderControl('ph_0');
    setEditableCaret(input, 'end');

    act(() => {
      textareaRef.current?.applyProgrammaticChange(
        '[[quick_action:安排任务]] ',
        '[[quick_action:安排任务]] '.length,
        '[[quick_action:安排任务]] '.length,
      );
    });

    expect(usePlaceholderStore.getState().textValues.ph_0).toBe('[[quick_action:安排任务]] ');
    const quickActionToken = input.querySelector('[data-token-type="quick-action"]') as HTMLElement | null;
    expect(quickActionToken?.getAttribute('data-token-value')).toBe('[[quick_action:安排任务]]');
    expect(quickActionToken?.textContent).toContain('安排任务');
  });

  it('renders skill tokens inside text placeholders with RichTextarea styling', () => {
    renderPrompt('before {{slot}} after', { ph_0: '[[skill:pdf]]' }, () => {}, undefined, {
      skillOptions: [{ name: 'pdf' }],
    });

    const input = placeholderControl('ph_0');
    const skillToken = input.querySelector('[data-token-type="skill"]') as HTMLElement | null;

    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');
    expect(skillToken?.getAttribute('contenteditable')).toBe('false');
    expect(skillToken?.className).toContain('text-[var(--text-accent)]');
    expect(skillToken?.textContent).toContain('pdf');
  });

  it('renders @ agent mentions inside text placeholders with RichTextarea styling', () => {
    refreshMentionData([
      makeAgent({
        id: 'assistant',
        displayName: '逻辑大师',
        mentionPatterns: ['@assistant', '@逻辑大师'],
      }),
    ]);
    renderPrompt('before {{slot}} after', { ph_0: '@逻辑大师' });

    const input = placeholderControl('ph_0');
    const mentionToken = input.querySelector('[data-token-type="mention"]') as HTMLElement | null;

    expect(mentionToken?.className).toContain('text-[var(--text-accent)]');
    expect(mentionToken?.textContent).toBe('@逻辑大师');
  });

  it('renders fixed skill and @ agent tokens while keeping placeholders editable', () => {
    refreshMentionData([
      makeAgent({
        id: 'gemini',
        displayName: '协作智能体',
        mentionPatterns: ['@gemini', '@协作智能体'],
      }),
    ]);
    renderPrompt(
      '请 [[skill:meeting-autopilot-pro]] {{slot}} @协作智能体 完成',
      { ph_0: '整理会议' },
      () => {},
      undefined,
      {
        skillOptions: [{ name: 'meeting-autopilot-pro' }],
      },
    );

    const input = placeholderControl('ph_0');
    const skillToken = fixedBlock(0).querySelector('[data-token-type="skill"]') as HTMLElement | null;
    const mentionToken = fixedBlock(2).querySelector('[data-token-type="mention"]') as HTMLElement | null;

    expect(input.textContent).toContain('整理会议');
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:meeting-autopilot-pro]]');
    expect(skillToken?.textContent).toContain('meeting-autopilot-pro');
    expect(mentionToken?.textContent).toBe('@协作智能体');
    expect(mentionToken?.className).toContain('text-[var(--text-accent)]');
  });

  it('renders programmatic skill insertions into fixed prompt text immediately', () => {
    const textareaRef = React.createRef<RichTextareaHandle>();
    renderPrompt('before {{slot}} after', {}, () => {}, textareaRef, {
      skillOptions: [{ name: 'pdf' }],
    });

    const after = fixedBlock(2);
    setFixedCaret(after, 'end');

    act(() => {
      textareaRef.current?.applyProgrammaticChange('before  after [[skill:pdf]] ', 28, 28);
    });

    const skillToken = after.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');
    expect(skillToken?.textContent).toContain('pdf');
  });

  it('moves from fixed text end into the next placeholder', () => {
    const { onFocus } = renderPrompt('before {{slot}} after');
    const before = fixedBlock(0);

    setFixedCaret(before, 'end');
    const event = keydown(before, 'ArrowRight');

    const input = placeholderControl('ph_0');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(window.getSelection()?.anchorOffset).toBe(0);
    expect(onFocus).toHaveBeenCalledWith('ph_0');
  });

  it('moves from placeholder end into the next fixed text block', () => {
    const { onBlur } = renderPrompt('before {{slot}} after');
    const input = placeholderControl('ph_0');
    setEditableCaret(input, 'end');

    const event = keydown(input, 'ArrowRight');

    const after = fixedBlock(2);
    const selection = window.getSelection();
    expect(event.defaultPrevented).toBe(true);
    expect(selection?.anchorNode).toBe(after);
    expect(selection?.anchorOffset).toBe(0);
    expect(onBlur).toHaveBeenCalled();
  });

  it('moves from fixed text start into the previous placeholder', () => {
    renderPrompt('before {{slot}} after', { ph_0: 'morning' });
    const after = fixedBlock(2);

    setFixedCaret(after, 'start');
    const event = keydown(after, 'ArrowLeft');

    const input = placeholderControl('ph_0');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(window.getSelection()?.anchorOffset).toBe('morning'.length);
  });

  it('moves from placeholder start into the previous fixed text block', () => {
    const { onBlur } = renderPrompt('before {{slot}} after', { ph_0: 'morning' });
    const input = placeholderControl('ph_0');
    setEditableCaret(input, 'start');

    const event = keydown(input, 'ArrowLeft');

    const before = fixedBlock(0);
    const selection = window.getSelection();
    expect(event.defaultPrevented).toBe(true);
    expect(selection?.anchorNode).toBe(before);
    expect(selection?.anchorOffset).toBe(before.childNodes.length);
    expect(onBlur).toHaveBeenCalled();
  });

  it('does not intercept arrows while moving inside placeholder text', () => {
    const { onBlur } = renderPrompt('before {{slot}} after', { ph_0: 'morning' });
    const input = placeholderControl('ph_0');
    setEditableTextOffset(input, 3);

    const event = keydown(input, 'ArrowRight');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(onBlur).not.toHaveBeenCalled();
  });

  it('moves through file placeholders as inline blocks', () => {
    const { onFocus, onBlur } = renderPrompt('before {{file:upload}} after');
    const before = fixedBlock(0);

    setFixedCaret(before, 'end');
    const enterEvent = keydown(before, 'ArrowRight');

    const filePlaceholder = placeholderControl('ph_0');
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(filePlaceholder);
    expect(onFocus).toHaveBeenCalledWith('ph_0');

    const leaveEvent = keydown(filePlaceholder, 'ArrowRight');

    const after = fixedBlock(2);
    const selection = window.getSelection();
    expect(leaveEvent.defaultPrevented).toBe(true);
    expect(selection?.anchorNode).toBe(after);
    expect(selection?.anchorOffset).toBe(0);
    expect(onBlur).toHaveBeenCalled();
  });

  it('renders text placeholders as inline padded text with placeholder-token colors', () => {
    renderPrompt('before {{slot}} after');

    const input = placeholderControl('ph_0');
    expect(input.tagName).toBe('SPAN');
    expect(input.getAttribute('contenteditable')).toBe('true');
    expect(input.className).toContain('inline');
    expect(input.className).toContain('px-[4px]');
    expect(input.className).toContain('whitespace-pre-wrap');
    expect(input.style.backgroundColor).toBe('rgba(20, 118, 255, 0.08)');
    expect(input.style.color).toBe('rgba(20, 118, 255, 0.4)');
    expect(input.getAttribute('data-placeholder-empty')).toBe('true');
  });

  it('keeps editable placeholder text synced with the placeholder store', () => {
    renderPrompt('before {{slot}} after');

    const input = placeholderControl('ph_0');
    act(() => {
      input.textContent = 'line 1\nline 2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(usePlaceholderStore.getState().textValues.ph_0).toBe('line 1\nline 2');
    expect(input.getAttribute('data-placeholder-empty')).toBe('false');
    expect(input.style.color).toBe('rgb(20, 118, 255)');
  });
});
