/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { applyTermDictionary, correctTranscription, mergeTermEntries } from '@/utils/transcription-corrector';

describe('mergeTermEntries', () => {
  it('returns built-in entries when no custom terms', () => {
    const entries = mergeTermEntries([]);
    // Should contain built-in entries (icp → MCP etc.)
    const result = applyTermDictionary('用 icp 协议', entries);
    expect(result).toBe('用 MCP 协议');
  });

  it('adds new custom terms alongside built-in', () => {
    const entries = mergeTermEntries([{ from: 'foo', to: 'bar' }]);
    expect(applyTermDictionary('foo来了', entries)).toBe('bar来了');
    // Built-in still works
    expect(applyTermDictionary('icp', entries)).toBe('MCP');
  });

  it('custom terms override built-in with same key', () => {
    // "icp" normally maps to "MCP", override to something else
    const entries = mergeTermEntries([{ from: 'icp', to: 'ICP协议' }]);
    expect(applyTermDictionary('用 icp', entries)).toBe('用 ICP协议');
  });

  it('skips custom terms with empty from', () => {
    const entries = mergeTermEntries([
      { from: '', to: 'nothing' },
      { from: '  ', to: 'spaces' },
      { from: '有效', to: '有效词' },
    ]);
    expect(applyTermDictionary('有效', entries)).toBe('有效词');
  });

  it('custom terms override built-in case-insensitively', () => {
    // Built-in: "icp" → "MCP" (case-insensitive regex)
    // Custom: "ICP" → "ICP协议" (different case key)
    // Expected: custom wins because regex is gi
    const entries = mergeTermEntries([{ from: 'ICP', to: 'ICP协议' }]);
    expect(applyTermDictionary('用 ICP 协议', entries)).toBe('用 ICP协议 协议');
    expect(applyTermDictionary('用 icp 协议', entries)).toBe('用 ICP协议 协议');
  });

  it('works end-to-end with correctTranscription', () => {
    const entries = mergeTermEntries([{ from: '测试词', to: '替换词' }]);
    const result = correctTranscription('嗯那个测试词帮我看看', entries);
    expect(result).toBe('替换词帮我看看');
  });
});
