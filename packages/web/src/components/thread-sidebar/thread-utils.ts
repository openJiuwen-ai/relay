/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ChatMessage, Thread, ThreadState } from '@/stores/chat-types';
import { getRecentThreads, splitIntoActiveAndArchived } from './active-workspace';

export function formatRelativeTime(ts: number, compact = false): string {
  if (!Number.isFinite(ts) || ts <= 0) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (!isSameDay) return `${mm}/${dd}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export function projectDisplayName(path: string): string {
  if (path === 'default') return '未分类';
  const parts = path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || path;
}

export function getProjectPaths(threads: Thread[]): string[] {
  const paths = new Set<string>();
  for (const t of threads) {
    if (t.projectPath && t.projectPath !== 'default') {
      paths.add(t.projectPath);
    }
  }
  // F095 Phase C (AC-C4): Sort by most recent thread activity, not alphabetically
  const pathList = [...paths];
  const activityMap = new Map<string, number>();
  for (const t of threads) {
    if (t.projectPath && t.projectPath !== 'default') {
      const current = activityMap.get(t.projectPath) ?? 0;
      if (t.lastActiveAt > current) activityMap.set(t.projectPath, t.lastActiveAt);
    }
  }

  return pathList.sort((a, b) => (activityMap.get(b) ?? 0) - (activityMap.get(a) ?? 0));
}

function getLatestMessageTimestamp(messages: ChatMessage[] | undefined): number {
  if (!messages || messages.length === 0) return 0;
  let latest = 0;
  for (const message of messages) {
    if (Number.isFinite(message.timestamp) && message.timestamp > latest) {
      latest = message.timestamp;
    }
  }
  return latest;
}

export function applyRealtimeThreadActivity(
  threads: Thread[],
  threadStates: Record<string, Pick<ThreadState, 'messages'> | undefined>,
): Thread[] {
  return threads.map((thread) => {
    const localLastActivity = getLatestMessageTimestamp(threadStates[thread.id]?.messages);
    if (localLastActivity <= thread.lastActiveAt) {
      return thread;
    }
    return { ...thread, lastActiveAt: localLastActivity };
  });
}

export interface ThreadGroup {
  type: 'pinned' | 'recent' | 'project' | 'archived-container' | 'favorites';
  label: string;
  threads: Thread[];
  projectPath?: string;
  archivedGroups?: ThreadGroup[];
}

function sortByUnreadThenActive(a: Thread, b: Thread, unreadIds?: Set<string>): number {
  if (unreadIds) {
    const aUnread = unreadIds.has(a.id) ? 1 : 0;
    const bUnread = unreadIds.has(b.id) ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
  }
  return b.lastActiveAt - a.lastActiveAt;
}

export function sortAndGroupThreads(threads: Thread[], unreadIds?: Set<string>): ThreadGroup[] {
  const groups: ThreadGroup[] = [];

  // 1. Pinned threads (unread first, then by lastActiveAt desc)
  const pinned = threads
    .filter((t) => t.pinned && t.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (pinned.length > 0) {
    groups.push({ type: 'pinned', label: '置顶', threads: pinned });
  }

  // 2. Regular threads grouped by project (each group sorted)
  const regular = threads.filter((t) => !t.pinned && !t.favorited && t.id !== 'default');
  const projectGroups = groupByProject(regular, unreadIds);
  for (const [projectPath, projectThreads] of projectGroups) {
    groups.push({
      type: 'project',
      label: projectDisplayName(projectPath),
      threads: projectThreads,
      projectPath,
    });
  }

  // 3. Favorites (unread first, then by lastActiveAt desc, excluding pinned)
  const favorited = threads
    .filter((t) => t.favorited && !t.pinned && t.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (favorited.length > 0) {
    groups.push({ type: 'favorites', label: '收藏', threads: favorited });
  }

  return groups;
}

export interface WorkspaceConfig {
  activeCutoffMs: number;
  recentLimit: number;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  activeCutoffMs: 7 * 86400_000,
  recentLimit: 8,
};

export function sortAndGroupThreadsWithWorkspace(
  threads: Thread[],
  unreadIds: Set<string> | undefined,
  pinnedProjects: Set<string>,
  config: WorkspaceConfig = DEFAULT_CONFIG,
  now: number = Date.now(),
): ThreadGroup[] {
  const groups: ThreadGroup[] = [];

  const pinned = threads
    .filter((thread) => thread.pinned && thread.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (pinned.length > 0) {
    groups.push({ type: 'pinned', label: '置顶', threads: pinned });
  }

  const recent = getRecentThreads(threads, config.recentLimit, now);
  if (recent.length > 0) {
    groups.push({ type: 'recent', label: '最近会话', threads: recent });
  }

  const regular = threads.filter((thread) => !thread.pinned && !thread.favorited && thread.id !== 'default');
  const projectGroupEntries = groupByProject(regular, unreadIds);
  const allProjectGroups: ThreadGroup[] = projectGroupEntries.map(([projectPath, projectThreads]) => ({
    type: 'project',
    label: projectDisplayName(projectPath),
    threads: projectThreads,
    projectPath,
  }));

  const { active, archived } = splitIntoActiveAndArchived(
    allProjectGroups,
    threads,
    pinnedProjects,
    config.activeCutoffMs,
    now,
  );

  for (const group of active) {
    groups.push(group);
  }

  if (archived.length > 0) {
    const allArchivedThreads = archived.flatMap((group) => group.threads);
    groups.push({
      type: 'archived-container',
      label: `其他项目 (${archived.length})`,
      threads: allArchivedThreads,
      archivedGroups: archived,
    });
  }

  const favorited = threads
    .filter((thread) => thread.favorited && !thread.pinned && thread.id !== 'default')
    .sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  if (favorited.length > 0) {
    groups.push({ type: 'favorites', label: '收藏', threads: favorited });
  }

  return groups;
}

function groupByProject(threads: Thread[], unreadIds?: Set<string>): [string, Thread[]][] {
  const groups = new Map<string, Thread[]>();
  for (const thread of threads) {
    const key = thread.projectPath;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(thread);
  }

  for (const [, projectThreads] of groups) {
    projectThreads.sort((a, b) => sortByUnreadThenActive(a, b, unreadIds));
  }

  return [...groups.entries()].sort(([a], [b]) => {
    if (a === 'default') return 1;
    if (b === 'default') return -1;
    return a.localeCompare(b);
  });
}
