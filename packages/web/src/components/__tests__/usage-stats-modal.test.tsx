/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPaginationPages, UsageStatsModal } from '../UsageStatsModal';

describe('UsageStatsModal', () => {
  const NOW = 1_700_000_000_000;

  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush(ms = 0) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  function createDataset(totalThreads = 1, startTime = NOW) {
    return {
      threads: Array.from({ length: totalThreads }, (_, index) => ({
        id: `thread-${index + 1}`,
        title: index === 0 ? 'session-1' : `session-${index + 1}`,
      })),
      sessionsByThreadId: Object.fromEntries(
        Array.from({ length: totalThreads }, (_, index) => [
          `thread-${index + 1}`,
          [
            {
              id: `session-${index + 1}`,
              updatedAt: startTime - index * 60_000,
              lastUsage: {
                inputTokens: index === 0 ? 2_345 : 100 + index,
                outputTokens: index === 0 ? undefined : 50 + index,
              },
            },
          ],
        ]),
      ),
    };
  }

  it('shows two pages around current page and preserves the first two and last two pages', () => {
    expect(formatPaginationPages(4, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(formatPaginationPages(1, 10)).toEqual([1, 2, 3, 'ellipsis', 9, 10]);
    expect(formatPaginationPages(5, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 'ellipsis', 9, 10]);
    expect(formatPaginationPages(10, 10)).toEqual([1, 2, 'ellipsis', 8, 9, 10]);
  });

  it('renders the session, input token, output token, total token, and time columns', async () => {
    const fetchDataset = vi.fn(async () => ({
      threads: [{ id: 'thread-1', title: 'session-1' }],
      sessionsByThreadId: {
        'thread-1': [
          {
            id: 'row-1',
            updatedAt: NOW,
            lastUsage: {
              inputTokens: 2_345,
              outputTokens: 10_000,
            },
          },
        ],
      },
    }));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    const rows = container.querySelectorAll('[data-testid^="usage-stats-row-"]');
    const cells = rows[0]?.querySelectorAll('td') ?? [];
    const sessionCell = cells[0];
    const inputTokenCell = cells[1];
    const outputTokenCell = cells[2];
    const totalTokenCell = cells[3];
    const timeCell = cells[4];

    expect(rows).toHaveLength(1);
    expect(cells).toHaveLength(5);
    expect(sessionCell?.className).toContain('h-16');
    expect(container.textContent).toContain('session-1');
    expect(inputTokenCell?.textContent).toBe('2.3k');
    expect(outputTokenCell?.textContent).toBe('10.0k');
    expect(totalTokenCell?.textContent).toBe('12.3k');
    expect(totalTokenCell?.getAttribute('title')).toBe('12,345');
    expect(timeCell?.className).toContain('text-[12px]');
  });

  it('shows a loading overlay while refreshing and keeps existing rows visible', async () => {
    let resolveNext: (() => void) | null = null;
    const fetchDataset = vi
      .fn()
      .mockImplementationOnce(async () => createDataset(1, NOW))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = () => resolve(createDataset(1, NOW + 100_000));
          }),
      );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    expect(container.textContent).toContain('session-1');

    const refreshButton = container.querySelector('[data-testid="usage-stats-refresh"]') as HTMLButtonElement | null;
    act(() => {
      refreshButton?.click();
    });

    expect(container.textContent).toContain('session-1');
    expect(container.querySelector('[data-testid="usage-stats-loading-overlay"]')).toBeTruthy();

    act(() => {
      resolveNext?.();
    });
    await flush(320);

    expect(container.querySelector('[data-testid="usage-stats-loading-overlay"]')).toBeNull();
    expect(fetchDataset).toHaveBeenCalledTimes(2);
  });

  it('clamps the current page to the new last page after refresh shrinks the total pages', async () => {
    let resolveNext: (() => void) | null = null;
    const fetchDataset = vi
      .fn()
      .mockImplementationOnce(async () => createDataset(60, NOW))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = () => resolve(createDataset(48, NOW));
          }),
      );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    const pageTenButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '10',
    );
    expect(pageTenButton).toBeTruthy();

    act(() => {
      pageTenButton?.click();
    });

    expect(container.textContent).toContain('session-55');

    const refreshButton = container.querySelector('[data-testid="usage-stats-refresh"]') as HTMLButtonElement | null;
    act(() => {
      refreshButton?.click();
    });

    act(() => {
      resolveNext?.();
    });
    await flush(320);

    const pageEightButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '8',
    );

    expect(fetchDataset).toHaveBeenCalledTimes(2);
    expect(pageEightButton?.className).toContain('bg-[var(--modal-muted-surface)]');
    expect(container.textContent).toContain('session-43');
    expect(container.textContent).not.toContain('session-55');
  });

  it('updates the active page immediately without triggering a new request', async () => {
    const fetchDataset = vi.fn(async () => createDataset(13, NOW));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    const pageTwoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '2',
    );
    expect(pageTwoButton).toBeTruthy();

    act(() => {
      pageTwoButton?.click();
    });

    expect(fetchDataset).toHaveBeenCalledTimes(1);
    expect(pageTwoButton?.className).toContain('bg-[var(--modal-muted-surface)]');
    expect(container.textContent).toContain('session-7');
  });

  it('rebuilds the current page locally when the range changes without triggering a new request', async () => {
    const fetchDataset = vi.fn(async () => ({
      threads: [
        { id: 'thread-1', title: 'today-session' },
        { id: 'thread-2', title: 'week-session' },
      ],
      sessionsByThreadId: {
        'thread-1': [
          {
            id: 'row-1',
            updatedAt: NOW - 2 * 60 * 60 * 1000,
            lastUsage: { inputTokens: 100 },
          },
        ],
        'thread-2': [
          {
            id: 'row-2',
            updatedAt: NOW - 5 * 24 * 60 * 60 * 1000,
            lastUsage: { inputTokens: 200 },
          },
        ],
      },
    }));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    expect(container.textContent).toContain('today-session');
    expect(container.textContent).toContain('week-session');

    const rangeTrigger = container.querySelector(
      '[data-testid="usage-stats-range-trigger"]',
    ) as HTMLButtonElement | null;
    act(() => {
      rangeTrigger?.click();
    });

    const todayOption = Array.from(container.querySelectorAll('[data-testid="usage-stats-range-menu"] button')).find(
      (button) => button.textContent?.trim() === '今日',
    );

    act(() => {
      todayOption?.click();
    });

    expect(fetchDataset).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('today-session');
    expect(container.textContent).not.toContain('week-session');
  });

  it('shows empty state when the selected page has no rows after filtering', async () => {
    const fetchDataset = vi.fn(async () => ({
      threads: [{ id: 'thread-1', title: 'session-1' }],
      sessionsByThreadId: {
        'thread-1': [
          {
            id: 'row-1',
            updatedAt: NOW - 40 * 24 * 60 * 60 * 1000,
            lastUsage: { inputTokens: 100 },
          },
        ],
      },
    }));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    expect(container.querySelectorAll('[data-testid^="usage-stats-row-"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="usage-stats-loading-overlay"]')).toBeNull();
  });

  it('does not trigger refresh, paging, or range menu opening while a request is already in flight', async () => {
    let resolveRequest: (() => void) | null = null;
    const fetchDataset = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRequest = () => resolve(createDataset(13, NOW));
        }),
    );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });

    await flush();

    const refreshButton = container.querySelector('[data-testid="usage-stats-refresh"]') as HTMLButtonElement | null;
    const rangeTrigger = container.querySelector(
      '[data-testid="usage-stats-range-trigger"]',
    ) as HTMLButtonElement | null;
    const pageTwoButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '2',
    );

    expect(fetchDataset).toHaveBeenCalledTimes(1);
    expect(refreshButton?.disabled).toBe(true);
    expect(rangeTrigger?.disabled).toBe(true);
    expect(pageTwoButton).toBeFalsy();

    act(() => {
      refreshButton?.click();
      rangeTrigger?.click();
      pageTwoButton?.click();
    });

    expect(fetchDataset).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="usage-stats-range-menu"]')).toBeNull();

    act(() => {
      resolveRequest?.();
    });
    await flush(320);

    expect(refreshButton?.disabled).toBe(false);
    expect(rangeTrigger?.disabled).toBe(false);
  });

  it('uses themed modal tokens for the visible range value and dropdown options without refetching', async () => {
    const fetchDataset = vi.fn(async () => createDataset(13, NOW));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    const rangeTrigger = container.querySelector(
      '[data-testid="usage-stats-range-trigger"]',
    ) as HTMLButtonElement | null;
    expect(rangeTrigger?.className).toContain('text-[12px]');
    expect(rangeTrigger?.className).toContain('text-[var(--modal-text)]');

    act(() => {
      rangeTrigger?.click();
    });

    const options = Array.from(container.querySelectorAll('[data-testid="usage-stats-range-menu"] button'));
    expect(options).toHaveLength(4);
    expect(options[0]?.className).toContain('hover:bg-[var(--modal-muted-surface)]');

    const defaultOption = options.find((option) => option.textContent?.trim() === '今日');
    const selectedOption = options.find((option) => option.textContent?.trim() === '近7日');

    expect(defaultOption?.className).toContain('text-[12px]');
    expect(defaultOption?.className).toContain('text-[var(--modal-text)]');
    expect(selectedOption?.className).toContain('text-[var(--modal-accent-text)]');

    act(() => {
      options.find((option) => option.textContent?.trim() === '近3日')?.click();
    });

    expect(fetchDataset).toHaveBeenCalledTimes(1);

    const headerRow = container.querySelector('thead tr');
    expect(headerRow?.className).not.toContain('font-medium');
    const headerCells = container.querySelectorAll('thead th');
    const separators = container.querySelectorAll('thead th span[aria-hidden="true"]');
    expect(headerCells[0]?.className).toContain('relative');
    expect(headerCells[1]?.className).toContain('relative');
    expect(headerCells[2]?.className).toContain('relative');
    expect(headerCells[3]?.className).toContain('relative');
    expect(headerCells[4]?.className).not.toContain('relative');
    expect(separators).toHaveLength(4);
    expect(separators[0]?.className).toContain('h-4');
    expect(separators[0]?.className).toContain('w-px');
    expect(separators[0]?.className).toContain('top-1/2');
    expect(separators[0]?.className).toContain('bg-[var(--modal-table-divider)]');
  });

  it('closes the modal when Escape key is pressed', async () => {
    const onClose = vi.fn();
    const fetchDataset = vi.fn(async () => createDataset(1, NOW));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose, fetchDataset }));
    });
    await flush(320);

    const modal = container.querySelector('[data-testid="usage-stats-modal-panel"]');
    expect(modal).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight usage stats request when the modal unmounts', async () => {
    let capturedSignal: AbortSignal | undefined;
    const abortListener = vi.fn();
    const fetchDataset = vi.fn(
      ({ signal }: { signal?: AbortSignal } = {}) =>
        new Promise<ReturnType<typeof createDataset>>(() => {
          capturedSignal = signal;
          signal?.addEventListener('abort', abortListener, { once: true });
        }),
    );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });

    await flush();

    expect(fetchDataset).toHaveBeenCalledTimes(1);
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    act(() => {
      root.unmount();
    });

    expect(abortListener).toHaveBeenCalledTimes(1);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('clears previously loaded rows when the modal closes before it opens again', async () => {
    const fetchDataset = vi
      .fn()
      .mockResolvedValueOnce(createDataset(1, NOW))
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof createDataset>>(() => {
            // Keep the second open in a loading state so stale rows would be visible if not cleared.
          }),
      );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush(320);

    expect(container.textContent).toContain('session-1');

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: false, onClose: vi.fn(), fetchDataset }));
    });

    expect(container.textContent).not.toContain('session-1');

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchDataset }));
    });
    await flush();

    expect(fetchDataset).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('session-1');
    expect(container.querySelector('[data-testid="usage-stats-loading-overlay"]')).toBeTruthy();
  });
});
