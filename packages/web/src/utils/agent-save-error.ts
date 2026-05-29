/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

const UNAVAILABLE_MODEL_ERROR_PATTERN = /model\s+["'][^"']+["']\s+is not available on provider/i;
const MISSING_PROVIDER_ERROR_PATTERN = /provider\s+["'][^"']+["']\s+not found/i;

export function normalizeAgentSaveErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  if (UNAVAILABLE_MODEL_ERROR_PATTERN.test(trimmed) || MISSING_PROVIDER_ERROR_PATTERN.test(trimmed)) {
    return '模型不存在，请重新选择';
  }
  return trimmed;
}
