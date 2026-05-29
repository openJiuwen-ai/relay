/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  bubbleExpandStorageKey,
  readBubbleExpandPref,
  writeBubbleExpandPref,
} from '@/lib/chat-bubble-expand-prefs';

describe('chat-bubble-expand-prefs', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('builds stable composite keys', () => {
    const k = bubbleExpandStorageKey('t1', 'm1', 'thinking-exec');
    expect(k).toContain('t1');
    expect(k).toContain('m1');
    expect(k).toContain('thinking-exec');
  });

  it('round-trips read and write', () => {
    const k = bubbleExpandStorageKey('thread_a', 'msg_b', 'cli-outer');
    expect(readBubbleExpandPref(k)).toBeUndefined();
    writeBubbleExpandPref(k, true);
    expect(readBubbleExpandPref(k)).toBe(true);
    writeBubbleExpandPref(k, false);
    expect(readBubbleExpandPref(k)).toBe(false);
  });
});
