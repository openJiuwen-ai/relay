/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import type { ChatMessage as ChatMessageData } from '@/stores/chatStore';
import { computeSuppressedGeneratedFileNamesByMessage } from '../generated-file-dedupe';

describe('computeSuppressedGeneratedFileNamesByMessage', () => {
  it('suppresses earlier duplicate final artifacts within the same dialogue turn', () => {
    const messages: ChatMessageData[] = [
      {
        id: 'user-1',
        type: 'user',
        content: '帮我生成分析报告',
        timestamp: 1000,
      },
      {
        id: 'assistant-1',
        type: 'assistant',
        agentId: 'codex',
        origin: 'stream',
        content:
          '先生成中间文档，最终会输出到 workspace/output/用户行为分析报告.xlsx。\n当前正在整理 用户行为分析可视化图表设计方案.md',
        timestamp: 1001,
        toolEvents: [{ id: 'te-1', type: 'tool_use', label: 'Write plan', timestamp: 1001 }],
      },
      {
        id: 'assistant-2',
        type: 'assistant',
        agentId: 'codex',
        origin: 'stream',
        content: '最终文件已生成',
        timestamp: 1002,
        toolEvents: [
          { id: 'te-2', type: 'tool_use', label: 'Write xlsx', timestamp: 1002 },
          {
            id: 'te-3',
            type: 'tool_result',
            label: 'codex ← result',
            detail: 'Saved: workspace/output/用户行为分析报告.xlsx',
            timestamp: 1003,
          },
        ],
      },
      {
        id: 'user-2',
        type: 'user',
        content: '再生成一次',
        timestamp: 1004,
      },
      {
        id: 'assistant-3',
        type: 'assistant',
        agentId: 'codex',
        origin: 'stream',
        content: '新一轮文件：workspace/output/用户行为分析报告.xlsx',
        timestamp: 1005,
        toolEvents: [{ id: 'te-4', type: 'tool_use', label: 'Rewrite xlsx', timestamp: 1005 }],
      },
    ];

    const suppressed = computeSuppressedGeneratedFileNamesByMessage(messages);

    expect(suppressed.get('assistant-1')).toEqual(['用户行为分析报告.xlsx']);
    expect(suppressed.has('assistant-2')).toBe(false);
    expect(suppressed.has('assistant-3')).toBe(false);
  });

  it('suppresses earlier txt references when a later message in the same turn generates the final txt', () => {
    const messages: ChatMessageData[] = [
      {
        id: 'user-1',
        type: 'user',
        content: '导出 txt',
        timestamp: 2000,
      },
      {
        id: 'assistant-1',
        type: 'assistant',
        agentId: 'codex',
        origin: 'stream',
        content:
          '先产出 markdown 草稿 企业数字化升级解决方案.md，最终会输出到 workspace/output/企业数字化升级解决方案.txt',
        timestamp: 2001,
        toolEvents: [{ id: 'te-1', type: 'tool_use', label: 'Write markdown', timestamp: 2001 }],
      },
      {
        id: 'assistant-2',
        type: 'assistant',
        agentId: 'codex',
        origin: 'stream',
        content: 'txt 已完成',
        timestamp: 2002,
        toolEvents: [
          { id: 'te-2', type: 'tool_use', label: 'Write txt', timestamp: 2002 },
          {
            id: 'te-3',
            type: 'tool_result',
            label: 'codex ← result',
            detail: 'Saved: workspace/output/企业数字化升级解决方案.txt',
            timestamp: 2003,
          },
        ],
      },
    ];

    const suppressed = computeSuppressedGeneratedFileNamesByMessage(messages);

    expect(suppressed.get('assistant-1')).toEqual(['企业数字化升级解决方案.txt']);
    expect(suppressed.has('assistant-2')).toBe(false);
  });
});
