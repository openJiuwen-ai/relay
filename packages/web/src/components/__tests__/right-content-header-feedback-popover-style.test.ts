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
const globalsCssPath = resolve(testDir, '..', '..', 'globals.css');
const globalsCss = readFileSync(globalsCssPath, 'utf8');

function getCssBlocks(selector: string): string[] {
  const blocks = [...globalsCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const matches: string[] = [];
  for (const [, selectorGroup, body] of blocks) {
    const selectors = selectorGroup
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (selectors.includes(selector)) {
      matches.push(body);
    }
  }

  if (matches.length === 0) {
    throw new Error(`Missing CSS selector: ${selector}`);
  }

  return matches;
}

function getDeclarationValue(blocks: string[], property: string): string | null {
  for (const block of blocks) {
    const match = block.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

describe('RightContentHeader feedback popover styles', () => {
  it('uses the updated popover layout, checkbox radius, and label weight', () => {
    const popoverBlocks = getCssBlocks('.ui-content-header-feedback-popover');
    const popoverContentBlocks = getCssBlocks('.ui-content-header-feedback-popover-content');
    const popoverBodyBlocks = getCssBlocks('.ui-content-header-feedback-popover-body');
    const arrowBlocks = getCssBlocks('.ui-content-header-feedback-popover-arrow');
    const headerBlocks = getCssBlocks('.ui-content-header-feedback-popover-header');
    const actionsBlocks = getCssBlocks('.ui-content-header-feedback-low-score-actions');
    const optionLabelBlocks = getCssBlocks('.ui-content-header-feedback-low-score-option-label');
    const checkboxBlocks = getCssBlocks('.ui-content-header-feedback-low-score-option input');
    const detailInputBlocks = getCssBlocks('.ui-content-header-feedback-detail-input');

    expect(getDeclarationValue(popoverBlocks, 'width')).toBe('min(430px, calc(100vw - 24px))');
    expect(getDeclarationValue(popoverBlocks, 'height')).toBe('auto');
    expect(getDeclarationValue(popoverBlocks, 'right')).toBe('-25px');
    expect(getDeclarationValue(popoverBlocks, 'overflow')).toBe('visible');
    expect(getDeclarationValue(popoverBlocks, 'border-radius')).toBe('12px');
    expect(getDeclarationValue(popoverContentBlocks, 'padding')).toBe('24px');
    expect(getDeclarationValue(popoverContentBlocks, 'display')).toBe('flex');
    expect(getDeclarationValue(popoverContentBlocks, 'flex-direction')).toBe('column');
    expect(getDeclarationValue(popoverContentBlocks, 'width')).toBe('100%');
    expect(getDeclarationValue(headerBlocks, 'align-items')).toBe('center');
    expect(getDeclarationValue(headerBlocks, 'flex-shrink')).toBe('0');
    expect(getDeclarationValue(popoverBodyBlocks, 'overflow-y')).toBe('auto');
    expect(getDeclarationValue(popoverBodyBlocks, 'width')).toBe('100%');
    expect(getDeclarationValue(actionsBlocks, 'flex-shrink')).toBe('0');
    expect(getDeclarationValue(arrowBlocks, 'right')).toBe('28px');
    expect(getDeclarationValue(optionLabelBlocks, 'font-weight')).toBe('400');
    expect(getDeclarationValue(checkboxBlocks, 'border-radius')).toBe('4px');
    expect(getDeclarationValue(detailInputBlocks, 'height')).toBe('104px');
    expect(getDeclarationValue(detailInputBlocks, 'padding')).toBe('8px 12px 16px');
    expect(getDeclarationValue(detailInputBlocks, 'border-radius')).toBe('6px');
  });

  it('does not keep bespoke feedback action button styles', () => {
    expect(globalsCss).not.toContain('.ui-content-header-feedback-cancel {');
    expect(globalsCss).not.toContain('.ui-content-header-feedback-cancel:hover {');
    expect(globalsCss).not.toContain('.ui-content-header-feedback-submit {');
    expect(globalsCss).not.toContain('.ui-content-header-feedback-submit:hover {');
    expect(globalsCss).not.toContain('.ui-content-header-feedback-submit:disabled {');
  });
});
