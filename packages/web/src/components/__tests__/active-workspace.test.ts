/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import type { Thread } from '@/stores/chat-types';
import {
  getProjectLatestActivity,
  getRecentThreads,
  PROJECT_PIN_KEY,
  readPinnedProjects,
  splitIntoActiveAndArchived,
  writePinnedProjects,
} from '../thread-sidebar/active-workspace';
import type { StorageLike } from '../thread-sidebar/collapse-state';
import type { ThreadGroup } from '../thread-sidebar/thread-utils';

/** In-memory storage mock. */
function createMockStorage(): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

const NOW = 1710000000000; // fixed reference time
const DAY = 86400_000;

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  return {
    projectPath: 'default',
    title: overrides.id,
    participants: [],
    lastActiveAt: NOW,
    pinned: false,
    favorited: false,
    preferredAgentIds: [],
    createdAt: NOW - 30 * DAY,
    ...overrides,
  } as Thread;
}

// ── getRecentThreads ──────────────────────────────────

describe('getRecentThreads', () => {
  it('returns threads sorted by lastActiveAt desc, limited to N', () => {
    const threads = [
      makeThread({ id: 't1', lastActiveAt: NOW - 5 * DAY }),
      makeThread({ id: 't2', lastActiveAt: NOW - 1 * DAY }),
      makeThread({ id: 't3', lastActiveAt: NOW }),
    ];
    const result = getRecentThreads(threads, 2, NOW);
    expect(result.map((t) => t.id)).toEqual(['t3', 't2']);
  });

  it('excludes default thread and pinned threads', () => {
    const threads = [
      makeThread({ id: 'default', lastActiveAt: NOW }),
      makeThread({ id: 't1', lastActiveAt: NOW, pinned: true }),
      makeThread({ id: 't2', lastActiveAt: NOW - DAY }),
      makeThread({ id: 't3', lastActiveAt: NOW - 2 * DAY }),
    ];
    const result = getRecentThreads(threads, 8, NOW);
    expect(result.map((t) => t.id)).toEqual(['t2', 't3']);
  });

  it('returns empty array when no eligible threads', () => {
    const threads = [makeThread({ id: 'default' })];
    expect(getRecentThreads(threads, 8, NOW)).toEqual([]);
  });

  it('caps at limit even with many threads', () => {
    const threads = Array.from({ length: 20 }, (_, i) => makeThread({ id: `t${i}`, lastActiveAt: NOW - i * DAY }));
    expect(getRecentThreads(threads, 8, NOW)).toHaveLength(8);
  });
});

// ── getProjectLatestActivity ──────────────────────────

describe('getProjectLatestActivity', () => {
  it('returns max lastActiveAt for a project', () => {
    const threads = [
      makeThread({ id: 't1', projectPath: '/proj/a', lastActiveAt: NOW - 3 * DAY }),
      makeThread({ id: 't2', projectPath: '/proj/a', lastActiveAt: NOW - 1 * DAY }),
      makeThread({ id: 't3', projectPath: '/proj/b', lastActiveAt: NOW }),
    ];
    expect(getProjectLatestActivity(threads, '/proj/a')).toBe(NOW - 1 * DAY);
  });

  it('returns 0 for unknown project', () => {
    expect(getProjectLatestActivity([], '/proj/x')).toBe(0);
  });
});

// ── splitIntoActiveAndArchived ────────────────────────

describe('splitIntoActiveAndArchived', () => {
  const cutoff = 7 * DAY;

  function makeGroup(projectPath: string, latestActivity: number): ThreadGroup {
    return {
      type: 'project',
      label: projectPath.split('/').pop()!,
      threads: [makeThread({ id: `${projectPath}-t1`, projectPath, lastActiveAt: latestActivity })],
      projectPath,
    };
  }

  it('splits groups by 7-day cutoff', () => {
    const groups = [
      makeGroup('/proj/active', NOW - 2 * DAY), // active
      makeGroup('/proj/old', NOW - 10 * DAY), // archived
    ];
    const allThreads = groups.flatMap((g) => g.threads);
    const { active, archived } = splitIntoActiveAndArchived(groups, allThreads, new Set(), cutoff, NOW);
    expect(active.map((g) => g.projectPath)).toEqual(['/proj/active']);
    expect(archived.map((g) => g.projectPath)).toEqual(['/proj/old']);
  });

  it('pinned projects are always active regardless of activity', () => {
    const groups = [makeGroup('/proj/old-but-pinned', NOW - 30 * DAY)];
    const allThreads = groups.flatMap((g) => g.threads);
    const pinned = new Set(['/proj/old-but-pinned']);
    const { active, archived } = splitIntoActiveAndArchived(groups, allThreads, pinned, cutoff, NOW);
    expect(active.map((g) => g.projectPath)).toEqual(['/proj/old-but-pinned']);
    expect(archived).toHaveLength(0);
  });

  it('active groups: pinned first, then by latest activity desc', () => {
    const groups = [
      makeGroup('/proj/recent', NOW - 1 * DAY),
      makeGroup('/proj/pinned-old', NOW - 5 * DAY),
      makeGroup('/proj/medium', NOW - 3 * DAY),
    ];
    const allThreads = groups.flatMap((g) => g.threads);
    const pinned = new Set(['/proj/pinned-old']);
    const { active } = splitIntoActiveAndArchived(groups, allThreads, pinned, cutoff, NOW);
    // pinned first, then by activity desc
    expect(active.map((g) => g.projectPath)).toEqual(['/proj/pinned-old', '/proj/recent', '/proj/medium']);
  });

  it('archived groups sorted alphabetically', () => {
    const groups = [makeGroup('/proj/zebra', NOW - 30 * DAY), makeGroup('/proj/alpha', NOW - 20 * DAY)];
    const allThreads = groups.flatMap((g) => g.threads);
    const { archived } = splitIntoActiveAndArchived(groups, allThreads, new Set(), cutoff, NOW);
    expect(archived.map((g) => g.projectPath)).toEqual(['/proj/alpha', '/proj/zebra']);
  });
});

// ── readPinnedProjects / writePinnedProjects ──────────

describe('project pin persistence', () => {
  it('reads empty set when nothing stored', () => {
    const storage = createMockStorage();
    expect(readPinnedProjects(storage).size).toBe(0);
  });

  it('round-trips correctly', () => {
    const storage = createMockStorage();
    const pins = new Set(['/proj/a', '/proj/b']);
    writePinnedProjects(pins, storage);
    const result = readPinnedProjects(storage);
    expect(result).toEqual(pins);
  });

  it('uses the correct storage key', () => {
    const storage = createMockStorage();
    writePinnedProjects(new Set(['/proj/x']), storage);
    expect(storage.store.has(PROJECT_PIN_KEY)).toBe(true);
  });

  it('falls back to empty set on invalid data', () => {
    const storage = createMockStorage();
    storage.setItem(PROJECT_PIN_KEY, 'not-json');
    expect(readPinnedProjects(storage).size).toBe(0);
  });

  it('falls back on non-array JSON', () => {
    const storage = createMockStorage();
    storage.setItem(PROJECT_PIN_KEY, '{"a":1}');
    expect(readPinnedProjects(storage).size).toBe(0);
  });
});
