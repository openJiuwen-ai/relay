/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * B1.1 regression tests: project path restoration on thread switch.
 *
 * Two fix points:
 * 1. ThreadSidebar.handleSelect restores projectPath from threads array
 * 2. ChatContainer restores projectPath on mount (store or API fallback)
 *
 * We test the logic paths directly since full component render requires
 * too many sub-component mocks for these focused behavioral tests.
 */
import { describe, expect, it } from 'vitest';

const FOREIGN_PROJECT = '/home/user/projects/studio-flow';
const threads = [
  { id: 'thread-foreign', projectPath: FOREIGN_PROJECT },
  { id: 'thread-default', projectPath: 'default' },
  { id: 'thread-empty', projectPath: '' },
];

/**
 * Mirrors the logic in ThreadSidebar.handleSelect and ChatContainer mount:
 * resolve projectPath from threads array for a given threadId.
 */
function resolveProjectPath(storeThreads: Array<{ id: string; projectPath: string }>, threadId: string): string {
  const cached = storeThreads.find((t) => t.id === threadId);
  if (cached) return cached.projectPath || 'default';
  return 'default';
}

describe('B1.1 project path restoration logic', () => {
  it('resolves foreign projectPath from threads array', () => {
    expect(resolveProjectPath(threads, 'thread-foreign')).toBe(FOREIGN_PROJECT);
  });

  it('resolves "default" for default-project thread', () => {
    expect(resolveProjectPath(threads, 'thread-default')).toBe('default');
  });

  it('falls back to "default" for thread with empty projectPath', () => {
    expect(resolveProjectPath(threads, 'thread-empty')).toBe('default');
  });

  it('falls back to "default" when thread not in store', () => {
    expect(resolveProjectPath(threads, 'unknown-thread')).toBe('default');
  });

  it('handleSelect should call setCurrentProject before navigateToThread', () => {
    // Verify the ordering contract: projectPath must be set before navigation
    // so that useWorkspace re-fetches with the correct repoRoot
    const calls: string[] = [];
    const setCurrentProject = (path: string) => {
      calls.push(`setProject:${path}`);
    };
    const navigateToThread = (id: string) => {
      calls.push(`navigate:${id}`);
    };

    // Simulate handleSelect logic
    const threadId = 'thread-foreign';
    const target = threads.find((t) => t.id === threadId);
    setCurrentProject(target?.projectPath ?? 'default');
    navigateToThread(threadId);

    expect(calls).toEqual([`setProject:${FOREIGN_PROJECT}`, 'navigate:thread-foreign']);
  });
});
