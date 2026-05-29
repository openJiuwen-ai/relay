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

function getDeclarationValue(block: string, property: string): string | null {
  const match = block.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

function getVarRefs(value: string): string[] {
  return [...value.matchAll(/var\((--[^)]+)\)/g)].map((match) => match[1]);
}

describe('card token contract in globals.css', () => {
  it('defines card-prefixed aliases in each theme', () => {
    expect(globalsCss).toContain('--card-bg:');
    expect(globalsCss).toContain('--card-muted-bg:');
    expect(globalsCss).toContain('--card-border:');
    expect(globalsCss).toContain('--card-radius:');
    expect(globalsCss).toContain('--card-padding:');
    expect(globalsCss).toContain('--card-hover-border:');
    expect(globalsCss).toContain('--card-disabled-bg:');
    expect(globalsCss).toContain('--card-disabled-border:');
    expect(globalsCss).toContain('--card-disabled-text:');
  });

  it('keeps ui-card spacing and radius on card tokens', () => {
    const cardBlock = getCssBlock('.ui-card');
    const mutedBlock = getCssBlock('.ui-card-muted');

    expect(getDeclarationValue(cardBlock, 'border-radius')).toBe('var(--card-radius)');
    expect(getDeclarationValue(cardBlock, 'padding')).toBe('var(--card-padding)');
    expect(getDeclarationValue(mutedBlock, 'border-radius')).toBe('var(--card-radius)');
    expect(getDeclarationValue(mutedBlock, 'padding')).toBe('var(--card-padding)');
  });

  it('sets shared card border, radius, and padding values through tokens', () => {
    const cardBorderValues = [...globalsCss.matchAll(/--card-border:\s*([^;]+);/g)].map((match) => match[1].trim());
    const cardRadiusValues = [...globalsCss.matchAll(/--card-radius:\s*([^;]+);/g)].map((match) => match[1].trim());
    const cardPaddingValues = [...globalsCss.matchAll(/--card-padding:\s*([^;]+);/g)].map((match) => match[1].trim());
    const cardHoverShadowValues = [...globalsCss.matchAll(/--card-hover-shadow:\s*([^;]+);/g)].map((match) =>
      match[1].trim(),
    );

    expect(cardBorderValues.length).toBeGreaterThan(0);
    expect(cardBorderValues.every((value) => value === '#e6e6e6')).toBe(true);
    expect(cardRadiusValues.length).toBeGreaterThan(0);
    expect(cardRadiusValues.every((value) => value === '16px')).toBe(true);
    expect(cardPaddingValues.length).toBeGreaterThan(0);
    expect(cardPaddingValues.every((value) => value === '21px')).toBe(true);
    expect(cardHoverShadowValues.length).toBeGreaterThan(0);
    expect(cardHoverShadowValues.every((value) => value === '0px 4px 16px 0px rgba(0, 0, 0, 0.08)')).toBe(true);
  });

  it('limits shared card classes to --card-* tokens', () => {
    const selectors = [
      { selector: '.ui-card', properties: ['border', 'border-radius', 'background', 'box-shadow', 'padding'] },
      { selector: '.ui-card-muted', properties: ['border', 'border-radius', 'background', 'box-shadow', 'padding'] },
      { selector: '.ui-card-hover', properties: ['transition'] },
      { selector: '.ui-card-hover:hover', properties: ['border-color', 'box-shadow'] },
      { selector: '.ui-card-disabled', properties: ['border-color', 'background', 'box-shadow', 'color'] },
    ];

    for (const { selector, properties } of selectors) {
      const block = getCssBlock(selector);
      const values = properties
        .map((property) => getDeclarationValue(block, property))
        .filter((value): value is string => value !== null);
      const tokenRefs = values.flatMap((value) => getVarRefs(value));
      const visualTokenRefs = tokenRefs.filter((token) => token !== '--border-width-default');

      expect(values.length).toBe(properties.length);
      expect(visualTokenRefs.length).toBeGreaterThan(0);
      expect(visualTokenRefs.every((token) => token.startsWith('--card-'))).toBe(true);
    }
  });
});
