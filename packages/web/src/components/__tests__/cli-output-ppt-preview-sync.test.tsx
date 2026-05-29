/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useSyncCliOutputPptPreview } from '@/components/cli-output/use-cli-output-ppt-preview';
import type { CliEvent } from '@/stores/chat-types';

function SyncHarness(props: {
  events: CliEvent[];
  status: 'streaming' | 'done' | 'failed';
  threadId: string;
}) {
  useSyncCliOutputPptPreview({
    events: props.events,
    status: props.status,
    currentThreadId: props.threadId,
    workspaceWorktreeId: null,
  });
  return null;
}

function makeWriteFileEvent(filePath: string, timestamp: number = 1000): CliEvent {
  return {
    id: `tool-${timestamp}`,
    kind: 'tool_use',
    timestamp,
    label: 'codex → write_file',
    detail: JSON.stringify({ file_path: filePath }),
  };
}

describe('cli output ppt preview sync', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useChatStore.setState({
      currentThreadId: 'thread-1',
      rightPanelMode: 'status',
      activePptPagesDir: null,
      pptStudioSessions: {},
      workspaceWorktreeId: 'wt-123',
      threads: [
        {
          id: 'thread-1',
          title: null,
          projectPath: '/tmp/cli-ppt-root',
          createdBy: 'user',
          participants: ['user'],
          lastActiveAt: 0,
          createdAt: 0,
        },
      ],
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useChatStore.setState({
      rightPanelMode: 'status',
      activePptPagesDir: null,
      pptStudioSessions: {},
      workspaceWorktreeId: null,
    });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('opens ppt preview on first write_file with page-N.pptx.html', () => {
    act(() => {
      root.render(
        React.createElement(SyncHarness, {
          events: [
            makeWriteFileEvent('/tmp/cli-ppt-root/output/demo/pages/page-1.pptx.html', 1000),
          ],
          status: 'streaming',
          threadId: 'thread-1',
        }),
      );
    });

    expect(useChatStore.getState().rightPanelMode).toBe('fileBrowser');
    expect(useChatStore.getState().activePptPagesDir).toBe('/tmp/cli-ppt-root/output/demo/pages');
    const session = useChatStore.getState().pptStudioSessions['/tmp/cli-ppt-root/output/demo/pages'];
    expect(session).toEqual(
      expect.objectContaining({
        threadId: 'thread-1',
        projectRoot: '/tmp/cli-ppt-root',
        pagesDir: '/tmp/cli-ppt-root/output/demo/pages',
        expectedSlideCount: 1,
        status: 'generating',
      }),
    );
    expect(session?.slides).toHaveLength(1);
    expect(session?.slides[0]?.pageNumber).toBe(1);
    expect(session?.slides[0]?.htmlPath).toBe('/tmp/cli-ppt-root/output/demo/pages/page-1.pptx.html');
  });

  it('accumulates slides from multiple write_file events sorted by page number', () => {
    act(() => {
      root.render(
        React.createElement(SyncHarness, {
          events: [
            makeWriteFileEvent('/tmp/cli-ppt-root/output/demo/pages/page-3.pptx.html', 3000),
            makeWriteFileEvent('/tmp/cli-ppt-root/output/demo/pages/page-1.pptx.html', 1000),
            makeWriteFileEvent('/tmp/cli-ppt-root/output/demo/pages/page-2.pptx.html', 2000),
          ],
          status: 'streaming',
          threadId: 'thread-1',
        }),
      );
    });

    const session = useChatStore.getState().pptStudioSessions['/tmp/cli-ppt-root/output/demo/pages'];
    expect(session?.slides).toHaveLength(3);
    expect(session?.slides.map((s) => s.pageNumber)).toEqual([1, 2, 3]);
  });

  it('uses artifact count to lower expectedSlideCount after deck shrink (10→5), dropping stale slides', () => {
    useChatStore.setState({
      pptStudioSessions: {
        '/tmp/cli-ppt-root/output/demo/pages': {
          threadId: 'thread-1',
          projectRoot: '/tmp/cli-ppt-root',
          pagesDir: '/tmp/cli-ppt-root/output/demo/pages',
          deckTitle: 'Deck',
          status: 'editable',
          expectedSlideCount: 10,
          slides: Array.from({ length: 10 }, (_, i) => ({
            slideId: `slide-${i + 1}`,
            pageNumber: i + 1,
            htmlPath: `/tmp/cli-ppt-root/output/demo/pages/page-${i + 1}.pptx.html`,
          })),
          activeSlideId: 'slide-1',
        },
      },
    });

    const baseDir = '/tmp/cli-ppt-root/output/demo/pages';
    act(() => {
      root.render(
        React.createElement(SyncHarness, {
          events: [
            {
              id: 'artifact-1',
              kind: 'text',
              timestamp: 100,
              content: `<!-- artifact:pptx-pages ${baseDir} count:5 -->`,
            },
            ...Array.from({ length: 5 }, (_, i) =>
              makeWriteFileEvent(`${baseDir}/page-${i + 1}.pptx.html`, 1100 + i),
            ),
          ],
          status: 'streaming',
          threadId: 'thread-1',
        }),
      );
    });

    const session = useChatStore.getState().pptStudioSessions['/tmp/cli-ppt-root/output/demo/pages'];
    expect(session?.expectedSlideCount).toBe(5);
    expect(session?.slides).toHaveLength(5);
    expect(session?.slides.map((s) => s.pageNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles Windows paths with backslashes', () => {
    act(() => {
      root.render(
        React.createElement(SyncHarness, {
          events: [
            {
              id: 'tool-1',
              kind: 'tool_use',
              timestamp: 1000,
              label: 'codex → write_file',
              detail: JSON.stringify({
                file_path: 'C:\\Users\\zhiyuan\\AppData\\Local\\Programs\\OfficeClaw\\workspace\\20260428232223\\output\\pages\\page-1.pptx.html',
              }),
            },
          ],
          status: 'streaming',
          threadId: 'thread-1',
        }),
      );
    });

    expect(useChatStore.getState().rightPanelMode).toBe('fileBrowser');
    const session = useChatStore.getState().pptStudioSessions['C:/Users/zhiyuan/AppData/Local/Programs/OfficeClaw/workspace/20260428232223/output/pages'];
    expect(session?.slides).toHaveLength(1);
    expect(session?.slides[0]?.pageNumber).toBe(1);
  });

  it('ignores non-write_file events and non-pptx-html files', () => {
    act(() => {
      root.render(
        React.createElement(SyncHarness, {
          events: [
            { id: 'tool-1', kind: 'tool_use', timestamp: 1000, label: 'codex → bash' },
            { id: 'tool-2', kind: 'tool_use', timestamp: 2000, label: 'codex → read_file' },
            makeWriteFileEvent('/tmp/cli-ppt-root/output/pages/style.css', 3000),
          ],
          status: 'streaming',
          threadId: 'thread-1',
        }),
      );
    });

    expect(useChatStore.getState().rightPanelMode).toBe('status');
    expect(Object.keys(useChatStore.getState().pptStudioSessions)).toHaveLength(0);
  });
});
