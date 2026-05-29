/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CliEvent } from '@/stores/chat-types';

const PPTX_PAGES_COMMENT =
  /<!--\s*artifact:pptx-pages\s+([^\s>]+)(?:\s+count:(\d+))?\s*-->/gi;

export function stripPptxPagesArtifactCommentsFromMarkdown(md: string): string {
  return md.replace(
    new RegExp(PPTX_PAGES_COMMENT.source, 'gi'),
    '',
  );
}

function parseMarkersInText(
  text: string,
  candidates: { pagesDir: string; expectedSlideCount?: number }[],
  seen: Set<string>,
): void {
  if (!text) return;
  const re = new RegExp(PPTX_PAGES_COMMENT.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (!match[1]) continue;
    const pagesDir = match[1];
    if (seen.has(pagesDir)) continue;
    seen.add(pagesDir);
    const count = match[2] ? parseInt(match[2], 10) : undefined;
    candidates.push({ pagesDir, expectedSlideCount: Number.isNaN(count ?? NaN) ? undefined : count });
  }
}

export function extractPptxPagesMarkerDirsFromCliEvents(
  events: CliEvent[],
): { pagesDir: string; expectedSlideCount?: number }[] {
  const searchSpace = events.flatMap((event) => [event.content, event.detail, event.label]).filter(Boolean) as string[];
  const candidates: { pagesDir: string; expectedSlideCount?: number }[] = [];
  const seen = new Set<string>();
  for (const text of searchSpace) {
    parseMarkersInText(text, candidates, seen);
  }
  return candidates;
}

const PPTX_HTML_PAGE_PATTERN = /page-(\d+)\.pptx\.html$/i;

interface PptHtmlFileInfo {
  filePath: string;
  pageNumber: number;
  pagesDir: string;
}

function getToolNameFromLabel(label: string | undefined): string {
  if (!label) return '';
  const forwardArrowIdx = label.indexOf('→');
  if (forwardArrowIdx >= 0) {
    return label.slice(forwardArrowIdx + 1).trim();
  }
  const backArrowIdx = label.indexOf('←');
  if (backArrowIdx >= 0) {
    return label.slice(backArrowIdx + 1).trim();
  }
  return label.trim().split(/\s+/)[0] ?? '';
}

/** Tool names (after label normalization) that touch a single file on disk like write_file / edit_file. */
const PPT_PAGE_TOUCH_TOOL_NAMES = new Set([
  'write',
  'write_file',
  'edit',
  'edit_file',
  'editor_file',
  'str_replace',
  'search_replace',
]);

function normalizeToolNameToken(label: string | undefined): string {
  return getToolNameFromLabel(label)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function isPptPagePathTouchTool(label: string | undefined): boolean {
  const n = normalizeToolNameToken(label);
  return PPT_PAGE_TOUCH_TOOL_NAMES.has(n);
}

function parseWriteFileDetail(detail: string | undefined): { file_path?: string } | null {
  if (!detail?.trim()) return null;
  const jsonPathMatch = /"file_path"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(detail);
  if (jsonPathMatch?.[1]) {
    return { file_path: jsonPathMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') };
  }
  const pythonDictMatch = /'file_path'\s*:\s*'((?:\\.|[^'\\])*)'/.exec(detail);
  if (pythonDictMatch?.[1]) {
    return { file_path: pythonDictMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') };
  }
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const filePath = obj.file_path ?? obj.path ?? obj.filePath;
      if (typeof filePath === 'string' && filePath.trim()) {
        return { file_path: filePath.trim() };
      }
      const nestedInput = obj.toolInput;
      if (nestedInput && typeof nestedInput === 'object' && !Array.isArray(nestedInput)) {
        const nested = nestedInput as Record<string, unknown>;
        const nestedPath = nested.file_path ?? nested.path ?? nested.filePath;
        if (typeof nestedPath === 'string' && nestedPath.trim()) {
          return { file_path: nestedPath.trim() };
        }
      }
    }
  } catch {}
  return null;
}

function extractPagesDir(normalizedPath: string): string {
  const pagesIdx = normalizedPath.lastIndexOf('/pages/');
  if (pagesIdx >= 0) {
    return normalizedPath.slice(0, pagesIdx + '/pages'.length);
  }
  const lastSlashIdx = normalizedPath.lastIndexOf('/');
  if (lastSlashIdx >= 0) {
    return normalizedPath.slice(0, lastSlashIdx);
  }
  return normalizedPath;
}

function extractPptHtmlFromPptPageToolEvent(event: CliEvent): PptHtmlFileInfo | null {
  if (event.kind !== 'tool_use' && event.kind !== 'tool_result') return null;
  if (!isPptPagePathTouchTool(event.label)) return null;
  const parsed = parseWriteFileDetail(event.detail);
  if (!parsed?.file_path) return null;
  const normalizedPath = parsed.file_path.replace(/\\/g, '/');
  const match = PPTX_HTML_PAGE_PATTERN.exec(normalizedPath);
  if (!match) return null;
  const pageNumber = parseInt(match[1], 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return null;
  const pagesDir = extractPagesDir(normalizedPath);
  return {
    filePath: parsed.file_path,
    pageNumber,
    pagesDir,
  };
}

export function extractPptxHtmlPagesFromWriteFile(
  events: CliEvent[],
): { pagesDir: string; htmlFiles: { filePath: string; pageNumber: number; lastTouchedAt: number }[] }[] {
  /** Last touch wins per (pagesDir, pageNumber) so rewrites/edits refresh preview. */
  const byPagesDir = new Map<string, Map<number, PptHtmlFileInfo & { lastTouchedAt: number }>>();
  for (const event of events) {
    const info = extractPptHtmlFromPptPageToolEvent(event);
    if (!info) continue;
    const pageMap = byPagesDir.get(info.pagesDir) ?? new Map();
    pageMap.set(info.pageNumber, { ...info, lastTouchedAt: event.timestamp });
    byPagesDir.set(info.pagesDir, pageMap);
  }
  const results: {
    pagesDir: string;
    htmlFiles: { filePath: string; pageNumber: number; lastTouchedAt: number }[];
  }[] = [];
  for (const [pagesDir, pageMap] of byPagesDir.entries()) {
    const sorted = [...pageMap.values()].sort((a, b) => a.pageNumber - b.pageNumber);
    results.push({
      pagesDir,
      htmlFiles: sorted.map((f) => ({
        filePath: f.filePath,
        pageNumber: f.pageNumber,
        lastTouchedAt: f.lastTouchedAt,
      })),
    });
  }
  return results;
}
