/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsPanel } from '@/components/skills-panel/SkillsPanel';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/utils/skill-options-cache', () => ({ notifySkillOptionsChanged: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);
const mockNotifySkillOptionsChanged = vi.mocked(notifySkillOptionsChanged);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

vi.mock('@/components/skills-panel/CapabilityTab', () => ({
  CapabilityTab: ({
    onImport,
    onSelectSkill,
    onUpdateSkill,
    skillUpdates,
    updatingSkillId,
  }: {
    onImport?: () => void;
    onSelectSkill?: (selection: { skillName: string; avatarUrl?: string | null }) => void;
    onUpdateSkill?: (skillName: string) => void;
    skillUpdates?: ReadonlySet<string>;
    updatingSkillId?: string | null;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'installed-panel-import',
          onClick: onImport,
        },
        'Import',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'installed-panel-open-detail',
          onClick: () =>
            onSelectSkill?.({
              skillName: 'demo-skill',
              avatarUrl: '/avatars/demo-skill.png',
            }),
        },
        'Open detail',
      ),
      React.createElement(
        'div',
        { 'data-testid': 'mock-skill-card-remote-skill' },
        'remote-skill',
        skillUpdates?.has('remote-skill') ? React.createElement('span', null, '有更新') : null,
        React.createElement(
          'button',
          {
            type: 'button',
            disabled: updatingSkillId === 'remote-skill',
            onClick: () => onUpdateSkill?.('remote-skill'),
          },
          updatingSkillId === 'remote-skill' ? '更新中' : '更新',
        ),
      ),
      React.createElement(
        'div',
        { 'data-testid': 'mock-skill-card-kept-skill' },
        'kept-skill',
        skillUpdates?.has('kept-skill') ? React.createElement('span', null, '有更新') : null,
        React.createElement(
          'button',
          {
            type: 'button',
            disabled: updatingSkillId === 'kept-skill',
            onClick: () => onUpdateSkill?.('kept-skill'),
          },
          updatingSkillId === 'kept-skill' ? '更新中' : '更新',
        ),
      ),
    ),
}));

vi.mock('@/components/skills-panel/SkillsTab', () => ({
  SkillsTab: () => React.createElement('div', { 'data-testid': 'market-panel' }),
}));

vi.mock('@/components/skills-panel/UploadSkillModal', () => ({
  UploadSkillModal: ({
    open,
    onSuccess,
  }: {
    open: boolean;
    onSuccess: () => void;
  }) =>
    open
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: onSuccess,
          },
          'Mock upload success',
        )
      : null,
}));

vi.mock('@/components/skills-panel/SkillDetailView', () => ({
  SkillDetailView: ({
    skillName,
    avatarUrl,
    onBack,
  }: {
    skillName: string;
    avatarUrl?: string | null;
    onBack: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'skill-detail-view' },
      React.createElement('div', null, `Detail:${skillName}`),
      React.createElement('div', null, `AvatarUrl:${avatarUrl ?? 'none'}`),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onBack,
        },
        'Back',
      ),
    ),
}));

describe('SkillsPanel global upload toast', () => {
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
    window.localStorage.removeItem('office-claw:skills-plaza-risk-ack:v1');
    mockApiFetch.mockResolvedValue(jsonResponse({ success: true, updates: [] }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('shows update status on skill cards and refreshes after updating one skill', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/skills/check-updates') {
        return Promise.resolve(
          jsonResponse({
            success: true,
            updates: [
              {
                name: 'remote-skill',
                remoteSkillName: 'remote-skill',
                currentVersion: '1.0.0',
                latestVersion: '1.1.0',
                description: 'remote skill description',
              },
              {
                name: 'kept-skill',
                remoteSkillName: 'kept-skill',
                currentVersion: '2.0.0',
                latestVersion: '2.1.0',
                description: 'kept skill description',
              },
            ],
          }),
        );
      }
      if (url === '/api/skills/update' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, name: 'remote-skill' }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(SkillsPanel),
          React.createElement(ToastContainer),
        ),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const remoteCard = document.body.querySelector('[data-testid="mock-skill-card-remote-skill"]');
    const keptCard = document.body.querySelector('[data-testid="mock-skill-card-kept-skill"]');
    expect(remoteCard?.textContent).toContain('有更新');
    expect(keptCard?.textContent).toContain('有更新');
    expect(document.body.textContent).not.toContain('发现技能更新');
    expect(document.body.textContent).not.toContain('1.0.0 → 1.1.0');

    const updateButton = Array.from(remoteCard?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('更新'),
    );
    expect(updateButton).toBeDefined();

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/skills/update',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'remote-skill' }),
      }),
    );
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/api/skills/update',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'kept-skill' }),
      }),
    );
    expect(mockNotifySkillOptionsChanged).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[data-testid="mock-skill-card-remote-skill"]')?.textContent).not.toContain('有更新');
    expect(document.body.querySelector('[data-testid="mock-skill-card-kept-skill"]')?.textContent).toContain('有更新');
    expect(useToastStore.getState().toasts.some((toast) => toast.title === '更新成功')).toBe(true);
  });

  it('routes upload success feedback through the global toast store', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(SkillsPanel),
          React.createElement(ToastContainer),
        ),
      );
    });

    const importButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Import'),
    );
    expect(importButton).toBeDefined();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const successButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Mock upload success'),
    );
    expect(successButton).toBeDefined();

    await act(async () => {
      successButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(
      useToastStore.getState().toasts.some((toast) => toast.type === 'success' && toast.title === '上传成功' && toast.message === '技能上传成功'),
    ).toBe(true);
  });

  it('switches from installed list to detail view and back inside SkillsPanel', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsPanel));
    });

    const openDetailButton = container.querySelector('[data-testid="installed-panel-open-detail"]') as HTMLButtonElement | null;
    expect(openDetailButton).not.toBeNull();

    await act(async () => {
      openDetailButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="skill-detail-view"]')).not.toBeNull();
    expect(container.textContent).toContain('Detail:demo-skill');
    expect(container.textContent).toContain('AvatarUrl:/avatars/demo-skill.png');
    expect(container.querySelector('[data-testid="installed-panel-import"]')).toBeNull();
    expect(container.textContent).not.toContain('技能广场');

    const backButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Back'),
    );
    expect(backButton).toBeDefined();

    await act(async () => {
      backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="skill-detail-view"]')).toBeNull();
    expect(container.querySelector('[data-testid="installed-panel-import"]')).not.toBeNull();
  });

  it('closes the skill plaza risk modal when Escape key is pressed', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsPanel));
    });

    const skillPlazaButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('技能广场'),
    );
    expect(skillPlazaButton).toBeDefined();

    await act(async () => {
      skillPlazaButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('风险提示');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain('风险提示');
  });
});
