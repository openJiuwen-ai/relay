/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function isSchedulerPlaceholderMessage(msg: {
  agentId?: string | null;
  origin?: string | null;
  source?: { connector?: string | null } | null;
}): boolean {
  return msg.origin === 'callback' && msg.agentId === 'system' && msg.source?.connector === 'scheduler';
}
