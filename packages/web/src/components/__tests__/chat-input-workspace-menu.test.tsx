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

describe('ChatInput workspace menu', () => {
  let container: HTMLDivElement;
  let root: Root;

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

  function getFolderButton(): HTMLButtonElement {
    return container.querySelector('[data-testid="folder-select-button"]') as HTMLButtonElement;
  }

  function getWorkspaceSearchInput(): HTMLInputElement {
    return container.querySelector('[data-testid="workspace-select-search"]') as HTMLInputElement;
  }

  function typeInInput(input: HTMLInputElement, value: string) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function chooseMenuItem(testId: string) {
    act(() => {
      container.querySelector(`[data-testid="${testId}"]`)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
  }

  function pressKey(el: HTMLElement, key: string) {
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  }

  it('hides workspace display when folder selection is disabled', async () => {
    await act(async () => {
      root.render(
        React.createElement(ChatInput, {
          onSend: vi.fn(),
          folderSelectionEnabled: false,
          selectedFolderName: 'demo',
          selectedFolderTitle: 'D:/workspace/demo',
        }),
      );
    });

    expect(container.querySelector('[data-testid="folder-select-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="workspace-select-menu"]')).toBeNull();
  });

  it('opens and closes workspace menu from folder button', async () => {
    await act(async () => {
      root.render(
        React.createElement(ChatInput, {
          onSend: vi.fn(),
          folderSelectionEnabled: true,
          workspaceOptions: [{ path: '/repo/a', name: 'repo-a', title: '/repo/a' }],
        }),
      );
    });

    act(() => {
      getFolderButton().click();
    });

    expect(container.querySelector('[data-testid="workspace-select-menu"]')).not.toBeNull();
    expect(container.textContent).toContain('从空文件夹开始');
    expect(container.textContent).toContain('打开新文件夹');

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="workspace-select-menu"]')).toBeNull();
  });

  it('filters only existing workspace options and keeps fixed actions visible', async () => {
    await act(async () => {
      root.render(
        React.createElement(ChatInput, {
          onSend: vi.fn(),
          folderSelectionEnabled: true,
          workspaceOptions: [
            { path: '/repo/alpha', name: 'alpha', title: '/repo/alpha' },
            { path: '/repo/beta', name: 'beta', title: '/repo/beta' },
          ],
        }),
      );
    });

    act(() => {
      getFolderButton().click();
    });

    typeInInput(getWorkspaceSearchInput(), 'beta');
    expect(container.textContent).toContain('从空文件夹开始');
    expect(container.textContent).toContain('打开新文件夹');
    expect(container.textContent).toContain('beta');
    expect(container.textContent).not.toContain('alpha');
  });

  it('triggers empty/open/existing callbacks from menu items', async () => {
    const onSelectEmptyWorkspace = vi.fn();
    const onOpenFolderPicker = vi.fn();
    const onSelectExistingWorkspace = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ChatInput, {
          onSend: vi.fn(),
          folderSelectionEnabled: true,
          workspaceOptions: [{ path: '/repo/work', name: 'work', title: '/repo/work' }],
          onSelectEmptyWorkspace,
          onOpenFolderPicker,
          onSelectExistingWorkspace,
        }),
      );
    });

    act(() => {
      getFolderButton().click();
    });
    chooseMenuItem('workspace-menu-item-empty');
    expect(onSelectEmptyWorkspace).toHaveBeenCalledTimes(1);

    act(() => {
      getFolderButton().click();
    });
    chooseMenuItem('workspace-menu-item-open');
    expect(onOpenFolderPicker).toHaveBeenCalledTimes(1);

    act(() => {
      getFolderButton().click();
    });
    chooseMenuItem('workspace-menu-item-2');
    expect(onSelectExistingWorkspace).toHaveBeenCalledWith('/repo/work');
  });

  it('supports keyboard navigation and escape close in workspace menu', async () => {
    const onOpenFolderPicker = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ChatInput, {
          onSend: vi.fn(),
          folderSelectionEnabled: true,
          workspaceOptions: [{ path: '/repo/work', name: 'work', title: '/repo/work' }],
          onOpenFolderPicker,
        }),
      );
    });

    act(() => {
      getFolderButton().click();
    });

    const searchInput = getWorkspaceSearchInput();
    pressKey(searchInput, 'ArrowDown');
    pressKey(searchInput, 'Enter');
    expect(onOpenFolderPicker).toHaveBeenCalledTimes(1);

    act(() => {
      getFolderButton().click();
    });
    pressKey(getWorkspaceSearchInput(), 'Escape');
    expect(container.querySelector('[data-testid="workspace-select-menu"]')).toBeNull();
  });
});
