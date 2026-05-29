/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockApiFetch: ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('thread export helpers', () => {
  beforeEach(() => {
    mockApiFetch = vi.fn();
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

  it('downloads markdown exports through apiFetch instead of relying on window navigation', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '# 对话记录',
    });

    const download = mockDownload();
    const { exportThreadText } = await import('../thread-export');
    await exportThreadText('thread-42', 'md');

    expect(mockApiFetch).toHaveBeenCalledWith('/api/export/thread/thread-42?format=md');
    expect(download.clickSpy).toHaveBeenCalled();
    download.restore();
  });

  it('downloads image exports through apiFetch POST', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['png-data'], { type: 'image/png' }),
    });

    const download = mockDownload();
    const { exportThreadImage } = await import('../thread-export');
    await exportThreadImage('thread-99');

    expect(mockApiFetch).toHaveBeenCalledWith('/api/threads/thread-99/export-image', { method: 'POST' });
    expect(download.clickSpy).toHaveBeenCalled();
    download.restore();
  });
});
