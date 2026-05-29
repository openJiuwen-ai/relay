/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import {
  extractDisplayedLocalGeneratedFiles,
  findLocalPptLinkedToPptPages,
  mergeVirtualPptInProgressArtifacts,
} from '@/components/cli-output/local-generated-files';
import type { PptStudioSession } from '@/components/ppt-studio/ppt-studio-types';
import type { CliEvent } from '@/stores/chat-types';

function sendFileToUserEvent(id: string, paths: string[]): CliEvent {
  return {
    id,
    kind: 'tool_use',
    timestamp: 1000,
    label: 'send_file_to_user',
    detail: JSON.stringify({ abs_file_path_list: paths }),
  };
}

describe('cli output generated file helpers', () => {
  it('keeps files sent through send_file_to_user without relying on text regexes', () => {
    const files = extractDisplayedLocalGeneratedFiles([
      sendFileToUserEvent('sf1', [
        'workspace/output/demo/outline.md',
        'workspace/output/demo/report.docx',
        'workspace/output/demo/final-deck.pptx',
      ]),
    ]);

    expect(files.map((file) => file.kind)).toEqual(['markdown', 'docx', 'ppt']);
    expect(files.map((file) => file.name)).toEqual(['outline.md', 'report.docx', 'final-deck.pptx']);
  });

  it('does not infer non-ppt files from plain text output', () => {
    const files = extractDisplayedLocalGeneratedFiles([
      {
        id: 'text-1',
        kind: 'text',
        timestamp: 1001,
        content:
          'Markdown file path: workspace/output/demo/outline.md\nWord file path: workspace/output/demo/report.docx',
      },
    ]);

    expect(files).toEqual([]);
  });

  it('does not add ppt from artifact:pptx in plain text (cards come from send_file_to_user, align upstream/main)', () => {
    const files = extractDisplayedLocalGeneratedFiles([
      {
        id: 'text-1',
        kind: 'text',
        timestamp: 1001,
        content: '<!-- artifact:pptx workspace/output/demo/final-deck.pptx -->',
      },
    ]);

    expect(files).toEqual([]);
  });

  it('does not treat ppt html preview pages as generated ppt files', () => {
    const files = extractDisplayedLocalGeneratedFiles([
      {
        id: 'text-1',
        kind: 'text',
        timestamp: 1001,
        content: 'HTML 已生成：output/demo/pages/page-3.pptx.html',
      },
    ]);

    expect(files).toEqual([]);
  });

  it('links send_file_to_user ppt to artifact pages dir by parent folder', () => {
    const files = extractDisplayedLocalGeneratedFiles([
      sendFileToUserEvent('sf1', ['workspace/output/demo/final-deck.pptx']),
    ]);
    const linked = findLocalPptLinkedToPptPages(files, 'workspace/output/demo/pages', 'final-deck');
    expect(linked?.path).toBe('workspace/output/demo/final-deck.pptx');
  });

  it('adds a virtual in-progress ppt row when HTML slides exist but no send_file ppt', () => {
    const base = extractDisplayedLocalGeneratedFiles([
      sendFileToUserEvent('sf1', ['workspace/output/demo/outline.md']),
    ]);
    const sessions: Record<string, PptStudioSession> = {
      k: {
        threadId: 't1',
        projectRoot: '/proj',
        pagesDir: 'workspace/output/demo/pages',
        deckTitle: 'deck',
        status: 'generating',
        slides: [
          {
            slideId: 'p1',
            pageNumber: 1,
            htmlPath: 'workspace/output/demo/pages/page-1.pptx.html',
            title: null,
            blockCount: null,
            updatedAt: null,
          },
        ],
        activeSlideId: 'p1',
      },
    };
    const merged = mergeVirtualPptInProgressArtifacts(base, sessions, 't1');
    expect(merged[0]?.name).toBe('PPT正在生成中…');
    expect(merged[0]?.isVirtual).toBe(true);
    expect(merged[0]?.pptPagesDir).toBe('workspace/output/demo/pages');
    expect(merged[0]?.kind).toBe('ppt');
  });

  it('does not add virtual when send_file already delivered a ppt for that deck', () => {
    const base = extractDisplayedLocalGeneratedFiles([
      sendFileToUserEvent('sf1', ['workspace/output/demo/final-deck.pptx']),
    ]);
    const sessions: Record<string, PptStudioSession> = {
      k: {
        threadId: 't1',
        projectRoot: '/proj',
        pagesDir: 'workspace/output/demo/pages',
        deckTitle: 'final-deck',
        status: 'editable',
        slides: [
          {
            slideId: 'p1',
            pageNumber: 1,
            htmlPath: 'workspace/output/demo/pages/page-1.pptx.html',
            title: null,
            blockCount: null,
            updatedAt: null,
          },
        ],
        activeSlideId: 'p1',
      },
    };
    const merged = mergeVirtualPptInProgressArtifacts(base, sessions, 't1');
    expect(merged.some((f) => f.isVirtual)).toBe(false);
  });

  it('does not add virtual for other threads', () => {
    const base = extractDisplayedLocalGeneratedFiles([]);
    const sessions: Record<string, PptStudioSession> = {
      k: {
        threadId: 'other',
        projectRoot: '/proj',
        pagesDir: 'workspace/output/demo/pages',
        deckTitle: 'deck',
        status: 'generating',
        slides: [
          {
            slideId: 'p1',
            pageNumber: 1,
            htmlPath: 'workspace/output/demo/pages/page-1.pptx.html',
            title: null,
            blockCount: null,
            updatedAt: null,
          },
        ],
        activeSlideId: 'p1',
      },
    };
    expect(mergeVirtualPptInProgressArtifacts(base, sessions, 't1')).toEqual([]);
  });

  it('treats fullwidth／IDEO full-stop before extension as . for docx inference', () => {
    const fullwidthDot = '\uFF0E';
    const files = extractDisplayedLocalGeneratedFiles([
      sendFileToUserEvent('fw1', [`workspace/output/demo/name${fullwidthDot}docx`]),
    ]);
    expect(files).toHaveLength(1);
    expect(files[0]!.kind).toBe('docx');
  });
});
