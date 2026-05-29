/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat-input/ChatInput';
import { fetchSkillOptionsWithCache } from '@/utils/skill-options-cache';

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
  fetchSkillOptionsWithCache: vi.fn(),
  seedSkillOptionsCache: vi.fn(),
  SKILL_OPTIONS_UPDATED_EVENT: 'office-claw:skill-options-updated',
}));

const mockFetchSkillOptionsWithCache = vi.mocked(fetchSkillOptionsWithCache);

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

function getSkillButton(): HTMLButtonElement | undefined {
  const icon = container.querySelector('img[src="/icons/menu/skills.svg"]') as HTMLImageElement | null;
  return (icon?.closest('button') as HTMLButtonElement | null) ?? undefined;
}

describe('ChatInput skill refresh', () => {
  it('force refreshes skill options when opening the skill menu', async () => {
    mockFetchSkillOptionsWithCache
      .mockResolvedValueOnce([{ name: 'alpha-skill' }])
      .mockResolvedValueOnce([{ name: 'alpha-skill' }, { name: 'beta-skill' }]);

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend: vi.fn() }));
    });
    await flush();

    expect(mockFetchSkillOptionsWithCache).toHaveBeenNthCalledWith(1, undefined);

    const skillButton = getSkillButton();
    expect(skillButton).toBeDefined();

    await act(async () => {
      skillButton?.click();
    });
    await flush();

    expect(mockFetchSkillOptionsWithCache).toHaveBeenNthCalledWith(2, { force: true });
    expect(container.textContent).toContain('alpha-skill');
    expect(container.textContent).toContain('beta-skill');
  });

  it('reloads skill options after a skill install refresh event', async () => {
    mockFetchSkillOptionsWithCache
      .mockResolvedValueOnce([{ name: 'alpha-skill' }])
      .mockResolvedValueOnce([{ name: 'alpha-skill' }, { name: 'beta-skill' }])
      .mockResolvedValueOnce([{ name: 'alpha-skill' }, { name: 'beta-skill' }]);

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend: vi.fn() }));
    });
    await flush();

    const skillButton = getSkillButton();
    expect(skillButton).toBeDefined();

    await act(async () => {
      skillButton?.click();
    });
    await flush();

    expect(container.textContent).toContain('alpha-skill');
    expect(container.textContent).toContain('beta-skill');

    await act(async () => {
      window.dispatchEvent(new CustomEvent('office-claw:skill-options-updated'));
    });
    await flush();

    expect(mockFetchSkillOptionsWithCache).toHaveBeenNthCalledWith(1, undefined);
    expect(mockFetchSkillOptionsWithCache).toHaveBeenNthCalledWith(2, { force: true });
    expect(mockFetchSkillOptionsWithCache).toHaveBeenNthCalledWith(3, { force: true });
    expect(container.textContent).toContain('beta-skill');
  });
});
