/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';
import { useEmbeddedTextPreviewSource } from '../useEmbeddedTextPreviewSource';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function createJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function PreviewStateProbe({ path }: { path: string }) {
  const state = useEmbeddedTextPreviewSource(path);
  return React.createElement('div', { 'data-testid': 'state' }, state.status === 'ok' ? state.content : state.status);
}

describe('useEmbeddedTextPreviewSource', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('loads bundled inspiration products from the API product path', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '# bundled product',
    } as Response);

    await act(async () => {
      root.render(React.createElement(PreviewStateProbe, { path: '/api/inspiration/products/example.md' }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('# bundled product');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/inspiration/products/example.md', expect.objectContaining({}));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps local workspace files on the project read API', async () => {
    mockApiFetch.mockResolvedValue(createJsonResponse({ content: '# local product' }));

    await act(async () => {
      root.render(React.createElement(PreviewStateProbe, { path: '/Users/example/result.md' }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('# local product');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/projects/read-local-text',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
