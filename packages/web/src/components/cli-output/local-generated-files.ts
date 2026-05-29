/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { DocumentPreviewKind } from '@/components/document-preview/document-preview-types';
import type { PptStudioSession } from '@/components/ppt-studio/ppt-studio-types';
import type { CliEvent } from '@/stores/chat-types';

export type LocalGeneratedFileKind = 'ppt' | 'markdown' | 'docx' | 'xlsx' | 'pdf' | 'txt' | 'html' | 'code' | 'other';

/** Mirrors `LOCAL_AGENT_OPENABLE_EXTS` in packages/api/src/routes/projects.ts for POST /api/projects/open-local */
export const LOCAL_AGENT_OPENABLE_EXTENSIONS = new Set([
  '.ppt',
  '.pptx',
  '.pot',
  '.potx',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.pdf',
  '.txt',
  '.log',
  '.json',
  '.md',
  '.markdown',
  '.html',
  '.htm',
]);

export function isLocalAgentOpenableExtension(pathOrFileName: string): boolean {
  const segment = pathOrFileName.trim().split(/[\\/]/).pop() ?? pathOrFileName;
  const base = segment.split(/[?#]/)[0] ?? segment;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return false;
  return LOCAL_AGENT_OPENABLE_EXTENSIONS.has(base.slice(dot).toLowerCase());
}

export interface LocalGeneratedFile {
  name: string;
  path: string;
  kind: LocalGeneratedFileKind;
  /**
   * Milliseconds from the paired `tool_use` CliEvent (agent message `timestamp`).
   * Shown when `/api/projects/local-file-meta` cannot provide `mtimeMs` (e.g. path not visible to API).
   */
  fallbackGeneratedAt?: number;
  /** 工作产物虚拟行：尚无 send_file 成品，用于 PPT 仅写 HTML 时的占位等 */
  isVirtual?: boolean;
  /** 与 `PptStudioSession.pagesDir` 对应 — 虚拟 PPT 行用于绑定幻灯片预览 */
  pptPagesDir?: string;
}

export interface LocalGeneratedFileMeta {
  generatedAt: number;
  /** Present when the API includes existence alongside timestamp. */
  exists?: boolean;
}

export type FileVerificationStatus = 'checking' | 'exists' | 'not-found' | 'error';

function normalizeLocalFilePath(path: string): string {
  const repairedEscapes = path.replace(/[\r\n\t\f\v\b]/g, (ch) => {
    if (ch === '\r') return '\\r';
    if (ch === '\n') return '\\n';
    if (ch === '\t') return '\\t';
    if (ch === '\f') return '\\f';
    if (ch === '\v') return '\\v';
    return '\\b';
  });
  return repairedEscapes
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\\//g, '/')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/g, '')
    .trim();
}

function sanitizeLocalFilePath(path: string): string {
  return path.replace(/[\r\n\t\f\v\b]/g, (ch) => {
    if (ch === '\r') return '\\r';
    if (ch === '\n') return '\\n';
    if (ch === '\t') return '\\t';
    if (ch === '\f') return '\\f';
    if (ch === '\v') return '\\v';
    return '\\b';
  });
}

function hasLikelyFileExtension(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '');
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  return /\.[^./\\]+$/.test(base);
}

function resolveFilePathWithOptionalName(path: string, fileName?: string): string {
  const cleanPath = sanitizeLocalFilePath(path)
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '');
  const cleanName = typeof fileName === 'string' ? fileName.trim() : '';
  if (!cleanPath || !cleanName) return cleanPath;
  if (hasLikelyFileExtension(cleanPath)) return cleanPath;
  const separator = cleanPath.includes('\\') ? '\\' : '/';
  const normalizedBase = cleanPath.replace(/[\\/]+$/g, '');
  const normalizedName = cleanName.replace(/^[\\/]+/g, '');
  return `${normalizedBase}${separator}${normalizedName}`;
}

/** 与 upstream/main 的 CliOutputBlock 中逻辑一致（仅用于 `send_file_to_user` 列表去重）。 */
function mergeFallbackAt(a: LocalGeneratedFile, b: LocalGeneratedFile): number | undefined {
  const x = a.fallbackGeneratedAt ?? 0;
  const y = b.fallbackGeneratedAt ?? 0;
  const m = Math.max(x, y);
  return m > 0 ? m : undefined;
}

