/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { tintedLight } from '../color-utils';

describe('tintedLight', () => {
  it('blends hex color toward white at given ratio', () => {
    // Pure black (#000000) at 0.08 toward white → rgb(242, 242, 242) (white * 0.92 + black * 0.08)
    // Actually: base + (accent - base) * ratio = 255 + (0 - 255) * 0.08 = 255 - 20.4 = 235
    const result = tintedLight('#000000', 0.08);
    expect(result).toBe('rgb(235, 235, 235)');
  });

  it('returns near-white for low ratio with a colored accent', () => {
    // Ragdoll primary #7C9FD4 at 0.08 toward white
    // R: 255 + (124 - 255) * 0.08 = 255 - 10.48 = 244.52 → 245
    // G: 255 + (159 - 255) * 0.08 = 255 - 7.68 = 247.32 → 247
    // B: 255 + (212 - 255) * 0.08 = 255 - 3.44 = 251.56 → 252
    const result = tintedLight('#7C9FD4', 0.08);
    expect(result).toBe('rgb(245, 247, 252)');
  });

  it('returns the accent color itself at ratio 1.0', () => {
    const result = tintedLight('#FF0000', 1.0);
    expect(result).toBe('rgb(255, 0, 0)');
  });

  it('returns white at ratio 0', () => {
    const result = tintedLight('#FF0000', 0);
    expect(result).toBe('rgb(255, 255, 255)');
  });
});
