/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('global state surface tokens', () => {
  it('uses the requested success and error surface colors in every theme block', () => {
    const css = readFileSync(join(process.cwd(), 'src/globals.css'), 'utf8');

    expect(css.match(/--state-success-surface:\s*rgba\(230,\s*242,\s*213,\s*1\);/g)).toHaveLength(2);
    expect(css.match(/--state-error-surface:\s*rgba\(252,\s*227,\s*225,\s*1\);/g)).toHaveLength(2);
  });
});
