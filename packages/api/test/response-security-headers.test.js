/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

await import('tsx/esm');
const {
  getApiSecurityHeaders,
  isFrameEmbeddableRequestUrl,
} = await import('../src/utils/response-security.ts');

describe('API response security headers', () => {
  it('keeps frame blocking headers for normal API routes', () => {
    const headers = getApiSecurityHeaders('/api/messages');

    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  });

  it('allows ppt slide HTML to be embedded without dropping the rest of the CSP', () => {
    const headers = getApiSecurityHeaders(
      '/api/ppt-studio/slide?projectRoot=%2Ftmp%2Fppt-root&path=output%2Fdemo%2Fpages%2Fpage-1.pptx.html',
    );

    assert.equal(headers['X-Frame-Options'], undefined);
    assert.ok(!headers['Content-Security-Policy'].includes('frame-ancestors'));
    assert.ok(headers['Content-Security-Policy'].includes("default-src 'self'"));
    assert.ok(
      headers['Content-Security-Policy'].includes(
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.digitalhumanai.top",
      ),
    );
    assert.ok(
      headers['Content-Security-Policy'].includes(
        "style-src 'self' 'unsafe-inline' https://cdn.digitalhumanai.top",
      ),
    );
    assert.ok(
      headers['Content-Security-Policy'].includes("font-src 'self' data: https://cdn.digitalhumanai.top"),
    );
  });

  it('does not relax neighboring ppt routes that are not embedded in an iframe', () => {
    const headers = getApiSecurityHeaders('/api/ppt-studio/session?projectRoot=%2Ftmp%2Fppt-root&pagesDir=output%2Fdemo%2Fpages');

    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  });

  it('detects the embeddable route even when passed an absolute URL', () => {
    assert.equal(
      isFrameEmbeddableRequestUrl(
        'http://127.0.0.1:3004/api/ppt-studio/slide?projectRoot=%2Ftmp%2Fppt-root&path=output%2Fdemo%2Fpages%2Fpage-1.pptx.html',
      ),
      true,
    );
  });
});
