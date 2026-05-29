/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b Phase 3: ThreadAgentSettings — settings popover for existing thread preferredAgentIds.
 * Tests the "open → select agent → save → onSave called" path.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadAgentSettings } from '../ThreadAgentSettings';

// ── Mock apiFetch (used by useAgentData inside AgentSelector) ──
vi.mock('@/utils/api-client', () => ({
  apiFetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
  API_URL: 'http://localhost:3003',
}));

describe('ThreadAgentSettings', () => {
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

  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  function render(props: Partial<React.ComponentProps<typeof ThreadAgentSettings>> = {}) {
    const defaults = {
      threadId: 'thread-123',
      currentAgentIds: [] as string[],
      onSave: vi.fn().mockResolvedValue(undefined),
      ...props,
    };
    act(() => {
      root.render(React.createElement(ThreadAgentSettings, defaults));
    });
    return defaults;
  }

  it('opens popover, selects an agent, and calls onSave with selected ids', async () => {
    const fns = render();
    await flush();

    // Click the settings button to open popover
    const settingsBtn = container.querySelector('button[title="设置默认智能体"]');
    expect(settingsBtn).toBeTruthy();
    act(() => {
      (settingsBtn as HTMLElement).click();
    });
    await flush();

    const popover = container.querySelector('[data-testid="thread-agent-settings-popover"]');
    expect(popover).toBeTruthy();
    expect(popover?.className).toContain('ui-overlay-card');

    // Popover should now be open — AgentSelector renders chips from fallback OFFICE_CLAW_CONFIGS
    // Find and click the 布偶猫 chip
    const agentChip = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('布偶猫'));
    expect(agentChip).toBeTruthy();
    act(() => {
      agentChip?.click();
    });

    // Save button should now be enabled (hasChanged = true)
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '保存');
    expect(saveBtn).toBeTruthy();
    expect(saveBtn?.hasAttribute('disabled')).toBe(false);
    expect(saveBtn?.className).toContain('ui-button-primary');

    // Click save
    await act(async () => {
      saveBtn?.click();
    });

    // onSave should have been called with threadId and selected agent ids
    expect(fns.onSave).toHaveBeenCalledWith('thread-123', ['opus']);
  });

  it('save button is disabled when no change has been made', async () => {
    render({ currentAgentIds: ['opus'] });
    await flush();

    // Open popover
    const settingsBtn = container.querySelector('button[title="设置默认智能体"]');
    act(() => {
      (settingsBtn as HTMLElement).click();
    });
    await flush();

    // opus is already selected, so no change → save should be disabled
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '保存');
    expect(saveBtn).toBeTruthy();
    expect(saveBtn?.hasAttribute('disabled')).toBe(true);
    expect(saveBtn?.className).toContain('ui-button-primary');
  });

  it('cancel reverts selection and closes popover', async () => {
    const fns = render();
    await flush();

    // Open popover
    const settingsBtn = container.querySelector('button[title="设置默认智能体"]');
    act(() => {
      (settingsBtn as HTMLElement).click();
    });
    await flush();

    // Select an agent
    const agentChip = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('布偶猫'));
    act(() => {
      agentChip?.click();
    });

    // Click cancel
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '取消');
    expect(cancelBtn?.className).toContain('ui-button-default');
    act(() => {
      cancelBtn?.click();
    });

    // Popover should be closed (no "保存" button visible)
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '保存');
    expect(saveBtn).toBeFalsy();

    // onSave should not have been called
    expect(fns.onSave).not.toHaveBeenCalled();
  });

  it('shows error and keeps popover open when onSave rejects', async () => {
    render({ onSave: vi.fn().mockRejectedValue(new Error('网络错误')) });
    await flush();

    // Open popover
    const settingsBtn = container.querySelector('button[title="设置默认智能体"]');
    act(() => {
      (settingsBtn as HTMLElement).click();
    });
    await flush();

    // Select an agent
    const agentChip = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('布偶猫'));
    act(() => {
      agentChip?.click();
    });

    // Click save (will reject)
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '保存');
    await act(async () => {
      saveBtn?.click();
    });

    // Popover should still be open (save button still visible)
    const saveBtnAfter = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '保存');
    expect(saveBtnAfter).toBeTruthy();
    expect(saveBtnAfter?.className).toContain('ui-button-primary');

    // Error message should be shown
    expect(container.textContent).toContain('保存失败');

    // Save button should not be disabled (isSaving reset, hasChanged still true)
    expect(saveBtnAfter?.hasAttribute('disabled')).toBe(false);
  });

  it('clear button resets selection to empty', async () => {
    const fns = render({ currentAgentIds: ['opus', 'codex'] });
    await flush();

    // Open popover
    const settingsBtn = container.querySelector('button[title="设置默认智能体"]');
    act(() => {
      (settingsBtn as HTMLElement).click();
    });
    await flush();

    // Click "清除" to clear all selections
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '清除');
    expect(clearBtn).toBeTruthy();
    act(() => {
      clearBtn?.click();
    });

    // Save should now be enabled (changed from ['opus','codex'] to [])
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '保存');
    expect(saveBtn?.hasAttribute('disabled')).toBe(false);

    // Save the cleared state
    await act(async () => {
      saveBtn?.click();
    });
    expect(fns.onSave).toHaveBeenCalledWith('thread-123', []);
  });
});
