/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THREAD_STATE } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';

describe('chatStore sentence deduplication', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      threadStates: {},
      currentThreadId: 'thread-active',
    });
  });

  describe('appendToMessage', () => {
    it('完全相同的句子应该被移除（连续重复场景）', () => {
      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '你好。世界！',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToMessage('msg-1', '世界！再见！');

      // "世界！"与现有内容的最后一句相同，应该被去重
      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).toBe('你好。世界！再见！');
    });

    it('相似的句子（≥70%）应该被移除 - 前缀子串场景', () => {
      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '我来帮你生成一页华为风格的PPT',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToMessage('msg-1', '我来帮你生成一页华为风格的PPT，内容是关于黄仁勋。');

      // "我来帮你生成一页华为风格的PPT" (18) vs "我来帮你生成一页华为风格的PPT，内容是关于黄仁勋。" (29)
      // 相似度 = 2×18/(18+29) = 76.6% > 70%，应该被去重
      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).not.toContain(
        '我来帮你生成一页华为风格的PPT我来帮你生成',
      );
    });

    it('不相似的句子应该保留', () => {
      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '你好。',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToMessage('msg-1', '世界！');

      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).toBe('你好。世界！');
    });

    it('短句子的正确处理（<10字符直接比较）', () => {
      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '测试',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToMessage('msg-1', '测试');

      // 短句子完全相同时应该被去重
      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).toBe('测试');
    });

    it('标点符号的处理（标准化后比较）', () => {
      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '你好，世界。',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToMessage('msg-1', '你好!世界!');

      // 标准化后相同，应该被去重
      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).not.toContain(
        '你好!世界!你好',
      );
    });

    it('换行符的处理', () => {
      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '第一句。\n第二句。',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToMessage('msg-1', '第二句。\n第三句。');

      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).not.toContain(
        '第二句。\n第二句。',
      );
    });

    it('空内容的处理', () => {
      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToMessage('msg-1', '新内容');

      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).toBe('新内容');
    });

    it('流式输出场景模拟 - LLM 连续重复最后一句', () => {
      const chunks = [
        '我来帮你生成一页华为风格的PPT。',
        '内容是关于黄仁勋2026 GTC大会讲话的核心观点总结。',
        '内容是关于黄仁勋2026 GTC大会讲话的核心观点总结。', // 连续重复最后一句
        '首先让我执行环境检测,',
        '然后创建任务列表。',
      ];

      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      for (const chunk of chunks) {
        store.appendToMessage('msg-1', chunk);
      }

      const finalContent = useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content ?? '';

      // 不应该包含重复的"内容是关于..."
      expect(finalContent.split('内容是关于黄仁勋2026 GTC大会讲话的核心观点总结。').length).toBe(2);
    });
  });

  describe('appendToThreadMessage', () => {
    it('背景线程消息去重应该正常工作', () => {
      useChatStore.setState((state) => ({
        threadStates: {
          ...state.threadStates,
          'thread-bg': {
            ...DEFAULT_THREAD_STATE,
            messages: [
              {
                id: 'bg-msg-1',
                type: 'assistant',
                agentId: 'codex',
                content: '你好。世界！',
                origin: 'stream',
                timestamp: 1,
                isStreaming: true,
              },
            ],
          },
        },
      }));

      const store = useChatStore.getState();
      store.appendToThreadMessage('thread-bg', 'bg-msg-1', '世界！再见！');

      const bgThread = store.getThreadState('thread-bg');
      expect(bgThread.messages.find((m) => m.id === 'bg-msg-1')?.content).toBe('你好。世界！再见！');
    });

    it('活动线程消息去重应该正常工作', () => {
      useChatStore.setState({
        currentThreadId: 'thread-active',
        messages: [],
      });

      const store = useChatStore.getState();
      store.addMessage({
        id: 'msg-1',
        type: 'assistant',
        agentId: 'opus',
        content: '你好。世界！',
        origin: 'stream',
        timestamp: 1,
        isStreaming: true,
      });

      store.appendToThreadMessage('thread-active', 'msg-1', '世界！再见！');

      expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.content).toBe(
        '你好。世界！再见！',
      );
    });
  });
});
