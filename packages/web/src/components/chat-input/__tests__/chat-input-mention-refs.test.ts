/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { deriveTargetAgentIds, reconcileMentionRefs } from '@/components/chat-input/utils/helpers';

describe('reconcileMentionRefs', () => {
  it('drops stale older refs when only the latest same-name mention remains', () => {
    const mentionRefs = [
      { catId: 'my-agent', mention: '@古诗词创作专家' },
      { catId: 'expert-poetry', mention: '@古诗词创作专家' },
    ];

    expect(reconcileMentionRefs('@古诗词创作专家 请帮我写诗', mentionRefs)).toEqual([
      { catId: 'expert-poetry', mention: '@古诗词创作专家' },
    ]);
  });

  it('preserves order when multiple same-name mentions are still present', () => {
    const mentionRefs = [
      { catId: 'expert-poetry', mention: '@古诗词创作专家' },
      { catId: 'my-agent', mention: '@古诗词创作专家' },
    ];

    expect(reconcileMentionRefs('@古诗词创作专家 和 @古诗词创作专家 一起讨论', mentionRefs)).toEqual(mentionRefs);
  });

  it('counts mentions that follow punctuation and removes unrelated refs', () => {
    const mentionRefs = [
      { catId: 'expert-poetry', mention: '@古诗词创作专家' },
      { catId: 'expert-design', mention: '@设计专家' },
    ];

    expect(reconcileMentionRefs('你好，@古诗词创作专家 请继续', mentionRefs)).toEqual([
      { catId: 'expert-poetry', mention: '@古诗词创作专家' },
    ]);
  });
});

describe('deriveTargetAgentIds', () => {
  it('prefers exact mentionRefs over fuzzy same-name option matches', () => {
    const mentionOptions = [
      {
        id: 'my-agent',
        label: '@古诗词创作专家',
        desc: '我的智能体',
        insert: '@古诗词创作专家 ',
        color: '#111111',
        avatar: '',
      },
      {
        id: 'expert-poetry',
        label: '@古诗词创作专家',
        desc: '专家',
        insert: '@古诗词创作专家 ',
        color: '#222222',
        avatar: '',
      },
    ];

    expect(
      deriveTargetAgentIds(
        '@古诗词创作专家 请帮我写诗',
        [{ catId: 'expert-poetry', mention: '@古诗词创作专家' }],
        mentionOptions,
      ),
    ).toEqual(['expert-poetry']);
  });
});
