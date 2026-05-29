/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RichTextarea } from '@/components/chat-input/components/RichTextarea';
import type { AgentData } from '@/hooks/useAgentData';
import { refreshMentionData, resetMentionDataForTest } from '@/lib/mention-highlight';

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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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

describe('RichTextarea skill tokens', () => {
  it('does not highlight plain skill-like text as a skill token', () => {
    act(() => {
      root.render(
        <RichTextarea
          value="need pdf docx xlsx files"
          onValueChange={() => {}}
          skillOptions={[{ name: 'pdf' }, { name: 'docx' }, { name: 'xlsx' }]}
        />,
      );
    });

    expect(container.querySelector('[data-token-type="skill"]')).toBeNull();
    expect(container.textContent).toContain('need pdf docx xlsx files');
  });

  it('renders an explicitly inserted skill token as a skill chip', () => {
    act(() => {
      root.render(
        <RichTextarea value="need [[skill:pdf]] files" onValueChange={() => {}} skillOptions={[{ name: 'pdf' }]} />,
      );
    });

    const skillToken = container.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken).toBeTruthy();
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');
    expect(skillToken?.textContent).toContain('pdf');
  });

  it('renders skill and terminal @ agent tokens in the main input', () => {
    refreshMentionData([
      makeAgent({
        id: 'gemini',
        displayName: '协作智能体',
        mentionPatterns: ['@gemini', '@协作智能体'],
      }),
    ]);

    act(() => {
      root.render(
        <RichTextarea
          value="[[skill:meeting-autopilot-pro]] @协作智能体"
          onValueChange={() => {}}
          skillOptions={[{ name: 'meeting-autopilot-pro' }]}
        />,
      );
    });

    const skillToken = container.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    const mentionToken = container.querySelector('[data-token-type="mention"]') as HTMLElement | null;

    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:meeting-autopilot-pro]]');
    expect(skillToken?.textContent).toContain('meeting-autopilot-pro');
    expect(mentionToken?.textContent).toBe('@协作智能体');
    expect(mentionToken?.className).toContain('text-[var(--text-accent)]');
  });
});
