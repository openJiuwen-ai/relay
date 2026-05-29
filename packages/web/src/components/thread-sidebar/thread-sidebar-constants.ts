/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type ThreadFilterOption = 'all' | '1m' | '3m' | '6m';

export const MAX_SIDEBAR_RESTORE_FRAMES = 90;
export const SIDEBAR_SCROLL_STORAGE_KEY = 'office-claw:sidebar-scroll:v1';
export const LEGACY_SIDEBAR_SCROLL_STORAGE_KEY = 'cat-cafe:sidebar-scroll:v1';
export const MAX_SESSIONS = 200;
export const COLLAPSE_BREAKPOINT_PX = 1280;
export const PPT_PREVIEW_COLLAPSE_BREAKPOINT_PX = 1920;
export const SIDEBAR_CONTENT_REVEAL_MS = 80;
export const FILTER_PANEL_WIDTH_PX = 200;
export const FILTER_PANEL_GAP_PX = 8;

export const FILTER_OPTION_LABELS: Record<ThreadFilterOption, string> = {
  all: '全部',
  '1m': '近1个月',
  '3m': '近3个月',
  '6m': '近6个月',
};

export const CONNECTOR_SOURCE_LABELS: Record<string, string> = {
  feishu: '飞书',
  wechat: '微信',
  slack: 'Slack',
  discord: 'Discord',
  dingtalk: '钉钉',
};

export const THREAD_FILTER_OPTIONS: Array<{ key: ThreadFilterOption; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '1m', label: '近1个月' },
  { key: '3m', label: '近3个月' },
  { key: '6m', label: '近6个月' },
];