function dedupeLocalGeneratedFiles(files: Array<LocalGeneratedFile | null>): LocalGeneratedFile[] {
  const deduped = new Map<string, LocalGeneratedFile>();
  const kindPriority: Record<LocalGeneratedFileKind, number> = {
    ppt: 5,
    docx: 4,
    markdown: 3,
    xlsx: 2,
    pdf: 2,
    txt: 2,
    html: 2,
    code: 1,
    other: 0,
  };

  function normalizeFileKey(path: string): string {
    return normalizeLocalFilePath(path).toLowerCase();
  }

  function isSameFileCandidate(left: string, right: string): boolean {
    if (left === right) return true;
    return left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
  }

  for (const file of files) {
    if (!file) continue;
    const key = normalizeFileKey(file.path);
    const matchedEntry = [...deduped.entries()].find(([existingKey]) => isSameFileCandidate(existingKey, key));
    const matchedKey = matchedEntry?.[0];
    const existing = matchedKey ? deduped.get(matchedKey) : deduped.get(key);
    const shouldReplace =
      !existing ||
      kindPriority[file.kind] > kindPriority[existing.kind] ||
      key.length > normalizeFileKey(existing.path).length;

    if (!existing) {
      deduped.set(key, file);
      continue;
    }

    if (matchedKey && matchedKey !== key) {
      deduped.delete(matchedKey);
    }

    if (shouldReplace) {
      deduped.set(key, { ...file, fallbackGeneratedAt: mergeFallbackAt(file, existing) });
    } else {
      deduped.set(matchedKey ?? key, { ...existing, fallbackGeneratedAt: mergeFallbackAt(existing, file) });
    }
  }
  return [...deduped.values()];
}

export function isAbsolutePresentationPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/');
}

