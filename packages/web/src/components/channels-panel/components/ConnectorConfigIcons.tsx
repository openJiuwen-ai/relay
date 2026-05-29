/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ReactNode } from 'react';
import React from 'react';

// ── Per-platform visual config (matches .pen wireframe Screen C) ──

export interface PlatformVisual {
  icon: ReactNode;
}

const SVG_PROPS = {
  fill: 'none' as const,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const PLATFORM_VISUALS: Record<string, PlatformVisual> = {
  feishu: {
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/images/connectors/feishu.svg" alt="飞书" className="h-11 w-11" />
    ),
  },
  weixin: {
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/images/connectors/weixin.svg" alt="微信" className="h-11 w-11" />
    ),
  },
  dingtalk: {
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/images/connectors/dingtalk.svg" alt="钉钉" className="h-11 w-11" />
    ),
  },
  xiaoyi: {
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/images/connectors/xiaoyi.svg" alt="小艺" className="h-11 w-11" />
    ),
  },
  'wecom-bot': {
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/images/connectors/wecom-bot.png" alt="WeCom" className="h-11 w-11" />
    ),
  },
  'wecom-agent': {
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/images/connectors/wecom-agent.png" alt="WeCom Agent" className="h-11 w-11" />
    ),
  },
};

export const DEFAULT_VISUAL: PlatformVisual = {
  icon: (
    <svg className="h-11 w-11" viewBox="0 0 24 24" stroke="currentColor" {...SVG_PROPS}>
      <path d="M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0" />
    </svg>
  ),
};

export function StepBadge({ num }: { num: number }) {
  return <span className="text-[14px]">{num}、</span>;
}

export function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" stroke="currentColor" {...SVG_PROPS}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function WifiIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" stroke="currentColor" {...SVG_PROPS}>
      <path d="M5 13a10 10 0 0 1 14 0" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <line x1="12" x2="12.01" y1="20" y2="20" />
    </svg>
  );
}

/** Spinning loader indicator */
export function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Checkmark circle icon for success states */
export function CheckCircleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" stroke="currentColor" {...SVG_PROPS}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

export function ConnectorLockIcon({ platformId }: { platformId: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/lock.svg" alt="" aria-hidden="true" className="h-4 w-4" />
  );
}
