/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorConfigTab } from '../components/ConnectorConfigTab';
import { apiFetch } from '@/utils/api-client';
vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('../components/WeixinQrPanel', () => ({
  WeixinQrPanel: () => React.createElement('div', { 'data-testid': 'weixin-qr' }),
}));
vi.mock('../components/FeishuQrPanel', () => ({
  FeishuQrPanel: () => React.createElement('div', { 'data-testid': 'feishu-qr' }),
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

describe('ConnectorConfigTab password visibility integration', () => {
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
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'dingtalk',
                name: '钉钉',
                nameEn: 'DingTalk',
                configured: false,
                docsUrl: 'https://open.dingtalk.com/',
                steps: ['创建应用', '填写凭证', '测试连接'],
                fields: [
                  { envName: 'DINGTALK_CLIENT_SECRET', label: 'Client Secret', sensitive: true, currentValue: null },
                ],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('renders a reusable password visibility toggle for sensitive connector fields', async () => {
    await act(async () => {
      root.render(React.createElement(ConnectorConfigTab));
    });
    await flushEffects();

    const input = container.querySelector('[data-testid="field-DINGTALK_CLIENT_SECRET"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.type).toBe('password');
    expect(container.querySelector('[data-testid="connector-password-toggle-DINGTALK_CLIENT_SECRET"]')).toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'secret-value');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    const toggle = container.querySelector(
      '[data-testid="connector-password-toggle-DINGTALK_CLIENT_SECRET"]',
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(input?.type).toBe('text');
  });
});
