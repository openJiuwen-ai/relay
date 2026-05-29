/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

const DEFAULT_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const PPT_STUDIO_ASSET_CDN = 'https://cdn.digitalhumanai.top';

function removeFrameAncestorsDirective(contentSecurityPolicy: string): string {
  return contentSecurityPolicy
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && !directive.startsWith('frame-ancestors'))
    .join('; ');
}

function appendSourceToDirective(
  contentSecurityPolicy: string,
  directiveName: string,
  source: string,
): string {
  return contentSecurityPolicy
    .split(';')
    .map((directive) => {
      const trimmed = directive.trim();
      if (!trimmed || !trimmed.startsWith(`${directiveName} `)) return trimmed;
      const sources = new Set(trimmed.split(/\s+/));
      sources.add(source);
      return Array.from(sources).join(' ');
    })
    .filter(Boolean)
    .join('; ');
}

function buildPptStudioSlideContentSecurityPolicy(): string {
  let contentSecurityPolicy = removeFrameAncestorsDirective(DEFAULT_CONTENT_SECURITY_POLICY);
  contentSecurityPolicy = appendSourceToDirective(contentSecurityPolicy, 'script-src', PPT_STUDIO_ASSET_CDN);
  contentSecurityPolicy = appendSourceToDirective(contentSecurityPolicy, 'style-src', PPT_STUDIO_ASSET_CDN);
  contentSecurityPolicy = appendSourceToDirective(contentSecurityPolicy, 'font-src', PPT_STUDIO_ASSET_CDN);
  contentSecurityPolicy = appendSourceToDirective(contentSecurityPolicy, 'img-src', PPT_STUDIO_ASSET_CDN);
  return contentSecurityPolicy;
}

function getPathname(requestUrl: string | undefined): string {
  if (!requestUrl) return '';
  try {
    if (requestUrl.startsWith('http://') || requestUrl.startsWith('https://')) {
      return new URL(requestUrl).pathname;
    }
  } catch {
    return requestUrl.split('?')[0] ?? requestUrl;
  }
  return requestUrl.split('?')[0] ?? requestUrl;
}

export function isFrameEmbeddableRequestUrl(requestUrl: string | undefined): boolean {
  return getPathname(requestUrl) === '/api/ppt-studio/slide';
}

export function getApiSecurityHeaders(requestUrl: string | undefined): Record<string, string> {
  const embeddableInFrame = isFrameEmbeddableRequestUrl(requestUrl);

  return {
    'X-Content-Type-Options': 'nosniff',
    ...(embeddableInFrame ? {} : { 'X-Frame-Options': 'DENY' }),
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': embeddableInFrame
      ? buildPptStudioSlideContentSecurityPolicy()
      : DEFAULT_CONTENT_SECURITY_POLICY,
  };
}
