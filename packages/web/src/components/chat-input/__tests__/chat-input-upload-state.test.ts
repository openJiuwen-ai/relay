/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { deriveImageLifecycleStatus, isImageLifecycleBlockingSend } from '@/components/chat-input/chat-input-upload-state';

describe('chat-input upload lifecycle state', () => {
  it('prioritizes preparing over uploadStatus from hook', () => {
    expect(deriveImageLifecycleStatus(true, 'idle')).toBe('preparing');
    expect(deriveImageLifecycleStatus(true, 'uploading')).toBe('preparing');
    expect(deriveImageLifecycleStatus(true, 'failed')).toBe('preparing');
  });

  it('passes through uploadStatus when not preparing', () => {
    expect(deriveImageLifecycleStatus(false, 'idle')).toBe('idle');
    expect(deriveImageLifecycleStatus(false, 'uploading')).toBe('uploading');
    expect(deriveImageLifecycleStatus(false, 'failed')).toBe('failed');
  });

  it('blocks send only for preparing/uploading states', () => {
    expect(isImageLifecycleBlockingSend('preparing')).toBe(true);
    expect(isImageLifecycleBlockingSend('uploading')).toBe(true);
    expect(isImageLifecycleBlockingSend('failed')).toBe(false);
    expect(isImageLifecycleBlockingSend('idle')).toBe(false);
  });
});
