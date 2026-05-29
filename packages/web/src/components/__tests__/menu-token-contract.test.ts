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

function getVarRefs(value: string): string[] {
  return [...value.matchAll(/var\((--[^)]+)\)/g)].map((match) => match[1]);
}

describe('menu token contract in globals.css', () => {
  it('defines menu-prefixed aliases in theme tokens', () => {
    expect(globalsCss).toContain('--menu-bg:');
    expect(globalsCss).toContain('--menu-hover-bg:');
    expect(globalsCss).toContain('--menu-active-bg:');
    expect(globalsCss).toContain('--menu-disabled-bg:');
    expect(globalsCss).toContain('--menu-transition:');
  });

  it('limits shared menu classes to --menu-* tokens', () => {
    const selectors = [
      { selector: '.ui-menu-item', properties: ['background'] },
      { selector: '.ui-menu-item:hover', properties: ['background'] },
      { selector: '.ui-menu-item-active', properties: ['background'] },
      { selector: '.ui-menu-item-active:hover', properties: ['background'] },
      { selector: '.ui-menu-item:disabled', properties: ['background'] },
      { selector: '.ui-menu-item-disabled', properties: ['background'] },
    ];

    for (const { selector, properties } of selectors) {
      const values = properties
        .map((property) => getDeclarationValue(getCssBlocks(selector), property))
        .filter((value): value is string => value !== null);
      const tokenRefs = values.flatMap((value) => getVarRefs(value));
      const visualTokenRefs = tokenRefs.filter((token) => token !== '--border-width-default');

      expect(values.length).toBe(properties.length);
      expect(visualTokenRefs.length).toBeGreaterThan(0);
      expect(visualTokenRefs.every((token) => token.startsWith('--menu-'))).toBe(true);
    }
  });

  it('does not declare menu text color or border styles on shared menu item selectors', () => {
    const selectors = [
      { selector: '.ui-menu-item', forbidden: ['border', 'color'] },
      { selector: '.ui-menu-item:hover', forbidden: ['border-color', 'color'] },
      { selector: '.ui-menu-item:disabled', forbidden: ['border-color', 'color'] },
      { selector: '.ui-menu-item-disabled', forbidden: ['border-color', 'color'] },
      { selector: '.ui-menu-item-active', forbidden: ['border-color', 'color'] },
      { selector: '.ui-menu-item-active:hover', forbidden: ['border-color', 'color'] },
      { selector: '.ui-menu-item-inactive', forbidden: ['border-color', 'color'] },
      { selector: '.ui-menu-item-inactive:hover', forbidden: ['border-color', 'color'] },
    ];

    for (const { selector, forbidden } of selectors) {
      const blocks = getCssBlocks(selector);

      for (const property of forbidden) {
        expect(getDeclarationValue(blocks, property)).toBeNull();
      }
    }
  });
});
