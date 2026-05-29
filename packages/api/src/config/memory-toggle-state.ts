/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

let longTermMemoryEnabled = true;

export function getLongTermMemoryEnabled(): boolean {
  return longTermMemoryEnabled;
}

export function setLongTermMemoryEnabled(enabled: boolean): boolean {
  longTermMemoryEnabled = enabled;
  return longTermMemoryEnabled;
}

export function resetLongTermMemoryEnabledForTest(): void {
  longTermMemoryEnabled = true;
}
