/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Resolve OpenAI-compatible model context window for relayclaw (jiuwen) sidecar.
 * Priority: embedded ACP config > getContextWindowFallback(defaultModel).
 */
import { getContextWindowFallback } from './context-window-sizes.js';

export function resolveRelayModelContextWindow(input: {
  defaultModel?: string;
  embeddedAcpContextWindow?: number;
}): number | undefined {
  const emb = input.embeddedAcpContextWindow;
  if (typeof emb === 'number' && Number.isFinite(emb) && emb > 0) {
    return Math.floor(emb);
  }
  return getContextWindowFallback(input.defaultModel ?? '');
}
