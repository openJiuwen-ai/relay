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

describe('button token contract in globals.css', () => {
  it('defines button-prefixed aliases in :root', () => {
    expect(globalsCss).toContain('--button-primary-bg:');
    expect(globalsCss).toContain('--button-default-bg:');
    expect(globalsCss).toContain('--button-danger-bg:');
    expect(globalsCss).toContain('--button-disabled-bg:');
    expect(globalsCss).toContain('--button-disabled-text:');
    expect(globalsCss).toContain('--button-disabled-border:');
  });

  it('limits semantic button classes to --button-* tokens', () => {
    const selectors = [
      { selector: '.ui-button-primary', properties: ['background', 'color'] },
      { selector: '.ui-button-primary:hover', properties: ['background', 'color'] },
      { selector: '.ui-button-primary:disabled', properties: ['border-color', 'background', 'color'] },
      { selector: '.ui-button-default', properties: ['border', 'background'] },
      { selector: '.ui-button-default:hover', properties: ['border-color', 'background', 'color'] },
      { selector: '.ui-button-default:disabled', properties: ['border-color', 'background', 'color'] },
      { selector: '.ui-button-danger', properties: ['background', 'color'] },
      { selector: '.ui-button-danger:hover', properties: ['background', 'color'] },
      { selector: '.ui-button-danger:disabled', properties: ['background', 'color'] },
    ];

    for (const { selector, properties } of selectors) {
      const blocks = getCssBlocks(selector);
      const values = properties
        .map((property) => getDeclarationValue(blocks, property))
        .filter((value): value is string => value !== null);
      const tokenRefs = values.flatMap((value) => getVarRefs(value));
      const visualTokenRefs = tokenRefs.filter((token) => token !== '--border-width-default');

      expect(values.length).toBe(properties.length);
      expect(visualTokenRefs.length).toBeGreaterThan(0);
      expect(visualTokenRefs.every((token) => token.startsWith('--button-'))).toBe(true);
    }
  });

  it('defines the default button border tokens for default, hover, and disabled states', () => {
    expect(globalsCss).toContain('--button-default-border: #595959;');
    expect(globalsCss).toContain('--button-default-border-hover: #c2c2c2;');
    expect(globalsCss).toContain('--button-disabled-border: #dbdbdb;');
  });

  it('defines the default button background tokens for default, hover, and disabled states', () => {
    expect(globalsCss).toContain('--button-default-bg: #ffffff;');
    expect(globalsCss).toContain('--button-default-bg-hover: #ffffff;');
    expect(globalsCss).toContain('--button-disabled-bg: #f0f0f0;');
  });

  it('defines shared disabled button tokens across themes', () => {
    expect(globalsCss.match(/--button-disabled-bg:\s*#f0f0f0;/g)?.length ?? 0).toBe(3);
    expect(globalsCss.match(/--button-disabled-text:\s*#c2c2c2;/g)?.length ?? 0).toBe(3);
    expect(globalsCss.match(/--button-disabled-border:\s*#dbdbdb;/g)?.length ?? 0).toBe(3);
  });

  it('does not keep per-variant disabled tokens for primary and default buttons', () => {
    expect(globalsCss).not.toContain('--button-primary-bg-disabled:');
    expect(globalsCss).not.toContain('--button-primary-text-disabled:');
    expect(globalsCss).not.toContain('--button-default-bg-disabled:');
    expect(globalsCss).not.toContain('--button-default-text-disabled:');
    expect(globalsCss).not.toContain('--button-default-border-disabled:');
  });

  it('defines the primary button hover background token as #595959 across themes', () => {
    expect(globalsCss.match(/--button-primary-bg-hover:\s*#595959;/g)?.length ?? 0).toBe(3);
  });

  it('defines a dedicated refresh button hover border token', () => {
    expect(globalsCss).toContain('--refresh-button-border-hover: #191919;');
    expect(globalsCss).toContain('--refresh-button-border-hover: #cc6d1a;');
    expect(globalsCss).toContain('--refresh-button-border-hover: #6d88b5;');
  });

  it('defines icon button border tokens consistently across themes', () => {
    const borderValues = [...globalsCss.matchAll(/--button-icon-border:\s*([^;]+);/g)].map((match) => match[1].trim());
    const hoverBorderValues = [...globalsCss.matchAll(/--button-icon-border-hover:\s*([^;]+);/g)].map((match) => match[1].trim());

    expect(borderValues).toHaveLength(4);
    expect(hoverBorderValues).toHaveLength(4);
    expect(borderValues.every((value) => value === '#c2c2c2')).toBe(true);
    expect(hoverBorderValues.every((value) => value === '#191919')).toBe(true);
  });
});
