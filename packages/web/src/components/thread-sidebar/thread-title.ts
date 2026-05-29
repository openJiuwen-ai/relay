/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

const TOKEN_RE =
  /([@\uFF20])([^\s,.:;!?\[\]{}<>\uFF0C\u3002\uFF01\uFF1F\u3001\uFF1A\uFF1B\u3010\u3011\u300A\u300B\u300C\u300D\u300E\u300F\u3008\u3009()（）]+)(?:\uFF08([^\uFF09]*)\uFF09|\(([^)]*)\))?/g;
const LEADING_NOISE_RE = /^[\s.\u3002\u2026!\uFF01?\uFF1F,\uFF0C:\uFF1A;\uFF1B\u3001~\-\u2014_()（）]+/;
const MEANINGFUL_CHAR_RE = /[A-Za-z0-9\u4E00-\u9FFF]/;
const EDGE_PUNCT_RE = /^[,.:;!?()\[\]{}<>\uFF0C\u3002\uFF01\uFF1F\u3001\uFF1A\uFF1B]+|[,.:;!?()\[\]{}<>\uFF0C\u3002\uFF01\uFF1F\u3001\uFF1A\uFF1B]+$/g;
const GENERIC_MENTION_RE =
  /[@\uFF20][^\s,.:;!?\[\]{}<>\uFF0C\u3002\uFF01\uFF1F\u3001\uFF1A\uFF1B\u3010\u3011\u300A\u300B\u300C\u300D\u300E\u300F\u3008\u3009()（）]+(?:\uFF08[^\uFF09]*\uFF09|\([^)]*\))?/g;
const BOUNDARY = '[\\s,.:;!?()\\[\\]{}<>\\uFF0C\\u3002\\uFF01\\uFF1F\\u3001\\uFF1A\\uFF1B\\uFF08\\uFF09\\u3010\\u3011\\u300A\\u300B\\u300C\\u300D\\u300E\\u300F\\u3008\\u3009]';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripAgentMentions(text: string, knownAliases?: ReadonlySet<string>): string {
  const targeted = text.replace(
    TOKEN_RE,
    (full: string, _at: string, alias: string, fullWidthSuffix?: string, halfWidthSuffix?: string) => {
      if (!knownAliases) return ' ';
      const base = alias.toLowerCase();
      if (knownAliases.has(base)) return ' ';
      const suffix = fullWidthSuffix ?? halfWidthSuffix;
      if (suffix && knownAliases.has(`${base}（${suffix.toLowerCase()}）`)) return ' ';
      return full;
    },
  );
  // Fallback: remove any remaining @token mentions to handle unregistered aliases/special chars.
  const replaced = targeted.replace(GENERIC_MENTION_RE, ' ');
  return replaced.replace(/\s+/g, ' ').trim();
}

function stripBareAgentAliases(text: string, knownAliases?: ReadonlySet<string>): string {
  if (!knownAliases || knownAliases.size === 0) return text;
  let next = text;
  const aliases = Array.from(knownAliases)
    .map((a) => a.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const escaped = escapeRegExp(alias);
    const re = new RegExp(`(^|${BOUNDARY})${escaped}(?=$|${BOUNDARY})`, 'giu');
    next = next.replace(re, '$1');
  }
  return next.replace(EDGE_PUNCT_RE, '').replace(/\s+/g, ' ').trim();
}

export function sanitizeThreadTitleOrNull(
  rawTitle: string | null | undefined,
  knownAliases?: ReadonlySet<string>,
): string | null {
  const withoutMentions = stripAgentMentions((rawTitle ?? '').trim(), knownAliases);
  const withoutAgentWords = stripBareAgentAliases(withoutMentions, knownAliases);
  const cleaned = withoutAgentWords.replace(LEADING_NOISE_RE, '').trim();
  return cleaned && MEANINGFUL_CHAR_RE.test(cleaned) ? cleaned : null;
}

export function normalizeStoredThreadTitleOrNull(rawTitle: string | null | undefined): string | null {
  const trimmed = (rawTitle ?? '').trim();
  return trimmed || null;
}

export function normalizeStoredThreadTitle(
  rawTitle: string | null | undefined,
  fallback = '\u672A\u547D\u540D\u5BF9\u8BDD',
): string {
  return normalizeStoredThreadTitleOrNull(rawTitle) ?? fallback;
}
