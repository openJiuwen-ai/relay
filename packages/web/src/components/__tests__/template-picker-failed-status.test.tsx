/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatePicker } from '@/components/chat-input/components/TemplatePicker';

const mockApiFetch = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mockAddToast }) => unknown) => selector({ addToast: mockAddToast }),
}));

vi.mock('@/hooks/useFilePicker', () => ({
  useFilePicker: () => ({
    isDesktopHost: false,
    pickFile: vi.fn(),
  }),
}));

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
  vi.useFakeTimers();
  mockApiFetch.mockReset();
  mockAddToast.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

describe('TemplatePicker failed status handling', () => {
  it('shows failed templates as failed and does not keep polling them', async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({
        templates: [
          {
            templateId: 'builtin:light-tech',
            name: '浅色科技风',
            source: 'builtin',
            status: 'ready',
            previewImageUrl: null,
          },
          {
            templateId: 'user:failed-template',
            name: '企业蓝',
            source: 'user',
            status: 'failed',
            previewImageUrl: null,
          },
        ],
      }),
    );

    await act(async () => {
      root.render(React.createElement(TemplatePicker, { onSelectChange: vi.fn() }));
    });
    await flush();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('我的模板')) as HTMLButtonElement).click();
    });
    await flush();

    expect(container.textContent).toContain('模版生成失败');
    expect(container.textContent).toContain('企业蓝');
    expect(container.textContent).not.toContain('模版生成中');
    expect(container.querySelector('[data-testid="failed-card-企业蓝"]')).not.toBeNull();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: '模板生成失败',
      }),
    );

    const initialCallCount = mockApiFetch.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });

    expect(mockApiFetch.mock.calls.length).toBe(initialCallCount);
  });

  it('allows deleting a failed template from the failed card', async () => {
    const onSelectChange = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => true));

    mockApiFetch
      .mockResolvedValueOnce(
        jsonResponse({
          templates: [
            {
              templateId: 'user:failed-template',
              name: '企业蓝',
              source: 'user',
              status: 'failed',
              previewImageUrl: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deleted: true, templateId: 'user:failed-template' }),
      })
      .mockResolvedValueOnce(
        jsonResponse({
          templates: [],
        }),
      );

    await act(async () => {
      root.render(React.createElement(TemplatePicker, { onSelectChange }));
    });
    await flush();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('我的模板')) as HTMLButtonElement).click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="failed-card-delete-企业蓝"]') as HTMLButtonElement).click();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/ppt-templates/user%3Afailed-template', { method: 'DELETE' });
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: '删除成功',
      }),
    );
    expect(container.querySelector('[data-testid="failed-card-企业蓝"]')).toBeNull();
    expect(container.querySelector('[data-testid="upload-card"]')).not.toBeNull();
  });

  it('refreshes the template list immediately when upload generation fails', async () => {
    mockApiFetch
      .mockResolvedValueOnce(
        jsonResponse({
          templates: [],
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'generation_failed' }),
      })
      .mockResolvedValueOnce(
        jsonResponse({
          templates: [
            {
              templateId: 'user:deck',
              name: 'deck',
              source: 'user',
              status: 'failed',
              previewImageUrl: null,
            },
          ],
        }),
      );

    await act(async () => {
      root.render(React.createElement(TemplatePicker, { onSelectChange: vi.fn() }));
    });
    await flush();

    act(() => {
      (container.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click();
    });
    await flush();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['pptx'], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/ppt-templates/upload', expect.objectContaining({ method: 'POST' }));
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[data-testid="failed-card-deck"]')).not.toBeNull();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: '模板生成失败',
      }),
    );
    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: '上传失败',
      }),
    );
  });
});
