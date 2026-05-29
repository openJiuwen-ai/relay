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
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let value: string | null = null;

  for (const block of blocks) {
    const match = block.match(new RegExp(`(?:^|[\\s;])${escapedProperty}\\s*:\\s*([^;]+);`));
    if (match) {
      value = match[1].trim();
    }
  }

  return value;
}

function getVarRefs(value: string): string[] {
  return [...value.matchAll(/var\((--[^)]+)\)/g)].map((match) => match[1]);
}

describe('text field token contract in globals.css', () => {
  it('defines text-prefixed field aliases in :root', () => {
    expect(globalsCss).toContain('--text-field:');
    expect(globalsCss).toContain('--text-field-hover:');
    expect(globalsCss).toContain('--text-field-disabled:');
    expect(globalsCss).toContain('--text-field-placeholder:');
  });

  it('limits input and textarea text color properties to --text-* tokens', () => {
    const selectors = [
      { selector: '.ui-input', properties: ['color'] },
      { selector: '.ui-input:hover', properties: ['color'] },
      { selector: '.ui-input:disabled', properties: ['color'] },
      { selector: '.ui-input::placeholder', properties: ['color'] },
      { selector: '.ui-textarea', properties: ['color'] },
      { selector: '.ui-textarea:hover', properties: ['color'] },
      { selector: '.ui-textarea:disabled', properties: ['color'] },
      { selector: '.ui-textarea::placeholder', properties: ['color'] },
    ];

    for (const { selector, properties } of selectors) {
      const values = properties
        .map((property) => getDeclarationValue(getCssBlocks(selector), property))
        .filter((value): value is string => value !== null);
      const tokenRefs = values.flatMap((value) => getVarRefs(value));

      expect(values.length).toBe(properties.length);
      expect(tokenRefs.length).toBeGreaterThan(0);
      expect(tokenRefs.every((token) => token.startsWith('--text-'))).toBe(true);
    }
  });

  it('limits ui-input border and sizing properties to --input-* tokens', () => {
    const selectors = [
      {
        selector: '.ui-input',
        properties: ['border-color', 'border-radius', 'font-size', 'line-height', 'padding'],
      },
      { selector: '.ui-input:hover', properties: ['border-color'] },
      { selector: '.ui-input:active', properties: ['border-color'] },
      { selector: '.ui-input', properties: ['transition'] },
    ];

    for (const { selector, properties } of selectors) {
      const values = properties
        .map((property) => getDeclarationValue(getCssBlocks(selector), property))
        .filter((value): value is string => value !== null);
      const tokenRefs = values.flatMap((value) => getVarRefs(value));

      expect(values.length).toBe(properties.length);
      expect(tokenRefs.length).toBeGreaterThan(0);
      expect(tokenRefs.every((token) => token.startsWith('--input-'))).toBe(true);
    }
  });

  it('keeps ui-input focus border on a tokenized border alias', () => {
    const value = getDeclarationValue(getCssBlocks('.ui-input:focus'), 'border-color');
    const tokenRefs = value ? getVarRefs(value) : [];

    expect(value).not.toBeNull();
    expect(tokenRefs).toContain('--border-accent');
  });
});
