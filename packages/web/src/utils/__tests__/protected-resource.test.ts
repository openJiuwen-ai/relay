/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockApiFetch: ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;
let mockFetch: ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://127.0.0.1:3004',
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('protected resource helpers', () => {
  beforeEach(() => {
    mockApiFetch = vi.fn();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockDownload() {
    const origCreateElement = document.createElement.bind(document);
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();

    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement;
      }
      return origCreateElement(tagName);
    });

    return {
      clickSpy,
      restore() {
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
        createElementSpy.mockRestore();
      },
    };
  }

  it('routes API absolute resource URLs through apiFetch so cookies stay in-app', async () => {
    const blob = new Blob(['png-data'], { type: 'image/png' });
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    });

    const { fetchProtectedResourceBlob } = await import('../protected-resource');
    const result = await fetchProtectedResourceBlob('http://127.0.0.1:3004/uploads/image.png');

    expect(result).toBe(blob);
    expect(mockApiFetch).toHaveBeenCalledWith('/uploads/image.png', undefined);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('downloads protected API resources through blob download instead of new window navigation', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['file-data'], { type: 'text/plain' }),
    });

    const download = mockDownload();
    const { downloadProtectedResource } = await import('../protected-resource');
    await downloadProtectedResource('/api/export/thread/thread-42?format=md', 'thread-42.md');

    expect(mockApiFetch).toHaveBeenCalledWith('/api/export/thread/thread-42?format=md', undefined);
    expect(download.clickSpy).toHaveBeenCalled();
    download.restore();
  });

  it('falls back to plain fetch for external resources', async () => {
    const blob = new Blob(['image-data'], { type: 'image/png' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    });

    const { fetchProtectedResourceBlob } = await import('../protected-resource');
    const result = await fetchProtectedResourceBlob('https://example.com/image.png');

    expect(result).toBe(blob);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png', undefined);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
