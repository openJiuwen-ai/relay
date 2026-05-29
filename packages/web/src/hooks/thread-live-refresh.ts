/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export const THREAD_LIVE_REFRESH_EVENT = 'office-claw:thread-live-refresh';

export type ThreadLiveRefreshScope = 'all' | 'messages' | 'panels';

export interface ThreadLiveRefreshDetail {
  threadId: string;
  scope: ThreadLiveRefreshScope;
  reason?: string;
}

export function requestThreadLiveRefresh(
  threadId: string,
  scope: ThreadLiveRefreshScope = 'all',
  reason?: string,
) {
  if (typeof window === 'undefined' || !threadId) return;
  window.dispatchEvent(
    new CustomEvent<ThreadLiveRefreshDetail>(THREAD_LIVE_REFRESH_EVENT, {
      detail: { threadId, scope, reason },
    }),
  );
}
