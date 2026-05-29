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

describe('overlay token contract in globals.css', () => {
  it('defines overlay-prefixed aliases in theme tokens', () => {
    expect(globalsCss).toContain('--overlay-bg:');
    expect(globalsCss).toContain('--overlay-border:');
    expect(globalsCss).toContain('--overlay-shadow:');
    expect(globalsCss).toContain('--overlay-text:');
    expect(globalsCss).toContain('--overlay-hover-bg:');
    expect(globalsCss).toContain('--overlay-hover-border:');
    expect(globalsCss).toContain('--overlay-hover-shadow:');
    expect(globalsCss).toContain('--overlay-hover-text:');
    expect(globalsCss).toContain('--overlay-disabled-bg:');
    expect(globalsCss).toContain('--overlay-disabled-border:');
    expect(globalsCss).toContain('--overlay-disabled-shadow:');
    expect(globalsCss).toContain('--overlay-disabled-text:');
    expect(globalsCss).toContain('--overlay-item-bg:');
    expect(globalsCss).toContain('--overlay-item-border:');
    expect(globalsCss).toContain('--overlay-item-text:');
    expect(globalsCss).toContain('--overlay-item-hover-bg:');
    expect(globalsCss).toContain('--overlay-item-hover-border:');
    expect(globalsCss).toContain('--overlay-item-hover-text:');
    expect(globalsCss).toContain('--overlay-item-disabled-bg:');
    expect(globalsCss).toContain('--overlay-item-disabled-border:');
    expect(globalsCss).toContain('--overlay-item-disabled-text:');
  });

  it('limits shared overlay classes to --overlay-* tokens', () => {
    const selectors = [
      { selector: '.ui-overlay-card', properties: ['border', 'background', 'box-shadow', 'color'] },
      { selector: '.ui-overlay-card-hover:hover', properties: ['border-color', 'background', 'box-shadow', 'color'] },
      { selector: '.ui-overlay-card-disabled', properties: ['border-color', 'background', 'box-shadow', 'color'] },
      { selector: '.ui-overlay-item', properties: ['border', 'background', 'color'] },
      { selector: '.ui-overlay-item:hover', properties: ['border-color', 'background', 'color'] },
      { selector: '.ui-overlay-item:disabled', properties: ['border-color', 'background', 'color'] },
      { selector: '.ui-overlay-item-disabled', properties: ['border-color', 'background', 'color'] },
    ];

    for (const { selector, properties } of selectors) {
      const values = properties
        .map((property) => getDeclarationValue(getCssBlocks(selector), property))
        .filter((value): value is string => value !== null);
      const tokenRefs = values.flatMap((value) => getVarRefs(value));
      const visualTokenRefs = tokenRefs.filter((token) => token !== '--border-width-default');

      expect(values.length).toBe(properties.length);
      expect(visualTokenRefs.length).toBeGreaterThan(0);
      expect(visualTokenRefs.every((token) => token.startsWith('--overlay-'))).toBe(true);
    }
  });
});
