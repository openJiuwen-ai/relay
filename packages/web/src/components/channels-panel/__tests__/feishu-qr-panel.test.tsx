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

const { FeishuQrPanel } = await import('../components/FeishuQrPanel');

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

describe('FeishuQrPanel', () => {
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
    useToastStore.setState({ toasts: [] });
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('renders the QR card shell and waiting text layout consistent with Weixin', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ qrUrl: 'https://example.com/qr.png', qrPayload: 'abc123', intervalMs: 2500 }))
      .mockResolvedValue(jsonResponse({ status: 'waiting' }));

    await act(async () => {
      root.render(React.createElement(FeishuQrPanel, { configured: false }));
    });
    await flushEffects();

    // Verify initial state has generate button
    const initialButton = queryTestId(container, 'feishu-generate-qr') as HTMLButtonElement | null;
    expect(initialButton).not.toBeNull();

    await act(async () => {
      (queryTestId(container, 'feishu-generate-qr') as HTMLButtonElement | null)?.click();
    });
    await flushEffects();

    // After click, QR waiting shell appears
    const wrapper = queryTestId(container, 'feishu-qr-waiting-shell');
    const card = queryTestId(container, 'feishu-qr-card');
    const hint = queryTestId(container, 'feishu-qr-waiting-text');
    const img = queryTestId(container, 'feishu-qr-image') as HTMLImageElement | null;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.getAttribute('style')).toContain('width: fit-content');

    expect(card).not.toBeNull();
    expect(card?.className).toContain('p-3');
    expect(card?.getAttribute('style')).toContain('0 4px 16px 0 rgba(0,0,0,0.08)');

    expect(hint).not.toBeNull();
    expect(hint?.className).toContain('justify-center');
    expect(hint?.className).toContain('text-xs');

    expect(img).not.toBeNull();
    expect(img?.getAttribute('class')).toContain('w-48');
    expect(img?.getAttribute('class')).toContain('h-48');
  });

  it('shows a global success toast after disconnect succeeds', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(FeishuQrPanel, { configured: true }),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();

    // Click disconnect button to open confirmation modal
    const disconnectButton = queryTestId(container, 'feishu-disconnect') as HTMLButtonElement | null;
    expect(disconnectButton).not.toBeNull();

    await act(async () => {
      disconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    // Click confirm button in the modal
    const confirmButton = queryTestId(container, 'feishu-disconnect-confirm-submit') as HTMLButtonElement | null;
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
});
