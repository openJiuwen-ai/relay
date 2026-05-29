/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '../chatStore';

describe('chatStore outline preview methods', () => {
  beforeEach(() => {
    useChatStore.setState({
      currentThreadId: 'thread-A',
      rightPanelMode: 'status',
      activeOutlinePreview: null,
      pptStudioSessions: {},
      activePptPagesDir: null,
    });
  });

  describe('openOutlinePreview', () => {
    it('opens outline preview with initial text and threadId', () => {
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        source: 'ask_tool',
        initialText: '# Outline\n## P1: Title',
        title: '大纲审阅',
      });

      const state = useChatStore.getState();
      expect(state.activeOutlinePreview).toEqual({
        requestId: 'req-1',
        source: 'ask_tool',
        threadId: 'thread-A',
        initialText: '# Outline\n## P1: Title',
        editedText: '# Outline\n## P1: Title',
        title: '大纲审阅',
        panelMode: 'preview',
        isConfirmed: false,
      });
      expect(state.rightPanelMode).toBe('outlinePreview');
    });

    it('uses currentThreadId when threadId is omitted', () => {
      useChatStore.setState({ currentThreadId: 'thread-B' });
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-2',
        initialText: 'test',
        title: 'Test',
        threadId: undefined,
      });

      expect(useChatStore.getState().activeOutlinePreview?.threadId).toBe('thread-B');
    });

    it('uses provided threadId when specified', () => {
      useChatStore.setState({ currentThreadId: 'thread-A' });
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-3',
        initialText: 'test',
        title: 'Test',
        threadId: 'thread-C',
      });

      expect(useChatStore.getState().activeOutlinePreview?.threadId).toBe('thread-C');
    });

    it('sets panelMode to preview by default', () => {
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-4',
        initialText: 'test',
        title: 'Test',
      });

      expect(useChatStore.getState().activeOutlinePreview?.panelMode).toBe('preview');
    });

    it('sets isConfirmed from parameter or defaults to false', () => {
      const store1 = useChatStore.getState();
      store1.openOutlinePreview({
        requestId: 'req-5',
        initialText: 'test',
        title: 'Test',
      });
      expect(useChatStore.getState().activeOutlinePreview?.isConfirmed).toBe(false);

      const store2 = useChatStore.getState();
      store2.openOutlinePreview({
        requestId: 'req-6',
        initialText: 'test',
        title: 'Test',
        isConfirmed: true,
      });
      expect(useChatStore.getState().activeOutlinePreview?.isConfirmed).toBe(true);
    });
  });

  describe('closeOutlinePreview', () => {
    it('closes outline preview and resets state', () => {
      // First open
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        initialText: 'test',
        title: 'Test',
      });

      // Then close
      store.closeOutlinePreview();

      expect(useChatStore.getState().activeOutlinePreview).toBeNull();
    });

    it('resolves rightPanelMode after close', () => {
      // Open outline preview
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        initialText: 'test',
        title: 'Test',
      });
      expect(useChatStore.getState().rightPanelMode).toBe('outlinePreview');

      // Close it - should collapse to status since no other preview active
      store.closeOutlinePreview();
      expect(useChatStore.getState().rightPanelMode).toBe('status');
    });

    it('no-op when no active outline preview', () => {
      const initialMode = useChatStore.getState().rightPanelMode;
      const store = useChatStore.getState();
      store.closeOutlinePreview();

      // State should remain unchanged
      expect(useChatStore.getState().rightPanelMode).toBe(initialMode);
      expect(useChatStore.getState().activeOutlinePreview).toBeNull();
    });
  });

  describe('updateOutlinePreviewText', () => {
    it('updates editedText in active outline preview', () => {
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        initialText: 'original',
        title: 'Test',
      });

      store.updateOutlinePreviewText('modified text');

      expect(useChatStore.getState().activeOutlinePreview?.editedText).toBe('modified text');
      expect(useChatStore.getState().activeOutlinePreview?.initialText).toBe('original');
    });

    it('no-op when no active outline preview', () => {
      const store = useChatStore.getState();
      store.updateOutlinePreviewText('some text');

      expect(useChatStore.getState().activeOutlinePreview).toBeNull();
    });
  });

  describe('setOutlinePreviewMode', () => {
    it('switches panelMode to edit', () => {
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        initialText: 'test',
        title: 'Test',
      });

      store.setOutlinePreviewMode('edit');

      expect(useChatStore.getState().activeOutlinePreview?.panelMode).toBe('edit');
    });

    it('switches panelMode to preview', () => {
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        initialText: 'test',
        title: 'Test',
      });
      store.setOutlinePreviewMode('edit');
      store.setOutlinePreviewMode('preview');

      expect(useChatStore.getState().activeOutlinePreview?.panelMode).toBe('preview');
    });

    it('no-op when no active outline preview', () => {
      const store = useChatStore.getState();
      store.setOutlinePreviewMode('edit');

      expect(useChatStore.getState().activeOutlinePreview).toBeNull();
    });
  });

  describe('setOutlinePreviewConfirmed', () => {
    it('sets isConfirmed to true', () => {
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        initialText: 'test',
        title: 'Test',
      });

      store.setOutlinePreviewConfirmed(true);

      expect(useChatStore.getState().activeOutlinePreview?.isConfirmed).toBe(true);
    });

    it('sets isConfirmed to false', () => {
      const store = useChatStore.getState();
      store.openOutlinePreview({
        requestId: 'req-1',
        initialText: 'test',
        title: 'Test',
        isConfirmed: true,
      });

      store.setOutlinePreviewConfirmed(false);

      expect(useChatStore.getState().activeOutlinePreview?.isConfirmed).toBe(false);
    });

    it('no-op when no active outline preview', () => {
      const store = useChatStore.getState();
      store.setOutlinePreviewConfirmed(true);

      expect(useChatStore.getState().activeOutlinePreview).toBeNull();
    });
  });
});