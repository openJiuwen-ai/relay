/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { buildAgentOptions, buildWhisperOptions } from '@/components/chat-input/chat-input-options';
import type { AgentData } from '@/hooks/useAgentData';

const LABEL_TEST_AGENTS: AgentData[] = [
  {
    id: 'gemini',
    displayName: '暹罗猫',
    color: { primary: '#5B9BD5', secondary: '#D6E9F8' },
    mentionPatterns: ['暹罗', '暹罗猫', 'gemini'],
    provider: 'google',
    defaultModel: 'gemini-3-pro',
    avatar: '/avatars/gemini.png',
    roleDescription: '视觉设计师',
    personality: '活泼有创意',
    source: 'seed',
  },
];

const MIXED_LABEL_AGENTS: AgentData[] = [
  ...LABEL_TEST_AGENTS,
  {
    id: 'opus-fast',
    displayName: '布偶猫(快)',
    color: { primary: '#9B7EBD', secondary: '#E8D5F5' },
    mentionPatterns: [],
    provider: 'anthropic',
    defaultModel: 'opus-fast',
    avatar: '/avatars/opus.png',
    roleDescription: '快速变体',
    personality: 'kind',
    source: 'seed',
  },
  {
    id: 'spark',
    displayName: '火花猫',
    color: { primary: '#F59E0B', secondary: '#FDE68A' },
    mentionPatterns: ['spark'],
    provider: 'openai',
    defaultModel: 'gpt-5.4-mini',
    avatar: '/avatars/spark.png',
    roleDescription: '精确点改',
    personality: 'fast',
    source: 'seed',
    roster: {
      family: 'maine-coon',
      roles: ['coder'],
      lead: false,
      available: false,
      evaluation: 'disabled for test',
    },
  },
];

describe('chat input mention option labels', () => {
  it('uses official 暹罗猫 label/insert for gemini option', () => {
    const options = buildAgentOptions(LABEL_TEST_AGENTS);
    const geminiOption = options.find((opt) => opt.id === 'gemini');
    expect(geminiOption).toBeDefined();
    expect(geminiOption?.label).toBe('@暹罗猫');
    expect(geminiOption?.insert).toBe('@暹罗猫 ');
  });

  it('prefers the mention pattern that matches displayName for autocomplete insert text', () => {
    const options = buildAgentOptions(LABEL_TEST_AGENTS);
    expect(options[0]?.insert).toBe('@暹罗猫 ');
    expect(options[0]?.insert).not.toBe('@暹罗 ');
    expect(options[0]?.insert).not.toBe('@gemini ');
  });

  it('falls back to the first mention pattern when none matches displayName', () => {
    const options = buildAgentOptions([
      {
        id: 'office',
        displayName: '通用助手Pro',
        color: { primary: '#2B5797', secondary: '#C0D0E8' },
        mentionPatterns: ['office', '通用助手', '小通'],
        provider: 'relayclaw',
        defaultModel: 'glm-5.1',
        avatar: '/avatars/office.png',
        roleDescription: '全局梳理',
        personality: 'steady',
        source: 'seed',
      },
    ]);
    expect(options[0]?.insert).toBe('@office ');
  });
});

describe('buildAgentOptions vs buildWhisperOptions split', () => {
  it('buildAgentOptions filters out agents with empty mentionPatterns', () => {
    const options = buildAgentOptions(MIXED_LABEL_AGENTS);
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe('gemini');
  });

  it('buildAgentOptions filters out unavailable agents even when they have mention patterns', () => {
    const options = buildAgentOptions(MIXED_LABEL_AGENTS);
    expect(options.map((option) => option.id)).not.toContain('spark');
  });

  it('buildWhisperOptions includes agents with empty mentionPatterns', () => {
    const options = buildWhisperOptions(MIXED_LABEL_AGENTS);
    expect(options).toHaveLength(2);
    const fast = options.find((o) => o.id === 'opus-fast');
    expect(fast).toBeDefined();
    expect(fast?.label).toBe('@布偶猫(快)');
    expect(fast?.insert).toBe(''); // no mentionPatterns → empty insert
    expect(options.map((option) => option.id)).not.toContain('spark');
  });
});
