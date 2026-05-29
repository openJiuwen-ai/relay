/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectoryPickerModal } from '../DirectoryPickerModal';

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

const CWD_PATH = '/path/to/project';
const WORKSPACE_PATH = '/path/to/workspace';

describe('DirectoryPickerModal', () => {
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

  function render(props: Partial<React.ComponentProps<typeof DirectoryPickerModal>> = {}) {
    const defaults = {
      existingProjects: [] as string[],
      onSelect: vi.fn(),
      onCancel: vi.fn(),
      ...props,
    };
    act(() => {
      root.render(React.createElement(DirectoryPickerModal, defaults));
    });
    return defaults;
  }

  function setupCwdSuccess() {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/projects/cwd') return jsonOk({ path: CWD_PATH, workspacePath: WORKSPACE_PATH });
      if (path.startsWith('/api/projects/browse')) {
        return jsonOk({ current: WORKSPACE_PATH, name: 'workspace', parent: '/path/to', homePath: '/path', entries: [] });
      }
      if (path === '/api/backlog/items') return jsonOk({ items: [] });
      return jsonFail();
    });
  }

  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  // ── cwd fetch ──────────────────────────────────────────────

  it('fetches cwd on mount and displays recommended quick pick', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    expect(container.textContent).toContain('workspace');
    expect(container.textContent).toContain('\u63a8\u8350');
    expect(container.textContent).toContain(WORKSPACE_PATH);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd');
    expect(fns.onSelect).not.toHaveBeenCalled();
  });

  it('does not show cwd in quick picks when it already exists in existingProjects', async () => {
    setupCwdSuccess();
    render({ existingProjects: [WORKSPACE_PATH] });
    await flush();
    expect(container.textContent).not.toContain('\u63a8\u8350');
  });

  // ── F068-R7: Helper to click confirm button after selecting ──
  function clickConfirm() {
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('\u521b\u5efa\u4f1a\u8bdd'),
    );
    expect(confirmBtn).toBeTruthy();
    act(() => {
      confirmBtn?.click();
    });
  }

  // ── Quick pick selection (two-step: select then confirm) ──

  it('calls onSelect with workspace path when recommended quick pick is selected and confirmed', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    const cwdBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u63a8\u8350'));
    expect(cwdBtn).toBeTruthy();
    act(() => {
      cwdBtn?.click();
    });
    expect(fns.onSelect).not.toHaveBeenCalled(); // not yet — just selected
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(expect.objectContaining({ projectPath: WORKSPACE_PATH }));
  });

  it('calls onSelect with existing project path when selected and confirmed', async () => {
    const existingPath = '/home/user/other';
    setupCwdSuccess();
    const fns = render({ existingProjects: [existingPath] });
    await flush();
    const projectBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('other'));
    expect(projectBtn).toBeTruthy();
    act(() => {
      projectBtn?.click();
    });
    expect(fns.onSelect).not.toHaveBeenCalled();
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(expect.objectContaining({ projectPath: existingPath }));
  });

  // ── Lobby selection (two-step) ─────────────────────────────

  it('calls onSelect(undefined) when lobby is selected and confirmed', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    const lobbyBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u5927\u5385'))!;
    expect(lobbyBtn).toBeTruthy();
    act(() => {
      lobbyBtn?.click();
    });
    expect(fns.onSelect).not.toHaveBeenCalled();
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(expect.objectContaining({ projectPath: undefined }));
  });

  it('confirm button is disabled when no project is selected', async () => {
    setupCwdSuccess();
    render();
    await flush();
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('\u521b\u5efa\u4f1a\u8bdd'),
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.disabled).toBe(true);
  });

  // ── F113: Browse directory button (replaces F068 osascript picker) ──

  it('shows the browse button', async () => {
    setupCwdSuccess();
    render();
    await flush();
    const browseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('\u6d4f\u89c8\u6587\u4ef6\u5939'),
    );
    expect(browseBtn).toBeTruthy();
  });

  it('toggles inline DirectoryBrowser when browse button is clicked', async () => {
    setupCwdSuccess();
    render();
    await flush();
    const browseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('\u6d4f\u89c8\u6587\u4ef6\u5939'),
    )!;
    // Click to open browser panel
    await act(async () => {
      browseBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/projects/browse?path=${encodeURIComponent(WORKSPACE_PATH)}`);
    // Button text changes when the browser is open
    expect(browseBtn.textContent).toContain('\u6536\u8d77\u6d4f\u89c8');
    // Click again to close
    await act(async () => {
      browseBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(browseBtn.textContent).toContain('\u6d4f\u89c8\u6587\u4ef6\u5939');
  });

  it('does not call onSelect just from toggling browser open', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    const browseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('\u6d4f\u89c8\u6587\u4ef6\u5939'),
    )!;
    await act(async () => {
      browseBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fns.onSelect).not.toHaveBeenCalled();
  });

  // ── F068: Path input ──────────────────────────────────────

  it('shows path input field with placeholder', async () => {
    setupCwdSuccess();
    render();
    await flush();
    const inputs = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const pathInput = inputs.find((i) => i.placeholder.includes('\u8def\u5f84'));
    expect(pathInput).toBeTruthy();
  });

  it('validates path via browse API and selects it for confirmation', async () => {
    const canonicalPath = '/home/user/new-path';
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/projects/cwd') return jsonOk({ path: CWD_PATH, workspacePath: WORKSPACE_PATH });
      if (path === '/api/backlog/items') return jsonOk({ items: [] });
      if (path.startsWith('/api/projects/browse'))
        return jsonOk({ current: canonicalPath, name: 'new-path', parent: null, entries: [] });
      return jsonFail();
    });
    const fns = render();
    await flush();
    const input = Array.from(container.querySelectorAll('input[type="text"]')).find((i) =>
      (i as HTMLInputElement).placeholder.includes('\u8def\u5f84'),
    ) as HTMLInputElement;
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      nativeInputValueSetter.call(input, '/home/user/new-path');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    const goBtn = container.querySelector('button[aria-label="\u8df3\u8f6c\u5230\u8def\u5f84"]') as HTMLButtonElement;
    expect(goBtn).toBeTruthy();
    await act(async () => {
      goBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fns.onSelect).not.toHaveBeenCalled(); // not yet
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(expect.objectContaining({ projectPath: canonicalPath }));
  });

  it('shows error when path input validation fails', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/projects/cwd') return jsonOk({ path: CWD_PATH, workspacePath: WORKSPACE_PATH });
      if (path === '/api/backlog/items') return jsonOk({ items: [] });
      if (path.startsWith('/api/projects/browse')) return jsonFail(403, 'Access denied');
      return jsonFail();
    });
    const fns = render();
    await flush();
    const input = Array.from(container.querySelectorAll('input[type="text"]')).find((i) =>
      (i as HTMLInputElement).placeholder.includes('\u8def\u5f84'),
    ) as HTMLInputElement;
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      nativeInputValueSetter.call(input, '/root/evil');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    const goBtn = container.querySelector('button[aria-label="\u8df3\u8f6c\u5230\u8def\u5f84"]') as HTMLButtonElement;
    await act(async () => {
      goBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fns.onSelect).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Access denied');
  });

  // ── F068: No more browse section ──────────────────────────

  it('does NOT show the removed browse-other-directories toggle (removed in F068)', async () => {
    setupCwdSuccess();
    render();
    await flush();
    expect(container.textContent).not.toContain('\u6d4f\u89c8\u5176\u4ed6\u76ee\u5f55');
  });

  // ── Cat selection with preferredAgentIds ──────────────────────

  it('passes selected cats as preferredAgentIds when confirmed', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    // Expand cat selector first (collapsed by default)
    const expandBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('选智能体'));
    expect(expandBtn).toBeTruthy();
    act(() => {
      expandBtn?.click();
    });
    await flush();
    const catChip = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u5e03\u5076\u732b'));
    expect(catChip).toBeTruthy();
    act(() => {
      catChip?.click();
    });
    const cwdBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u63a8\u8350'));
    act(() => {
      cwdBtn?.click();
    });
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: WORKSPACE_PATH, preferredAgentIds: ['opus'] }),
    );
  });

  // ── F095 Phase C: Title input ────────────────────────────

  it('shows thread title input field', async () => {
    setupCwdSuccess();
    render();
    await flush();
    const titleInput = Array.from(container.querySelectorAll('input')).find((i) =>
      (i as HTMLInputElement).placeholder.includes('\u4f1a\u8bdd\u6807\u9898'),
    ) as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    expect(titleInput.maxLength).toBe(200);
  });

  it('shows pin checkbox', async () => {
    setupCwdSuccess();
    render();
    await flush();
    expect(container.textContent).toContain('\u521b\u5efa\u540e\u7f6e\u9876');
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
  });

  // ── F095 Phase C: Title/Pin/Backlog values flow into onSelect ──

  it('passes threadTitle in onSelect when title is filled and confirmed', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    const titleInput = Array.from(container.querySelectorAll('input')).find((i) =>
      (i as HTMLInputElement).placeholder.includes('\u4f1a\u8bdd\u6807\u9898'),
    ) as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(titleInput, '\u6211\u7684\u65b0\u5bf9\u8bdd');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    const cwdBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u63a8\u8350'));
    act(() => {
      cwdBtn?.click();
    });
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(expect.objectContaining({ title: '\u6211\u7684\u65b0\u5bf9\u8bdd' }));
  });

  it('passes pinned=true in onSelect when pin checkbox is checked and confirmed', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => {
      checkbox.click();
    });
    await flush();
    const cwdBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u63a8\u8350'));
    act(() => {
      cwdBtn?.click();
    });
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(expect.objectContaining({ pinned: true }));
  });

  it('passes backlogItemId in onSelect when feat is selected and confirmed', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/projects/cwd') return jsonOk({ path: CWD_PATH, workspacePath: WORKSPACE_PATH });
      if (path === '/api/backlog/items')
        return jsonOk({
          items: [
            { id: 'bl-001', title: 'F095 \u4fa7\u680f\u5bfc\u822a', status: 'in-progress' },
            { id: 'bl-002', title: 'F042 \u63d0\u793a\u8bcd\u5ba1\u8ba1', status: 'open' },
          ],
        });
      return jsonFail();
    });
    const fns = render();
    await flush();
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    act(() => {
      select.value = 'bl-001';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    const cwdBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u63a8\u8350'));
    act(() => {
      cwdBtn?.click();
    });
    clickConfirm();
    expect(fns.onSelect).toHaveBeenCalledWith(expect.objectContaining({ backlogItemId: 'bl-001' }));
  });

  // ── Escape key ────────────────────────────────────────────

  it('calls onCancel when Escape key is pressed', async () => {
    setupCwdSuccess();
    const fns = render();
    await flush();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(fns.onCancel).toHaveBeenCalledTimes(1);
  });
});
