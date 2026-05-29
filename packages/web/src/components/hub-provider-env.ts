/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function parseProviderEnvText(value: string): Record<string, string> | undefined {
  const lines = value.split(/\r?\n/);
  const entries: Array<[string, string]> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = (separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex)).trim();
    if (!key) continue;
    const envValue = separatorIndex === -1 ? '' : trimmed.slice(separatorIndex + 1);
    entries.push([key, envValue]);
  }
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}