function normalizePathSeparators(path: string, separator: '\\' | '/'): string {
  return separator === '\\' ? path.replace(/\//g, '\\') : path.replace(/\\/g, '/');
}

function joinPresentationPath(basePath: string, filePath: string): string {
  const separator: '\\' | '/' = basePath.includes('\\') || /^[A-Za-z]:\\/.test(basePath) ? '\\' : '/';
  const normalizedBase = normalizePathSeparators(basePath, separator).replace(/[\\/]+$/, '');
  const normalizedFile = normalizePathSeparators(filePath, separator)
    .replace(/^[.][\\/]/, '')
    .replace(/^[\\/]+/, '');
  return `${normalizedBase}${separator}${normalizedFile}`;
}

export function resolvePresentationPath(
  rawPath: string,
  configuredProjectPath?: string | null,
  defaultProjectPath?: string | null,
): string | null {
  if (isAbsolutePresentationPath(rawPath)) return rawPath;

  const basePath =
    configuredProjectPath && configuredProjectPath !== 'default'
      ? configuredProjectPath
      : defaultProjectPath && defaultProjectPath !== 'default'
        ? defaultProjectPath
        : null;

  return basePath ? joinPresentationPath(basePath, rawPath) : null;
}

export function getParentDirectoryPath(path: string): string | null {
  const normalized = path.trim().replace(/[\\/]+$/, '');
  if (!normalized) return null;
  const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (idx < 0) return null;
  if (idx === 0) return normalized[0];
  return normalized.slice(0, idx);
}

export function fileNameFromPath(path: string): string {
  const s = path.trim();
  if (!s) return '';
  const normalized = s.replace(/\\/g, '/').replace(/\/+$/, '');
  const i = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  const base = i >= 0 ? normalized.slice(i + 1) : normalized;
  if (base) {
    try {
      if (/^(file:|content:|https?:)/i.test(s)) {
        return decodeURIComponent(base.split('?')[0] ?? base);
      }
    } catch {
      // ignore
    }
    return base;
  }
  return s;
}

/** Fullwidth / IDEO full stop → ASCII `.` so extension heuristics match agent-provided filenames. */
function normalizeExtensionDotsForKindHeuristic(input: string): string {
  return input.replace(/\uFF0E/gu, '.').replace(/\u3002/gu, '.');
}

function inferLocalGeneratedFileKindFromValue(value: string): LocalGeneratedFileKind | null {
  const raw = value.split(/[?#]/)[0] ?? value;
  const q = normalizeExtensionDotsForKindHeuristic(raw);
  const normalized = q.toLowerCase();
  if (/\.(?:md|markdown)$/.test(normalized)) return 'markdown';
  if (/\.(?:doc|docx)$/.test(normalized)) return 'docx';
  if (/\.(?:xls|xlsx|csv)$/.test(normalized)) return 'xlsx';
  if (/\.pdf$/.test(normalized)) return 'pdf';
  if (/\.(?:txt|log)$/.test(normalized)) return 'txt';
  if (/\.(?:html|htm)$/.test(normalized)) return 'html';
  if (/\.(?:ppt|pptx|pot|potx)$/.test(normalized)) return 'ppt';
  // Code / script files rendered via CodeMirror in the file browser
  if (
    /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|json5|css|scss|less|sass|py|pyw|rb|rs|go|java|kt|kts|c|cpp|cc|cxx|h|hpp|cs|php|swift|sh|bash|zsh|fish|ps1|psm1|r|lua|dart|scala|clj|cljs|ex|exs|zig|toml|yaml|yml|ini|conf|config|env|env\.[a-z]+|xml|svg|graphql|gql|prisma|dockerfile|makefile|cmake|gradle|groovy|vim|el|lisp|erl|hrl|ml|mli|fs|fsi|fsx|nim|cr|v|tf|tfvars|hcl|proto|thrift|avro|sol|vue|svelte|astro|mdx|rst|tex|bib|nix)$/.test(
      normalized,
    )
  )
    return 'code';
  // Dotfiles with no further extension are almost always plain-text config / placeholder files
  // e.g. .gitignore, .gitkeep, .editorconfig, .eslintrc, .prettierrc, .nvmrc, .dockerignore …
  if (/^\.[a-z][a-z0-9_-]*$/.test(normalized)) return 'code';
  return null;
}

export function inferLocalGeneratedFileKind(path: string, preferredName?: string): LocalGeneratedFileKind {
  const byName = preferredName ? inferLocalGeneratedFileKindFromValue(preferredName) : null;
  if (byName) return byName;
  return inferLocalGeneratedFileKindFromValue(path) ?? 'other';
}

function looksLikeFilePathString(s: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('/');
}

type SendFilePathEntry = { path: string; nameFromPayload?: string };

function decodeNestedJson(value: unknown, maxDepth = 3): unknown {
  let current = value;
  for (let i = 0; i < maxDepth; i += 1) {
    if (typeof current !== 'string') break;
    const trimmed = current.trim();
    if (!trimmed) break;
    if (!(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"'))) break;
    try {
      current = JSON.parse(trimmed) as unknown;
    } catch {
      break;
    }
  }
  return current;
}

function parseSendFileToUserFromDetail(detail: string | undefined): {
  entries: SendFilePathEntry[];
  topLevelName?: string;
} {
  if (!detail?.trim()) return { entries: [] };
  const out: SendFilePathEntry[] = [];
  let topLevelName: string | undefined;
  const collectFromObject = (obj: Record<string, unknown>): void => {
    const nestedToolInput = obj.toolInput;
    if (nestedToolInput && typeof nestedToolInput === 'object' && !Array.isArray(nestedToolInput)) {
      collectFromObject(nestedToolInput as Record<string, unknown>);
    }

    if (typeof obj.file_name === 'string' && obj.file_name.trim()) {
      topLevelName = obj.file_name.trim();
    }
    const list = obj.abs_file_path_list;
    if (Array.isArray(list)) {
      for (const x of list) {
        if (typeof x === 'string' && x.trim()) {
          out.push({ path: x.trim() });
        } else if (x && typeof x === 'object' && !Array.isArray(x)) {
          const o = x as Record<string, unknown>;
          const p = o.path ?? o.file_path ?? o.abs_path;
          if (typeof p === 'string' && p.trim()) {
            const perName = typeof o.file_name === 'string' && o.file_name.trim() ? o.file_name.trim() : undefined;
            out.push({ path: p.trim(), nameFromPayload: perName });
          }
        }
      }
      return;
    }
    if (typeof list === 'string' && list.trim()) {
      const t = list.trim();
      if (t.startsWith('[')) {
        try {
          const arr = JSON.parse(t) as unknown;
          if (Array.isArray(arr)) {
            for (const el of arr) {
              if (typeof el === 'string' && el.trim()) {
                out.push({ path: el.trim() });
              }
            }
          }
        } catch {
          // ignore
        }
        return;
      }
      out.push({ path: t });
    }
  };
  try {
    const decoded = decodeNestedJson(detail);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      collectFromObject(decoded as Record<string, unknown>);
    }
  } catch {
    // Truncated / invalid — fall through to heuristics
  }
  if (out.length) {
    return { entries: out, topLevelName };
  }

  // Only `abs_file_path_list` is considered as the source of truth (align upstream/main CliOutputBlock).
  const arrFrag = /"abs_file_path_list"\s*:\s*(\[[\s\S]*?\])/.exec(detail);
  if (arrFrag?.[1]) {
    try {
      const arr = JSON.parse(arrFrag[1]) as unknown;
      if (Array.isArray(arr)) {
        for (const x of arr) {
          if (typeof x === 'string' && x.trim()) out.push({ path: x.trim() });
        }
      }
    } catch {
      for (const m of arrFrag[1].matchAll(/"((?:\\.|[^"\\])*)"/g)) {
        if (!m[1]) continue;
        const decoded = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        if (looksLikeFilePathString(decoded)) out.push({ path: decoded });
      }
    }
  }
  if (out.length) {
    return { entries: out, topLevelName };
  }

  return { entries: [] };
}

function getToolNameFromToolUseLabel(label: string | undefined): string {
  if (!label) return '';
  return (label.trim().match(/^(\S+)/)?.[1] ?? '') as string;
}

function eventTimestampFallbackMs(event: CliEvent): number | undefined {
  const ts = event.timestamp;
  return typeof ts === 'number' && Number.isFinite(ts) && ts > 0 ? ts : undefined;
}

export function extractSendFileToUserLocalFiles(events: CliEvent[]): LocalGeneratedFile[] {
  const out: LocalGeneratedFile[] = [];
  for (const event of events) {
    if (event.kind !== 'tool_use') continue;
    if (getToolNameFromToolUseLabel(event.label) !== 'send_file_to_user') continue;
    const { entries, topLevelName } = parseSendFileToUserFromDetail(event.detail);
    const fallbackAt = eventTimestampFallbackMs(event);
    for (const entry of entries) {
      const preferredName =
        (entry.nameFromPayload && entry.nameFromPayload.trim()) ||
        (entries.length === 1 && topLevelName ? topLevelName : '');
      const path = resolveFilePathWithOptionalName(entry.path, preferredName);
      if (!path) continue;
      const fromPath = fileNameFromPath(path);
      const name = preferredName || fromPath || '未命名文件';
      out.push({
        name,
        path,
        kind: inferLocalGeneratedFileKind(path, name),
        ...(fallbackAt != null ? { fallbackGeneratedAt: fallbackAt } : {}),
      });
    }
  }
  return out;
}

/** Normalized lowercase path with `/` slashes — align with dedupe keys in generated-file helpers. */
export function comparableLocalPathKey(path: string): string {
  return normalizeLocalFilePath(path).toLowerCase();
}

/** Resolve whether a `send_file_to_user` path refers to this preview path (supports relative vs resolved absolute paths). */
export function resolvedLocalPreviewMatchesSendFilePath(resolvedPreviewPath: string, sendFileRawPath: string): boolean {
  const previewKey = comparableLocalPathKey(resolvedPreviewPath);
  const rawKey = comparableLocalPathKey(sendFileRawPath);
  if (!previewKey || !rawKey) return false;
  if (previewKey === rawKey) return true;
  const rawNoLeadingDot = rawKey.replace(/^\.\/+/, '');
  const endsSegment = (full: string, seg: string) => full === seg || full.endsWith(`/${seg}`);
  return endsSegment(previewKey, rawKey) || endsSegment(previewKey, rawNoLeadingDot);
}

/** Monotonic reload signal: how many recorded `send_file_to_user` rows target this preview path after its messages are merged chronologically. */
export function countSendFileToUserHitsForResolvedPreviewPath(
  chronologicalCliEvents: CliEvent[],
  resolvedPreviewPath: string,
): number {
  let n = 0;
  for (const file of extractSendFileToUserLocalFiles(chronologicalCliEvents)) {
    if (resolvedLocalPreviewMatchesSendFilePath(resolvedPreviewPath, file.path)) n += 1;
  }
  return n;
}

export function formatGeneratedDate(timestamp: number | null): string {
  if (timestamp == null || Number.isNaN(timestamp)) return '生成时间获取中...';
  const date = new Date(timestamp);
  return `生成时间：${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function embeddedDocumentPreviewKind(kind: LocalGeneratedFileKind): DocumentPreviewKind | null {
  if (kind === 'markdown') return 'markdown';
  if (kind === 'html') return 'html';
  if (kind === 'docx') return 'docx';
  if (kind === 'xlsx') return 'xlsx';
  if (kind === 'pdf') return 'pdf';
  return null;
}

export function supportsEmbeddedDocumentPreview(kind: LocalGeneratedFileKind): boolean {
  return embeddedDocumentPreviewKind(kind) !== null;
}

/** 与 upstream/main 一致：成品文件卡片只来自 `send_file_to_user`，不从正文/`artifact:pptx` 注释解析。 */
export function extractDisplayedLocalGeneratedFiles(events: CliEvent[]): LocalGeneratedFile[] {
  return dedupeLocalGeneratedFiles(extractSendFileToUserLocalFiles(events));
}

const VIRTUAL_PPT_IN_PROGRESS_PREFIX = 'virtual:ppt-in-progress:';

/** 工作产物列表中的「PPT 正在生成」占位路径 — 非磁盘路径，不可传给 open-local */
export function buildVirtualPptInProgressPath(pagesDir: string): string {
  return `${VIRTUAL_PPT_IN_PROGRESS_PREFIX}${comparableLocalPathKey(pagesDir)}`;
}

export function isVirtualPptInProgressPath(path: string): boolean {
  return path.startsWith(VIRTUAL_PPT_IN_PROGRESS_PREFIX);
}

/**
 * 当 HTML 幻灯片已写入但尚无 `send_file_to_user` 成品 PPT 时，在工作产物列表前追加占位行，
 * 选择后仍走与 `pagesDir` 绑定的 PPT 预览。
 */
export function mergeVirtualPptInProgressArtifacts(
  base: LocalGeneratedFile[],
  sessions: Record<string, PptStudioSession>,
  threadId: string,
): LocalGeneratedFile[] {
  const virtuals: LocalGeneratedFile[] = [];
  const seen = new Set<string>();

  for (const session of Object.values(sessions ?? {})) {
    if (session.threadId !== threadId) continue;
    if (session.slides.length === 0) continue;

    const linked = findLocalPptLinkedToPptPages(base, session.pagesDir, session.deckTitle);
    if (linked) continue;

    const dedupeKey = comparableLocalPathKey(session.pagesDir);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    virtuals.push({
      name: 'PPT正在生成中…',
      path: buildVirtualPptInProgressPath(session.pagesDir),
      kind: 'ppt',
      isVirtual: true,
      pptPagesDir: session.pagesDir,
    });
  }

  return [...virtuals, ...base];
}

/**
 * 将 `send_file_to_user` 中的 PPT 与 `artifact:pptx-pages` 的 `pagesDir` 关联，用于与 HTML 预览合并为同一张卡片。
 */
export function findLocalPptLinkedToPptPages(
  files: LocalGeneratedFile[],
  pagesDir: string,
  deckTitle?: string,
): LocalGeneratedFile | undefined {
  const normPages = pagesDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normPages.split('/').filter(Boolean);
  const parentDir =
    segments.length > 0 && segments[segments.length - 1] === 'pages'
      ? segments.slice(0, -1).join('/')
      : segments.length > 1
        ? segments.slice(0, -1).join('/')
        : '';

  const ppts = files.filter((f) => f.kind === 'ppt' && !f.isVirtual);
  if (ppts.length === 0) return undefined;

  if (parentDir) {
    const byParent = ppts.find((f) => {
      const fFolder = f.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      return resolvedLocalPreviewMatchesSendFilePath(parentDir, fFolder) && /\.pptx?$/i.test(f.path);
    });
    if (byParent) return byParent;
  }

  const dt = deckTitle?.trim();
  if (dt) {
    const t = dt.toLowerCase().replace(/\.pptx?$/i, '');
    const byTitle = ppts.find((f) => {
      const base = f.name
        .replace(/\.pptx?$/i, '')
        .trim()
        .toLowerCase();
      return base === t;
    });
    if (byTitle) return byTitle;
  }

  if (ppts.length === 1) return ppts[0];
  return undefined;
}
