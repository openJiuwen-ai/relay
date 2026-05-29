/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { compactToolResultDetail } from '@/utils/toolPreview';

describe('compactToolResultDetail', () => {
  it('keeps short output unchanged', () => {
    const raw = 'command: pwd\nstatus: completed\nexit_code: 0';
    expect(compactToolResultDetail(raw)).toBe(raw);
  });

  it('limits verbose output to compact preview with ellipsis', () => {
    const raw = [
      'command: /bin/zsh -lc ~/.codex/superpowers/.codex/superpowers-codex bootstrap',
      'status: completed',
      'exit_code: 0',
      '# Superpowers Bootstrap for Codex',
      '# ================================',
      '## Bootstrap Instructions:',
      '<EXTREMELY_IMPORTANT>',
    ].join('\n');

    const detail = compactToolResultDetail(raw);
    const lines = detail.split('\n');

    expect(lines.length).toBeLessThanOrEqual(5);
    expect(detail).toContain('command:');
    expect(detail).toContain('status:');
    expect(detail).toContain('exit_code:');
    expect(detail).toContain('…');
  });

  it('enforces a hard character cap for long single-line output', () => {
    const raw = `output: ${'x'.repeat(800)}`;
    const detail = compactToolResultDetail(raw);

    expect(detail.length).toBeLessThanOrEqual(221); // 220 + optional ellipsis
    expect(detail.endsWith('…')).toBe(true);
  });
});
