/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { extractPptxHtmlPagesFromWriteFile } from '../pptx-pages-artifact';
import type { CliEvent } from '@/stores/chat-types';

function makeWriteFileEvent(filePath: string, timestamp: number = 1000): CliEvent {
  return {
    id: `tool-${timestamp}`,
    kind: 'tool_use',
    timestamp,
    label: 'codex → write_file',
    detail: JSON.stringify({ file_path: filePath }),
  };
}

function makeWriteFileResultEvent(filePath: string, timestamp: number = 1000): CliEvent {
  return {
    id: `toolr-${timestamp}`,
    kind: 'tool_result',
    timestamp,
    label: 'codex ← write_file',
    detail: `success=True data={'file_path': '${filePath.replace(/\\/g, '\\\\')}', 'bytes_written': 1495} error=None`,
  };
}

describe('extractPptxHtmlPagesFromWriteFile', () => {
  it('extracts page-N.pptx.html from write_file tool events', () => {
    const events: CliEvent[] = [
      makeWriteFileEvent('/workspace/output/demo/pages/page-1.pptx.html', 1000),
      makeWriteFileEvent('/workspace/output/demo/pages/page-2.pptx.html', 2000),
      makeWriteFileEvent('/workspace/output/demo/pages/page-3.pptx.html', 3000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.pagesDir).toBe('/workspace/output/demo/pages');
    expect(result[0]?.htmlFiles).toEqual([
      { filePath: '/workspace/output/demo/pages/page-1.pptx.html', pageNumber: 1, lastTouchedAt: 1000 },
      { filePath: '/workspace/output/demo/pages/page-2.pptx.html', pageNumber: 2, lastTouchedAt: 2000 },
      { filePath: '/workspace/output/demo/pages/page-3.pptx.html', pageNumber: 3, lastTouchedAt: 3000 },
    ]);
  });

  it('sorts html files by page number ascending', () => {
    const events: CliEvent[] = [
      makeWriteFileEvent('/workspace/pages/page-3.pptx.html', 3000),
      makeWriteFileEvent('/workspace/pages/page-1.pptx.html', 1000),
      makeWriteFileEvent('/workspace/pages/page-2.pptx.html', 2000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result[0]?.htmlFiles).toEqual([
      { filePath: '/workspace/pages/page-1.pptx.html', pageNumber: 1, lastTouchedAt: 1000 },
      { filePath: '/workspace/pages/page-2.pptx.html', pageNumber: 2, lastTouchedAt: 2000 },
      { filePath: '/workspace/pages/page-3.pptx.html', pageNumber: 3, lastTouchedAt: 3000 },
    ]);
  });

  it('handles Windows paths with backslashes', () => {
    const events: CliEvent[] = [
      {
        id: 'tool-1',
        kind: 'tool_use',
        timestamp: 1000,
        label: 'codex → write_file',
        detail: JSON.stringify({
          file_path: 'C:\\Users\\test\\workspace\\output\\pages\\page-1.pptx.html',
        }),
      },
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.pagesDir).toBe('C:/Users/test/workspace/output/pages');
    expect(result[0]?.htmlFiles).toEqual([
      {
        filePath: 'C:\\Users\\test\\workspace\\output\\pages\\page-1.pptx.html',
        pageNumber: 1,
        lastTouchedAt: 1000,
      },
    ]);
  });

  it('ignores non-pptx-html files', () => {
    const events: CliEvent[] = [
      makeWriteFileEvent('/workspace/output/pages/style.css', 1000),
      makeWriteFileEvent('/workspace/output/pages/page-1.pptx.html', 2000),
      makeWriteFileEvent('/workspace/output/pages/readme.md', 3000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.htmlFiles).toHaveLength(1);
    expect(result[0]?.htmlFiles[0]?.pageNumber).toBe(1);
  });

  it('extracts page-N.pptx.html from edit_file / Edit tool events', () => {
    const events: CliEvent[] = [
      {
        id: 'tool-1',
        kind: 'tool_use',
        timestamp: 1000,
        label: 'codex → edit_file',
        detail: JSON.stringify({ file_path: '/workspace/pages/page-2.pptx.html' }),
      },
      {
        id: 'tool-2',
        kind: 'tool_use',
        timestamp: 2000,
        label: 'opus → Edit',
        detail: JSON.stringify({ path: '/workspace/pages/page-1.pptx.html' }),
      },
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.htmlFiles).toEqual([
      { filePath: '/workspace/pages/page-1.pptx.html', pageNumber: 1, lastTouchedAt: 2000 },
      { filePath: '/workspace/pages/page-2.pptx.html', pageNumber: 2, lastTouchedAt: 1000 },
    ]);
  });

  it('last touching event wins for the same page (rewrite or edit)', () => {
    const events: CliEvent[] = [
      makeWriteFileEvent('/workspace/pages/page-1.pptx.html', 1000),
      {
        id: 'e2',
        kind: 'tool_use',
        timestamp: 2500,
        label: 'codex → edit_file',
        detail: JSON.stringify({ file_path: '/workspace/pages/page-1.pptx.html' }),
      },
      makeWriteFileEvent('/workspace/pages/page-2.pptx.html', 3000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result[0]?.htmlFiles).toHaveLength(2);
    const page1 = result[0]?.htmlFiles.find((f) => f.pageNumber === 1);
    expect(page1?.lastTouchedAt).toBe(2500);
  });

  it('ignores non-write_file tool events', () => {
    const events: CliEvent[] = [
      { id: 'tool-1', kind: 'tool_use', timestamp: 1000, label: 'codex → read_file' },
      { id: 'tool-2', kind: 'tool_use', timestamp: 2000, label: 'codex → bash' },
      makeWriteFileEvent('/workspace/pages/page-1.pptx.html', 3000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.htmlFiles).toHaveLength(1);
  });

  it('dedupes same page number within same pagesDir', () => {
    const events: CliEvent[] = [
      makeWriteFileEvent('/workspace/pages/page-1.pptx.html', 1000),
      makeWriteFileEvent('/workspace/pages/page-1.pptx.html', 2000),
      makeWriteFileEvent('/workspace/pages/page-2.pptx.html', 3000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result[0]?.htmlFiles).toHaveLength(2);
    expect(result[0]?.htmlFiles.map((f) => f.pageNumber)).toEqual([1, 2]);
  });

  it('separates multiple pagesDir from different PPT projects', () => {
    const events: CliEvent[] = [
      makeWriteFileEvent('/project-a/pages/page-1.pptx.html', 1000),
      makeWriteFileEvent('/project-b/pages/page-1.pptx.html', 2000),
      makeWriteFileEvent('/project-a/pages/page-2.pptx.html', 3000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(2);
    const projectA = result.find((r) => r.pagesDir === '/project-a/pages');
    const projectB = result.find((r) => r.pagesDir === '/project-b/pages');
    expect(projectA?.htmlFiles).toHaveLength(2);
    expect(projectB?.htmlFiles).toHaveLength(1);
  });

  it('handles Write tool name (capitalized)', () => {
    const events: CliEvent[] = [
      {
        id: 'tool-1',
        kind: 'tool_use',
        timestamp: 1000,
        label: 'opus → Write',
        detail: JSON.stringify({ file_path: '/workspace/pages/page-1.pptx.html' }),
      },
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.htmlFiles).toHaveLength(1);
  });

  it('returns empty array when no matching events', () => {
    const events: CliEvent[] = [
      { id: 'text-1', kind: 'text', timestamp: 1000, content: 'some text' },
      { id: 'tool-1', kind: 'tool_use', timestamp: 2000, label: 'codex → bash' },
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(0);
  });

  it('extracts from tool_result with Python dict format', () => {
    const events: CliEvent[] = [
      makeWriteFileResultEvent('/workspace/pages/page-1.pptx.html', 1000),
      makeWriteFileResultEvent('/workspace/pages/page-2.pptx.html', 2000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.htmlFiles).toHaveLength(2);
    expect(result[0]?.htmlFiles[0]?.pageNumber).toBe(1);
    expect(result[0]?.htmlFiles[1]?.pageNumber).toBe(2);
  });

  it('extracts page-N.pptx.html from any directory (not just pages/)', () => {
    const events: CliEvent[] = [
      makeWriteFileEvent('/workspace/output/demo/page-1.pptx.html', 1000),
      makeWriteFileEvent('/workspace/output/demo/page-2.pptx.html', 2000),
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.pagesDir).toBe('/workspace/output/demo');
    expect(result[0]?.htmlFiles).toHaveLength(2);
  });

  it('extracts from Windows path without pages directory', () => {
    const events: CliEvent[] = [
      {
        id: 'tool-1',
        kind: 'tool_result',
        timestamp: 1000,
        label: 'codex ← write_file',
        detail: `success=True data={'file_path': 'D:\\\\code\\\\open\\\\relay-claw\\\\workspace\\\\20260429015421\\\\page-3.pptx.html', 'bytes_written': 1495} error=None`,
      },
    ];

    const result = extractPptxHtmlPagesFromWriteFile(events);

    expect(result).toHaveLength(1);
    expect(result[0]?.pagesDir).toBe('D:/code/open/relay-claw/workspace/20260429015421');
    expect(result[0]?.htmlFiles).toHaveLength(1);
    expect(result[0]?.htmlFiles[0]?.pageNumber).toBe(3);
  });
});