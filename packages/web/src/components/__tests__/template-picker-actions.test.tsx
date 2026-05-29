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
  mockApiFetch.mockReset();
  mockAddToast.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('TemplatePicker card actions', () => {
  it('opens dropdown and triggers rename for custom templates', async () => {
    mockApiFetch
      .mockResolvedValueOnce(
        jsonResponse({
          templates: [
            {
              templateId: 'user:enterprise-blue',
              name: '企业蓝',
              source: 'user',
              status: 'ready',
              previewImageUrl: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ template: { templateId: 'user:enterprise-blue', name: '企业蓝升级版' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          templates: [
            {
              templateId: 'user:enterprise-blue',
              name: '企业蓝升级版',
              source: 'user',
              status: 'ready',
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

    act(() => {
      (container.querySelector('[data-testid="template-card-menu-trigger-user:enterprise-blue"]') as HTMLElement).click();
    });
    await flush();

    const renameButton = Array.from(document.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('重命名')) as HTMLButtonElement;
    expect(renameButton).toBeTruthy();

    act(() => {
      renameButton.click();
    });
    await flush();

    const renameInput = Array.from(document.querySelectorAll('input')).find((node) => node.getAttribute('placeholder')?.includes('请输入新的模板名称')) as HTMLInputElement;
    expect(renameInput).toBeTruthy();

    await act(async () => {
      setInputValue(renameInput, '企业蓝升级版');
      await Promise.resolve();
    });
    await flush();

    act(() => {
      (Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === '确认') as HTMLButtonElement).click();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/ppt-templates/user%3Aenterprise-blue', expect.objectContaining({ method: 'PATCH' }));
  });

  it('blocks invalid rename characters on the client', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        templates: [
          {
            templateId: 'user:enterprise-blue',
            name: '企业蓝',
            source: 'user',
            status: 'ready',
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

    act(() => {
      (container.querySelector('[data-testid="template-card-menu-trigger-user:enterprise-blue"]') as HTMLElement).click();
    });
    await flush();

    const renameButton = Array.from(document.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('重命名')) as HTMLButtonElement;
    act(() => {
      renameButton.click();
    });
    await flush();

    const renameInput = Array.from(document.querySelectorAll('input')).find((node) => node.getAttribute('placeholder')?.includes('请输入新的模板名称')) as HTMLInputElement;
    expect(renameInput).toBeTruthy();

    await act(async () => {
      setInputValue(renameInput, '../evil<script>');
      await Promise.resolve();
    });
    await flush();

    act(() => {
      (Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === '确认') as HTMLButtonElement).click();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: '重命名失败',
    }));
  });

  it('blocks overly long rename names on the client', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        templates: [
          {
            templateId: 'user:enterprise-blue',
            name: '企业蓝',
            source: 'user',
            status: 'ready',
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

    act(() => {
      (container.querySelector('[data-testid="template-card-menu-trigger-user:enterprise-blue"]') as HTMLElement).click();
    });
    await flush();

    const renameButton = Array.from(document.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('重命名')) as HTMLButtonElement;
    act(() => {
      renameButton.click();
    });
    await flush();

    const renameInput = Array.from(document.querySelectorAll('input')).find((node) => node.getAttribute('placeholder')?.includes('请输入新的模板名称')) as HTMLInputElement;
    expect(renameInput).toBeTruthy();

    await act(async () => {
      setInputValue(renameInput, '企'.repeat(31));
      await Promise.resolve();
    });
    await flush();

    act(() => {
      (Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === '确认') as HTMLButtonElement).click();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: '重命名失败',
    }));
  });

  it('opens dropdown and triggers delete for custom templates', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onSelectChange = vi.fn();
    mockApiFetch
      .mockResolvedValueOnce(
        jsonResponse({
          templates: [
            {
              templateId: 'user:enterprise-blue',
              name: '企业蓝',
              source: 'user',
              status: 'ready',
              previewImageUrl: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ deleted: true, templateId: 'user:enterprise-blue' }))
      .mockResolvedValueOnce(jsonResponse({ templates: [] }));

    await act(async () => {
      root.render(React.createElement(TemplatePicker, { onSelectChange, selectedTemplateId: 'user:enterprise-blue' }));
    });
    await flush();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('我的模板')) as HTMLButtonElement).click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="template-card-menu-trigger-user:enterprise-blue"]') as HTMLElement).click();
    });
    await flush();

    const deleteButton = Array.from(document.querySelectorAll('[role="menuitem"]')).find((node) => node.textContent?.includes('删除')) as HTMLButtonElement;
    expect(deleteButton).toBeTruthy();

    act(() => {
      deleteButton.click();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/ppt-templates/user%3Aenterprise-blue', { method: 'DELETE' });
    expect(onSelectChange).toHaveBeenCalledWith(null);
  });

  it('blocks oversized ppt uploads on the client', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ templates: [] }));

    await act(async () => {
      root.render(React.createElement(TemplatePicker, { onSelectChange: vi.fn() }));
    });
    await flush();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('我的模板')) as HTMLButtonElement).click();
    });
    await flush();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const oversizedFile = new File([new Uint8Array(100 * 1024 * 1024 + 1)], 'oversized.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [oversizedFile],
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: '上传失败',
        message: '仅支持上传 100MB 以下的 PPT',
      }),
    );
  });

  it('blocks invalid upload extensions on the client', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ templates: [] }));

    await act(async () => {
      root.render(React.createElement(TemplatePicker, { onSelectChange: vi.fn() }));
    });
    await flush();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('我的模板')) as HTMLButtonElement).click();
    });
    await flush();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const invalidFile = new File(['fake'], 'not-ppt.pdf', { type: 'application/pdf' });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [invalidFile],
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: '上传失败',
        message: '仅支持 .pptx 格式文件',
      }),
    );
  });

  it('blocks overly long upload filenames on the client', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ templates: [] }));

    await act(async () => {
      root.render(React.createElement(TemplatePicker, { onSelectChange: vi.fn() }));
    });
    await flush();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('我的模板')) as HTMLButtonElement).click();
    });
    await flush();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const invalidFile = new File(['fake'], `${'浅'.repeat(31)}.pptx`, {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [invalidFile],
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: '上传失败',
        message: '上传文件名长度不能超过 30 个字符（不含 .pptx 后缀）',
      }),
    );
  });

  it('allows upload when original ppt filename contains punctuation', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ templates: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          template: {
            templateId: 'user:q2-2026',
            name: 'Q2.2026 项目汇报（终版）',
            source: 'user',
            status: 'generating',
            previewImageUrl: null,
          },
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

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake'], 'Q2.2026 项目汇报（终版）.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [file],
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/ppt-templates/upload',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: '上传成功',
      }),
    );
  });
});
