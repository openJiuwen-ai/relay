/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(resolve(testDir, '..', '..', 'globals.css'), 'utf8');
const chatContainerSource = readFileSync(resolve(testDir, '..', 'ChatContainer.tsx'), 'utf8');

function getCssBlock(selector: string): string {
  const blocks = [...globalsCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, selectorGroup, body] of blocks) {
    const selectors = selectorGroup
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (selectors.length === 1 && selectors[0] === selector) {
      return body;
    }
  }

  throw new Error(`Missing CSS selector: ${selector}`);
}

describe('chat scrollbar styles', () => {
  it('keeps maximized desktop chat scrollbars inside the client edge', () => {
    const block = getCssBlock('.chat-scrollbar-maximized-inset');

    expect(block).toMatch(/margin-inline-end\s*:\s*1px;/);
  });

  it('applies the inset only to maximized desktop chat containers', () => {
    expect(chatContainerSource).toContain('useDesktopWindowControls');
    expect(chatContainerSource).toContain("isDesktopHost && isMaximized ? 'chat-scrollbar-maximized-inset' : ''");
  });
});
