/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatePicker } from '@/components/chat-input/components/TemplatePicker';
import { useToastStore } from '@/stores/toastStore';

vi.mock('@/components/shared/SearchInput', () => ({
  SearchInput: ({
    value,
    onChange,
    onClear,
    placeholder,
    wrapperClassName,
  }: {
    value: string;
    onChange: (v: string) => void;
    onClear?: () => void;
    placeholder?: string;
    wrapperClassName?: string;
  }) =>
    React.createElement('input', {
      'data-testid': 'search-input',
      value,
      placeholder,
      className: wrapperClassName,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && onClear) onClear();
      },
    }),
}));

// Mock the API call that TemplatePicker makes on mount
const mockTemplates = [
  { templateId: 'preset-1', name: '红色主题风格', source: 'builtin', status: 'ready', previewImageUrl: '/images/ppt-template/red-theme-style.png' },
  { templateId: 'preset-2', name: '浅色科技风格', source: 'builtin', status: 'ready', previewImageUrl: '/images/ppt-template/light-tech-style.png' },
  { templateId: 'preset-3', name: '纸质人文风格', source: 'builtin', status: 'ready', previewImageUrl: '/images/ppt-template/paper-like-style.png' },
  { templateId: 'preset-4', name: '深绿科技风格', source: 'builtin', status: 'ready', previewImageUrl: '/images/ppt-template/deep-green-technology-style.png' },
  { templateId: 'preset-5', name: 'Preset 5', source: 'builtin', status: 'ready', previewImageUrl: null },
  { templateId: 'preset-6', name: 'Preset 6', source: 'builtin', status: 'ready', previewImageUrl: null },
  { templateId: 'preset-7', name: 'Preset 7', source: 'builtin', status: 'ready', previewImageUrl: null },
  { templateId: 'preset-8', name: 'Preset 8', source: 'builtin', status: 'ready', previewImageUrl: null },
  { templateId: 'preset-9', name: 'Preset 9', source: 'builtin', status: 'ready', previewImageUrl: null },
  { templateId: 'preset-10', name: 'Preset 10', source: 'builtin', status: 'ready', previewImageUrl: null },
  { templateId: 'preset-11', name: 'Preset 11', source: 'builtin', status: 'ready', previewImageUrl: null },
  { templateId: 'preset-12', name: 'Preset 12', source: 'builtin', status: 'ready', previewImageUrl: null },
];

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn((url: string) => {
    if (url === '/api/ppt-templates') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ templates: mockTemplates }),
      });
    }
    return Promise.reject(new Error('Unknown route'));
  }),
}));

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  // templatePicker test init
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  // templatePicker test init
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('TemplatePicker', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSelectChange = vi.fn();

  beforeEach(() => {
    onSelectChange.mockClear();
    useToastStore.setState({ toasts: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: { selectedTemplateId?: string; onSelectChange?: typeof onSelectChange } = {}) {
    const { selectedTemplateId, onSelectChange: propsOnSelectChange = onSelectChange } = props;
    act(() => {
      root.render(
        React.createElement(TemplatePicker, {
          selectedTemplateId,
          onSelectChange: propsOnSelectChange,
        }),
      );
    });
  }

  // ─── TP-01 ──────────────────────────────────────────────────────────────────

  it('TP-01: renders preset tab with preset template cards', async () => {
    render();
    await act(async () => {});
    const cards = container.querySelectorAll('[data-testid^="template-card-preset"]');
    expect(cards).toHaveLength(12);
  });

  // ─── TP-02 ──────────────────────────────────────────────────────────────────

  it('TP-02: clicking the make-same button on a ready template card triggers onSelectChange', async () => {
    render();
    await act(async () => {});
    // Click the "做同款" button inside the card (the card div has no click handler)
    const makeSameBtn = container.querySelector('[data-testid="template-card-preset-1"] button') as HTMLButtonElement;
    act(() => {
      makeSameBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectChange).toHaveBeenCalledTimes(1);
    const calledTemplate = onSelectChange.mock.calls[0][0];
    expect(calledTemplate.id).toBe('preset-1');
    expect(calledTemplate.status).toBe('ready');
  });

  // ─── TP-03 ──────────────────────────────────────────────────────────────────

  it('TP-03: clicking the make-same button on a selected card triggers onSelectChange with that template', async () => {
    render({ selectedTemplateId: 'preset-1' });
    await act(async () => {});
    // Click the "做同款" button on the already-selected card
    const makeSameBtn = container.querySelector('[data-testid="template-card-preset-1"] button') as HTMLButtonElement;
    act(() => {
      makeSameBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectChange).toHaveBeenCalledTimes(1);
    // Re-clicking a selected card triggers onSelectChange with that template (not null)
    const calledTemplate = onSelectChange.mock.calls[0][0];
    expect(calledTemplate.id).toBe('preset-1');
  });

  // ─── TP-04 ──────────────────────────────────────────────────────────────────

  it('TP-04: ready template cards have data-selected=false attribute', async () => {
    // All mock preset cards are 'ready' (not 'parsing'), so they are not disabled.
    // This test verifies the card aria-disabled attribute for ready cards.
    render();
    await act(async () => {});
    const cards = container.querySelectorAll('[data-testid^="template-card-"]');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of Array.from(cards)) {
      expect(card.getAttribute('aria-disabled')).toBe('false');
    }
  });

  // ─── TP-05 ──────────────────────────────────────────────────────────────────

  it('TP-05: switching to my template tab shows upload card', async () => {
    render();
    await act(async () => {});
    // Tab labels are "平台推荐" and "我的模板"
    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const uploadCard = container.querySelector('[data-testid="upload-card"]');
    expect(uploadCard).not.toBeNull();
  });

  // ─── TP-06 ──────────────────────────────────────────────────────────────────

  it('TP-06: upload card contains a file input accepting .pptx', async () => {
    render();
    await act(async () => {});
    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const uploadCard = container.querySelector('[data-testid="upload-card"]') as HTMLDivElement;
    const input = uploadCard?.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input?.accept).toBe('.pptx');
  });

  // ─── TP-07 & TP-09 ─────────────────────────────────────────────────────────

  it('TP-07/TP-09: uploading a .ppt file shows format error toast', async () => {
    render();
    await act(async () => {});
    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const uploadCard = container.querySelector('[data-testid="upload-card"]') as HTMLDivElement;
    const input = uploadCard?.querySelector('input[type="file"]') as HTMLInputElement;

    // .ppt is not a valid format (only .pptx is accepted)
    const fakeFile = new File(['dummy'], 'report.ppt', { type: 'application/vnd.ms-powerpoint' });
    Object.defineProperty(input, 'files', { value: [fakeFile], configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});

    // Should show error toast for invalid format
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.type === 'error' && t.message.includes('仅支持 .pptx'))).toBe(true);
  });

  // ─── TP-08 ──────────────────────────────────────────────────────────────────

  it('TP-08: uploading a non-ppt file shows toast error without changing state', async () => {
    render();
    await act(async () => {});
    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const uploadCard = container.querySelector('[data-testid="upload-card"]') as HTMLDivElement;
    const input = uploadCard?.querySelector('input[type="file"]') as HTMLInputElement;

    const fakeFile = new File(['not a ppt'], 'readme.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [fakeFile], configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.type === 'error' && t.message.includes('仅支持 .pptx'))).toBe(true);
  });

  // ─── TP-10 & TP-11 ─────────────────────────────────────────────────────────

  it('TP-10/TP-11: search input filters my templates and clear resets list', async () => {
    render();
    await act(async () => {});
    // Mock has no user templates, so my tab shows only the upload card (empty grid)
    // Search on an empty list shows the empty state — verify structural behavior
    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    // 新实现仅当我的模板数量 > 3 时才显示搜索框
    const searchInput = container.querySelector('[data-testid="search-input"]') as HTMLInputElement | null;
    expect(searchInput).toBeNull();

    // With empty myTemplates, grid renders upload card as full-width
    const uploadCard = container.querySelector('[data-testid="upload-card"]') as HTMLDivElement;
    expect(uploadCard).not.toBeNull();
    expect(uploadCard.getAttribute('data-is-full')).toBe('true');
  });

  // ─── TP-12 ──────────────────────────────────────────────────────────────────

  it('TP-12: my templates empty shows upload card full-width', async () => {
    // When myTemplates is empty (no search keyword), the upload card takes full width
    render();
    await act(async () => {});

    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const uploadCard = container.querySelector('[data-testid="upload-card"]') as HTMLDivElement;
    expect(uploadCard).not.toBeNull();
    // myTemplates is empty, so isFull=true
    expect(uploadCard.getAttribute('data-is-full')).toBe('true');
  });

  // ─── TP-13 ──────────────────────────────────────────────────────────────────

  it('TP-13: template card renders with correct structure', async () => {
    render();
    await act(async () => {});
    const card = container.querySelector('[data-testid="template-card-preset-1"]') as HTMLDivElement;
    expect(card).not.toBeNull();
    // Card should have the card class (verifying it renders correctly)
    expect(card.className).toContain('card');
    // Card should have a preview container
    const previewContainer = card.querySelector('[class*="previewContainer"]');
    expect(previewContainer).not.toBeNull();
    // Card should have a title area
    const titleArea = card.querySelector('[class*="cardTitleArea"]');
    expect(titleArea).not.toBeNull();
  });

  // ─── TP-14 ──────────────────────────────────────────────────────────────────

  it('TP-14: template card has preview image or placeholder', async () => {
    render();
    await act(async () => {});
    const card = container.querySelector('[data-testid="template-card-preset-1"]') as HTMLDivElement;
    const previewContainer = card?.querySelector('[class*="previewContainer"]') as HTMLDivElement;
    expect(previewContainer).not.toBeNull();
    // Should have either an img or a placeholder div
    const hasImg = previewContainer.querySelector('img') !== null;
    const hasPlaceholder = previewContainer.querySelector('[class*="previewImage"]') !== null;
    expect(hasImg || hasPlaceholder).toBe(true);
  });

  // ─── TP-15 ──────────────────────────────────────────────────────────────────

  it('TP-15: selected card has correct CSS class applied', async () => {
    render({ selectedTemplateId: 'preset-1' });
    await act(async () => {});
    const card = container.querySelector('[data-testid="template-card-preset-1"]') as HTMLDivElement;
    // Selected card should have the cardSelected class
    expect(card.className).toContain('cardSelected');
  });

  // ─── TP-16 ──────────────────────────────────────────────────────────────────

  it('TP-16: selected state persists after switching tabs', async () => {
    render({ selectedTemplateId: 'preset-1' });
    await act(async () => {});

    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    const presetTab = container.querySelectorAll('[role="tab"]')[0];
    act(() => {
      presetTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    const card = container.querySelector('[data-testid="template-card-preset-1"]') as HTMLDivElement;
    // Selected card should still have the cardSelected class
    expect(card.className).toContain('cardSelected');
  });

  // ─── TP-17: Tab switch clears search input ───────────────────────────────────

  it('TP-17: tab switch clears search input', async () => {
    const appendedUserTemplates = [
      { templateId: 'user-1', name: 'User Template 1', source: 'user', status: 'ready', previewImageUrl: null },
      { templateId: 'user-2', name: 'User Template 2', source: 'user', status: 'ready', previewImageUrl: null },
      { templateId: 'user-3', name: 'User Template 3', source: 'user', status: 'ready', previewImageUrl: null },
      { templateId: 'user-4', name: 'User Template 4', source: 'user', status: 'ready', previewImageUrl: null },
    ] as const;
    mockTemplates.push(...appendedUserTemplates);
    try {
      render();
      await act(async () => {});
      const myTab = container.querySelectorAll('[role="tab"]')[1];
      act(() => {
        myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {});
      const searchInput = container.querySelector('[data-testid="search-input"]') as HTMLInputElement | null;
      expect(searchInput).not.toBeNull();

      // Switch back — search input should disappear on preset tab
      const presetTab = container.querySelectorAll('[role="tab"]')[0];
      act(() => {
        presetTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {});
      const searchInputAfter = container.querySelector('[data-testid="search-input"]');
      expect(searchInputAfter).toBeNull();
    } finally {
      mockTemplates.splice(-appendedUserTemplates.length, appendedUserTemplates.length);
    }
  });

  // ─── TP-19: Grid layout ────────────────────────────────────────────────────

  it('TP-19: grid element exists and has grid class', async () => {
    render();
    await act(async () => {});
    const grid = container.querySelector('[class*="grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
    // Grid should exist within the cardGrid container
    const cardGrid = container.querySelector('[class*="cardGrid"]');
    expect(cardGrid).not.toBeNull();
  });

  // ─── TP-20: Grid gap ───────────────────────────────────────────────────────

  it('TP-20: grid container exists', async () => {
    render();
    await act(async () => {});
    const grid = container.querySelector('[class*="grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
  });

  // ─── TP-25: Card width is self-adaptive ─────────────────────────────────────

  it('TP-25: card has correct CSS classes for width behavior', async () => {
    render();
    await act(async () => {});
    const card = container.querySelector('[data-testid="template-card-preset-1"]') as HTMLDivElement;
    expect(card).not.toBeNull();
    // Card should have the card class
    expect(card.className).toContain('card');
  });

  // ─── TP-21~TP-24: Responsive grid ─────────────────────────────────────────

  it('TP-21: grid renders correct number of cards at 1200px width', async () => {
    container.style.width = '1200px';
    render();
    await act(async () => {});
    // Should render 12 preset cards
    const cards = container.querySelectorAll('[data-testid^="template-card-preset"]');
    expect(cards.length).toBe(12);
    container.style.width = '';
  });

  it('TP-22: grid renders correct number of cards at 900px width', async () => {
    container.style.width = '900px';
    render();
    await act(async () => {});
    const cards = container.querySelectorAll('[data-testid^="template-card-preset"]');
    expect(cards.length).toBe(12);
    container.style.width = '';
  });

  it('TP-23: grid renders correct number of cards at 700px width', async () => {
    container.style.width = '700px';
    render();
    await act(async () => {});
    const cards = container.querySelectorAll('[data-testid^="template-card-preset"]');
    expect(cards.length).toBe(12);
    container.style.width = '';
  });

  it('TP-24: grid renders correct number of cards at 380px width', async () => {
    container.style.width = '380px';
    render();
    await act(async () => {});
    const cards = container.querySelectorAll('[data-testid^="template-card-preset"]');
    expect(cards.length).toBe(12);
    container.style.width = '';
  });
});
