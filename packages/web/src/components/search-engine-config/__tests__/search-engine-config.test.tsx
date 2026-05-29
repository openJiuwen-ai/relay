/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchEngineConfig } from '@/components/search-engine-config/SearchEngineConfig';
import { SearchEngineEditView } from '@/components/search-engine-config/components/SearchEngineEditView';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function defaultSearchApiFetch(path: string, init?: RequestInit) {
  if (path === '/api/config/env-summary' && !init?.method) {
    return Promise.resolve(
      jsonResponse({
        variables: [
          { name: 'BOCHA_API_KEY', currentValue: '***' },
          { name: 'JINA_API_KEY', currentValue: null },
          { name: 'PERPLEXITY_API_KEY', currentValue: null },
          { name: 'SERPER_API_KEY', currentValue: null },
        ],
      }),
    );
  }
  if (path === '/api/config/env' && init?.method === 'PATCH') {
    return Promise.resolve(jsonResponse({ ok: true }));
  }
  throw new Error(`Unexpected apiFetch path: ${path}`);
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function changeField(element: HTMLInputElement, value: string) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('SearchEngineConfig', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(defaultSearchApiFetch);
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    useToastStore.setState({ toasts: [] });
  });

  it('renders loading state initially', async () => {
    mockApiFetch.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    expect(container.querySelector('.h-\\[200px\\]')).toBeTruthy();
  });

  it('treats masked keys as configured, opens with empty input, and submits plaintext replacement', async () => {
    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    expect(container.textContent?.match(/已配置/g)?.length ?? 0).toBe(1);
    expect(container.textContent).toContain('Bocha');

    const firstCardButton = container.querySelector('section button') as HTMLButtonElement | null;
    expect(firstCardButton).toBeTruthy();

    await act(async () => {
      firstCardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const input = container.querySelector('#search-engine-bocha') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.value).toBe('');
    expect(input?.getAttribute('placeholder')).toBe('请输入');

    await changeField(input!, 'new-bocha-key');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const patchCall = mockApiFetch.mock.calls.find(
      ([path, init]) => path === '/api/config/env' && init?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    expect(String(patchCall?.[1]?.body)).toContain('new-bocha-key');
    expect(String(patchCall?.[1]?.body)).not.toContain('***');

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast).toMatchObject({ type: 'success', title: '保存成功' });
  });

  it('shows all four engines in correct order', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/config/env-summary') {
        return Promise.resolve(jsonResponse({ variables: [] }));
      }
      return defaultSearchApiFetch(path);
    });

    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const cards = container.querySelectorAll('section .space-y-2 > div');
    expect(cards.length).toBe(4);
    expect(cards[0].textContent).toContain('Bocha');
    expect(cards[1].textContent).toContain('Jina');
    expect(cards[2].textContent).toContain('Perplexity');
    expect(cards[3].textContent).toContain('Serper');
  });

  it('shows unconfigured state for engines without values', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/config/env-summary') {
        return Promise.resolve(jsonResponse({ variables: [] }));
      }
      return defaultSearchApiFetch(path);
    });

    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const unconfiguredCount = container.textContent?.match(/未配置/g)?.length ?? 0;
    expect(unconfiguredCount).toBe(4);
  });

  it('routes save failures through global toast only without rendering inline component errors', async () => {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/config/env' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ error: '保存失败（测试）' }, 500));
      }
      return defaultSearchApiFetch(path, init);
    });

    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const firstCardButton = container.querySelector('section button') as HTMLButtonElement | null;
    await act(async () => {
      firstCardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const input = container.querySelector('#search-engine-bocha') as HTMLInputElement | null;
    await changeField(input!, 'broken-bocha-key');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast).toMatchObject({ type: 'error', title: '保存失败', message: '保存失败（测试）' });
    expect(container.textContent).not.toContain('保存失败（测试）');
  });

  it('loadConfig failure shows error toast', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/config/env-summary') {
        return Promise.resolve(jsonResponse({ error: '加载失败' }, 500));
      }
      return defaultSearchApiFetch(path);
    });

    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast).toMatchObject({ type: 'error', title: '加载失败' });
  });

  it('cancel button returns to list view', async () => {
    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const firstCardButton = container.querySelector('section button') as HTMLButtonElement | null;
    await act(async () => {
      firstCardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('配置');

    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '取消');
    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('搜索引擎');
    expect(container.textContent).toContain('Bocha');
    expect(container.querySelector('#search-engine-bocha')).toBeNull();
  });

  it('editing unconfigured engine shows correct placeholder', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/config/env-summary') {
        return Promise.resolve(jsonResponse({ variables: [] }));
      }
      return defaultSearchApiFetch(path);
    });

    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const buttons = container.querySelectorAll('section button');
    await act(async () => {
      buttons[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true })); // Perplexity
    });
    await flushEffects();

    const input = container.querySelector('#search-engine-perplexity') as HTMLInputElement | null;
    expect(input?.getAttribute('placeholder')).toBe('请输入');
  });

  it('closes alert tip and does not show it again', async () => {
    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const firstCardButton = container.querySelector('section button') as HTMLButtonElement | null;
    await act(async () => {
      firstCardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const closeButton = container.querySelector('[aria-label="Close"]') as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).not.toContain('请前往对应网站获取API key后填入此处');
  });

  it('saves plaintext value (not masked) to state after successful patch', async () => {
    await act(async () => {
      root.render(React.createElement(SearchEngineConfig));
    });
    await flushEffects();

    const firstCardButton = container.querySelector('section button') as HTMLButtonElement | null;
    await act(async () => {
      firstCardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const input = container.querySelector('#search-engine-bocha') as HTMLInputElement | null;
    await changeField(input!, 'plaintext-key');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    // verify PATCH was called with plaintext value, not ***
    const patchCall = mockApiFetch.mock.calls.find(
      ([path, init]) => path === '/api/config/env' && init?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    expect(String(patchCall?.[1]?.body)).toContain('plaintext-key');
    expect(String(patchCall?.[1]?.body)).not.toContain('***');
  });
});

describe('SearchEngineEditView', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  });

  it('keeps empty-input validation in the edit form', async () => {
    const onSave = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'bocha',
            name: 'Bocha',
            description: '一站式 AI 搜索服务',
            type: 'paid',
            inputLabel: 'bocha_api_key',
            envVar: 'BOCHA_API_KEY',
          },
          value: '',
          configured: true,
          onSave,
          onCancel: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('输入内容不能为空');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows validation error when saving with empty input', async () => {
    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'bocha',
            name: 'Bocha',
            description: '一站式 AI 搜索服务',
            type: 'paid',
            inputLabel: 'bocha_api_key',
            envVar: 'BOCHA_API_KEY',
          },
          value: '',
          configured: true,
          onSave: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('输入内容不能为空');
    const input = container.querySelector('#search-engine-bocha') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    // input should have error styling (border-red-500 class is applied)
    expect(container.querySelector('.border-red-500')).toBeTruthy();
  });

  it('blur triggers validation', async () => {
    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'perplexity',
            name: 'Perplexity',
            description: 'AI 驱动的答案搜索引擎',
            type: 'paid',
            inputLabel: 'perplexity_api_key',
            envVar: 'PERPLEXITY_API_KEY',
          },
          value: '',
          configured: false,
          onSave: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const input = container.querySelector('#search-engine-perplexity') as HTMLInputElement | null;
    await act(async () => {
      input?.focus();
      input?.blur();
    });
    await flushEffects();

    expect(container.textContent).toContain('输入内容不能为空');
  });

  it('shows alert with API URL link', async () => {
    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'jina',
            name: 'Jina',
            description: '神经搜索和 Reader 服务',
            type: 'paid',
            inputLabel: 'jina_api_key',
            envVar: 'JINA_API_KEY',
          },
          value: '',
          configured: false,
          onSave: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });
    await flushEffects();

    expect(container.textContent).toContain('请前往对应网站获取API key后填入此处');
    const link = container.querySelector('a[target="_blank"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://jina.ai/reader/');
    expect(link?.textContent).toContain('前往获取');
  });

  it('uses correct placeholder for configured vs unconfigured', async () => {
    // unconfigured
    let container2: HTMLDivElement;
    let root2: Root;
    container2 = document.createElement('div');
    document.body.appendChild(container2);
    root2 = createRoot(container2);

    await act(async () => {
      root2.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'serper',
            name: 'Serper',
            description: 'Google 搜索 API',
            type: 'paid',
            inputLabel: 'serper_api_key',
            envVar: 'SERPER_API_KEY',
          },
          value: '',
          configured: false,
          onSave: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });
    await flushEffects();

    let input = container2.querySelector('#search-engine-serper') as HTMLInputElement | null;
    expect(input?.placeholder).toBe('请输入');

    act(() => root2.unmount());
    container2.remove();
  });

  it('saving state shows saving text and disabled button', async () => {
    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'bocha',
            name: 'Bocha',
            description: '一站式 AI 搜索服务',
            type: 'paid',
            inputLabel: 'bocha_api_key',
            envVar: 'BOCHA_API_KEY',
          },
          value: 'test-key',
          configured: true,
          onSave: vi.fn(),
          onCancel: vi.fn(),
          saving: true,
        }),
      );
    });
    await flushEffects();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存中...');
    expect(saveButton).toBeTruthy();
    expect(saveButton?.hasAttribute('disabled')).toBe(true);
  });

  it('onCancel is called when cancel button clicked', async () => {
    const onCancel = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'bocha',
            name: 'Bocha',
            description: '一站式 AI 搜索服务',
            type: 'paid',
            inputLabel: 'bocha_api_key',
            envVar: 'BOCHA_API_KEY',
          },
          value: '',
          configured: true,
          onSave: vi.fn(),
          onCancel,
        }),
      );
    });
    await flushEffects();

    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '取消');
    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onSave with trimmed value', async () => {
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'bocha',
            name: 'Bocha',
            description: '一站式 AI 搜索服务',
            type: 'paid',
            inputLabel: 'bocha_api_key',
            envVar: 'BOCHA_API_KEY',
          },
          value: '',
          configured: true,
          onSave,
          onCancel: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const input = container.querySelector('#search-engine-bocha') as HTMLInputElement | null;
    await changeField(input!, '  trimmed-key  ');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(onSave).toHaveBeenCalledWith('bocha', 'trimmed-key');
  });

  it('shows API URL fallback when engine id not in API_URLS', async () => {
    await act(async () => {
      root.render(
        React.createElement(SearchEngineEditView, {
          engine: {
            id: 'bocha',
            name: 'Bocha',
            description: '一站式 AI 搜索服务',
            type: 'paid',
            inputLabel: 'bocha_api_key',
            envVar: 'BOCHA_API_KEY',
          },
          value: '',
          configured: false,
          onSave: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const link = container.querySelector('a[target="_blank"]');
    expect(link?.getAttribute('href')).toBe('https://bochaai.com/');
  });
});
