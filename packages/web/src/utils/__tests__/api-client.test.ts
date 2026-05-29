/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getUserId: vi.fn(() => 'test-user'),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => mocks.getUserId(),
}));

async function importApiClient() {
  vi.resetModules();
  return import('../api-client');
}

function stubLocation(url: string) {
  const parsed = new URL(url);
  const replace = vi.fn();
  vi.stubGlobal('location', {
    href: parsed.href,
    origin: parsed.origin,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port,
    replace,
  } as Location);
  return replace;
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubEnv('NEXT_PUBLIC_PROD_API_URL', 'https://api.office-claw.com');
    vi.stubEnv('NEXT_PUBLIC_PROD_FRONTEND_HOST', 'office-claw.com');
    vi.stubEnv('API_CLOWDER_HOST', 'https://api.office-claw.com');
    vi.stubEnv('DEFAULT_API_CLIENT_URL', 'http://127.0.0.1:3004');
  });

  it('includes credentials by default for local frontend-to-api split origins', async () => {
    stubLocation('http://127.0.0.1:3003/login/callback?userId=test-user');

    const { apiFetch } = await importApiClient();
    await apiFetch('/api/threads', { method: 'POST' });

    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3004/api/threads',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.any(Headers),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('keeps same-origin when the configured api origin matches the current page', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://app.example.com');
    stubLocation('https://app.example.com/workspace?userId=test-user');

    const { apiFetch } = await importApiClient();
    await apiFetch('/api/threads');

    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://app.example.com/api/threads',
      expect.objectContaining({
        credentials: 'same-origin',
      }),
    );
  });

  it('does not globally redirect on 401 in packages/web', async () => {
    const replace = stubLocation('http://127.0.0.1:3003/thread/thread_1');
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const { apiFetch } = await importApiClient();
    await apiFetch('/api/maas-test-connection', { method: 'POST' });

    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps suppressAuthRedirect as a no-op compatibility option', async () => {
    const replace = stubLocation('http://127.0.0.1:3003/thread/thread_1');
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const { apiFetch } = await importApiClient();
    await apiFetch('/api/maas-test-connection', { method: 'POST', suppressAuthRedirect: true });

    expect(replace).not.toHaveBeenCalled();
  });

  it('uses the internal signal while allowing an external signal to abort it', async () => {
    stubLocation('http://127.0.0.1:3003/thread/thread_1');
    let internalSignal: AbortSignal | null = null;
    mocks.fetch.mockImplementationOnce((_url: string, init?: RequestInit) => {
      internalSignal = init?.signal instanceof AbortSignal ? init.signal : null;
      return new Promise((_resolve, reject) => {
        internalSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const externalController = new AbortController();
    const { apiFetch } = await importApiClient();
    const request = apiFetch('/api/slow', { signal: externalController.signal });

    await Promise.resolve();
    expect(internalSignal).toBeInstanceOf(AbortSignal);
    expect(internalSignal).not.toBe(externalController.signal);
    expect(internalSignal?.aborted).toBe(false);

    externalController.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(internalSignal?.aborted).toBe(true);
  });
});
