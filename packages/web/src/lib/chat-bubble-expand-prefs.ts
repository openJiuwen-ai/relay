/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/** Record Separator — unlikely in thread/message ids */
const KEY_SEP = '\u001e';

const STORAGE_KEY = 'office-claw:bubble-expand:v1';

type ExpandStore = Record<string, boolean>;

function parseStore(raw: string | null): ExpandStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as ExpandStore;
  } catch {
    return {};
  }
}

function readStore(): ExpandStore {
  if (typeof window === 'undefined') return {};
  return parseStore(localStorage.getItem(STORAGE_KEY));
}

function writeStore(data: ExpandStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/** Stable key for one collapsible facet within a message in a thread. */
export function bubbleExpandStorageKey(threadId: string, messageId: string, facet: string): string {
  return `${threadId}${KEY_SEP}${messageId}${KEY_SEP}${facet}`;
}

/** `undefined` = user never set; caller applies product default. */
export function readBubbleExpandPref(storageKey: string): boolean | undefined {
  const v = readStore()[storageKey];
  return typeof v === 'boolean' ? v : undefined;
}

export function writeBubbleExpandPref(storageKey: string, expanded: boolean): void {
  const all = readStore();
  all[storageKey] = expanded;
  writeStore(all);
}
