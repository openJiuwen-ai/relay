/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Phase 4 (AC-H2): Content fetch with browser-automation routing detection.
 * Server-side fetch for simple HTML; flags JS-heavy sites as needs-browser.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FetchResult } from './types.js';

/** Known JS-heavy site patterns that need real browser rendering */
const JS_HEAVY_PATTERNS = [
  /^https?:\/\/(www\.)?(x|twitter)\.com\//,
  /^https?:\/\/(www\.)?xiaohongshu\.com\//,
  /^https?:\/\/(www\.)?bilibili\.com\//,
  /^https?:\/\/(www\.)?douyin\.com\//,
  /^https?:\/\/(www\.)?instagram\.com\//,
  /^https?:\/\/(www\.)?threads\.net\//,
];

const MAX_TEXT_LENGTH = 2000;

/** Private/internal IP patterns for SSRF protection */
const BLOCKED_HOSTS = [
  /^localhost(\.localdomain)?$/i,
  /\.localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?fe[89ab][0-9a-f]:/i,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?::ffff:/i,
];

/** Check if a resolved IP address falls in private/loopback/link-local ranges */
function isPrivateIP(ip: string): boolean {
  // IPv4 checks
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('0.') || ip.startsWith('169.254.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  // IPv6 loopback and private
  if (ip === '::1' || ip === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  if (/^::ffff:/i.test(ip)) return true;
  return false;
}

/** Validate URL for SSRF safety: only public HTTP(S) allowed */
export async function validateUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL blocked: only HTTP(S) allowed, got ${parsed.protocol}`);
  }
  const host = parsed.hostname;
  // Phase 1: hostname pattern check (fast path)
  if (BLOCKED_HOSTS.some((p) => p.test(host))) {
    throw new Error(`URL blocked: internal/private address not allowed (${host})`);
  }
  // Phase 2: DNS resolution check — prevents rebind attacks via external domains pointing to internal IPs
  const resolvedIP = isIP(host) ? host : (await lookup(host)).address;
  if (isPrivateIP(resolvedIP)) {
    throw new Error(`URL blocked: resolved to private IP ${resolvedIP} (${host})`);
  }
}

export function needsBrowser(url: string): boolean {
  return JS_HEAVY_PATTERNS.some((p) => p.test(url));
}

/** Extract readable text from HTML — strips scripts, styles, and tags */
export function extractText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text: cleaned };
}

export function createFetchContentFn(): (url: string) => Promise<FetchResult> {
  return async (url: string): Promise<FetchResult> => {
    await validateUrl(url);

    if (needsBrowser(url)) {
      return {
        text: '',
        title: '',
        url,
        method: 'browser',
        truncated: false,
      };
    }

    // Manual redirect loop — validate each hop to prevent SSRF via 302 to internal IP
    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let res: Response | undefined;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      res = await fetch(currentUrl, {
        headers: { 'User-Agent': 'OfficeClaw-WebDigest/1.0' },
        signal: AbortSignal.timeout(15_000),
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error(`Redirect ${res.status} without Location header`);
        currentUrl = new URL(location, currentUrl).href;
        await validateUrl(currentUrl);
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400)) {
      throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
    }
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const { title, text } = extractText(html);
    const truncated = text.length > MAX_TEXT_LENGTH;

    return {
      text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
      title,
      url,
      method: 'server-fetch',
      truncated,
    };
  };
}
