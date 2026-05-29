/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@openjiuwen/relay-shared');
  vi.resetModules();
});

describe('transcription-corrector alias source', () => {
  it('follows OFFICE_CLAW_CONFIGS mentionPatterns dynamically', async () => {
    vi.doMock('@openjiuwen/relay-shared', async () => {
      const actual = await vi.importActual<typeof import('@openjiuwen/relay-shared')>('@openjiuwen/relay-shared');
      const codexPatterns = [...actual.OFFICE_CLAW_CONFIGS.codex.mentionPatterns, '@测试Codex别名'];
      return {
        ...actual,
        OFFICE_CLAW_CONFIGS: {
          ...actual.OFFICE_CLAW_CONFIGS,
          codex: {
            ...actual.OFFICE_CLAW_CONFIGS.codex,
            mentionPatterns: codexPatterns,
          },
        },
      };
    });

    const { correctTranscription } = await import('@/utils/transcription-corrector');
    expect(correctTranscription('at测试Codex别名 出来一下')).toBe('@测试Codex别名 出来一下');
  });
});
