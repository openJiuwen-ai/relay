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
const componentsDir = resolve(testDir, '..');
const appDir = resolve(testDir, '..', '..');

const globalsCss = readFileSync(resolve(appDir, 'globals.css'), 'utf8');
const capabilityBoardSource = readFileSync(resolve(componentsDir, 'skills-panel/components/capability-board-ui.tsx'), 'utf8');
const memberOverviewSource = readFileSync(resolve(componentsDir, 'HubMemberOverviewCard.tsx'), 'utf8');
const modelsPanelSource = readFileSync(resolve(componentsDir, 'ModelsPanel.tsx'), 'utf8');
const skillsTabStyles = readFileSync(resolve(componentsDir, 'HubSkillsTab.module.css'), 'utf8');

function getCssBlock(source: string, selector: string): string {
  const blocks = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
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

describe('ui-card shared padding contract', () => {
  it('applies shared padding to muted cards through the tokenized class', () => {
    const block = getCssBlock(globalsCss, '.ui-card-muted');

    expect(block).toMatch(/padding\s*:\s*var\(--card-padding\);/);
  });

  it('does not add extra padding utilities on ui-card consumers', () => {
    expect(capabilityBoardSource).not.toMatch(/ui-card[^\r\n"'`]*(?:\sp-\d+\b|\spx-\[[^\]]+\]|\spy-\[[^\]]+\])/);
    expect(memberOverviewSource).not.toContain('ui-card-muted ui-card-hover px-[18px] py-[18px]');
    expect(memberOverviewSource).not.toContain('ui-card-muted px-[18px] py-[18px]');
    expect(memberOverviewSource).not.toContain('ui-card ui-card-hover px-[18px] py-[18px]');
    expect(memberOverviewSource).not.toContain('ui-card px-[18px] py-[18px]');
    expect(modelsPanelSource).not.toMatch(/ui-card[^\r\n"'`]*(?:\sp-\d+\b|\spx-\[[^\]]+\]|\spy-\[[^\]]+\])/);
  });

  it('does not redefine card padding inside the skills plaza card module', () => {
    const block = getCssBlock(skillsTabStyles, '.card');

    expect(block).not.toMatch(/padding\s*:/);
  });
});
