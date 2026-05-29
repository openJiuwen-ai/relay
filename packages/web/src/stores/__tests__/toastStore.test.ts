/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('adds a toast and returns id', () => {
    const id = useToastStore.getState().addToast({
      type: 'success',
      title: 'Done',
      message: 'Task complete',
      duration: 5000,
    });
    expect(id).toMatch(/^toast-/);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].title).toBe('Done');
  });

  it('removes a toast by id', () => {
    const id = useToastStore.getState().addToast({
      type: 'info',
      title: 'Test',
      message: 'Hello',
      duration: 0,
    });
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('marks a toast as exiting', () => {
    const id = useToastStore.getState().addToast({
      type: 'error',
      title: 'Oops',
      message: 'Error occurred',
      duration: 3000,
    });
    useToastStore.getState().markExiting(id);
    expect(useToastStore.getState().toasts[0].exiting).toBe(true);
  });

  it('keeps max 10 toasts', () => {
    for (let i = 0; i < 15; i++) {
      useToastStore.getState().addToast({
        type: 'info',
        title: `Toast ${i}`,
        message: `Message ${i}`,
        duration: 0,
      });
    }
    expect(useToastStore.getState().toasts).toHaveLength(10);
    // Latest toast should be the last added
    expect(useToastStore.getState().toasts[9].title).toBe('Toast 14');
  });

  it('preserves threadId on toast', () => {
    useToastStore.getState().addToast({
      type: 'success',
      title: 'Cat done',
      message: 'opus completed',
      threadId: 'thread-123',
      duration: 5000,
    });
    expect(useToastStore.getState().toasts[0].threadId).toBe('thread-123');
  });
});
