/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it, vi } from 'vitest';
import { buildPptSlideUrl, PPT_SLIDE_HEIGHT, PPT_SLIDE_WIDTH } from '@/components/ppt-studio/ppt-preview-canvas';

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3004',
}));

describe('ppt preview canvas helpers', () => {
  it('builds a slide url with cache-busting version when slide metadata is available', () => {
    const url = buildPptSlideUrl(
      '/tmp/ppt-root',
      {
        slideId: 'slide-2',
        pageNumber: 2,
        htmlPath: 'output/demo/pages/page-2.pptx.html',
        updatedAt: 200,
        title: 'Revenue Plan',
        blockCount: 1,
        url: null,
        sha256: null,
      },
    );

    expect(url).toContain('http://localhost:3004/api/ppt-studio/slide?');
    expect(url).toContain('projectRoot=%2Ftmp%2Fppt-root');
    expect(url).not.toContain('worktreeId=');
    expect(url).toContain('path=output%2Fdemo%2Fpages%2Fpage-2.pptx.html');
    expect(url).toContain('v=200');
    expect(PPT_SLIDE_WIDTH).toBe(1280);
    expect(PPT_SLIDE_HEIGHT).toBe(720);
  });

  it('returns an empty slide url when project root or slide is missing', () => {
    expect(buildPptSlideUrl(null, null)).toBe('');
    expect(
      buildPptSlideUrl(
        '/tmp/ppt-root',
        {
          slideId: 'slide-1',
          pageNumber: 1,
          htmlPath: 'output/demo/pages/page-1.pptx.html',
          updatedAt: null,
          title: null,
          blockCount: null,
          url: null,
          sha256: null,
        },
      ),
    ).toContain('projectRoot=');
  });

  it('coerces legacy workspace projectRoot when pagesDir is absolute under pptx-craft', () => {
    const r = '/Users/dev/relay-claw';
    const u = buildPptSlideUrl(
      `${r}/workspace/20260425111805`,
      {
        slideId: 's1',
        pageNumber: 1,
        htmlPath: 'output/20260425_113003_000/pages/page-1.pptx.html',
        updatedAt: null,
        title: null,
        blockCount: null,
        url: null,
        sha256: null,
      },
      `${r}/office-claw-skills/pptx-craft/output/20260425_113003_000/pages`,
    );
    expect(u).toContain(encodeURIComponent(`${r}/office-claw-skills/pptx-craft`));
  });
});
