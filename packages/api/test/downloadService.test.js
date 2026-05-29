/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelDownload,
  clearDownloadTask,
  getDownloadProgress,
  startDownload,
} from '../src/services/downloadService.js';

describe('downloadService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for non-existent download progress', () => {
    const progress = getDownloadProgress('non-existent');
    expect(progress).toBeNull();
  });

  it('starts a download task and returns progress', () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-length': '1000' }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      }),
    );

    const progress = startDownload('test-task', 'https://example.com/file.exe', 'test.exe');

    expect(progress.status).toBe('downloading');
    expect(progress.fileName).toBe('test.exe');
    expect(progress.progress).toBe(0);

    mockFetch.mockRestore();
    clearDownloadTask('test-task');
  });

  it('returns existing progress for same taskId', () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-length': '1000' }),
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      }),
    );

    startDownload('test-task-2', 'https://example.com/file.exe', 'test.exe');
    const progress2 = startDownload('test-task-2', 'https://example.com/file.exe', 'test.exe');

    expect(progress2.status).toBe('downloading');

    mockFetch.mockRestore();
    clearDownloadTask('test-task-2');
  });

  it('returns false when cancelling non-existent download', () => {
    const result = cancelDownload('non-existent');
    expect(result).toBe(false);
  });

  it('clears download task', () => {
    clearDownloadTask('test-task');
    const progress = getDownloadProgress('test-task');
    expect(progress).toBeNull();
  });
});
