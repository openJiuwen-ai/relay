/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * useChatCommands unit tests (#39)
 * Tests the isCommandInvocation pure function.
 */

import { describe, expect, it } from 'vitest';
import { isCommandInvocation } from '../useChatCommands';

describe('isCommandInvocation', () => {
  // Exact match (command only, no trailing args)
  it('matches exact command', () => {
    expect(isCommandInvocation('/config', '/config')).toBe(true);
  });

  it('matches command with trailing space + args', () => {
    expect(isCommandInvocation('/config set foo bar', '/config')).toBe(true);
  });

  it('matches command with single trailing space', () => {
    expect(isCommandInvocation('/config ', '/config')).toBe(true);
  });

  // False positives that should NOT match
  it('rejects command prefix (no boundary)', () => {
    expect(isCommandInvocation('/configs', '/config')).toBe(false);
  });

  it('rejects /approved vs /approve', () => {
    expect(isCommandInvocation('/approved', '/approve')).toBe(false);
  });

  it('rejects /recalling vs /recall', () => {
    expect(isCommandInvocation('/recalling', '/recall')).toBe(false);
  });

  // Positive matches for other commands
  it('matches /approve exactly', () => {
    expect(isCommandInvocation('/approve', '/approve')).toBe(true);
  });

  it('matches /approve with args', () => {
    expect(isCommandInvocation('/approve all', '/approve')).toBe(true);
  });

  it('matches /evidence with query', () => {
    expect(isCommandInvocation('/evidence per-cat budgets', '/evidence')).toBe(true);
  });

  it('matches /reflect with query', () => {
    expect(isCommandInvocation('/reflect why Phase 4', '/reflect')).toBe(true);
  });

  // Edge cases
  it('rejects empty string', () => {
    expect(isCommandInvocation('', '/config')).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(isCommandInvocation('   ', '/config')).toBe(false);
  });

  it('rejects plain text', () => {
    expect(isCommandInvocation('hello world', '/config')).toBe(false);
  });

  it('matches with tab as separator', () => {
    expect(isCommandInvocation('/config\tset', '/config')).toBe(true);
  });
});
