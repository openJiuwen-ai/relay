/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentData } from '@/hooks/useAgentData';

afterEach(() => {
  vi.resetModules();
});

function makeCat(overrides: Partial<AgentData> & { id: string; mentionPatterns: string[] }): AgentData {
  return {
    displayName: overrides.id,
    color: { primary: '#000', secondary: '#fff' },
    provider: 'anthropic',
    defaultModel: 'test',
    roleDescription: '',
    personality: '',
    ...overrides,
  } as AgentData;
}

describe('mention highlight cache', () => {
  it('excludes disabled cats (roster.available === false) from highlight (#193)', async () => {
    const { refreshMentionData, getMentionToAgentId, getMentionRe } = await import('@/lib/mention-highlight');
    const agents: AgentData[] = [
      makeCat({
        id: 'spark',
        displayName: '火花猫',
        color: { primary: '#F59E0B', secondary: '#FDE68A' },
        mentionPatterns: ['@spark', '@火花猫'],
        roster: { family: 'maine-coon', roles: ['coder'], lead: false, available: false, evaluation: 'disabled' },
      }),
      makeCat({
        id: 'ragdoll',
        displayName: '布偶猫',
        color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
        mentionPatterns: ['@ragdoll', '@布偶猫'],
        roster: { family: 'ragdoll', roles: ['architect'], lead: true, available: true, evaluation: '' },
      }),
    ];

    refreshMentionData(agents);

    const toAgent = getMentionToAgentId();
    // Disabled cat excluded
    expect(toAgent.spark).toBeUndefined();
    expect(toAgent['火花猫']).toBeUndefined();
    // Available cat included
    expect(toAgent.ragdoll).toBe('ragdoll');
    expect(toAgent['布偶猫']).toBe('ragdoll');

    const re = getMentionRe();
    re.lastIndex = 0;
    expect(re.exec('@spark')).toBeNull();
    re.lastIndex = 0;
    expect(re.exec('@ragdoll')).not.toBeNull();
  });

  it('includes cats without roster field (seed cats default to available)', async () => {
    const { refreshMentionData, getMentionToAgentId } = await import('@/lib/mention-highlight');
    refreshMentionData([makeCat({ id: 'seed-cat', mentionPatterns: ['@seed'], roster: null as never })]);
    expect(getMentionToAgentId().seed).toBe('seed-cat');
  });

  it('includes invited thread experts in the mention cache', async () => {
    const { refreshMentionData, refreshThreadExpertMentionData, getMentionToCat, getMentionRe } = await import(
      '@/lib/mention-highlight'
    );

    refreshMentionData([
      makeCat({
        id: 'codex',
        displayName: '通用智能体',
        mentionPatterns: ['@codex', '@通用智能体'],
        roster: { family: 'maine-coon', roles: ['assistant'], lead: false, available: true, evaluation: '' },
      }),
    ]);
    refreshThreadExpertMentionData([
      {
        expertId: 'expert-poetry',
        displayName: '古诗词创作专家',
        mentionPatterns: ['@古诗词创作专家', '@诗词专家', '@小诗', '@expert-poetry', '@诗词'],
        category: 'content',
      },
    ]);

    const toCat = getMentionToCat();
    expect(toCat['古诗词创作专家']).toBe('expert-poetry');
    expect(toCat['诗词专家']).toBe('expert-poetry');

    const re = getMentionRe();
    re.lastIndex = 0;
    expect(re.exec('@诗词专家')).not.toBeNull();
  });
});
