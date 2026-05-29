/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


export function compactToolResultDetail(raw: string): string {
  const trimmed = raw.trimEnd();
  if (trimmed.length === 0) return '(no output)';
  return trimmed;
}
