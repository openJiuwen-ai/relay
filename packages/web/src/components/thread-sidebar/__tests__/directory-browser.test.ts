/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F113 Phase D: DirectoryBrowser component tests.
 * Covers breadcrumb navigation, directory listing, path input,
 * and cross-platform path separator handling.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectoryBrowser } from '../DirectoryBrowser';

// ── Mock apiFetch ──────────────────────────────────────────────
const mockApiFetch = vi.fn();
vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// ── Helpers ────────────────────────────────────────────────────
function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
}
function jsonFail(status = 500, error = 'fail') {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error }) });
}

const HOME = '/home/user';

function makeBrowseResult(current: string, entries: { name: string; path: string }[], parent: string | null = HOME) {
  return {
    current,
    name: current.split('/').pop() || '',
    parent,
    homePath: HOME,
    drives: [],
    entries: entries.map((e) => ({ ...e, isDirectory: true })),
  };
}

describe('DirectoryBrowser', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
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

  function render(props: Partial<React.ComponentProps<typeof DirectoryBrowser>> = {}) {
    const defaults = {
      onSelect: vi.fn(),
      onCancel: vi.fn(),
      ...props,
    };
    act(() => {
      root.render(React.createElement(DirectoryBrowser, defaults));
    });
    return defaults;
  }

  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  function getAllButtons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('button'));
  }

  function findButtonByText(text: string): HTMLButtonElement | undefined {
    return getAllButtons().find((b) => b.textContent?.includes(text));
  }

  function getPrimaryActionButton(): HTMLButtonElement | null {
    return container.querySelector('button.ui-button-primary');
  }

  // ── Initial load ─────────────────────────────────────────

  it('fetches home directory on mount and shows entries', async () => {
    mockApiFetch.mockReturnValue(
      jsonOk(
        makeBrowseResult(
          HOME,
          [
            { name: 'projects', path: `${HOME}/projects` },
            { name: 'Documents', path: `${HOME}/Documents` },
          ],
          null,
        ),
      ),
    );
    render();
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/browse');
    expect(container.textContent).toContain('projects');
    expect(container.textContent).toContain('Documents');
    expect(container.textContent).toContain('Home');
  });

  // ── Directory drilling ──────────────────────────────────

  it('navigates into a subdirectory when clicking a folder row', async () => {
    // Initial: home
    mockApiFetch.mockReturnValueOnce(
      jsonOk(makeBrowseResult(HOME, [{ name: 'projects', path: `${HOME}/projects` }], null)),
    );
    render();
    await flush();

    // Click "projects" folder
    mockApiFetch.mockReturnValueOnce(
      jsonOk(
        makeBrowseResult(`${HOME}/projects`, [
          { name: 'cat-cafe', path: `${HOME}/projects/cat-cafe` },
          { name: 'other', path: `${HOME}/projects/other` },
        ]),
      ),
    );
    const projectsBtn = findButtonByText('projects');
    expect(projectsBtn).toBeTruthy();
    await act(async () => {
      projectsBtn!.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(`/api/projects/browse?path=${encodeURIComponent(`${HOME}/projects`)}`);
    expect(container.textContent).toContain('cat-cafe');
    expect(container.textContent).toContain('other');
  });

  // ── Breadcrumb navigation ──────────────────────────────

  it('shows breadcrumb segments and navigates back when clicking a segment', async () => {
    // Start at a deep path
    mockApiFetch.mockReturnValueOnce(
      jsonOk(
        makeBrowseResult(`${HOME}/projects/cat-cafe`, [
          { name: 'packages', path: `${HOME}/projects/cat-cafe/packages` },
        ]),
      ),
    );
    render({ initialPath: `${HOME}/projects/cat-cafe` });
    await flush();

    // Should show breadcrumb: Home > projects > cat-cafe
    expect(container.textContent).toContain('Home');
    expect(container.textContent).toContain('projects');
    expect(container.textContent).toContain('cat-cafe');

    // Click "Home" breadcrumb to go back to home
    mockApiFetch.mockReturnValueOnce(
      jsonOk(
        makeBrowseResult(
          HOME,
          [
            { name: 'projects', path: `${HOME}/projects` },
            { name: 'Desktop', path: `${HOME}/Desktop` },
          ],
          null,
        ),
      ),
    );
    const homeBtn = findButtonByText('Home');
    expect(homeBtn).toBeTruthy();
    await act(async () => {
      homeBtn!.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    // Home breadcrumb calls browse without path (defaults to home)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/browse');
    expect(container.textContent).toContain('Desktop');
  });

  it('clicking mid-level breadcrumb navigates to that level', async () => {
    mockApiFetch.mockReturnValueOnce(
      jsonOk(
        makeBrowseResult(`${HOME}/projects/cat-cafe`, [
          { name: 'packages', path: `${HOME}/projects/cat-cafe/packages` },
        ]),
      ),
    );
    render({ initialPath: `${HOME}/projects/cat-cafe` });
    await flush();

    // Click "projects" breadcrumb (mid-level)
    mockApiFetch.mockReturnValueOnce(
      jsonOk(makeBrowseResult(`${HOME}/projects`, [{ name: 'cat-cafe', path: `${HOME}/projects/cat-cafe` }])),
    );
    const projectsBtn = findButtonByText('projects');
    expect(projectsBtn).toBeTruthy();
    await act(async () => {
      projectsBtn!.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(`/api/projects/browse?path=${encodeURIComponent(`${HOME}/projects`)}`);
  });

  // ── Select and cancel ─────────────────────────────────

  it('calls onSelect with current path when the select button is clicked', async () => {
    mockApiFetch.mockReturnValueOnce(jsonOk(makeBrowseResult(`${HOME}/projects`, [], HOME)));
    const fns = render({ initialPath: `${HOME}/projects` });
    await flush();

    const selectBtn = getPrimaryActionButton();
    expect(selectBtn).toBeTruthy();
    act(() => {
      selectBtn!.click();
    });

    expect(fns.onSelect).toHaveBeenCalledWith(`${HOME}/projects`);
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    mockApiFetch.mockReturnValueOnce(jsonOk(makeBrowseResult(HOME, [], null)));
    const fns = render();
    await flush();

    const cancelBtn = findButtonByText('\u53d6\u6d88');
    expect(cancelBtn).toBeTruthy();
    act(() => {
      cancelBtn!.click();
    });

    expect(fns.onCancel).toHaveBeenCalledTimes(1);
  });

  // ── Active project highlight ──────────────────────────

  it('highlights the active project directory', async () => {
    const activePath = `${HOME}/projects/cat-cafe`;
    mockApiFetch.mockReturnValueOnce(
      jsonOk(
        makeBrowseResult(`${HOME}/projects`, [
          { name: 'cat-cafe', path: activePath },
          { name: 'other', path: `${HOME}/projects/other` },
        ]),
      ),
    );
    render({ initialPath: `${HOME}/projects`, activeProjectPath: activePath });
    await flush();

    expect(container.textContent).toContain('\u5f53\u524d\u9879\u76ee');
  });

  // ── Error handling ────────────────────────────────────

  it('shows error when browse API fails', async () => {
    mockApiFetch.mockReturnValueOnce(jsonFail(403, 'Access denied'));
    render();
    await flush();

    expect(container.textContent).toContain('Access denied');
  });

  // ── Empty directory ───────────────────────────────────

  it('shows "No subdirectories" for empty directory', async () => {
    mockApiFetch.mockReturnValueOnce(jsonOk(makeBrowseResult(`${HOME}/empty`, [])));
    render({ initialPath: `${HOME}/empty` });
    await flush();

    expect(container.textContent).toContain('No subdirectories');
  });

  // ── Windows path support ──────────────────────────────

  it('handles Windows-style paths with my-computer breadcrumbs', async () => {
    const winHome = 'C:\\Users\\test';
    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: `${winHome}\\projects\\cat-cafe`,
        name: 'cat-cafe',
        parent: `${winHome}\\projects`,
        homePath: winHome,
        drives: [{ name: 'C:', path: 'C:\\', isDirectory: true }],
        entries: [{ name: 'src', path: `${winHome}\\projects\\cat-cafe\\src`, isDirectory: true }],
      }),
    );
    render({ initialPath: `${winHome}\\projects\\cat-cafe` });
    await flush();

    expect(container.textContent).toContain('\u6211\u7684\u7535\u8111');
    expect(container.textContent).toContain('C:');
    expect(container.textContent).toContain('Users');
    expect(container.textContent).toContain('projects');
    expect(container.textContent).toContain('cat-cafe');
    expect(container.textContent).toContain('src');
  });

  it('shows drive roots only after clicking the my-computer breadcrumb', async () => {
    const winHome = 'C:\\Users\\test';
    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: 'C:\\Users\\test',
        name: 'test',
        parent: 'C:\\Users',
        homePath: winHome,
        drives: [
          { name: 'C:', path: 'C:\\', isDirectory: true },
          { name: 'D:', path: 'D:\\', isDirectory: true },
        ],
        entries: [{ name: 'projects', path: 'C:\\Users\\test\\projects', isDirectory: true }],
      }),
    );
    render({ initialPath: 'C:\\Users\\test' });
    await flush();

    expect(container.textContent).toContain('projects');
    expect(findButtonByText('D:')).toBeFalsy();

    const computerButton = findButtonByText('\u6211\u7684\u7535\u8111');
    expect(computerButton).toBeTruthy();
    await act(async () => {
      computerButton!.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('C:');
    expect(container.textContent).toContain('D:');
    expect(container.textContent).not.toContain('projects');
    expect(getPrimaryActionButton()?.disabled).toBe(true);
  });

  it('clicks any Windows breadcrumb segment, including the current segment', async () => {
    const winHome = 'C:\\Users\\test';
    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: 'D:\\workspace\\demo',
        name: 'demo',
        parent: 'D:\\workspace',
        homePath: winHome,
        drives: [
          { name: 'C:', path: 'C:\\', isDirectory: true },
          { name: 'D:', path: 'D:\\', isDirectory: true },
        ],
        entries: [{ name: 'src', path: 'D:\\workspace\\demo\\src', isDirectory: true }],
      }),
    );
    render({ initialPath: 'D:\\workspace\\demo' });
    await flush();

    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: 'D:\\workspace\\demo',
        name: 'demo',
        parent: 'D:\\workspace',
        homePath: winHome,
        drives: [
          { name: 'C:', path: 'C:\\', isDirectory: true },
          { name: 'D:', path: 'D:\\', isDirectory: true },
        ],
        entries: [{ name: 'src', path: 'D:\\workspace\\demo\\src', isDirectory: true }],
      }),
    );
    const currentButton = findButtonByText('demo');
    expect(currentButton).toBeTruthy();
    await act(async () => {
      currentButton!.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiFetch).toHaveBeenLastCalledWith(`/api/projects/browse?path=${encodeURIComponent('D:\\workspace\\demo')}`);
  });

  it('shows a clickable drive-root breadcrumb for Windows paths', async () => {
    const winHome = 'C:\\Users\\test';
    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: 'D:\\workspace\\demo',
        name: 'demo',
        parent: 'D:\\workspace',
        homePath: winHome,
        drives: [
          { name: 'C:', path: 'C:\\', isDirectory: true },
          { name: 'D:', path: 'D:\\', isDirectory: true },
        ],
        entries: [{ name: 'src', path: 'D:\\workspace\\demo\\src', isDirectory: true }],
      }),
    );
    render({ initialPath: 'D:\\workspace\\demo' });
    await flush();

    expect(container.textContent).toContain('\u6211\u7684\u7535\u8111');
    expect(container.textContent).toContain('D:');

    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: 'D:\\',
        name: '',
        parent: null,
        homePath: winHome,
        drives: [
          { name: 'C:', path: 'C:\\', isDirectory: true },
          { name: 'D:', path: 'D:\\', isDirectory: true },
        ],
        entries: [{ name: 'workspace', path: 'D:\\workspace', isDirectory: true }],
      }),
    );
    const driveButton = getAllButtons().find((button) => button.textContent === 'D:');
    expect(driveButton).toBeTruthy();
    await act(async () => {
      driveButton!.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(`/api/projects/browse?path=${encodeURIComponent('D:\\')}`);
    expect(container.textContent).toContain('workspace');
  });

  it('does not render other drive roots while browsing inside a drive', async () => {
    const winHome = 'C:\\Users\\test';
    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: 'D:\\workspace',
        name: 'workspace',
        parent: 'D:\\',
        homePath: winHome,
        drives: [
          { name: 'C:', path: 'C:\\', isDirectory: true },
          { name: 'D:', path: 'D:\\', isDirectory: true },
        ],
        entries: [{ name: 'demo', path: 'D:\\workspace\\demo', isDirectory: true }],
      }),
    );
    render({ initialPath: 'D:\\workspace' });
    await flush();

    expect(findButtonByText('C:')).toBeFalsy();
    expect(findButtonByText('D:')).toBeTruthy();
    expect(container.textContent).toContain('demo');
  });

  // ── Path input navigation ─────────────────────────────

  it('navigates to typed path on Enter key', async () => {
    mockApiFetch.mockReturnValueOnce(
      jsonOk(makeBrowseResult(HOME, [{ name: 'projects', path: `${HOME}/projects` }], null)),
    );
    render();
    await flush();

    // Type a new path
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    mockApiFetch.mockReturnValueOnce(jsonOk(makeBrowseResult('/tmp/test', [{ name: 'data', path: '/tmp/test/data' }])));
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '/tmp/test');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(`/api/projects/browse?path=${encodeURIComponent('/tmp/test')}`);
    expect(container.textContent).toContain('data');
  });

  // ── Stale state after error (cloud P2) ────────────────

  it('keeps current listing on browse error and shows error message', async () => {
    // First: successful load
    mockApiFetch.mockReturnValueOnce(
      jsonOk(makeBrowseResult(`${HOME}/projects`, [{ name: 'cat-cafe', path: `${HOME}/projects/cat-cafe` }])),
    );
    const fns = render({ initialPath: `${HOME}/projects` });
    await flush();

    expect(getPrimaryActionButton()).toBeTruthy();
    expect(container.textContent).toContain('cat-cafe');

    // Navigate to a forbidden path
    mockApiFetch.mockReturnValueOnce(jsonFail(403, 'Access denied'));
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '/root/evil');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Error banner shown AND listing still visible (non-destructive)
    expect(container.textContent).toContain('Access denied');
    expect(container.textContent).toContain('cat-cafe');
    // The select button still chooses the previous valid directory
    const selectBtn = getPrimaryActionButton();
    expect(selectBtn).toBeTruthy();
    expect(selectBtn!.disabled).toBe(false);
    act(() => {
      selectBtn!.click();
    });
    expect(fns.onSelect).toHaveBeenCalledWith(`${HOME}/projects`);
  });

  // ── Non-home path breadcrumbs (cloud P2) ──────────────

  it('shows all breadcrumb segments clickable for paths outside $HOME', async () => {
    mockApiFetch.mockReturnValueOnce(
      jsonOk({
        current: '/tmp/workspace/project',
        name: 'project',
        parent: '/tmp/workspace',
        homePath: HOME,
        entries: [{ name: 'src', path: '/tmp/workspace/project/src', isDirectory: true }],
      }),
    );
    render({ initialPath: '/tmp/workspace/project' });
    await flush();

    // Should show path segments
    expect(container.textContent).toContain('tmp');
    expect(container.textContent).toContain('workspace');
    expect(container.textContent).toContain('project');
    expect(container.textContent).toContain('src');

    // All non-current segments should be clickable buttons
    // (backend handles 403 for non-allowed ancestors gracefully)
    const tmpButton = getAllButtons().find((b) => b.textContent === 'tmp');
    expect(tmpButton).toBeTruthy();
    const wsButton = getAllButtons().find((b) => b.textContent === 'workspace');
    expect(wsButton).toBeTruthy();
  });

  it('falls back to homedir with visible info when initialPath returns 403', async () => {
    // initialPath 403 → visible fallback to homedir (not silent!)
    mockApiFetch.mockReturnValueOnce(jsonFail(403, 'Path not allowed'));
    mockApiFetch.mockReturnValueOnce(
      jsonOk(makeBrowseResult(HOME, [{ name: 'projects', path: `${HOME}/projects` }], null)),
    );
    render({ initialPath: '/restricted/path' });
    await flush();

    // Falls back: 2 API calls (initial + homedir)
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    // Shows visible info banner (not silent)
    expect(container.textContent).toContain('\u914d\u7f6e\u8def\u5f84\u4e0d\u53ef\u7528');
    // Shows homedir contents
    expect(container.textContent).toContain('projects');
  });

  it('does NOT fallback on 400 (shows error directly)', async () => {
    mockApiFetch.mockReturnValueOnce(jsonFail(400, 'Cannot read directory'));
    render({ initialPath: '/broken/mount' });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Cannot read directory');
  });
});
