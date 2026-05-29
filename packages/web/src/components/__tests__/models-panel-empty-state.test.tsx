/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelsPanel } from '@/components/models-panel/ModelsPanel';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3004',
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickButton(button: HTMLElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('ModelsPanel shared empty search state', () => {
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
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/maas-models') {
        return Promise.resolve(
          jsonResponse({
            list: [
              {
                id: 'model-1',
                object: 'model',
                name: 'gpt-5',
                description: 'flagship model',
                protocol: 'openai',
                labels: ['text-gen'],
                developer: 'OpenAI',
              },
            ],
          }),
        );
      }
      if (url === '/api/model-config-profiles') {
        return Promise.resolve(jsonResponse({ providers: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
  });

  it('uses the shared no-search-results state and clears the search query from its action', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector('input[aria-label="搜索模型"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await changeInputValue(input!, 'no-match');

    const emptyShell = container.querySelector('[data-testid="models-no-results-state"]') as HTMLDivElement | null;
    expect(emptyShell).not.toBeNull();
    expect(emptyShell?.className).toContain('flex-1');
    expect(emptyShell?.className).toContain('items-center');
    expect(emptyShell?.className).toContain('justify-center');
    expect(container.textContent).toContain('暂未匹配到数据');
    expect(container.textContent).toContain('没有匹配到符合条件的数据');

    const clearButton = container.querySelector('[data-testid="no-search-results-clear"]') as HTMLButtonElement | null;
    expect(clearButton).not.toBeNull();

    await clickButton(clearButton!);
    await flushEffects();

    expect((container.querySelector('input[aria-label="搜索模型"]') as HTMLInputElement | null)?.value).toBe('');
    expect(container.textContent).toContain('gpt-5');
  });

  it('uses the shared empty-data state when the model list is empty', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/maas-models') {
        return Promise.resolve(jsonResponse({ list: [] }));
      }
      if (url === '/api/model-config-profiles') {
        return Promise.resolve(jsonResponse({ providers: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const emptyShell = container.querySelector('[data-testid="models-empty-state"]') as HTMLDivElement | null;
    expect(emptyShell).not.toBeNull();
    expect(emptyShell?.className).toContain('flex-1');
    expect(emptyShell?.className).toContain('items-center');
    expect(emptyShell?.className).toContain('justify-center');
    expect(container.querySelector('[data-testid="empty-data-state"]')).not.toBeNull();
    expect(container.textContent).toContain('暂无模型');
  });
});
