/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';
import VersionUpdateModal from '../VersionUpdateModal';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

describe('VersionUpdateModal', () => {
  let container: HTMLDivElement;
  let root: Root;
  const mockedApiFetch = vi.mocked(apiFetch);

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  const mockVersionResponse = (versionInfo: {
    curversion: string;
    lastversion: string;
    description: string;
    downloadUrl?: string;
    download_url?: string;
  }) => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(versionInfo),
    } as Response);

    const hasNewVersion =
      !!versionInfo.lastversion && !!versionInfo.curversion && versionInfo.lastversion !== versionInfo.curversion;

    if (hasNewVersion) {
      mockedApiFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);
    }
  };

  const versionNew = {
    curversion: '1.0.0',
    lastversion: '1.0.1',
    description: 'bug fixes',
  };

  const versionUpToDate = {
    curversion: '1.0.1',
    lastversion: '1.0.1',
    description: 'bug fixes',
  };

  it('uses the OfficeClaw icon in the update dialog', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('/images/lobster.svg');
    expect(image?.className).toContain('w-[64px]');
    expect(image?.className).toContain('h-[64px]');
  });

  it('uses a 24x24 close icon', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const closeIcon = container.querySelector('button svg');
    expect(closeIcon).not.toBeNull();
    expect(closeIcon?.getAttribute('class')).toContain('h-6');
    expect(closeIcon?.getAttribute('class')).toContain('w-6');
  });

  it('uses version-bg.svg as the dialog card background', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="version-update-card"]');
    expect(card).not.toBeNull();
    expect(card).toBeInstanceOf(HTMLElement);
    expect((card as HTMLElement).style.backgroundImage).toBe('url("/images/version-bg.svg")');
  });

  it('uses a 360px dialog width', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="version-update-card"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('w-[360px]');
  });

  it('uses a 16px dialog corner radius', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="version-update-card"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('rounded-[16px]');
  });

  it('left aligns the icon when a new version is available', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const image = container.querySelector('img');
    expect(image?.parentElement?.className).toContain('justify-start');
  });

  it('centers the icon when there is no new version', async () => {
    mockVersionResponse({
      curversion: '1.0.1',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionUpToDate }));
      await Promise.resolve();
    });

    const image = container.querySelector('img');
    expect(image?.parentElement?.className).toContain('justify-center');
  });

  it('styles the new version title with the specified gradient text', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const title = container.querySelector('[data-testid="version-update-title"]');
    expect(title).not.toBeNull();
    expect(title).toBeInstanceOf(HTMLElement);

    const styleAttr = title?.getAttribute('style') ?? '';
    expect(styleAttr).toContain('linear-gradient(160deg');
    expect(styleAttr).toContain('-webkit-text-fill-color: transparent');
    expect(styleAttr).toContain('font-size: 20px');
    expect(styleAttr).toContain('font-weight: 700');
    expect(styleAttr).toContain('line-height: 30px');
  });

  it('left aligns the content area when a new version is available', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const content = container.querySelector('[data-testid="version-update-content"]');
    expect(content).not.toBeNull();
    expect(content?.className).toContain('text-left');
  });

  it('has action buttons in a separate area at the bottom', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const laterButton = container.querySelector('[data-testid="version-update-cancel"]');
    expect(laterButton).not.toBeNull();

    const updateButton = container.querySelector('[data-testid="version-update-confirm"]');
    expect(updateButton).not.toBeNull();
  });

  it('calls onCancel when clicking the later button', async () => {
    const onCancel = vi.fn();
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel, versionInfo: versionNew }));
      await Promise.resolve();
    });

    const laterButton = container.querySelector('[data-testid="version-update-cancel"]');
    expect(laterButton).not.toBeNull();
    expect(laterButton?.className).toContain('ui-button-default');

    await act(async () => {
      laterButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('starts download when clicking update button', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
      downloadUrl: 'https://example.com/update.exe',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const updateButton = container.querySelector('[data-testid="version-update-confirm"]');
    expect(updateButton).not.toBeNull();
    expect(updateButton?.className).toContain('ui-button-primary');
  });

  it('shows download progress when download starts', async () => {
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
      } as unknown as Response),
    );

    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
      downloadUrl: 'https://example.com/update.exe',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn(), versionInfo: versionNew }));
      await Promise.resolve();
    });

    const updateButton = container.querySelector('[data-testid="version-update-confirm"]');

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    mockFetch.mockRestore();
  });

  it('closes the modal when Escape key is pressed', async () => {
    const onCancel = vi.fn();
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel, versionInfo: versionNew }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="version-update-card"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
