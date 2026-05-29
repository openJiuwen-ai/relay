/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/utils/api-client';

const mockApiFetch = vi.mocked(apiFetch);

const { WeixinQrPanel } = await import('../components/WeixinQrPanel');

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

function queryTestId(el: HTMLElement, testId: string): HTMLElement | null {
  return el.querySelector(`[data-testid="${testId}"]`);
}

function queryButton(el: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`Missing button: ${text}`);
  return btn as HTMLButtonElement;
}

describe('F137 Phase C — WeixinQrPanel', () => {
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useToastStore.setState({ toasts: [] });
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows "生成二维码" button when idle', async () => {
    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false }));
    });
    await flushEffects();

    expect(queryTestId(container, 'weixin-generate-qr')).not.toBeNull();
    expect(container.textContent).toContain('生成二维码');
  });

  it('shows connected state when already configured', async () => {
    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: true }));
    });
    await flushEffects();

    expect(queryTestId(container, 'weixin-connected')).not.toBeNull();
    expect(container.textContent).toContain('微信已连接');
    expect(queryTestId(container, 'weixin-disconnect')).not.toBeNull();
  });

  it('disconnects WeChat and returns to QR generation state', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ ok: true, configured: false }));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: true }));
    });
    await flushEffects();

    // Click disconnect button to open confirmation modal
    await act(async () => {
      queryButton(container, '断开连接').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    // Click confirm button in the modal
    const confirmButton = queryTestId(container, 'weixin-disconnect-confirm-submit') as HTMLButtonElement | null;
    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/connector/weixin/disconnect', { method: 'POST' });
    expect(queryTestId(container, 'weixin-generate-qr')).not.toBeNull();
  });

  it('shows a global success toast after disconnect succeeds', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ ok: true, configured: false }));

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(WeixinQrPanel, { configured: true }),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();

    // Click disconnect button to open confirmation modal
    const disconnectButton = queryTestId(container, 'weixin-disconnect') as HTMLButtonElement | null;
    expect(disconnectButton).not.toBeNull();

    await act(async () => {
      disconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    // Click confirm button in the modal
    const confirmButton = queryTestId(container, 'weixin-disconnect-confirm-submit') as HTMLButtonElement | null;
    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => toast.type === 'success' && toast.title === '断开连接成功' && toast.message.includes('已断开连接')),
    ).toBe(true);
  });

  it('shows disconnect error and stays connected when disconnect fails', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ error: '解除绑定失败' }, 500));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: true }));
    });
    await flushEffects();

    // Click disconnect button to open confirmation modal
    await act(async () => {
      queryButton(container, '断开连接').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    // Click confirm button in the modal
    const confirmButton = queryTestId(container, 'weixin-disconnect-confirm-submit') as HTMLButtonElement | null;
    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('解除绑定失败');
    expect(queryTestId(container, 'weixin-connected')).not.toBeNull();
  });

  it('fetches QR code on button click and displays image', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ qrUrl: 'https://example.com/qr.png', qrPayload: 'abc123' }));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false }));
    });
    await flushEffects();

    await act(async () => {
      queryButton(container, '生成二维码').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const img = queryTestId(container, 'weixin-qr-image') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toBe('https://example.com/qr.png');
  });

  it('shows error when QR code fetch fails', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ error: 'Service unavailable' }, 500));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false }));
    });
    await flushEffects();

    await act(async () => {
      queryButton(container, '生成二维码').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('Service unavailable');
  });

  it('auto-polls after QR fetch, transitions scanned → confirmed', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ qrUrl: 'https://example.com/qr.png', qrPayload: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'scanned' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'scanned' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'confirmed' }));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false }));
    });
    await flushEffects();

    await act(async () => {
      queryButton(container, '生成二维码').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    expect(queryTestId(container, 'weixin-qr-image')).not.toBeNull();
    expect(container.textContent).toContain('已扫码');

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    await flushEffects();
    expect(container.textContent).toContain('已扫码');

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    await flushEffects();
    expect(queryTestId(container, 'weixin-connected')).not.toBeNull();
  });

  it('calls onConfigured after QR confirmation succeeds', async () => {
    const onConfigured = vi.fn();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ qrUrl: 'https://example.com/qr.png', qrPayload: 'abc123' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'confirmed' }));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false, onConfigured }));
    });
    await flushEffects();

    await act(async () => {
      queryButton(container, '生成二维码').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(onConfigured).toHaveBeenCalledTimes(1);
    expect(queryTestId(container, 'weixin-connected')).not.toBeNull();
  });

  it('ignores late confirmed poll result after configured prop flips to true', async () => {
    const onConfigured = vi.fn();
    let resolveStatus: ((value: Response | PromiseLike<Response>) => void) | null = null;
    const pendingStatus = new Promise<Response>((resolve) => {
      resolveStatus = resolve;
    });

    mockApiFetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/connector/weixin/qrcode-status')) {
        return pendingStatus;
      }
      if (url === '/api/connector/weixin/qrcode') {
        return Promise.resolve(jsonResponse({ qrUrl: 'https://example.com/qr.png', qrPayload: 'abc123' }));
      }
      throw new Error(`Unexpected apiFetch call: ${String(url)}`);
    });

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false, onConfigured }));
    });
    await flushEffects();

    await act(async () => {
      const generateButton = queryTestId(container, 'weixin-generate-qr') as HTMLButtonElement | null;
      expect(generateButton).not.toBeNull();
      generateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    expect(queryTestId(container, 'weixin-qr-image')).not.toBeNull();

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: true, onConfigured }));
    });
    await flushEffects();

    await act(async () => {
      resolveStatus?.(jsonResponse({ status: 'confirmed' }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(onConfigured).toHaveBeenCalledTimes(0);
    expect(queryTestId(container, 'weixin-connected')).not.toBeNull();
  });

  it('syncs to connected state when configured prop flips to true', async () => {
    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false }));
    });
    await flushEffects();

    expect(queryTestId(container, 'weixin-generate-qr')).not.toBeNull();

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: true }));
    });
    await flushEffects();

    expect(queryTestId(container, 'weixin-connected')).not.toBeNull();
  });

  it('shows expired state after 60s timeout and allows regeneration', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ qrUrl: 'https://example.com/qr.png', qrPayload: 'abc123' }))
      .mockResolvedValue(jsonResponse({ status: 'waiting' }));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false }));
    });
    await flushEffects();

    await act(async () => {
      queryButton(container, '生成二维码').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    expect(queryTestId(container, 'weixin-qr-image')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    await flushEffects();

    expect(container.textContent?.toLowerCase()).toContain('过期');
    expect(container.textContent).toContain('重新生成二维码');
  });

  it('auto-poll calls qrcode-status with correct qrPayload', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ qrUrl: 'https://example.com/qr.png', qrPayload: 'test-payload' }))
      .mockResolvedValue(jsonResponse({ status: 'waiting' }));

    await act(async () => {
      root.render(React.createElement(WeixinQrPanel, { configured: false }));
    });
    await flushEffects();

    await act(async () => {
      queryButton(container, '生成二维码').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    await flushEffects();

    const statusCalls = mockApiFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('qrcode-status'),
    );
    expect(statusCalls.length).toBeGreaterThanOrEqual(1);
    expect(statusCalls[0][0]).toContain('qrPayload=test-payload');
  });
});
