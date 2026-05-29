/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/ChatContainer.tsx'), 'utf8');

describe('ChatContainer loading indicator', () => {
  it('renders the loading indicator inside the main content area while auth is pending', () => {
    expect(source).toContain('/icons/chart/loading.svg');
    expect(source).toMatch(/className="[^"]*h-8[^"]*w-8[^"]*animate-spin[^"]*"/);
    expect(source).not.toContain('if (!authChecked) {');
    expect(source).toContain('data-testid="chat-container-loading-panel"');
    expect(source).toMatch(/authChecked\s*\?\s*\(/);
    expect(source).toMatch(
      /<div[^>]*className="(?=[^"]*h-full)(?=[^"]*flex)(?=[^"]*items-center)(?=[^"]*justify-center)[^"]*"[^>]*data-testid="chat-container-loading-panel"/,
    );
  });
});
