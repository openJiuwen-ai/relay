/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { Thread } from '@/stores/chat-types';
import {
  COLLAPSE_BREAKPOINT_PX,
  CONNECTOR_SOURCE_LABELS,
  LEGACY_SIDEBAR_SCROLL_STORAGE_KEY,
  PPT_PREVIEW_COLLAPSE_BREAKPOINT_PX,
  SIDEBAR_SCROLL_STORAGE_KEY,
} from './thread-sidebar-constants';

export function readSidebarScrollTop(): number {
  if (typeof window === 'undefined') return 0;
  try {
    let raw = window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY);
    if (!raw) raw = window.sessionStorage.getItem(LEGACY_SIDEBAR_SCROLL_STORAGE_KEY);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeSidebarScrollTop(nextTop: number): void {
  if (typeof window === 'undefined') return;
  const safeTop = Number.isFinite(nextTop) && nextTop > 0 ? nextTop : 0;
  try {
    window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(safeTop));
    try {
      window.sessionStorage.removeItem(LEGACY_SIDEBAR_SCROLL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    // ignore storage failures
  }
}

export function shouldCollapseSidebar(hasPptPreview = false): boolean {
  if (typeof window === 'undefined') return false;
  const breakpoint = hasPptPreview ? PPT_PREVIEW_COLLAPSE_BREAKPOINT_PX : COLLAPSE_BREAKPOINT_PX;
  return window.innerWidth <= breakpoint;
}

export function getSidebarShellClassName(className: string | undefined, isCollapsed: boolean): string {
  const externalClasses = (className ?? 'shrink-0')
    .split(/\s+/)
    .filter((token) => token && !token.startsWith('w-'))
    .join(' ');
  const widthClassName = isCollapsed ? 'w-12' : 'w-[256px]';
  return [externalClasses, widthClassName, 'ui-sidebar-shell flex h-full flex-col overflow-hidden transition-[width] duration-200 ease-out']
    .filter(Boolean)
    .join(' ');
}

export function getThreadSourceLabel(thread: Thread): string | undefined {
  const connectorId = thread.connectorHubState?.connectorId;
  if (!connectorId) return undefined;
  return CONNECTOR_SOURCE_LABELS[connectorId] ?? connectorId;
}

export function getThreadLastActiveAtMs(thread: Thread): number {
  const lastActiveAt = Number(thread.lastActiveAt);
  return Number.isFinite(lastActiveAt) ? lastActiveAt : 0;
}

export function normalizeThreadSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function closeSidebarOnMobile(onClose?: () => void): void {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    onClose?.();
  }
}

export function countNonDefaultThreads(threads: Thread[]): number {
  return threads.filter((thread) => thread.id !== 'default').length;
}
